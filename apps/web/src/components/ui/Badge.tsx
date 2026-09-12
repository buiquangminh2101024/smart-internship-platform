import type { ReactNode } from "react";
import { Icon } from "./Icon";

type Tone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";

export interface BadgeProps {
  tone?: Tone;
  icon?: string;
  children?: ReactNode;
  className?: string;
}

// `brand` đổi màu theo khu vực (AD-7); `success` cố định xanh Pine vì là màu
// trạng thái, không phải màu thương hiệu — xem chú thích ở `globals.css`.
const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-hover text-text-body",
  brand: "bg-brand-100 text-brand-800",
  accent: "bg-marigold-100 text-marigold-700",
  success: "bg-success-100 text-success-700",
  warning: "bg-marigold-100 text-marigold-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-indigo-100 text-indigo-700",
};

export function Badge({ tone = "neutral", icon, children, className = "" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        toneClasses[tone],
        className,
      ].join(" ")}
    >
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}
