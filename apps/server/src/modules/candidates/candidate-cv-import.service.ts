import type { Prisma, PrismaClient } from "@prisma/client";
import type { ImportFromCvFieldOverrides, ImportFromCvResponse } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { MajorDedupeService } from "../education-catalog/major-dedupe.service";
import type { UniversityDedupeService } from "../education-catalog/university-dedupe.service";
import type { SkillDedupeService } from "../skills/skill-dedupe.service";
import { normalizeSkillName } from "../skills/skill-normalize.util";
import { suggestSkillSchema } from "../skills/skills.dto";
import type { CandidateRepository } from "./candidate.repository";
import type { ImportFromCvInput } from "./candidates.dto";

type ExtractedData = ImportFromCvInput["extractedData"];

/**
 * Ghi kết quả đọc CV (đã được Candidate lọc ở preview) vào hồ sơ —
 * docs/06-backend/cv-ai-extraction-phase2/PLAN.md Phần 2 + Quyết định #7/#8/#9:
 *  - danh sách (Education/WorkExperience/Project/Certificate/Award): luôn thêm
 *    dòng mới, không dò để thay thế dòng đã có;
 *  - CandidateSkill: đã có thì bỏ qua, giữ nguyên yearsOfExperience cũ;
 *  - field đơn lẻ: chỉ ghi khi có cờ trong fieldOverrides;
 *  - fullName: bỏ qua (không có chỗ lưu).
 *
 * Hai giai đoạn: (1) phân giải tên trường/ngành/kỹ năng/thành phố ra id — có thể
 * tạo mục PENDING trong catalog, giống hệt khi Candidate tự gõ; (2) ghi hồ sơ
 * trong MỘT transaction. Giai đoạn 2 không gọi lại logic của PATCH /candidates/me
 * như PLAN gợi ý vì cần nguyên tử: import hỏng giữa chừng rồi bấm lại sẽ nhân
 * đôi các dòng đã kịp ghi.
 */
export class CandidateCvImportService {
  private readonly prisma: PrismaClient;
  private readonly candidateRepository: CandidateRepository;
  private readonly universityDedupeService: UniversityDedupeService;
  private readonly majorDedupeService: MajorDedupeService;
  private readonly skillDedupeService: SkillDedupeService;
  private readonly logger: Logger;

  constructor({
    prisma,
    candidateRepository,
    universityDedupeService,
    majorDedupeService,
    skillDedupeService,
    logger,
  }: {
    prisma: PrismaClient;
    candidateRepository: CandidateRepository;
    universityDedupeService: UniversityDedupeService;
    majorDedupeService: MajorDedupeService;
    skillDedupeService: SkillDedupeService;
    logger: Logger;
  }) {
    this.prisma = prisma;
    this.candidateRepository = candidateRepository;
    this.universityDedupeService = universityDedupeService;
    this.majorDedupeService = majorDedupeService;
    this.skillDedupeService = skillDedupeService;
    this.logger = logger;
  }

