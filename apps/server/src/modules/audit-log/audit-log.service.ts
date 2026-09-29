import type { Prisma } from "@prisma/client";
import type { AuditActivityItem, PaginatedResponse } from "@sip/shared-types";
import type { Logger } from "../../shared/logger";
import type { UserRepository } from "../users/user.repository";
import type { AuditLogRepository, AuditLogWriteData } from "./audit-log.repository";

/**
 * Nhật ký hoạt động cho Admin (AD-16). `summary` là câu tiếng Việt do caller
 * render lúc ghi — snapshot, không dựng lại khi đọc (giống Notification).
 */
export class AuditLogService {
  private readonly auditLogRepository: AuditLogRepository;
  private readonly userRepository: UserRepository;
  private readonly logger: Logger;

  constructor({
    auditLogRepository,
    userRepository,
    logger,
  }: {
    auditLogRepository: AuditLogRepository;
    userRepository: UserRepository;
    logger: Logger;
  }) {
    this.auditLogRepository = auditLogRepository;
    this.userRepository = userRepository;
    this.logger = logger;
  }

  /** GET /admin/activity — mới nhất trước. */
  async listActivity(options: { cursor?: string | undefined; limit: number }): Promise<PaginatedResponse<AuditActivityItem>> {
    const page = await this.auditLogRepository.listLatest(options);
    const actorIds = [...new Set(page.items.flatMap((item) => (item.actorId ? [item.actorId] : [])))];
    const emails = await this.userRepository.findEmailsByIds(actorIds);
    return {
      items: page.items.map((item) => ({
        id: item.id,
        actorId: item.actorId,
        actorRole: item.actorRole,
        actorEmail: item.actorId ? (emails.get(item.actorId) ?? null) : null,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        summary: item.summary,
        createdAt: item.createdAt.toISOString(),
      })),
      hasMore: page.hasMore,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  /**
   * Có `tx`: ghi cùng transaction với thao tác nghiệp vụ, lỗi thì rollback cả hai.
   * Không có `tx` (thao tác đã commit riêng, vd. repository danh mục tự mở
   * transaction): ghi sau cùng và chỉ log lỗi — mất một dòng nhật ký không đáng
   * để báo thất bại cho một thao tác đã thành công.
   */
  async record(entry: AuditLogWriteData, tx?: Prisma.TransactionClient): Promise<void> {
    if (tx) {
      await this.auditLogRepository.create(entry, tx);
      return;
    }
    try {
      await this.auditLogRepository.create(entry);
    } catch (error) {
      this.logger.error("Không ghi được audit log", { error, action: entry.action, entityId: entry.entityId });
    }
  }
}
