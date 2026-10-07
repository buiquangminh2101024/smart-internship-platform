import type { AuditLog, PrismaClient } from "@prisma/client";
import type { AdminUserListItem, PaginatedResponse, UserProfile } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { AccountSuspensionStore } from "../../shared/ports/AccountSuspensionStore";
import type { RealtimeNotifier } from "../../shared/ports/RealtimeNotifier";
import type { AuditLogRepository } from "../audit-log/audit-log.repository";
import { readReason, type AuditLogService } from "../audit-log/audit-log.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { AdminUserRow, UserRepository } from "./user.repository";
import type { AdminListUsersQuery } from "./users.dto";

export class UsersService {
  private readonly prisma: PrismaClient;
  private readonly userRepository: UserRepository;
  private readonly auditLogRepository: AuditLogRepository;
  private readonly auditLogService: AuditLogService;
  private readonly notificationsService: NotificationsService;
  private readonly accountSuspensionStore: AccountSuspensionStore;
  private readonly realtimeNotifier: RealtimeNotifier;
  private readonly logger: Logger;

  constructor({
    prisma,
    userRepository,
    auditLogRepository,
    auditLogService,
    notificationsService,
    accountSuspensionStore,
    realtimeNotifier,
    logger,
  }: {
    prisma: PrismaClient;
    userRepository: UserRepository;
    auditLogRepository: AuditLogRepository;
    auditLogService: AuditLogService;
    notificationsService: NotificationsService;
    accountSuspensionStore: AccountSuspensionStore;
    realtimeNotifier: RealtimeNotifier;
    logger: Logger;
  }) {
    this.prisma = prisma;
    this.userRepository = userRepository;
    this.auditLogRepository = auditLogRepository;
    this.auditLogService = auditLogService;
    this.notificationsService = notificationsService;
    this.accountSuspensionStore = accountSuspensionStore;
    this.realtimeNotifier = realtimeNotifier;
    this.logger = logger;
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError(404, "User not found");
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    };
  }

  // ─── Quản lý người dùng của Admin (AD-17) ────────────────────────────────

  /** GET /admin/users — người đang SUSPENDED kèm lý do / người khoá / thời điểm (U7). */
  async listForAdmin(query: AdminListUsersQuery): Promise<PaginatedResponse<AdminUserListItem>> {
    const page = await this.userRepository.listForAdmin(query);
    return {
      items: await this.toAdminItems(page.items),
      hasMore: page.hasMore,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    };
  }

  /**
   * Khoá tài khoản (U1–U3, U6). DB + nhật ký + thông báo/email trong một
   * transaction; cờ Redis và ngắt socket chạy SAU commit, để transaction lỗi
   * không chặn oan người dùng vẫn ACTIVE.
   */
  async suspend(adminId: string, userId: string, reason: string): Promise<AdminUserListItem> {
    const user = await this.requireManageableUser(userId);
    if (user.status === "SUSPENDED") {
      throw new AppError(409, "User is already suspended");
    }

    await this.prisma.$transaction(async (tx) => {
      const changed = await this.userRepository.setStatus(userId, ["ACTIVE", "PENDING_VERIFICATION"], "SUSPENDED", tx);
      if (!changed) {
        throw new AppError(409, "User is already suspended");
      }
      await this.auditLogService.record(
        {
          actorId: adminId,
          actorRole: "ADMIN",
          action: "USER_SUSPENDED",
          entityType: "User",
          entityId: userId,
          summary: `Khoá tài khoản ${user.email}`,
          metadata: { reason, previousStatus: user.status },
        },
        tx,
      );
      await this.notificationsService.notify("ACCOUNT_SUSPENDED", userId, { reason }, tx);
    });

    // Lỗi ở đây chỉ log: refresh() vẫn chặn theo DB, nên kẽ hở tối đa là thời
    // hạn còn lại của access token (như trước khi có cờ Redis).
    try {
      await this.accountSuspensionStore.markSuspended(userId);
      await this.realtimeNotifier.disconnectUser(userId);
    } catch (error) {
      this.logger.error("Không ghi được cờ khoá / ngắt socket sau khi khoá tài khoản", { userId, error });
    }

    return this.requireAdminItem(userId);
  }

  /** Mở khoá (U4): đã xác thực email ⇒ ACTIVE, chưa ⇒ PENDING_VERIFICATION. */
  async reactivate(adminId: string, userId: string): Promise<AdminUserListItem> {
    const user = await this.requireManageableUser(userId);
    if (user.status !== "SUSPENDED") {
      throw new AppError(409, "User is not suspended");
    }

    const requiresEmailVerification = user.emailVerifiedAt === null;
    const nextStatus = requiresEmailVerification ? "PENDING_VERIFICATION" : "ACTIVE";

    await this.prisma.$transaction(async (tx) => {
      const changed = await this.userRepository.setStatus(userId, ["SUSPENDED"], nextStatus, tx);
      if (!changed) {
        throw new AppError(409, "User is not suspended");
      }
      await this.auditLogService.record(
        {
          actorId: adminId,
          actorRole: "ADMIN",
          action: "USER_REACTIVATED",
          entityType: "User",
          entityId: userId,
          summary: `Mở khoá tài khoản ${user.email}`,
          metadata: { newStatus: nextStatus },
        },
        tx,
      );
      await this.notificationsService.notify("ACCOUNT_REACTIVATED", userId, { requiresEmailVerification }, tx);
    });

    try {
      await this.accountSuspensionStore.clear(userId);
    } catch (error) {
      this.logger.error("Không xoá được cờ khoá sau khi mở khoá tài khoản", { userId, error });
    }

    return this.requireAdminItem(userId);
  }

  /** 404 nếu không có user; 403 nếu là Admin — kể cả chính mình (U2). */
  private async requireManageableUser(userId: string): Promise<AdminUserRow> {
    const user = await this.userRepository.findForAdmin(userId);
    if (!user) {
      throw new AppError(404, "User not found");
    }
    if (user.role === "ADMIN") {
      throw new AppError(403, "Admin accounts cannot be suspended or reactivated");
    }
    return user;
  }

  private async requireAdminItem(userId: string): Promise<AdminUserListItem> {
    const row = await this.userRepository.findForAdmin(userId);
    if (!row) {
      throw new AppError(404, "User not found");
    }
    const [item] = await this.toAdminItems([row]);
    return item!;
  }

  private async toAdminItems(rows: AdminUserRow[]): Promise<AdminUserListItem[]> {
    const suspendedIds = rows.filter((row) => row.status === "SUSPENDED").map((row) => row.id);
    const suspensions = await this.auditLogRepository.findLatestByEntities("User", suspendedIds, "USER_SUSPENDED");
    const actorIds = [...new Set([...suspensions.values()].flatMap((log) => (log.actorId ? [log.actorId] : [])))];
    const actorEmails = await this.userRepository.findEmailsByIds(actorIds);
    return rows.map((row) => toAdminUserListItem(row, suspensions.get(row.id), actorEmails));
  }
}

function toAdminUserListItem(
  row: AdminUserRow,
  suspension: AuditLog | undefined,
  actorEmails: Map<string, string>,
): AdminUserListItem {
  const name =
    row.role === "CANDIDATE" ? row.candidate?.fullName?.trim() : row.role === "EMPLOYER" ? row.employer?.company.name : null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    name: name || null,
    companyId: row.employer?.companyId ?? null,
    emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    // Tài khoản bị khoá trước khi có AuditLog USER_SUSPENDED (vd. sửa tay DB) thì không có thông tin khoá.
    suspension:
      row.status === "SUSPENDED" && suspension
        ? {
            reason: readReason(suspension.metadata),
            byEmail: suspension.actorId ? (actorEmails.get(suspension.actorId) ?? null) : null,
            at: new Date(suspension.createdAt).toISOString(),
          }
        : null,
  };
}