  async importFromCv(userId: string, input: ImportFromCvInput): Promise<ImportFromCvResponse> {
    const { extractedData: data, fieldOverrides } = input;
    const warnings: string[] = [];

    // Kiểm tra field đơn lẻ TRƯỚC khi đụng catalog: lỗi ở đây không được để lại
    // mục PENDING mồ côi từ một lần import không thành.
    const profileData = this.buildProfileUpdate(data.candidate, fieldOverrides);
    const candidate = await this.candidateRepository.ensureCandidate(userId);

    const cityId = fieldOverrides.cityId ? await this.resolveCity(data.candidate.city, warnings) : null;
    const educations = await this.resolveEducations(userId, data.educations, warnings);
    const skillIds = await this.resolveSkills(userId, data.skills, warnings);

    const updatedFields = [...(Object.keys(profileData) as Array<keyof ImportFromCvFieldOverrides>)];
    if (cityId) updatedFields.push("cityId");

    const created = await this.prisma.$transaction(async (tx) => {
      if (updatedFields.length > 0) {
        await tx.candidate.update({
          where: { id: candidate.id },
          data: { ...profileData, ...(cityId ? { cityId } : {}) },
        });
      }

      // Chỉ một dòng học vấn được là "đang học" (cùng quy tắc createEducation):
      // dòng isCurrent đầu tiên trong CV thắng, các dòng cũ bị gỡ cờ.
      const firstCurrent = educations.findIndex((education) => education.isCurrent);
      if (firstCurrent >= 0) {
        await tx.education.updateMany({ where: { candidateId: candidate.id, isCurrent: true }, data: { isCurrent: false } });
      }
      const educationCount = await createRows(
        tx.education,
        educations.map((education, index) => ({
          ...education,
          candidateId: candidate.id,
          isCurrent: index === firstCurrent,
        })),
      );

      const workExperienceCount = await createRows(
        tx.workExperience,
        data.workExperiences.map((work) => ({
          candidateId: candidate.id,
          company: work.company,
          position: work.position,
          startDate: parsePartialDate(work.startDate),
          endDate: work.isCurrent ? null : parsePartialDate(work.endDate),
          isCurrent: work.isCurrent,
          description: work.description ?? null,
        })),
      );

      const projectCount = await createRows(
        tx.project,
        data.projects.map((project) => ({
          candidateId: candidate.id,
          name: project.name,
          description: project.description ?? null,
          url: project.url ?? null,
          isWorkingOn: project.isWorkingOn,
          startDate: parsePartialDate(project.startDate),
          endDate: project.isWorkingOn ? null : parsePartialDate(project.endDate),
        })),
      );

      const certificateCount = await createRows(
        tx.certificate,
        data.certificates.map((certificate) => ({
          candidateId: candidate.id,
          name: certificate.name,
          issuer: certificate.issuer ?? null,
          issueDate: parsePartialDate(certificate.issueDate),
          credentialUrl: certificate.credentialUrl ?? null,
          description: certificate.description ?? null,
        })),
      );

      const awardCount = await createRows(
        tx.award,
        data.awards.map((award) => ({
          candidateId: candidate.id,
          name: award.name,
          issuer: award.issuer ?? null,
          date: parsePartialDate(award.date),
          description: award.description ?? null,
        })),
      );

      // skipDuplicates = "đã có thì bỏ qua": khoá kép [candidateId, skillId] giữ
      // nguyên dòng cũ cùng yearsOfExperience của nó. Kỹ năng mới nhận mặc định
      // 0 năm — CV hiếm khi ghi số năm theo từng kỹ năng.
      const skillCount = await createRows(
        tx.candidateSkill,
        skillIds.map((skillId) => ({ candidateId: candidate.id, skillId })),
        true,
      );

      return {
        educations: educationCount,
        workExperiences: workExperienceCount,
        projects: projectCount,
        certificates: certificateCount,
        awards: awardCount,
        skills: skillCount,
      };
    });

    this.logger.info("Imported CV extraction into candidate profile", {
      candidateId: candidate.id,
      cvId: input.cvId ?? null,
      created,
      updatedFields,
      warnings: warnings.length,
    });

    return { created, updatedFields, warnings };
  }

  /** Chỉ field có cờ VÀ có giá trị mới — cờ bật nhưng CV không có thì giữ nguyên. */
  private buildProfileUpdate(
    candidate: ExtractedData["candidate"],
    overrides: ImportFromCvInput["fieldOverrides"],
  ): Prisma.CandidateUncheckedUpdateInput {
    const update: Prisma.CandidateUncheckedUpdateInput = {};

    if (overrides.headline && candidate.headline) update.headline = candidate.headline;
    if (overrides.bio && candidate.bio) update.bio = candidate.bio;
    if (overrides.gender && candidate.gender) update.gender = candidate.gender;

    if (overrides.phone && candidate.phone) {
      // CV hay ghi "+84 912.345.678" — bỏ ký tự trình bày rồi kiểm tra như form tay.
      const phone = candidate.phone.replace(/[\s.\-()]/g, "");
      if (!/^\+?\d{9,14}$/.test(phone)) {
        throw new AppError(
          400,
          `Số điện thoại "${candidate.phone}" đọc từ CV không hợp lệ — hãy chọn "Giữ giá trị hiện tại" cho số điện thoại.`,
        );
      }
      update.phone = phone;
    }

    if (overrides.dateOfBirth && candidate.dateOfBirth) {
      const dateOfBirth = parsePartialDate(candidate.dateOfBirth);
      if (!dateOfBirth) {
        throw new AppError(
          400,
          `Ngày sinh "${candidate.dateOfBirth}" đọc từ CV không hợp lệ — hãy chọn "Giữ giá trị hiện tại" cho ngày sinh.`,
        );
      }
      update.dateOfBirth = dateOfBirth;
    }

    return update;
  }

  /**
   * City là danh sách tỉnh/thành cố định — không tạo mục mới, không fuzzy
   * (Quyết định #7). Không khớp thì giữ nguyên thành phố hiện tại.
   */
  private async resolveCity(name: string | null | undefined, warnings: string[]): Promise<string | null> {
    if (!name) return null;
    const key = normalizeCityName(name);
    const cities = await this.prisma.city.findMany({ select: { id: true, name: true } });
    const match = cities.find((city) => normalizeCityName(city.name) === key);
    if (!match) {
      warnings.push(`Không tìm thấy "${name}" trong danh mục tỉnh/thành — giữ nguyên thành phố hiện tại.`);
      return null;
    }
    return match.id;
  }

