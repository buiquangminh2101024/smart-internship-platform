import type { MessagingArea } from "./messaging";

/** message = tin nhắn; system = thông báo nghiệp vụ (duyệt tin, ứng tuyển...). */
export type BrowserNotificationKind = "message" | "system";

// Setting bật/tắt thông báo trình duyệt lưu theo từng trình duyệt (localStorage),
// không đồng bộ đa thiết bị — đã chấp nhận trong PLAN.md phase 9 (frontend).
// Key của "message" giữ nguyên tên cũ để không mất setting đã bật trước đó.
const storageKey = (area: MessagingArea, kind: BrowserNotificationKind) =>
  kind === "message" ? `sip-browser-notify-${area}` : `sip-browser-notify-system-${area}`;

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function readBrowserNotificationSetting(area: MessagingArea, kind: BrowserNotificationKind): boolean {
  try {
    return window.localStorage.getItem(storageKey(area, kind)) === "on";
  } catch {
    return false;
  }
}

export function writeBrowserNotificationSetting(
  area: MessagingArea,
  kind: BrowserNotificationKind,
  enabled: boolean,
): void {
  try {
    window.localStorage.setItem(storageKey(area, kind), enabled ? "on" : "off");
  } catch {
    // Private mode / storage bị chặn — setting chỉ không được nhớ, không lỗi.
  }
}

/**
 * Bắn thông báo hệ điều hành — chỉ khi tab đang mở nhưng không hiển thị
 * (visibilityState, không phải hasFocus), đã cấp quyền và loại này đang bật.
 */
export function showBrowserNotification(
  area: MessagingArea,
  kind: BrowserNotificationKind,
  { title, body, tag, onClick }: { title: string; body: string; tag: string; onClick: () => void },
): void {
  if (!isBrowserNotificationSupported()) return;
  if (document.visibilityState === "visible") return;
  if (Notification.permission !== "granted" || !readBrowserNotificationSetting(area, kind)) return;

  // `tag` trùng → thay thế thông báo cũ thay vì hiện thêm (mở nhiều tab).
  const notification = new Notification(title, { body, tag });
  notification.onclick = () => {
    window.focus();
    onClick();
    notification.close();
  };
}
