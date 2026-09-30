import type { ReactNode, Ref } from "react";
import { Icon } from "@/components/ui/Icon";

type Tone = "brand" | "muted" | "warning" | "danger";

const toneClasses: Record<Tone, { box: string; icon: string }> = {
  brand: { box: "bg-brand-50", icon: "text-brand-600" },
  muted: { box: "bg-surface-page", icon: "text-text-muted" },
  warning: { box: "border border-marigold-300 bg-marigold-100", icon: "text-marigold-800" },
  danger: { box: "border border-red-200 bg-red-50", icon: "text-red-600" },
};

/** Khung ghi chú trong hộp thoại (tóm tắt, cảnh báo, lỗi): icon + nội dung. */
export function NoteBox({
  tone,
  icon,
  children,
  boxRef,
  role,
}: {
  tone: Tone;
  icon: string;
  children: ReactNode;
  /** Để chuyển focus tới khung lỗi. */
  boxRef?: Ref<HTMLDivElement>;
  role?: "alert" | "status";
}) {
  const look = toneClasses[tone];
  return (
    <div
      ref={boxRef}
      role={role}
      tabIndex={boxRef ? -1 : undefined}
      className={`flex items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-text-body outline-none ${look.box}`}
    >
      <Icon name={icon} size={18} className={`mt-px shrink-0 ${look.icon}`} />
      <div className="min-w-0 flex-1 [&_b]:text-text-strong">{children}</div>
    </div>
  );
}
