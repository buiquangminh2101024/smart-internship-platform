import type { PrismaClient } from "@prisma/client";
import type {
  CreateCompanyRequest,
  EmployerMeResponse,
  EmployerProfile,
  EmployerStage,
  InviteCodeResponse,
  VerificationCheckResponse,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { MediaStorage } from "../../shared/ports/MediaStorage";
import type { CompanyInviteCodeStore } from "../../shared/ports/CompanyInviteCodeStore";
import type { UserRepository } from "../users/user.repository";
import type { CompanyRepository, CompanyWriteData } from "../companies/company.repository";
import { toCompanyDto } from "../companies/company.mapper";
import type { NotificationsService } from "../notifications/notifications.service";
import { CompanyVerificationService } from "./company-verification.service";
import { EmployerRepository, type EmployerWithCompany } from "./employer.repository";

interface EmployersConfig {
  DEV_SKIP_COMPANY_MANUAL_VERIFICATION: boolean;
}

export interface UploadedFileInput {
  buffer: Buffer;
  originalName: string;
}

export interface CompanyUploadFiles {
  businessLicense?: UploadedFileInput;
  logo?: UploadedFileInput;
  banner?: UploadedFileInput;
}

// `exactOptionalPropertyTypes` cấm gán {key: undefined} cho field khai báo
// `key?: T` — dùng helper này để chỉ đưa key vào object khi giá trị thật sự
// có, thay vì gán tường minh undefined.
function definedOnly<T extends object>(fields: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(fields) as (keyof T)[]) {
    if (fields[key] !== undefined) result[key] = fields[key];
  }
  return result;
}

function toEmployerProfileDto(employer: EmployerWithCompany): EmployerProfile {
  return {
    id: employer.id,
    userId: employer.userId,
    companyId: employer.companyId,
    isCompanyAdmin: employer.isCompanyAdmin,
    title: employer.title,
    phone: employer.phone,
  };
}

function stageFor(employer: EmployerWithCompany): EmployerStage {
  return employer.company.verificationStatus === "VERIFIED" ? "ACTIVE" : "PENDING_VERIFICATION";
}

function describeBlockedReason(reason: string): string {
  switch (reason) {
    case "NO_MAIL_SERVER":
      return "The email domain has no mail server configured";
    case "TAX_CODE_INVALID":
      return "The tax code format is invalid";
    case "TAX_CODE_NOT_FOUND":
      return "The tax code was not found";
    default:
      return "Could not verify the tax code";
  }
}

export class EmployersService {
  private readonly prisma: PrismaClient;
  private readonly employerRepository: EmployerRepository;
  private readonly companyRepository: CompanyRepository;
  private readonly userRepository: UserRepository;
  private readonly companyVerificationService: CompanyVerificationService;
  private readonly companyInviteCodeStore: CompanyInviteCodeStore;
  private readonly mediaStorage: MediaStorage;
  private readonly logger: Logger;
  private readonly employersConfig: EmployersConfig;
  private readonly notificationsService: NotificationsService;

  constructor({
    prisma,
    employerRepository,
    companyRepository,
    userRepository,
    companyVerificationService,
    companyInviteCodeStore,
    mediaStorage,
    logger,
    config,
    notificationsService,
  }: {
    prisma: PrismaClient;
    employerRepository: EmployerRepository;
    companyRepository: CompanyRepository;
    userRepository: UserRepository;
    companyVerificationService: CompanyVerificationService;
    companyInviteCodeStore: CompanyInviteCodeStore;
    mediaStorage: MediaStorage;
    logger: Logger;
    config: EmployersConfig;
    notificationsService: NotificationsService;
  }) {
    this.prisma = prisma;
    this.employerRepository = employerRepository;
    this.companyRepository = companyRepository;
    this.userRepository = userRepository;
    this.companyVerificationService = companyVerificationService;
    this.companyInviteCodeStore = companyInviteCodeStore;
    this.mediaStorage = mediaStorage;
    this.logger = logger;
    this.employersConfig = config;
    this.notificationsService = notificationsService;
  }

  async getMe(userId: string): Promise<EmployerMeResponse> {
    const employer = await this.employerRepository.findByUserId(userId);
    if (!employer) {
      return { hasEmployerProfile: false, stage: "ONBOARDING" };
    }

    return {
      hasEmployerProfile: true,
      stage: stageFor(employer),
      employer: toEmployerProfileDto(employer),
      company: toCompanyDto(employer.company),
    };
  }

