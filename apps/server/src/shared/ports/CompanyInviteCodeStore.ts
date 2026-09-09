// Mã mời liên kết nhân viên mới vào một Company đã có (Phase 4) — sinh bởi
// employer isCompanyAdmin=true, TTL 2 phút, dùng một lần. Tách riêng khỏi
// OtpStore vì key theo companyId/code chứ không theo (purpose, email).
export interface CompanyInviteCodeStore {
  /** Sinh mã mới cho companyId (TTL 2 phút), vô hiệu hoá mã cũ của cùng companyId nếu có. */
  issue(companyId: string): Promise<string>;

  /** Đổi mã lấy companyId rồi xoá (dùng một lần); null nếu mã sai/hết hạn. */
  consume(code: string): Promise<string | null>;
}
