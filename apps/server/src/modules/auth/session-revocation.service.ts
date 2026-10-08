import type { Prisma } from "@prisma/client";
import type { Logger } from "../../shared/logger";
import type { RealtimeNotifier } from "../../shared/ports/RealtimeNotifier";
import type { SessionRevocationStore } from "../../shared/ports/SessionRevocationStore";
import type { UserRepository } from "../users/user.repository";

/**
 * Token có `iat` (giây) <= mốc thu hồi ⇒ bị từ chối (AD-18, P8). Dùng `<=` để
 * token cấp cùng giây với lúc thu hồi cũng bị chặn. Dùng chung cho authenticate,
 * Socket.IO và /auth/refresh.
 */
export function isIssuedBeforeRevocation(iat: number, revokedAtSec: number | null): boolean {
  return revokedAtSec !== null && iat <= revokedAtSec;
}

/** Đổi cột `User.sessionsRevokedAt` ra epoch giây để so với `iat`. */
export function toRevokedAtSec(sessionsRevokedAt: Date | null): number | null {
  return sessionsRevokedAt ? Math.floor(sessionsRevokedAt.getTime() / 1000) : null;
}

/**
 * Thu hồi mọi phiên của một người dùng (AD-18). Chia 2 bước để bên gọi đặt
 * bước ghi DB vào transaction của mình (cùng đổi mật khẩu / ghi AuditLog):
 *
 *   await prisma.$transaction(async (tx) => { at = await revokeInTx(userId, tx); ... });
 *   await propagate(userId, at); // SAU commit
 *
 * Đăng ký trong container.ts vì cả `auth` (đặt lại mật khẩu) lẫn `users` (nút
 * Admin "Buộc đăng xuất") đều dùng.
 */
export class SessionRevocationService {
  private readonly userRepository: UserRepository;
  private readonly sessionRevocationStore: SessionRevocationStore;
  private readonly realtimeNotifier: RealtimeNotifier;
  private readonly logger: Logger;

  constructor({
    userRepository,
    sessionRevocationStore,
    realtimeNotifier,
    logger,
  }: {
    userRepository: UserRepository;
    sessionRevocationStore: SessionRevocationStore;
    realtimeNotifier: RealtimeNotifier;
    logger: Logger;
  }) {
    this.userRepository = userRepository;
    this.sessionRevocationStore = sessionRevocationStore;
    this.realtimeNotifier = realtimeNotifier;
    this.logger = logger;
  }

  /** Ghi mốc vào DB trong transaction của bên gọi; trả mốc (epoch giây) để truyền cho `propagate`. */
  async revokeInTx(userId: string, tx: Prisma.TransactionClient): Promise<number> {
    // Làm tròn xuống giây cho khớp với `iat` của JWT (P8).
    const revokedAtSec = Math.floor(Date.now() / 1000);
    await this.userRepository.markSessionsRevoked(userId, new Date(revokedAtSec * 1000), tx);
    return revokedAtSec;
  }

  /**
   * Gọi SAU commit: ghi bản sao Redis rồi ngắt socket. Lỗi chỉ log — refresh()
   * vẫn chặn theo cột DB, nên kẽ hở tối đa là thời hạn còn lại của access token
   * (giống cờ khoá của AD-17).
   */
  async propagate(userId: string, revokedAtSec: number): Promise<void> {
    try {
      await this.sessionRevocationStore.markRevoked(userId, revokedAtSec);
      await this.realtimeNotifier.disconnectUser(userId);
    } catch (error) {
      this.logger.error("Không ghi được mốc thu hồi phiên / ngắt socket", { userId, error });
    }
  }
}