  async checkVerification(userId: string, taxCode: string): Promise<VerificationCheckResponse> {
    const user = await this.requireUser(userId);
    return this.companyVerificationService.runVerificationCheck({ email: user.email, taxCode });
  }

  async createOrResubmitCompany(
    userId: string,
    dto: CreateCompanyRequest,
    files: CompanyUploadFiles,
  ): Promise<EmployerMeResponse> {
    const user = await this.requireUser(userId);
    const existingEmployer = await this.employerRepository.findByUserId(userId);
    const licenseFile = files.businessLicense;

    let mode: "create" | "resubmit";
    if (!existingEmployer) {
      mode = "create";
    } else if (existingEmployer.isCompanyAdmin && existingEmployer.company.verificationStatus === "REJECTED") {
      mode = "resubmit";
    } else {
      throw new AppError(409, "This account is already linked to a company");
    }

    // Nộp lại hồ sơ được giữ ảnh cũ — chỉ bắt buộc khi công ty chưa từng có ảnh.
    if (!files.logo && !existingEmployer?.company.logoUrl) {
      throw new AppError(400, "A company logo is required");
    }
    if (!files.banner && !existingEmployer?.company.bannerUrl) {
      throw new AppError(400, "A company banner is required");
    }

    const outcome = await this.companyVerificationService.runVerificationCheck({ email: user.email, taxCode: dto.taxCode });
    const devBypass = this.employersConfig.DEV_SKIP_COMPANY_MANUAL_VERIFICATION;

    if (outcome.outcome === "BLOCKED" && !dto.forceManualReview && !devBypass) {
      throw new AppError(
        400,
        `${describeBlockedReason(outcome.reason)}. Resend with forceManualReview to request manual review instead.`,
      );
    }

    const autoVerified = devBypass || outcome.outcome === "AUTO_VERIFIED";
    const needsLicense = !autoVerified;

    if (needsLicense && !licenseFile) {
      throw new AppError(400, "A business license file is required for manual review");
    }

    if (devBypass && outcome.outcome !== "AUTO_VERIFIED") {
      this.logger.warn("DEV_SKIP_COMPANY_MANUAL_VERIFICATION bypass applied — never enable this in production", {
        userId,
        outcome,
      });
    }

    let businessLicenseUrl: string | undefined;
    if (licenseFile) {
      const uploaded = await this.mediaStorage.upload(licenseFile.buffer, {
        folder: "business-licenses",
        filename: `${userId}-${Date.now()}`,
      });
      businessLicenseUrl = uploaded.url;
    }

    const brandingUrls = await this.uploadBranding(userId, files);

    let verificationNote: string | null = null;
    if (!autoVerified) {
      if (outcome.outcome === "BLOCKED") {
        verificationNote = `Manual review requested after blocked check: ${outcome.reason}`;
      } else if (outcome.outcome === "NEEDS_MANUAL_REVIEW") {
        verificationNote = outcome.reason;
      }
    }

    const companyData: CompanyWriteData = {
      name: dto.name,
      taxCode: dto.taxCode,
      industryId: dto.industryId ?? null,
      companyTypeId: dto.companyTypeId ?? null,
      cityId: dto.cityId ?? null,
      address: dto.address ?? null,
      description: dto.description ?? null,
      website: dto.website ?? null,
      foundedYear: dto.foundedYear ?? null,
      verificationStatus: autoVerified ? "VERIFIED" : "PENDING",
      verificationMethod: autoVerified ? "AUTO_TAX_MATCH" : "MANUAL_REVIEW",
      businessLicenseUrl: businessLicenseUrl ?? null,
      verificationNote,
      rejectedAt: null,
      isVerified: autoVerified,
      verifiedAt: autoVerified ? new Date() : null,
      ...brandingUrls,
    };

    const profileFields = definedOnly({ title: dto.title, phone: dto.phone });

    await this.prisma.$transaction(async (tx) => {
      let companyId: string;
      if (mode === "create") {
        const company = await this.companyRepository.create({ ...companyData, name: dto.name, taxCode: dto.taxCode }, tx);
        await this.employerRepository.create(
          { userId, companyId: company.id, isCompanyAdmin: true, ...profileFields },
          tx,
        );
        companyId = company.id;
      } else {
        await this.companyRepository.update(existingEmployer!.companyId, companyData, tx);
        if (Object.keys(profileFields).length > 0) {
          await this.employerRepository.updateProfile(userId, profileFields, tx);
        }
        companyId = existingEmployer!.companyId;
      }

      // Nhánh auto-verify là đường phổ biến nhất khiến company trở thành
      // VERIFIED (Admin duyệt tay đi qua companies.service.ts) — trước Phase 10
      // luồng này im lặng, employer không nhận được xác nhận nào.
      if (autoVerified) {
        await this.notificationsService.notify(
          "COMPANY_VERIFIED",
          userId,
          { companyId, companyName: dto.name },
          tx,
        );
      } else {
        // AD-12 — company vào MANUAL_REVIEW (create lẫn resubmit): Admin cần
        // biết để xử lý, không tự lộ ra qua polling danh sách company.
        const adminIds = await this.userRepository.findAdminIds(tx);
        await this.notificationsService.notifyMany(
          "COMPANY_LINK_REQUESTED",
          adminIds,
          { companyId, companyName: dto.name, employerEmail: user.email },
          tx,
        );
      }
    });

    return this.getMe(userId);
  }

