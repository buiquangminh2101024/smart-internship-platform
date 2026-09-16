"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useSocketConnection, type SocketStatus } from "@/hooks/useSocket";
import { showBrowserNotification } from "@/lib/browser-notification";
import { markNotificationRead } from "@/lib/notifications";
import { MESSAGES_HREF, unreadSummaryQueryKey, type MessagingArea } from "@/lib/messaging";

interface SocketContextValue {
  area: MessagingArea;
  status: SocketStatus;
  /** false = chưa gửi được vì mất kết nối. */
  sendMessage: (conversationId: string, content: string) => boolean;
}

const SocketContext = createContext<SocketContextValue | null>(null);

/**
 * Kết nối realtime dùng chung (NotificationBell + trang chat), mỗi area 1
 * socket/tab. Candidate mount ở app/provider.tsx để nhận thông báo cả trên
 * trang công khai; employer mount ở EmployerPortalShell (provider gần nhất
 * được ưu tiên). `enabled=false` giữ nguyên cây component, chỉ ngắt kết nối.
 *
 * Không hiện banner toàn trang khi mất kết nối: NotificationBell đã tự quay về
 * polling, chỉ trang chat (ChatLayout) mới báo lỗi qua `status`.
 */
export function SocketProvider({
  area,
  enabled = true,
  children,
}: {
  area: MessagingArea;
  enabled?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { status, sendMessage } = useSocketConnection(
    area,
    {
      onNotification: (event) => {
        const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications", area] });
        void invalidate();
        showBrowserNotification(area, "system", {
          title: event.title,
          body: event.body ?? "",
          tag: `sip-notification-${event.id}`,
          // Giống bấm trong NotificationBell: đánh dấu đã đọc rồi mở link backend đã render.
          onClick: () => {
            void markNotificationRead(area, event.id).then(invalidate, () => undefined);
            if (event.link) router.push(event.link);
          },
        });
      },
      onMessageNotification: (event) => {
        void queryClient.invalidateQueries({ queryKey: unreadSummaryQueryKey(area) });
        showBrowserNotification(area, "message", {
          title: `Tin nhắn mới từ ${event.senderName}`,
          body: event.preview,
          // Nhiều tab cùng chạy nền đều nhận event — cùng tag thì trình duyệt gộp làm 1.
          tag: `sip-message-${area}-${event.conversationId}`,
          onClick: () =>
            router.push(`${MESSAGES_HREF[area]}?conversationId=${encodeURIComponent(event.conversationId)}`),
        });
      },
    },
    enabled,
  );

  const value = useMemo(() => ({ area, status, sendMessage }), [area, status, sendMessage]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

/** Provider gần nhất; null khi không có provider nào (nơi dùng tự fallback). */
export function useSocket(): SocketContextValue | null {
  return useContext(SocketContext);
}
