"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@sip/shared-types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import type { AuthArea } from "@/lib/auth-area";
import {
  fetchNotifications,
  formatRelativeTime,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";

/**
 * Nội dung trang "Thông báo". API actor-agnostic nên cả 3 khu vực dùng chung
 * component này, mỗi khu vực chỉ khác layout bọc ngoài (app shell riêng).
 */
export function NotificationListPage({ area }: { area: AuthArea }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", area, "list", unreadOnly, cursor],
    queryFn: () => fetchNotifications(area, { unreadOnly, ...(cursor ? { cursor } : {}) }),
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

  function handleFilterChange(next: boolean) {
    setUnreadOnly(next);
    // Cursor thuộc về bộ lọc cũ — giữ lại sẽ phân trang sai.
    setCursor(undefined);
  }

  function handleOpen(notification: Notification) {
    if (!notification.isRead) readOne.mutate(notification.id);
    if (notification.link) router.push(notification.link);
  }

  const items = data?.items ?? [];

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text-strong">Thông báo</h1>
        <Button variant="secondary" size="sm" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
          Đánh dấu tất cả đã đọc
        </Button>
      </div>

      <div className="flex gap-2">
        <Button variant={unreadOnly ? "secondary" : "primary"} size="sm" onClick={() => handleFilterChange(false)}>
          Tất cả
        </Button>
        <Button variant={unreadOnly ? "primary" : "secondary"} size="sm" onClick={() => handleFilterChange(true)}>
          Chưa đọc
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-text-muted">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">
          {unreadOnly ? "Không có thông báo chưa đọc." : "Chưa có thông báo nào."}
        </p>
      ) : (
        <div className="grid gap-2">
          {items.map((notification) => (
            <Card key={notification.id} padding="md">
              <button
                type="button"
                onClick={() => handleOpen(notification)}
                className="flex w-full items-start gap-3 text-left"
              >
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.isRead ? "bg-transparent" : "bg-brand-600"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-text-strong">{notification.title}</span>
                  {notification.body ? (
                    <span className="mt-1 block text-sm text-text-muted">{notification.body}</span>
                  ) : null}
                  <span className="mt-1.5 block text-xs text-text-subtle">
                    {formatRelativeTime(notification.createdAt)}
                  </span>
                </span>
                {notification.link ? <Icon name="chevron-right" size={16} className="mt-1 text-text-subtle" /> : null}
              </button>
            </Card>
          ))}
        </div>
      )}

      {data?.hasMore && data.nextCursor ? (
        <div>
          <Button variant="secondary" size="sm" onClick={() => setCursor(data.nextCursor)}>
            Xem thêm
          </Button>
        </div>
      ) : null}

      {cursor ? (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setCursor(undefined)}>
            Về trang đầu
          </Button>
        </div>
      ) : null}
    </div>
  );
}
