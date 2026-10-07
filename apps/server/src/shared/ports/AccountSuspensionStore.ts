// Cờ "tài khoản đang bị khoá" cho kiểm tra nhanh ở mỗi request/handshake
// (AD-17). Nguồn sự thật vẫn là `User.status` trong DB — cờ này chỉ là bản sao
// để authenticate/Socket.IO không phải truy vấn DB, ghi SAU khi transaction
// khoá/mở khoá đã commit.
export interface AccountSuspensionStore {
  /** Đánh dấu userId đang bị khoá (không hết hạn, tới khi `clear`). */
  markSuspended(userId: string): Promise<void>;

  /** Bỏ cờ khoá của userId (mở khoá). */
  clear(userId: string): Promise<void>;

  /** true nếu userId đang bị đánh dấu khoá. */
  isSuspended(userId: string): Promise<boolean>;
}
