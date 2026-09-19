import type { CatalogEntryStatus } from "@prisma/client";
import type { AdminEducationCatalogEntryDto, PaginatedResponse, SuggestCatalogEntryResponse } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { AdminEducationCatalogRow, EducationCatalogDomain, EducationCatalogRepository } from "./education-catalog.types";
import type { MajorDedupeService } from "./major-dedupe.service";
import type { MajorRepository } from "./major.repository";
import type { UniversityDedupeService } from "./university-dedupe.service";
import type { UniversityRepository } from "./university.repository";

const LABELS: Record<EducationCatalogDomain, string> = {
  university: "Trường",
  major: "Ngành",
};

/**
 * Hành động của Candidate (suggest) và Admin (duyệt/từ chối/gộp/sửa tên & duyệt)
 * trên University/Major. Cùng quy tắc với skills.service.ts, cộng thêm
 * `renameApprove` (docs/06-backend/cv-ai-extraction-phase2/PLAN.md Phần 2).
 */
export class EducationCatalogService {
  private readonly repositories: Record<EducationCatalogDomain, EducationCatalogRepository>;
  private readonly universityDedupeService: UniversityDedupeService;
  private readonly majorDedupeService: MajorDedupeService;

  constructor({
    universityRepository,
    majorRepository,
    universityDedupeService,
    majorDedupeService,
  }: {
    universityRepository: UniversityRepository;
    majorRepository: MajorRepository;
    universityDedupeService: UniversityDedupeService;
    majorDedupeService: MajorDedupeService;
  }) {
    this.repositories = { university: universityRepository, major: majorRepository };
    this.universityDedupeService = universityDedupeService;
    this.majorDedupeService = majorDedupeService;
  }

  // ─── Candidate ───────────────────────────────────────────────────────────

  suggest(domain: EducationCatalogDomain, userId: string, name: string): Promise<SuggestCatalogEntryResponse> {
    return domain === "university"
      ? this.universityDedupeService.suggest(userId, name)
      : this.majorDedupeService.suggest(userId, name);
  }

  // ─── Admin ───────────────────────────────────────────────────────────────

  async listForAdmin(
    domain: EducationCatalogDomain,
    status: CatalogEntryStatus | undefined,
    cursor: string | undefined,
  ): Promise<PaginatedResponse<AdminEducationCatalogEntryDto>> {
    const page = await this.repositories[domain].listForAdmin(status, cursor);
    return {
      items: page.items.map(toAdminDto),
      hasMore: page.hasMore,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  async approve(domain: EducationCatalogDomain, id: string): Promise<AdminEducationCatalogEntryDto> {
    await this.requirePending(domain, id);
    await this.repositories[domain].approve(id);
    return this.adminDto(domain, id);
  }

  /**
   * Dùng khi mục là mới thật nhưng tên người dùng gõ chưa chuẩn (viết tắt, sai
   * hoa/thường). Tên sửa trùng một mục khác → 409: trùng mục đã duyệt thì đúng
   * ra phải Gộp, không phải tạo bản thứ hai.
   */
  async renameApprove(domain: EducationCatalogDomain, id: string, correctedName: string): Promise<AdminEducationCatalogEntryDto> {
    await this.requirePending(domain, id);
    const repository = this.repositories[domain];
    const name = correctedName.trim().replace(/\s+/g, " ");

    const duplicate = await repository.findByNameInsensitive(name, id);
    if (duplicate) {
      throw new AppError(
        409,
        duplicate.status === "APPROVED"
          ? `${LABELS[domain]} "${duplicate.name}" đã có trong danh mục — hãy dùng "Gộp" thay vì đổi tên.`
          : `Tên "${duplicate.name}" trùng với một mục khác đang chờ duyệt — hãy xử lý mục đó trước.`,
      );
    }

    await repository.renameApprove(id, name);
    return this.adminDto(domain, id);
  }

  async reject(domain: EducationCatalogDomain, id: string): Promise<void> {
    await this.requirePending(domain, id);
    await this.repositories[domain].reject(id);
  }

  async merge(domain: EducationCatalogDomain, id: string, targetId: string): Promise<void> {
    await this.requirePending(domain, id);
    if (id === targetId) {
      throw new AppError(400, `Không thể gộp một ${LABELS[domain].toLowerCase()} vào chính nó`);
    }

    const target = await this.repositories[domain].findById(targetId);
    if (!target) {
      throw new AppError(404, `Không tìm thấy ${LABELS[domain].toLowerCase()} đích`);
    }
    // Gộp vào một mục cũng đang chờ duyệt tạo chuỗi PENDING → PENDING — cùng
    // quy tắc với Skill.
    if (target.status !== "APPROVED") {
      throw new AppError(409, `Chỉ được gộp vào ${LABELS[domain].toLowerCase()} đã duyệt`);
    }

    await this.repositories[domain].merge(id, targetId, "ADMIN_MERGE");
  }

  private async adminDto(domain: EducationCatalogDomain, id: string): Promise<AdminEducationCatalogEntryDto> {
    const row = await this.repositories[domain].findAdminRow(id);
    if (!row) {
      throw new AppError(404, `Không tìm thấy ${LABELS[domain].toLowerCase()}`);
    }
    return toAdminDto(row);
  }

  private async requirePending(domain: EducationCatalogDomain, id: string): Promise<void> {
    const entry = await this.repositories[domain].findById(id);
    if (!entry) {
      throw new AppError(404, `Không tìm thấy ${LABELS[domain].toLowerCase()}`);
    }
    if (entry.status !== "PENDING") {
      throw new AppError(409, `Chỉ xử lý được ${LABELS[domain].toLowerCase()} đang chờ duyệt`);
    }
  }
}

function toAdminDto(row: AdminEducationCatalogRow): AdminEducationCatalogEntryDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status,
    createdByEmail: row.createdByEmail,
    pendingMatch: row.pendingMatch,
    usageCount: row.usageCount,
    createdAt: row.createdAt.toISOString(),
  };
}
