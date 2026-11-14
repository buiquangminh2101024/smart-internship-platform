import type { CatalogEntryStatus, Prisma, Skill } from "@prisma/client";
import type { AdminSkillDto, PaginatedResponse, SuggestSkillResponse } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { AuditLogService } from "../audit-log/audit-log.service";
import type { CandidateRescoreMarker } from "../live-rescore/candidate-rescore-marker";
import type { SkillDedupeService } from "./skill-dedupe.service";
import type { AdminSkillRow, SkillsRepository } from "./skills.repository";

export class SkillsService {
  private readonly skillsRepository: SkillsRepository;
  private readonly skillDedupeService: SkillDedupeService;
  private readonly auditLogService: AuditLogService;
  private readonly rescoreMarker: CandidateRescoreMarker;

  constructor({
    skillsRepository,
    skillDedupeService,
    auditLogService,
    candidateRescoreMarker,
  }: {
    skillsRepository: SkillsRepository;
    skillDedupeService: SkillDedupeService;
    auditLogService: AuditLogService;
    candidateRescoreMarker: CandidateRescoreMarker;
  }) {
    this.skillsRepository = skillsRepository;
    this.skillDedupeService = skillDedupeService;
    this.auditLogService = auditLogService;
    this.rescoreMarker = candidateRescoreMarker;
  }

  // ─── Candidate / Employer ────────────────────────────────────────────────

  suggest(userId: string, name: string): Promise<SuggestSkillResponse> {
    return this.skillDedupeService.suggest(userId, name);
  }

  // ─── Admin ───────────────────────────────────────────────────────────────

  async listForAdmin(
    status: CatalogEntryStatus | undefined,
    cursor: string | undefined,
  ): Promise<PaginatedResponse<AdminSkillDto>> {
    const page = await this.skillsRepository.listForAdmin(status, cursor);
    return {
      items: page.items.map(toAdminSkillDto),
      hasMore: page.hasMore,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  // Nhật ký ghi SAU khi repository commit (không truyền tx): reject/merge tự mở
  // transaction riêng, AuditLogService chỉ log lỗi ở nhánh này (AD-16).
  //
  // AD-27 D6: duyệt / từ chối / gộp đổi pool và hồ sơ chấm của người đang có kỹ năng đó
  // (tin chỉ tính kỹ năng APPROVED; từ chối xoá liên kết; gộp chuyển liên kết). Đánh dấu
  // họ qua rescoreMarker.markSkillHolders: danh sách lấy trước khi đổi, đánh dấu sau khi
  // đổi thành công. Phía tin (Q1) làm ở bước 5 của plan live-rescore.

  async approve(actorId: string, id: string): Promise<AdminSkillDto> {
    const skill = await this.requirePending(id);
    await this.rescoreMarker.markSkillHolders([id], () => this.skillsRepository.approve(id));
    await this.recordAudit(actorId, "CATALOG_ENTRY_APPROVED", id, `Duyệt kỹ năng "${skill.name}"`);

    const row = await this.skillsRepository.findAdminRow(id);
    if (!row) {
      throw new AppError(404, "Skill not found");
    }
    return toAdminSkillDto(row);
  }

  async reject(actorId: string, id: string): Promise<void> {
    const skill = await this.requirePending(id);
    await this.rescoreMarker.markSkillHolders([id], () => this.skillsRepository.reject(id));
    await this.recordAudit(actorId, "CATALOG_ENTRY_REJECTED", id, `Từ chối kỹ năng "${skill.name}"`);
  }

  async merge(actorId: string, id: string, targetSkillId: string): Promise<void> {
    const skill = await this.requirePending(id);
    if (id === targetSkillId) {
      throw new AppError(400, "Cannot merge a skill into itself");
    }

    const target = await this.skillsRepository.findById(targetSkillId);
    if (!target) {
      throw new AppError(404, "Target skill not found");
    }
    // Gộp vào một skill cũng đang chờ duyệt sẽ tạo ra chuỗi PENDING → PENDING,
    // liên kết rồi lại phải gộp lần nữa. Chỉ cho gộp vào skill đã duyệt.
    if (target.status !== "APPROVED") {
      throw new AppError(409, "A skill can only be merged into an approved skill");
    }

    await this.rescoreMarker.markSkillHolders([id], () => this.skillsRepository.merge(id, targetSkillId, "ADMIN_MERGE"));
    await this.recordAudit(actorId, "CATALOG_ENTRY_MERGED", id, `Gộp kỹ năng "${skill.name}" vào "${target.name}"`, {
      targetId: targetSkillId,
    });
  }

  private recordAudit(
    actorId: string,
    action: "CATALOG_ENTRY_APPROVED" | "CATALOG_ENTRY_REJECTED" | "CATALOG_ENTRY_MERGED",
    entityId: string,
    summary: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    return this.auditLogService.record({
      actorId,
      actorRole: "ADMIN",
      action,
      entityType: "Skill",
      entityId,
      summary,
      ...(metadata ? { metadata } : {}),
    });
  }

  private async requirePending(id: string): Promise<Skill> {
    const skill = await this.skillsRepository.findById(id);
    if (!skill) {
      throw new AppError(404, "Skill not found");
    }
    if (skill.status !== "PENDING") {
      throw new AppError(409, "Only a pending skill can be moderated");
    }
    return skill;
  }
}

export function toAdminSkillDto(row: AdminSkillRow): AdminSkillDto {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    // Chưa có bảng profile chung — dùng email làm tên hiển thị, giống
    // job-post.mapper.ts với actor kiểm duyệt.
    createdByEmail: row.createdBy?.email ?? null,
    pendingMatchSkill: row.pendingMatchSkill,
    // Số hồ sơ/tin đang gắn skill này — Admin cần biết reject sẽ làm mất bao
    // nhiêu liên kết trước khi bấm.
    usageCount: row._count.candidateSkills + row._count.jobPostSkills,
    createdAt: row.createdAt.toISOString(),
  };
}
