import type { ElementType, HTMLAttributes, ReactNode } from "react";

type Padding = "none" | "sm" | "md" | "lg";
type Tone = "default" | "brand" | "sunken" | "warning";

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
};

export function Card({ padding = "md", interactive = false, tone = "default", as, className = "", children, ...rest }: CardProps) {
  const Tag = as ?? "div";
  const classes = [
    "rounded-xl border",
    paddingClasses[padding],
    toneClasses[tone],
    interactive ? "cursor-pointer transition-shadow hover:shadow-md" : "",
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
