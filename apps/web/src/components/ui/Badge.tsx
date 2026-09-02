import type { ReactNode } from "react";
import { Icon } from "./Icon";

type Tone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";

export interface BadgeProps {
  tone?: Tone;
  icon?: string;
  children?: ReactNode;
  className?: string;
}

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-hover text-text-body",
  brand: "bg-pine-100 text-pine-800",
  accent: "bg-marigold-100 text-marigold-700",
  success: "bg-pine-100 text-pine-700",
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
