import type { AuditActionGroup, AuditActivityGroup } from "@sip/shared-types";

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
  // Bảo mật (AD-20, docs/06-backend/admin-audit-log/PLAN.md L2–L6)
  "AUTH_LOGIN_SUCCEEDED",
  "AUTH_LOGIN_FAILED_REPEATED",
  "AUTH_PASSWORD_RESET",
  "AUTH_GOOGLE_LINKED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntityType = "JobPost" | "Company" | "Skill" | "University" | "Major" | "Subscription" | "User";

/**
 * Nhóm hành động (L1): bộ lọc và biểu đồ làm việc theo nhóm. Mỗi action thuộc
 * đúng một nhóm — unit test `audit-log-actions.test.ts` kiểm không sót action nào.
 */
export const AUDIT_ACTION_GROUPS: Record<AuditActionGroup, readonly AuditAction[]> = {
  JOB_POST: [
    "JOB_POST_SUBMITTED",
    "JOB_POST_AUTO_PUBLISHED",
    "JOB_POST_APPROVED",
    "JOB_POST_REJECTED",
    "JOB_POST_RETRACTED",
  ],
  COMPANY: [
    "COMPANY_SUBMITTED",
    "COMPANY_AUTO_VERIFIED",
    "COMPANY_VERIFIED",
    "COMPANY_REJECTED",
    "COMPANY_REQUIRES_APPROVAL_CHANGED",
  ],
  CATALOG: [
    "CATALOG_ENTRY_APPROVED",
    "CATALOG_ENTRY_RENAME_APPROVED",
    "CATALOG_ENTRY_REJECTED",
    "CATALOG_ENTRY_MERGED",
  ],
  PAYMENT: ["PAYMENT_COMPLETED"],
  ACCOUNT: [
    "USER_SUSPENDED",
    "USER_REACTIVATED",
    "USER_SESSIONS_REVOKED",
    "USER_ACTIVATED",
    "USER_PASSWORD_RESET_GUIDE_SENT",
  ],
  SECURITY: ["AUTH_LOGIN_SUCCEEDED", "AUTH_LOGIN_FAILED_REPEATED", "AUTH_PASSWORD_RESET", "AUTH_GOOGLE_LINKED"],
};

const GROUP_BY_ACTION = new Map<string, AuditActionGroup>(
  Object.entries(AUDIT_ACTION_GROUPS).flatMap(([group, actions]) =>
    actions.map((action) => [action, group as AuditActionGroup] as const),
  ),
);

// Dòng cũ có action không còn trong danh sách (vd. `JOB_POST_TAKEN_DOWN`) ⇒ xếp theo đối tượng.
const GROUP_BY_ENTITY_TYPE: Record<string, AuditActionGroup> = {
  JobPost: "JOB_POST",
  Company: "COMPANY",
  Skill: "CATALOG",
  University: "CATALOG",
  Major: "CATALOG",
  Subscription: "PAYMENT",
  User: "ACCOUNT",
};

export function isAuditAction(action: string): action is AuditAction {
  return GROUP_BY_ACTION.has(action);
}

/** Nhóm của một dòng nhật ký; không xác định được thì `OTHER`. */
export function groupOfAction(action: string, entityType?: string): AuditActivityGroup {
  return GROUP_BY_ACTION.get(action) ?? (entityType ? GROUP_BY_ENTITY_TYPE[entityType] : undefined) ?? "OTHER";
}
