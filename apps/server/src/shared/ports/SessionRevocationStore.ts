// Mốc "đăng xuất mọi thiết bị" cho kiểm tra nhanh ở mỗi request/handshake
// (AD-18). Nguồn sự thật là `User.sessionsRevokedAt` trong DB (do /auth/refresh
// đọc) — đây chỉ là bản sao ngắn hạn để authenticate/Socket.IO không phải truy
// vấn DB, ghi SAU khi transaction thu hồi đã commit.
//
// Bản sao chỉ cần sống bằng thời hạn access token: access token cấp trước mốc
// sẽ tự hết hạn trong khoảng đó, còn refresh token cũ đã bị cột DB chặn. Khi
// không còn bản sao, authenticate KHÔNG hỏi lại DB — không còn gì cần chặn.
export interface SessionRevocationStore {
  /** Ghi mốc thu hồi (epoch giây) của userId, tự hết hạn sau thời hạn access token. */
  markRevoked(userId: string, revokedAtSec: number): Promise<void>;

  /** Mốc thu hồi (epoch giây) còn hiệu lực của userId, `null` nếu không có. */
  getRevokedAt(userId: string): Promise<number | null>;
}
