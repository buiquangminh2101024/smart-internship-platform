"use client";

import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { useBrowserNotification } from "@/hooks/useBrowserNotification";
import type { BrowserNotificationKind } from "@/lib/browser-notification";
import type { MessagingArea } from "@/lib/messaging";

const TOGGLES: { kind: BrowserNotificationKind; icon: string; label: string; description: string }[] = [
  {
    kind: "message",
    icon: "messages-square",
    label: "Tin nhắn mới",
    description: "Báo khi có tin nhắn mới trong hội thoại.",
  },
  {
    kind: "system",
    icon: "bell-ring",
    label: "Thông báo hệ thống",
    description: "Báo khi có cập nhật như tin tuyển dụng được duyệt/từ chối, trạng thái ứng tuyển, xác minh công ty.",
  },
];

/**
 * Trang "Cài đặt" dùng chung candidate/employer: bật/tắt riêng từng loại
 * thông báo qua trình duyệt (lưu theo trình duyệt, localStorage).
 */
export function SettingsPage({ area }: { area: MessagingArea }) {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold text-text-strong">Cài đặt</h1>

      <Card padding="md" className="grid gap-5">
        <div>
          <p className="text-sm font-semibold text-text-strong">Thông báo qua trình duyệt</p>
          <p className="mt-1 text-sm text-text-muted">
            Hiện thông báo của trình duyệt khi bạn đang ở tab khác. Chỉ áp dụng trên trình duyệt này.
          </p>
        </div>
        {TOGGLES.map((toggle) => (
          <BrowserNotificationToggle key={toggle.kind} area={area} {...toggle} />
        ))}
      </Card>
    </div>
  );
}

function BrowserNotificationToggle({
  area,
  kind,
  icon,
  label,
  description,
}: {
  area: MessagingArea;
  kind: BrowserNotificationKind;
  icon: string;
  label: string;
  description: string;
}) {
  const { supported, enabled, permission, setEnabled } = useBrowserNotification(area, kind);

  let hint = description;
  if (!supported) hint = "Trình duyệt này không hỗ trợ thông báo.";
  else if (permission === "denied")
    hint = "Bạn đã chặn quyền thông báo cho trang này. Hãy cho phép lại trong cài đặt trang của trình duyệt rồi bật lại.";

  return (
    <div className="flex items-start gap-4 border-t border-border-subtle pt-5">
      <Icon name={icon} size={20} className="mt-0.5 shrink-0 text-brand-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-strong">{label}</p>
        <p className="mt-1 text-sm text-text-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`Thông báo trình duyệt: ${label}`}
        disabled={!supported || permission === "denied"}
        onClick={() => void setEnabled(!enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-50 ${
          enabled ? "bg-brand-600" : "bg-border-strong"
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
