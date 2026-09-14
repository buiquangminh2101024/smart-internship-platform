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

// Phase 10 chưa có Socket.IO (thuộc Phase 9, làm song song) nên badge được làm
// mới bằng polling.
// TODO(Phase 9): bỏ refetchInterval, thay bằng lắng nghe socket event rồi gọi
// queryClient.invalidateQueries(["notifications", area]) — REST contract giữ nguyên.
const UNREAD_POLL_MS = 30_000;
const PREVIEW_COUNT = 6;

export function NotificationBell({ area }: { area: AuthArea }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const listHref = NOTIFICATIONS_HREF[area];

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
    refetchInterval: UNREAD_POLL_MS,
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
  const items = preview?.items.slice(0, PREVIEW_COUNT) ?? [];

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        aria-label={count > 0 ? `Thông báo (${count} chưa đọc)` : "Thông báo"}
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
