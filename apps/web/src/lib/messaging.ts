import type { Conversation, JobPostStatus, UnreadCountResponse } from "@sip/shared-types";
import { apiFetch } from "./api-client";

export type MessagingArea = "candidate" | "employer";

export const MESSAGES_HREF: Record<MessagingArea, string> = {
  candidate: "/messages",
  employer: "/employer/messages",
};

export const SETTINGS_HREF: Record<MessagingArea, string> = {
  candidate: "/settings",
  employer: "/employer/settings",
};

export const unreadSummaryQueryKey = (area: MessagingArea) => ["conversations", area, "unread-summary"] as const;

/** Số hội thoại có tin nhắn chưa đọc — nguồn cho dòng ghim ở NotificationBell. */
export function fetchUnreadConversationSummary(area: MessagingArea): Promise<UnreadCountResponse> {
  return apiFetch<UnreadCountResponse>(area, "/conversations/unread-summary");
}

/** Tin mới nhất do phía kia gửi và mới hơn mốc đọc của mình — cùng quy tắc với backend. */
export function isConversationUnread(conv: Conversation, area: MessagingArea, currentUserId: string | undefined): boolean {
  const latest = conv.latestMessage;
  if (!latest || latest.senderId === currentUserId) return false;
  const lastRead = area === "candidate" ? conv.candidateLastReadAt : conv.employerLastReadAt;
  return !lastRead || new Date(latest.createdAt) > new Date(lastRead);
}

const DELETABLE_JOB_POST_STATUSES: readonly JobPostStatus[] = ["CLOSED", "EXPIRED", "TAKEN_DOWN"];

/** Tin tuyển dụng đã đóng/hết hạn/bị gỡ — được phép xoá hội thoại (cùng quy tắc với backend, AD-11). */
export function isConversationDeletable(conv: Conversation): boolean {
  return DELETABLE_JOB_POST_STATUSES.includes(conv.jobPost.status);
}

/** false khi đã có phía xoá hội thoại — chỉ còn xem lịch sử, không gửi tin được. */
export function isConversationAvailable(conv: Conversation): boolean {
  return !conv.candidateDeletedAt && !conv.employerDeletedAt;
}

/** Nhãn badge theo trạng thái tin tuyển dụng của hội thoại đủ điều kiện xoá. */
export const CLOSED_JOB_POST_LABEL: Partial<Record<JobPostStatus, string>> = {
  CLOSED: "Tin đã đóng",
  EXPIRED: "Tin hết hạn",
  TAKEN_DOWN: "Tin bị gỡ",
};

/** Link ra ngoài cho dòng hội thoại: CV ứng viên (employer) hoặc tin tuyển dụng của công ty (candidate). */
export function conversationExternalLink(
  conv: Conversation,
  area: MessagingArea,
): { href: string; label: string } | null {
  if (area === "employer") {
    // Không có Application khớp (employer nhắn trước khi ứng viên nộp đơn) → ẩn link.
    return conv.applicationId
      ? { href: `/employer/applications/${conv.applicationId}`, label: "Xem CV ứng viên" }
      : null;
  }
  // Chưa có trang công ty công khai — tạm dùng trang tin tuyển dụng của hội thoại.
  return { href: `/jobs/${conv.jobPostId}`, label: "Xem tin tuyển dụng & công ty" };
}
