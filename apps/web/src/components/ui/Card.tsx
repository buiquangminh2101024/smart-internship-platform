import type { ElementType, HTMLAttributes, ReactNode } from "react";

type Padding = "none" | "sm" | "md" | "lg";
type Tone = "default" | "brand" | "sunken" | "warning" | "solid";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  padding?: Padding;
  interactive?: boolean;
  tone?: Tone;
  as?: ElementType;
  children?: ReactNode;
}

const paddingClasses: Record<Padding, string> = {
  none: "p-0",
  sm: "p-4",
  md: "p-6",
  lg: "p-10",
};

const toneClasses: Record<Tone, string> = {
  default: "bg-surface-card border-border-subtle",
  brand: "bg-surface-brand-soft border-brand-100",
  sunken: "bg-surface-page border-border-subtle",
  warning: "bg-marigold-100 border-marigold-300",
  // Khối tâm điểm tối của dashboard — mỗi màn hình chỉ một khối (`brand` là nền sáng).
  solid: "bg-brand-800 border-brand-800 text-white",
};

export function Card({ padding = "md", interactive = false, tone = "default", as, className = "", children, ...rest }: CardProps) {
  const Tag = as ?? "div";
  const classes = [
    "rounded-2xl border shadow-[0_1px_3px_rgba(13,17,23,0.04)]",
    paddingClasses[padding],
    toneClasses[tone],
    interactive ? "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:border-border-default hover:shadow-[0_12px_32px_-6px_rgba(13,17,23,0.1)]" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
