export type OtpPurpose = "register" | "reset-password";

export interface OtpStore {
  /** Lưu `code` cho `(purpose, email)` với TTL cố định (xem RedisOtpStore). Đặt lại bộ đếm nhập sai về 0. */
  set(purpose: OtpPurpose, email: string, code: string): Promise<void>;

  /** Đọc lại code đã lưu, null nếu không tồn tại/đã hết hạn. */
  get(purpose: OtpPurpose, email: string): Promise<string | null>;

  /** Xoá code (sau khi verify thành công, hoặc khi nhập sai quá số lần) cùng bộ đếm nhập sai. */
  delete(purpose: OtpPurpose, email: string): Promise<void>;

  /** Ghi một lần nhập sai, trả số lần sai của mã hiện tại (AD-31 D3). Bộ đếm sống cùng TTL với mã. */
  recordFailure(purpose: OtpPurpose, email: string): Promise<number>;
}
