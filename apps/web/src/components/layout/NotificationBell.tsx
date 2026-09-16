"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@sip/shared-types";
import { Icon } from "@/components/ui/Icon";
import type { AuthArea } from "@/lib/auth-area";
import {
  NOTIFICATIONS_HREF,
  fetchNotifications,
  fetchUnreadCount,
  formatRelativeTime,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import {
  MESSAGES_HREF,
  fetchUnreadConversationSummary,
  unreadSummaryQueryKey,
  type MessagingArea,
} from "@/lib/messaging";
import { useSocket } from "@/components/realtime/SocketProvider";

// Khi có kết nối Socket.IO, SocketProvider invalidate query theo event
// `notification:new`/`notification:new_message` nên không cần polling. Polling
// chỉ còn là dự phòng: ngoài SocketProvider (trang công khai, khu admin) hoặc
// khi socket đang mất kết nối.
const UNREAD_POLL_MS = 30_000;
const PREVIEW_COUNT = 6;

export function NotificationBell({ area }: { area: AuthArea }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const listHref = NOTIFICATIONS_HREF[area];
  const socket = useSocket();
  const pollInterval = socket?.area === area && socket.status === "connected" ? false : UNREAD_POLL_MS;
  // Admin không có tin nhắn → không có dòng ghim/badge tin nhắn.
  const messagingArea: MessagingArea | null = area === "admin" ? null : area;

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const { data: unread } = useQuery({
    queryKey: ["notifications", area, "unread-count"],
    queryFn: () => fetchUnreadCount(area),
    refetchInterval: pollInterval,
  });

  const { data: unreadMessages } = useQuery({
    queryKey: unreadSummaryQueryKey(messagingArea ?? "candidate"),
    queryFn: () => fetchUnreadConversationSummary(messagingArea!),
    enabled: messagingArea !== null,
    refetchInterval: pollInterval,
  });

  const { data: preview, isLoading } = useQuery({
    queryKey: ["notifications", area, "preview"],
    queryFn: () => fetchNotifications(area),
    enabled: isOpen,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications", area] });

  const readOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(area, id),
    onSuccess: invalidate,
  });

  const readAll = useMutation({
    mutationFn: () => markAllNotificationsRead(area),
    onSuccess: invalidate,
  });

  function handleOpenNotification(notification: Notification) {
    setIsOpen(false);
    if (!notification.isRead) readOne.mutate(notification.id);
    // Dùng thẳng `link` backend đã render, không suy luận lại theo `type`.
    // Trang đích tự kiểm tra quyền — link chỉ là điều hướng.
    if (notification.link) router.push(notification.link);
  }

  const count = unread?.count ?? 0;
  const messageCount = unreadMessages?.count ?? 0;
  const items = preview?.items.slice(0, PREVIEW_COUNT) ?? [];

  const ariaParts = [
    count > 0 ? `${count} thông báo chưa đọc` : null,
    messageCount > 0 ? `${messageCount} hội thoại có tin nhắn mới` : null,
  ].filter(Boolean);

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        aria-label={ariaParts.length > 0 ? `Thông báo (${ariaParts.join(", ")})` : "Thông báo"}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border-default text-text-body transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
      >
        <Icon name="bell" size={18} />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-[18px] text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
        {/* Badge riêng cho tin nhắn — tách khỏi badge thông báo nghiệp vụ. */}
        {messageCount > 0 ? (
          <span className="absolute -bottom-0.5 -right-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold leading-[18px] text-white">
            {messageCount > 99 ? "99+" : messageCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div role="menu" className="absolute right-0 top-12 z-30 w-80 overflow-hidden rounded-xl border border-border-subtle bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <p className="text-sm font-semibold text-text-strong">Thông báo</p>
            {count > 0 ? (
              <button
                type="button"
                onClick={() => readAll.mutate()}
                disabled={readAll.isPending}
                className="text-xs text-brand-700 hover:underline disabled:opacity-50"
              >
                Đánh dấu tất cả đã đọc
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="px-4 py-6 text-sm text-text-muted">Đang tải...</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-text-muted">Chưa có thông báo nào.</p>
            ) : (
              items.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleOpenNotification(notification)}
                  className="flex w-full items-start gap-3 border-b border-border-subtle px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-page"
                >
                  <span
                    aria-hidden
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.isRead ? "bg-transparent" : "bg-brand-600"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-text-strong">{notification.title}</span>
                    {notification.body ? (
                      <span className="mt-0.5 line-clamp-2 block text-xs text-text-muted">{notification.body}</span>
                    ) : null}
                    <span className="mt-1 block text-xs text-text-subtle">{formatRelativeTime(notification.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Dòng ghim tin nhắn — luôn ở cuối, không xen vào danh sách thông báo.
              Không đánh dấu đã đọc ở đây: chỉ mở hội thoại mới tính là đọc. */}
          {messagingArea ? (
            <Link
              href={`${MESSAGES_HREF[messagingArea]}${messageCount > 0 ? "?filter=unread" : ""}`}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 border-t border-border-subtle bg-surface-page px-4 py-3 text-sm transition-colors hover:bg-brand-50"
            >
              <Icon name="messages-square" size={16} className="shrink-0 text-brand-600" />
              <span className={`flex-1 ${messageCount > 0 ? "font-medium text-text-strong" : "text-text-muted"}`}>
                {messageCount > 0 ? `Bạn có ${messageCount} hội thoại có tin nhắn mới` : "Không có tin nhắn mới"}
              </span>
              <Icon name="chevron-right" size={16} className="shrink-0 text-text-muted" />
            </Link>
          ) : null}

          <div className="border-t border-border-subtle px-4 py-2.5">
            <Link href={listHref} onClick={() => setIsOpen(false)} className="text-sm text-brand-700 hover:underline">
              Xem tất cả thông báo
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
