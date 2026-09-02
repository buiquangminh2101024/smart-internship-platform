export type OtpPurpose = "register" | "reset-password";

export interface OtpStore {
  /** Lưu `code` cho `(purpose, email)` với TTL cố định (xem RedisOtpStore). */
  set(purpose: OtpPurpose, email: string, code: string): Promise<void>;

  /** Đọc lại code đã lưu, null nếu không tồn tại/đã hết hạn. */
  get(purpose: OtpPurpose, email: string): Promise<string | null>;

  /** Xoá code sau khi verify thành công (chống dùng lại). */
  delete(purpose: OtpPurpose, email: string): Promise<void>;
}
