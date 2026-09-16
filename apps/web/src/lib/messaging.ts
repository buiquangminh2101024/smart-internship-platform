import type { Conversation, UnreadCountResponse } from "@sip/shared-types";
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
