import type { NotificationType, Role } from "@prisma/client";
import type { NotificationGroup } from "@sip/shared-types";

// Nhóm của trung tâm thông báo (AD-16, docs/06-backend/dashboard-employer-admin/PLAN.md
// mục "Thông báo"). Chỉ là ánh xạ trong code, không lưu vào DB: đổi nhóm không
// cần migration. Record<NotificationType, ...> ép khai báo nhóm cho mọi loại mới.
export const NOTIFICATION_GROUP_BY_TYPE: Record<NotificationType, NotificationGroup> = {
  APPLICATION_STATUS_CHANGED: "APPLICATIONS",
  APPLICATION_RECEIVED: "APPLICATIONS",
  JOB_POST_APPROVED: "JOB_POSTS",
  JOB_POST_REJECTED: "JOB_POSTS",
  JOB_POST_TAKEN_DOWN: "JOB_POSTS",
  JOB_POST_EXPIRING: "JOB_POSTS",
  JOB_POST_SUBMITTED: "JOB_POSTS",
  COMPANY_VERIFIED: "COMPANY",
  COMPANY_REJECTED: "COMPANY",
  COMPANY_LINK_REQUESTED: "COMPANY",
  CANDIDATE_OUTREACH_INVITATION_RECEIVED: "INVITATIONS",
  CANDIDATE_OUTREACH_INVITATION_RESPONDED: "INVITATIONS",
  SUBSCRIPTION_EXPIRING: "SUBSCRIPTION",
  CATALOG_ENTRY_SUGGESTED: "CATALOG",
  PAYMENT_COMPLETED: "PAYMENTS",
  INTERVIEW_SCHEDULED: "INTERVIEWS",
  INTERVIEW_RESCHEDULED: "INTERVIEWS",
  INTERVIEW_CANCELLED: "INTERVIEWS",
  INTERVIEW_REMINDER: "INTERVIEWS",
  ACCOUNT_SUSPENDED: "ACCOUNT",
  ACCOUNT_REACTIVATED: "ACCOUNT",
  SUPPORT_CONTACT_RECEIVED: "ACCOUNT",
};

// Record<NotificationGroup, ...> ép liệt kê đủ nhóm của shared-types — nguồn cho
// validate query `group`.
const GROUP_KEYS: Record<NotificationGroup, true> = {
  APPLICATIONS: true,
  JOB_POSTS: true,
  COMPANY: true,
  INVITATIONS: true,
  INTERVIEWS: true,
  SUBSCRIPTION: true,
  CATALOG: true,
  PAYMENTS: true,
  ACCOUNT: true,
};
export const NOTIFICATION_GROUPS = Object.keys(GROUP_KEYS) as [NotificationGroup, ...NotificationGroup[]];

// Thứ tự = thứ tự tab trên giao diện. Employer chỉ nhận INTERVIEW_REMINDER trong
// nhóm INTERVIEWS (ba loại còn lại gửi ứng viên). ACCOUNT (AD-17): ứng viên/NTD nhận
// thông báo khoá/mở khoá, Admin nhận yêu cầu hỗ trợ.
export const NOTIFICATION_GROUPS_BY_ROLE: Record<Role, NotificationGroup[]> = {
  CANDIDATE: ["APPLICATIONS", "INTERVIEWS", "INVITATIONS", "ACCOUNT"],
  EMPLOYER: ["APPLICATIONS", "JOB_POSTS", "COMPANY", "INVITATIONS", "INTERVIEWS", "SUBSCRIPTION", "ACCOUNT"],
  ADMIN: ["JOB_POSTS", "COMPANY", "CATALOG", "PAYMENTS", "ACCOUNT"],
};

export function typesInGroup(group: NotificationGroup): NotificationType[] {
  return (Object.keys(NOTIFICATION_GROUP_BY_TYPE) as NotificationType[]).filter(
    (type) => NOTIFICATION_GROUP_BY_TYPE[type] === group,
  );
}
