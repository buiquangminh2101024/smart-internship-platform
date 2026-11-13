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
    /** AD-25 — chỉ có khi hệ thống đóng hồ sơ (`newStatus = JOB_CLOSED`); chọn lời thông báo. */
    closeReason?: "JOB_ENDED" | "NO_RESULT";
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
  // AD-23 — tự động mời theo tin. Gửi bằng notifyOnce, khoá auto-outreach:<tin>:<ngày>,
  // nên sentCount là số lời mời của lượt chạy đầu tiên trong ngày.
  AUTO_OUTREACH_SENT: { jobPostId: string; jobPostTitle: string; sentCount: number };
  // AD-16 — dashboard Employer & Admin, docs/06-backend/dashboard-employer-admin/PLAN.md
  APPLICATION_RECEIVED: {
    applicationId: string;
    jobPostId: string;
    jobPostTitle: string;
    candidateName: string | null;
  };
  // AD-25 — nhắc tuần, gộp một thông báo cho mỗi employer của công ty. Gửi bằng notifyOnce,
  // khoá APPLICATIONS_NEED_ATTENTION:<công ty>:<người nhận>:<thứ Hai của tuần>.
  APPLICATIONS_NEED_ATTENTION: {
    companyId: string;
    companyName: string;
    /** Chờ duyệt quá 7 ngày, tin đang hiển thị. */
    pendingStale: number;
    /** Đang xem xét đứng yên quá 7 ngày, tin đang hiển thị. */
    reviewingStale: number;
    /** Chờ đặt lịch quá 7 ngày, tin đang hiển thị. */
    awaitingSchedule: number;
    /** Đã phỏng vấn quá 7 ngày, chưa có kết quả, mọi tin. */
    needsResult: number;
    /** Sẽ tự đóng (G2, G4) trong 7 ngày tới. */
    closingSoon: number;
    /** Lượt hằng ngày sẽ đóng hồ sơ sớm nhất trong `closingSoon`; null khi `closingSoon = 0`. */
    closingOn: Date | null;
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
  // AD-26 D8 — một thông báo mỗi ứng viên mỗi ngày (upsertDaily, khoá
  // job-alert:<ứng viên>:<ngày giờ VN>); tin sau trong ngày cập nhật lại thông báo đó.
  JOB_ALERT: {
    /** Tin mới nhất vừa được báo. */
    jobPostId: string;
    jobPostTitle: string;
    companyName: string;
    /** Điểm phù hợp của ứng viên với tin này lúc báo. */
    score: number;
    /** Số tin đã báo cho ứng viên trong ngày (giờ VN), tính cả tin này — đếm từ `job_alerts`. */
    todayCount: number;
  };
  // AD-26 D10 — nhắc một lần (notifyOnce, khoá profile-skills-reminder:<ứng viên>). Nội dung cố định.
  PROFILE_SKILLS_REMINDER: Record<string, never>;
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
