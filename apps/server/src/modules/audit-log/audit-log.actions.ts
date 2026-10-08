// Hằng số `action` của bảng audit_logs (AD-16). Cột trong DB là String để thêm
// hành động mới không cần migration; tập giá trị hợp lệ được giữ ở đây.
export const AUDIT_ACTIONS = [
  // Tin tuyển dụng
  "JOB_POST_SUBMITTED",
  "JOB_POST_AUTO_PUBLISHED",
  "JOB_POST_APPROVED",
  "JOB_POST_REJECTED",
  "JOB_POST_RETRACTED",
  // Công ty
  "COMPANY_SUBMITTED",
  "COMPANY_AUTO_VERIFIED",
  "COMPANY_VERIFIED",
  "COMPANY_REJECTED",
  "COMPANY_REQUIRES_APPROVAL_CHANGED",
  // Danh mục kỹ năng / trường / ngành
  "CATALOG_ENTRY_APPROVED",
  "CATALOG_ENTRY_RENAME_APPROVED",
  "CATALOG_ENTRY_REJECTED",
  "CATALOG_ENTRY_MERGED",
  // Thanh toán
  "PAYMENT_COMPLETED",
  // Tài khoản người dùng (AD-17)
  "USER_SUSPENDED",
  "USER_REACTIVATED",
  // Mở rộng 1 (AD-18)
  "USER_SESSIONS_REVOKED",
  "USER_ACTIVATED",
  "USER_PASSWORD_RESET_GUIDE_SENT",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntityType = "JobPost" | "Company" | "Skill" | "University" | "Major" | "Subscription" | "User";
