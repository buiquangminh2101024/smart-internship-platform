import type { InterviewMode, NotificationType, UserStatus } from "@prisma/client";
import type { SupportCategory } from "@sip/shared-types";

/** Phần chung của payload INTERVIEW_* — mọi giá trị chụp tại lúc gửi. */
interface InterviewDetails {
  interviewId: string;
  applicationId: string;
  jobPostTitle: string;
  companyName: string;
  scheduledAt: Date;
  durationMinutes: number;
  mode: InterviewMode;
  location: string | null;
  note: string | null;
}

/**
 * Dữ liệu đầu vào để render template cho từng loại notification. Giữ ở
 * server-local (không đưa vào packages/shared-types) vì đây là write-shape nội
 * bộ, frontend không bao giờ nhìn thấy — nó chỉ nhận title/body/link đã render.
 */
export interface NotificationPayloadMap {
  APPLICATION_STATUS_CHANGED: {
    applicationId: string;
    jobPostId: string;
    jobPostTitle: string;
    companyName: string;
    oldStatus: string;
    newStatus: string;
  };
  JOB_POST_APPROVED: { jobPostId: string; jobPostTitle: string };
  JOB_POST_REJECTED: { jobPostId: string; jobPostTitle: string; reason?: string };
  JOB_POST_TAKEN_DOWN: { jobPostId: string; jobPostTitle: string; reason?: string };
  COMPANY_VERIFIED: { companyId: string; companyName: string };
  COMPANY_REJECTED: { companyId: string; companyName: string; reason?: string };
  COMPANY_LINK_REQUESTED: { companyId: string; companyName: string; employerEmail: string };
  JOB_POST_SUBMITTED: { jobPostId: string; jobPostTitle: string; companyName: string };
  // B3, AD-15 — docs/06-backend/candidate-outreach/PLAN.md
  CANDIDATE_OUTREACH_INVITATION_RECEIVED: {
    invitationId: string;
    jobPostId: string;
    jobPostTitle: string;
    companyName: string;
    expiresAt: Date;
  };
  CANDIDATE_OUTREACH_INVITATION_RESPONDED: {
    invitationId: string;
    jobPostId: string;
    jobPostTitle: string;
    candidateName: string | null;
    accepted: boolean;
  };
  // AD-16 — dashboard Employer & Admin, docs/06-backend/dashboard-employer-admin/PLAN.md
  APPLICATION_RECEIVED: {
    applicationId: string;
    jobPostId: string;
    jobPostTitle: string;
    candidateName: string | null;
  };
  JOB_POST_EXPIRING: { jobPostId: string; jobPostTitle: string; expiresAt: Date };
  SUBSCRIPTION_EXPIRING: { subscriptionId: string; planName: string; endDate: Date };
  CATALOG_ENTRY_SUGGESTED: {
    entryType: "SKILL" | "UNIVERSITY" | "MAJOR";
    entryId: string;
    entryName: string;
    /** D14 — họ tên ứng viên / tên công ty của người đề xuất; null thì ghi "Một người dùng". */
    suggestedByName: string | null;
  };
  PAYMENT_COMPLETED: { paymentId: string; companyId: string; companyName: string; planName: string; amount: number };
  // AD-16 M2 — lịch phỏng vấn. Ba loại đầu chỉ gửi ứng viên (có email).
  INTERVIEW_SCHEDULED: InterviewDetails;
  INTERVIEW_RESCHEDULED: InterviewDetails & { previousScheduledAt: Date };
  INTERVIEW_CANCELLED: Pick<InterviewDetails, "interviewId" | "applicationId" | "jobPostTitle" | "companyName" | "scheduledAt"> & {
    reason: string;
  };
  // Cron nhắc lịch gửi cả hai phía; chỉ ứng viên nhận email.
  INTERVIEW_REMINDER: InterviewDetails & { recipientRole: "CANDIDATE" | "EMPLOYER"; candidateName: string | null };
  // AD-17 — khoá/mở khoá tài khoản (gửi chính người bị khoá) và yêu cầu hỗ trợ (gửi Admin).
  ACCOUNT_SUSPENDED: { reason: string };
  ACCOUNT_REACTIVATED: { requiresEmailVerification: boolean };
  // AD-18 — Admin kích hoạt thủ công / gửi hướng dẫn đặt lại mật khẩu (gửi chính
  // người đó). Nội dung cố định nên payload rỗng.
  ACCOUNT_ACTIVATED: Record<string, never>;
  PASSWORD_RESET_SUGGESTED: Record<string, never>;
  SUPPORT_CONTACT_RECEIVED: {
    email: string;
    category: SupportCategory;
    message: string;
    /** Trạng thái tài khoản trùng email người gửi; null = email chưa có tài khoản. */
    accountStatus: UserStatus | null;
  };
}

// Khoá của map phải trùng khít enum Prisma: thêm giá trị vào enum mà quên khai
// báo payload (hoặc ngược lại) sẽ lỗi biên dịch ngay tại đây thay vì lúc chạy.
type AssertSameKeys =
  Exclude<NotificationType, keyof NotificationPayloadMap> extends never
    ? Exclude<keyof NotificationPayloadMap, NotificationType> extends never
      ? true
      : never
    : never;
const _assertSameKeys: AssertSameKeys = true;
void _assertSameKeys;

export interface RenderedEmail {
  subject: string;
  html: string;
}

export interface RenderedNotification {
  title: string;
  body: string | null;
  link: string | null;
  /** null = loại này cố ý không gửi email (chỉ hiển thị in-app). */
  email: RenderedEmail | null;
}

/** Payload ghi vào OutboxEvent.payload cho eventType = "NOTIFICATION_EMAIL". */
export interface NotificationEmailPayload {
  to: string;
  subject: string;
  html: string;
  notificationType: NotificationType;
}

export const OUTBOX_EVENT_NOTIFICATION_EMAIL = "NOTIFICATION_EMAIL";
export const OUTBOX_AGGREGATE_NOTIFICATION = "Notification";