  private async resolveEducations(
    userId: string,
    educations: ExtractedData["educations"],
    warnings: string[],
  ): Promise<Array<Omit<Prisma.EducationUncheckedCreateInput, "candidateId">>> {
    const rows: Array<Omit<Prisma.EducationUncheckedCreateInput, "candidateId">> = [];

    for (const education of educations) {
      const universityId = education.universityName
        ? await this.resolveCatalogEntry(
            () => this.universityDedupeService.suggest(userId, education.universityName!),
            `trường "${education.universityName}"`,
            warnings,
          )
        : null;
      const majorId = education.majorName
        ? await this.resolveCatalogEntry(
            () => this.majorDedupeService.suggest(userId, education.majorName!),
            `ngành "${education.majorName}"`,
            warnings,
          )
        : null;

      rows.push({
        universityId,
        majorId,
        degree: education.degree ?? null,
        startYear: education.startYear ?? null,
        endYear: education.isCurrent ? null : (education.endYear ?? null),
        isCurrent: education.isCurrent,
        description: education.description ?? null,
      });
    }

    return rows;
  }

  /**
   * Lỗi nghiệp vụ khi đề xuất một mục (hết lượt 429, tên rỗng 400) chỉ làm mất
   * đúng liên kết đó — dòng học vấn vẫn được thêm, kèm cảnh báo. Lỗi hệ thống
   * (DB, mạng) vẫn ném ra để cả lần import báo lỗi.
   */
  private async resolveCatalogEntry(
    suggest: () => Promise<{ id: string }>,
    label: string,
    warnings: string[],
  ): Promise<string | null> {
    try {
      return (await suggest()).id;
    } catch (error) {
      if (error instanceof AppError && error.statusCode < 500) {
        warnings.push(`Không thêm được ${label}: ${error.message}`);
        return null;
      }
      throw error;
    }
  }

  private async resolveSkills(userId: string, names: string[], warnings: string[]): Promise<string[]> {
    const skillIds = new Set<string>();
    const seen = new Set<string>();
    // Hết quota một lần thì các tên mới phía sau chắc chắn cũng hết — gom lại
    // thành một cảnh báo thay vì lặp cùng một câu cho từng kỹ năng.
    let quotaError: string | null = null;
    const skippedByQuota: string[] = [];

    for (const rawName of names) {
      const key = normalizeSkillName(rawName);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      // Bậc 0 + trùng tên trước, KHÔNG qua quota: người đã hết lượt đề xuất
      // vẫn gắn được kỹ năng có sẵn trong catalog.
      const existing = await this.skillDedupeService.findExisting(rawName);
      if (existing) {
        skillIds.add(existing.skillId);
        continue;
      }

      const validation = suggestSkillSchema.shape.name.safeParse(rawName);
      if (!validation.success) {
        warnings.push(`Bỏ qua kỹ năng "${rawName}": ${validation.error.issues[0]?.message ?? "tên không hợp lệ"}.`);
        continue;
      }
      if (quotaError) {
        skippedByQuota.push(rawName);
        continue;
      }

      try {
        const suggested = await this.skillDedupeService.suggest(userId, validation.data);
        skillIds.add(suggested.skillId);
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 429) {
          quotaError = error.message;
          skippedByQuota.push(rawName);
          continue;
        }
        throw error;
      }
    }

    if (quotaError) {
      warnings.push(`Chưa thêm ${skippedByQuota.length} kỹ năng mới (${skippedByQuota.join(", ")}): ${quotaError}`);
    }
    return [...skillIds];
  }
}

/** createMany bỏ qua lượt gọi rỗng — Prisma vẫn chạy câu INSERT với mảng rỗng. */
async function createRows<T>(
  delegate: { createMany(args: { data: T[]; skipDuplicates?: boolean }): Prisma.PrismaPromise<Prisma.BatchPayload> },
  data: T[],
  skipDuplicates = false,
): Promise<number> {
  if (data.length === 0) return 0;
  const result = await delegate.createMany({ data, ...(skipDuplicates ? { skipDuplicates } : {}) });
  return result.count;
}

/**
 * "YYYY" | "YYYY-MM" | "YYYY-MM-DD" (định dạng Phase 1 lưu) → Date UTC, thiếu
 * tháng/ngày thì lấy ngày đầu. Ngày không tồn tại (31/02) → null thay vì để
 * JS tự "tràn" sang tháng sau.
 */
function parsePartialDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/** "TP. Hồ Chí Minh" / "Thành phố Hồ Chí Minh" → "hồ chí minh". */
function normalizeCityName(raw: string): string {
  return normalizeSkillName(raw).replace(/^(thành phố|tỉnh|tp)\s+/, "");
}
