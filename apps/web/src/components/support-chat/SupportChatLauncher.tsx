"use client";

import { forwardRef } from "react";
import { Icon } from "@/components/ui/Icon";

export interface SupportChatLauncherProps {
  open: boolean;
  panelId: string;
  onToggle: () => void;
}

/** Nút nổi góc phải dưới. Panel mở thì thành nút đóng (mobile: panel che toàn màn hình nên ẩn nút). */
export const SupportChatLauncher = forwardRef<HTMLButtonElement, SupportChatLauncherProps>(function SupportChatLauncher(
  { open, panelId, onToggle },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      aria-label={open ? "Đóng trợ lý InternHub" : "Mở trợ lý InternHub"}
      aria-expanded={open}
      aria-controls={panelId}
      className={[
        "fixed right-4 bottom-4 z-40 flex size-12 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition-colors hover:bg-brand-700",
        "focus-visible:ring-4 focus-visible:ring-brand-200 focus-visible:outline-none sm:right-6 sm:bottom-6 sm:size-14",
        open ? "max-sm:hidden" : "",
      ].join(" ")}
    >
      <Icon name={open ? "x" : "message-circle-question"} size={24} strokeWidth={2} />
    </button>
  );
});
