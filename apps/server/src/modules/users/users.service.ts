import type { AuditLog, PrismaClient } from "@prisma/client";
import type {
  AdminBulkActionResponse,
  AdminBulkActionResult,
  AdminUserCandidateDetail,
  AdminUserDetail,
  AdminUserEmployerDetail,
  AdminUserListItem,
  AdminUserListResponse,
  JobPostStatus,
  UserProfile,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { AccountSuspensionStore } from "../../shared/ports/AccountSuspensionStore";
import type { RateLimiter } from "../../shared/ports/RateLimiter";
import type { RealtimeNotifier } from "../../shared/ports/RealtimeNotifier";
import type { AuditLogRepository } from "../audit-log/audit-log.repository";
import type { SessionRevocationService } from "../auth/session-revocation.service";
import { readReason, type AuditLogService } from "../audit-log/audit-log.service";
import type { NotificationsService } from "../notifications/notifications.service";
import {
  ADMIN_DETAIL_LIMIT,
  ADMIN_PAGE_SIZE,
  type AdminUserDetailRow,
  type AdminUserRow,
  type UserRepository,
} from "./user.repository";
import type { AdminListUsersQuery } from "./users.dto";

// P4 (AD-18): giới hạn số lần Admin gửi hướng dẫn đặt lại mật khẩu cho một người,
// để không spam hộp thư của họ.
const PASSWORD_RESET_SENDS_PER_HOUR = 3;
const ONE_HOUR_SECONDS = 60 * 60;

// Trạng thái không có tin vẫn trả 0 (E5), để frontend không phải tự điền.
const JOB_POST_STATUSES: readonly JobPostStatus[] = ["DRAFT", "PENDING", "PUBLISHED", "EXPIRED", "CLOSED", "TAKEN_DOWN"];

export class UsersService {
  private readonly prisma: PrismaClient;
  private readonly userRepository: UserRepository;
  private readonly auditLogRepository: AuditLogRepository;
  private readonly auditLogService: AuditLogService;
  private readonly notificationsService: NotificationsService;
  private readonly accountSuspensionStore: AccountSuspensionStore;
  private readonly realtimeNotifier: RealtimeNotifier;
  private readonly sessionRevocationService: SessionRevocationService;
  private readonly rateLimiter: RateLimiter;
  private readonly logger: Logger;

  constructor({
    prisma,
    userRepository,
    auditLogRepository,
    auditLogService,
    notificationsService,
    accountSuspensionStore,
    realtimeNotifier,
    sessionRevocationService,
    rateLimiter,
    logger,
  }: {
    prisma: PrismaClient;
    userRepository: UserRepository;
    auditLogRepository: AuditLogRepository;
    auditLogService: AuditLogService;
    notificationsService: NotificationsService;
    accountSuspensionStore: AccountSuspensionStore;
    realtimeNotifier: RealtimeNotifier;
    sessionRevocationService: SessionRevocationService;
    rateLimiter: RateLimiter;
    logger: Logger;
  }) {
    this.prisma = prisma;
    this.userRepository = userRepository;
    this.auditLogRepository = auditLogRepository;
    this.auditLogService = auditLogService;
    this.notificationsService = notificationsService;
    this.accountSuspensionStore = accountSuspensionStore;
    this.realtimeNotifier = realtimeNotifier;
    this.sessionRevocationService = sessionRevocationService;
    this.rateLimiter = rateLimiter;
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
      // E9 — chỉ cho biết có mật khẩu hay không, không trả hash.
      hasPassword: user.passwordHash !== null,
    };
  }

  // ─── Quản lý người dùng của Admin (AD-17) ────────────────────────────────

  /**
   * GET /admin/users — người đang SUSPENDED kèm lý do / người khoá / thời điểm
   * (U7). Trang vượt quá tổng số trả `items` rỗng kèm `total` thật (không 404).
   */
  async listForAdmin(query: AdminListUsersQuery): Promise<AdminUserListResponse> {
    const { items, total } = await this.userRepository.listForAdmin(query);
    return { items: await this.toAdminItems(items), total, page: query.page, pageSize: ADMIN_PAGE_SIZE };
  }

  /**
   * GET /admin/users/:id (E4, E5). Admin xem được mọi tài khoản, kể cả Admin
   * (E8: chỉ tài khoản + lịch sử). Không trả phone, ngày sinh, link CV.
   */
  async getDetailForAdmin(userId: string): Promise<AdminUserDetail> {
    const row = await this.userRepository.findDetailForAdmin(userId);
    if (!row) {
      throw new AppError(404, "User not found");
    }

    const [[item], history, jobPostCounts] = await Promise.all([
      this.toAdminItems([row]),
      this.auditLogRepository.listByEntity("User", userId, ADMIN_DETAIL_LIMIT),
      row.role === "EMPLOYER" && row.employer ? this.userRepository.countJobPostsByStatus(row.employer.id) : null,
    ]);
    const actorIds = [...new Set(history.items.flatMap((log) => (log.actorId ? [log.actorId] : [])))];
    const actorEmails = await this.userRepository.findEmailsByIds(actorIds);

    return {
      account: { ...item!, sessionsRevokedAt: row.sessionsRevokedAt?.toISOString() ?? null },
      history: {
        total: history.total,
        items: history.items.map((log) => ({
          id: log.id,
          action: log.action,
          summary: log.summary,
          reason: readReason(log.metadata),
          actorEmail: log.actorId ? (actorEmails.get(log.actorId) ?? null) : null,
          at: log.createdAt.toISOString(),
        })),
      },
      candidate: row.role === "CANDIDATE" ? toCandidateDetail(row.candidate) : null,
      employer: row.role === "EMPLOYER" && row.employer && jobPostCounts ? toEmployerDetail(row.employer, jobPostCounts) : null,
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

  // ─── Mở rộng 1 (AD-18) ──────────────────────────────────────────────────

  /**
   * Buộc đăng xuất mọi thiết bị (E2). Không khoá, không gửi thông báo. Chỉ cho
   * tài khoản ACTIVE (P3): PENDING_VERIFICATION chưa đăng nhập được, SUSPENDED đã
   * bị chặn bằng cờ khoá. Mốc + nhật ký trong một transaction; Redis và ngắt
   * socket chạy SAU commit (như suspend).
   */
  async revokeSessions(adminId: string, userId: string, reason: string | undefined): Promise<AdminUserListItem> {
    const user = await this.requireManageableUser(userId);
    if (user.status !== "ACTIVE") {
      throw new AppError(409, "Only active accounts can be signed out");
    }

    const revokedAtSec = await this.prisma.$transaction(async (tx) => {
      const at = await this.sessionRevocationService.revokeInTx(userId, tx);
      await this.auditLogService.record(
        {
          actorId: adminId,
          actorRole: "ADMIN",
          action: "USER_SESSIONS_REVOKED",
          entityType: "User",
          entityId: userId,
          summary: `Buộc đăng xuất ${user.email}`,
          ...(reason ? { metadata: { reason } } : {}),
        },
        tx,
      );
      return at;
    });
    await this.sessionRevocationService.propagate(userId, revokedAtSec);

    return this.requireAdminItem(userId);
  }

  /**
   * Kích hoạt thủ công tài khoản chưa xác thực email (E3), dùng sau khi người
   * dùng liên hệ /support. Ghi cả `emailVerifiedAt` (P1) và `verifiedBy: "ADMIN"`
   * để sau này phân biệt với người tự xác thực bằng OTP. Đổi trạng thái, nhật ký,
   * thông báo + email trong một transaction.
   */
  async activate(adminId: string, userId: string, reason: string): Promise<AdminUserListItem> {
    const user = await this.requireManageableUser(userId);
    if (user.status !== "PENDING_VERIFICATION") {
      throw new AppError(409, "User is not pending email verification");
    }

    await this.prisma.$transaction(async (tx) => {
      const changed = await this.userRepository.activateManually(userId, tx);
      if (!changed) {
        throw new AppError(409, "User is not pending email verification");
      }
      await this.auditLogService.record(
        {
          actorId: adminId,
          actorRole: "ADMIN",
          action: "USER_ACTIVATED",
          entityType: "User",
          entityId: userId,
          summary: `Kích hoạt thủ công ${user.email}`,
          metadata: { reason, verifiedBy: "ADMIN" },
        },
        tx,
      );
      await this.notificationsService.notify("ACCOUNT_ACTIVATED", userId, {}, tx);
    });

    return this.requireAdminItem(userId);
  }

  /**
   * Gửi hướng dẫn đặt lại mật khẩu (E1): chỉ là thông báo + email có link tới
   * /forgot-password, người dùng tự xin OTP ở đó. Mật khẩu không đổi nên không
   * buộc đăng xuất.
   */
  async sendPasswordResetGuide(adminId: string, userId: string): Promise<AdminUserListItem> {
    const user = await this.requireManageableUser(userId);
    if (!user.passwordHash) {
      // P4: tài khoản chỉ đăng nhập bằng Google — forgotPassword bỏ qua tài khoản
      // này, nên gửi hướng dẫn cũng vô ích.
      throw new AppError(409, "User has no password (signs in with Google only)", "USER_HAS_NO_PASSWORD");
    }
    if (user.status === "SUSPENDED") {
      throw new AppError(409, "User is suspended");
    }
    // Đếm sau các bước kiểm, để lần bị từ chối vì 409 không tính vào hạn mức.
    const allowed = await this.rateLimiter.consume(
      `admin-pw-reset-guide:${userId}`,
      PASSWORD_RESET_SENDS_PER_HOUR,
      ONE_HOUR_SECONDS,
    );
    if (!allowed) {
      throw new AppError(429, "Password reset instructions were sent too often — please try again later");
    }

    await this.prisma.$transaction(async (tx) => {
      await this.auditLogService.record(
        {
          actorId: adminId,
          actorRole: "ADMIN",
          action: "USER_PASSWORD_RESET_GUIDE_SENT",
          entityType: "User",
          entityId: userId,
          summary: `Gửi hướng dẫn đặt lại mật khẩu cho ${user.email}`,
        },
        tx,
      );
      await this.notificationsService.notify("PASSWORD_RESET_SUGGESTED", userId, {}, tx);
    });

    return this.requireAdminItem(userId);
  }

  /** Khoá hàng loạt (E7): mỗi người xử lý như khoá lẻ, kết quả theo từng người. */
  bulkSuspend(adminId: string, userIds: string[], reason: string): Promise<AdminBulkActionResponse> {
    return this.runBulk(userIds, (userId) => this.suspend(adminId, userId, reason));
  }

  /** Mở khoá hàng loạt (E7). */
  bulkReactivate(adminId: string, userIds: string[]): Promise<AdminBulkActionResponse> {
    return this.runBulk(userIds, (userId) => this.reactivate(adminId, userId));
  }

  /**
   * Thành công từng phần: mỗi người một transaction (trong suspend/reactivate),
   * lỗi của người này không huỷ người khác. Chạy tuần tự để không chiếm cùng lúc
   * tới 20 kết nối DB. Lỗi không phải AppError (vd. mất kết nối DB) vẫn ghi vào
   * kết quả thay vì ném 500, vì những người trước đó đã được xử lý xong.
   */
  private async runBulk(
    userIds: string[],
    action: (userId: string) => Promise<unknown>,
  ): Promise<AdminBulkActionResponse> {
    const results: AdminBulkActionResult[] = [];
    for (const userId of userIds) {
      try {
        await action(userId);
        results.push({ userId, ok: true });
      } catch (error) {
        if (error instanceof AppError) {
          results.push({ userId, ok: false, status: error.statusCode, message: error.message });
        } else {
          this.logger.error("Thao tác hàng loạt lỗi với một người dùng", { userId, error });
          results.push({ userId, ok: false, status: 500, message: "Internal server error" });
        }
      }
    }
    return { results };
  }

  /** 404 nếu không có user; 403 nếu là Admin — kể cả chính mình (U2, E8). */
  private async requireManageableUser(userId: string): Promise<AdminUserRow> {
    const user = await this.userRepository.findForAdmin(userId);
    if (!user) {
      throw new AppError(404, "User not found");
    }
    if (user.role === "ADMIN") {
      throw new AppError(403, "Admin accounts cannot be managed here");
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
    hasPassword: row.passwordHash !== null,
    hasGoogle: row.googleId !== null,
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

/** Ứng viên chưa có dòng Candidate (chưa từng mở hồ sơ / tải CV) ⇒ hồ sơ null, danh sách rỗng. */
function toCandidateDetail(candidate: AdminUserDetailRow["candidate"]): AdminUserCandidateDetail {
  if (!candidate) {
    return { profile: null, cvs: [], applications: { total: 0, items: [] }, invitations: { total: 0, items: [] } };
  }
  return {
    profile: {
      fullName: candidate.fullName,
      headline: candidate.headline,
      isOpenToOutreach: candidate.isOpenToOutreach,
      educations: candidate.educations.map((education) => ({
        universityName: education.university?.name ?? null,
        majorName: education.major?.name ?? null,
        degree: education.degree,
        startYear: education.startYear,
        endYear: education.endYear,
        isCurrent: education.isCurrent,
      })),
      skills: candidate.skills.map((entry) => entry.skill.name),
    },
    cvs: candidate.cvs.map((cv) => ({
      id: cv.id,
      fileName: cv.fileName,
      uploadedAt: cv.uploadedAt.toISOString(),
      isDefault: cv.isDefault,
      isHidden: cv.isHidden,
    })),
    applications: {
      total: candidate._count.applications,
      items: candidate.applications.map((application) => ({
        id: application.id,
        jobPost: { id: application.jobPost.id, title: application.jobPost.title },
        company: application.jobPost.company,
        status: application.status,
        createdAt: application.createdAt.toISOString(),
      })),
    },
    invitations: {
      total: candidate._count.outreachInvitations,
      items: candidate.outreachInvitations.map((invitation) => ({
        id: invitation.id,
        jobPost: invitation.jobPost,
        company: invitation.company,
        status: invitation.status,
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
      })),
    },
  };
}

function toEmployerDetail(
  employer: NonNullable<AdminUserDetailRow["employer"]>,
  counts: Map<JobPostStatus, number>,
): AdminUserEmployerDetail {
  return {
    company: { id: employer.companyId, name: employer.company.name, verificationStatus: employer.company.verificationStatus },
    isCompanyAdmin: employer.isCompanyAdmin,
    title: employer.title,
    jobPostCounts: Object.fromEntries(JOB_POST_STATUSES.map((status) => [status, counts.get(status) ?? 0])) as Record<
      JobPostStatus,
      number
    >,
  };
}