  async issueInviteCode(userId: string): Promise<InviteCodeResponse> {
    const employer = await this.employerRepository.findByUserId(userId);
    if (!employer) {
      throw new AppError(404, "Employer profile not found");
    }
    if (!employer.isCompanyAdmin) {
      throw new AppError(403, "Only a company admin can generate an invite code");
    }

    const code = await this.companyInviteCodeStore.issue(employer.companyId);
    return { code, expiresInSeconds: 120 };
  }

  async joinCompany(userId: string, inviteCode: string): Promise<EmployerMeResponse> {
    const existing = await this.employerRepository.findByUserId(userId);
    if (existing) {
      throw new AppError(409, "This account is already linked to a company");
    }

    const companyId = await this.companyInviteCodeStore.consume(inviteCode);
    if (!companyId) {
      throw new AppError(400, "Invalid or expired invite code");
    }

    await this.employerRepository.create({ userId, companyId, isCompanyAdmin: false });
    return this.getMe(userId);
  }

  async updateOwnProfile(userId: string, data: { title?: string; phone?: string }): Promise<EmployerMeResponse> {
    const existing = await this.employerRepository.findByUserId(userId);
    if (!existing) {
      throw new AppError(404, "Employer profile not found");
    }

    await this.employerRepository.updateProfile(userId, data);
    return this.getMe(userId);
  }

  async updateCompanyBranding(userId: string, files: CompanyUploadFiles): Promise<EmployerMeResponse> {
    const employer = await this.employerRepository.findByUserId(userId);
    if (!employer) {
      throw new AppError(404, "Employer profile not found");
    }
    if (!employer.isCompanyAdmin) {
      throw new AppError(403, "Only a company admin can update the company logo and banner");
    }
    if (!files.logo && !files.banner) {
      throw new AppError(400, "Provide a logo or a banner to update");
    }

    const brandingUrls = await this.uploadBranding(userId, files);
    await this.companyRepository.update(employer.companyId, brandingUrls);
    return this.getMe(userId);
  }

  /** Chỉ trả về key của ảnh thật sự được upload, để ảnh không gửi lên giữ nguyên giá trị cũ. */
  private async uploadBranding(
    userId: string,
    files: CompanyUploadFiles,
  ): Promise<{ logoUrl?: string; bannerUrl?: string }> {
    const result: { logoUrl?: string; bannerUrl?: string } = {};
    if (files.logo) {
      const uploaded = await this.mediaStorage.upload(files.logo.buffer, {
        folder: "company-logos",
        filename: `${userId}-${Date.now()}`,
        resourceType: "image",
      });
      result.logoUrl = uploaded.url;
    }
    if (files.banner) {
      const uploaded = await this.mediaStorage.upload(files.banner.buffer, {
        folder: "company-banners",
        filename: `${userId}-${Date.now()}`,
        resourceType: "image",
      });
      result.bannerUrl = uploaded.url;
    }
    return result;
  }

  private async requireUser(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError(404, "User not found");
    }
    return user;
  }
}
