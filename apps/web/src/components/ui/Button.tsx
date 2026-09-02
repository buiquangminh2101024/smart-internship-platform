import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { Icon } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "accent" | "danger" | "link";
type Size = "sm" | "md" | "lg";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  /** Tên icon Lucide render trước label. */
  icon?: string;
  /** Tên icon Lucide render sau label. */
  iconAfter?: string;
  fullWidth?: boolean;
  loading?: boolean;
  children?: ReactNode;
  className?: string;
}

interface ButtonAsButton extends CommonProps {
  as?: "button";
  type?: "button" | "submit" | "reset";
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

interface ButtonAsLink extends CommonProps {
  as: "a";
  href: string;
}

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors border";

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[15px]",
  lg: "h-[52px] px-5 text-base",
};

const variantClasses: Record<Variant, string> = {
  primary: "bg-pine-500 text-white border-transparent hover:bg-pine-600",
  secondary: "bg-white text-text-strong border-border-default shadow-sm hover:bg-pine-50 hover:border-pine-200",
  ghost: "bg-transparent text-text-body border-transparent hover:bg-surface-hover hover:text-text-strong",
  accent: "bg-marigold-500 text-pine-900 border-transparent hover:bg-marigold-300",
  danger: "bg-red-600 text-white border-transparent hover:bg-red-700",
  link: "bg-transparent text-pine-700 border-transparent p-0 h-auto hover:underline",
};

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    icon,
    iconAfter,
    fullWidth = false,
    loading = false,
    children,
    className = "",
  } = props;

  const iconSize = size === "sm" ? 15 : 17;
  const disabled = props.as !== "a" && (props.disabled || loading);

  const classes = [
    base,
    variant === "link" ? "" : sizeClasses[size],
    variantClasses[variant],
    fullWidth ? "w-full" : "",
    disabled ? "opacity-50 cursor-not-allowed hover:bg-none" : "cursor-pointer",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {loading ? (
        <Icon name="loader-circle" size={iconSize} className="animate-spin" />
      ) : icon ? (
        <Icon name={icon} size={iconSize} />
      ) : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} size={iconSize} /> : null}
    </>
  );

  if (props.as === "a") {
    return (
      <Link href={props.href} className={classes} aria-disabled={disabled}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={props.type}
      onClick={props.onClick}
      autoFocus={props.autoFocus}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={classes}
    >
      {content}
    </button>
  );
}
