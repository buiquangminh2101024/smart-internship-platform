"use client";

import { useReducer, useSyncExternalStore } from "react";
import {
  isBrowserNotificationSupported,
  readBrowserNotificationSetting,
  writeBrowserNotificationSetting,
  type BrowserNotificationKind,
} from "@/lib/browser-notification";
import type { MessagingArea } from "@/lib/messaging";

// Quyền/setting không phát sự kiện thay đổi; snapshot được đọc lại mỗi lần
// render, nên sau khi ghi chỉ cần ép render lại (forceRender).
const subscribeNoop = () => () => {};

/** State cho 1 toggle ở trang Cài đặt. Việc bắn thông báo nằm ở SocketProvider. */
export function useBrowserNotification(area: MessagingArea, kind: BrowserNotificationKind) {
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  // Server snapshot = "chưa hỗ trợ" — window/localStorage không có lúc SSR.
  const supported = useSyncExternalStore(subscribeNoop, isBrowserNotificationSupported, () => false);
  const permission = useSyncExternalStore<NotificationPermission>(
    subscribeNoop,
    () => (isBrowserNotificationSupported() ? Notification.permission : "default"),
    () => "default",
  );
  const stored = useSyncExternalStore(subscribeNoop, () => readBrowserNotificationSetting(area, kind), () => false);
  const enabled = stored && permission === "granted";

  async function setEnabled(next: boolean) {
    if (!supported) return;
    if (next && Notification.permission === "default") {
      // Chỉ hỏi quyền khi người dùng chủ động bật, không hỏi lúc tải trang.
      await Notification.requestPermission();
    }
    writeBrowserNotificationSetting(area, kind, next && Notification.permission === "granted");
    forceRender();
  }

  return { supported, enabled, permission, setEnabled };
}
