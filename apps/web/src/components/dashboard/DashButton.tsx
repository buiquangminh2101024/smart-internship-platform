import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

type Variant = "primary" | "secondary" | "danger" | "danger-solid" | "light" | "ghost";
type Size = "sm" | "md";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: string;
  iconAfter?: string;
  children: ReactNode;
  className?: string;
}

interface AsButton extends CommonProps {
  href?: undefined;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** `submit` + `form`: nút gửi đặt ở chân hộp thoại, ngoài thẻ <form>. */
  type?: "button" | "submit";
  form?: string;
}

interface AsLink extends CommonProps {
  href: string;
}

export type DashButtonProps = AsButton | AsLink;

// Kích thước theo mẫu bản C: md 40px / 14px, sm 32px / 13px (nút trong hàng việc).
const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};

const variantClasses: Record<Variant, string> = {
  primary: "border-transparent bg-brand-600 text-white hover:bg-brand-700",
  secondary: "border-border-default bg-surface-card text-text-strong hover:bg-surface-hover",
  // Từ chối trong hàng: chữ đỏ, không nền — nút đỏ đặc để dành cho hộp xác nhận.
  danger: "border-transparent bg-transparent text-red-700 hover:bg-red-50",
  "danger-solid": "border-transparent bg-red-600 text-white hover:bg-red-700",
  // Nút trên khối tối (banner).
  light: "border-transparent bg-white text-brand-800 hover:bg-brand-50",
  // Thao tác phụ trong đầu khối (vd. "Đánh dấu tất cả đã đọc" của Admin bản D).
  ghost: "border-transparent bg-transparent text-brand-700 hover:bg-brand-50",
};

/** Nút riêng của dashboard, đúng cỡ của mẫu bản C. */
export function DashButton(props: DashButtonProps) {
  const { variant = "primary", size = "md", icon, iconAfter, children, className = "" } = props;
  const loading = props.href === undefined && props.loading === true;
  const iconSize = size === "sm" ? 14 : 16;

  const classes = [
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-semibold",
    "transition-colors duration-150 motion-reduce:transition-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
    sizeClasses[size],
    variantClasses[variant],
    className,
  ].join(" ");

  const content = (
    <>
      {loading ? (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
        />
      ) : icon ? (
        <Icon name={icon} size={iconSize} />
      ) : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} size={iconSize} /> : null}
    </>
  );

  if (props.href !== undefined) {
    return (
      <Link href={props.href} className={classes}>
        {content}
      </Link>
    );
  }

  const disabled = props.disabled === true || loading;
  return (
    <button
      type={props.type ?? "button"}
      form={props.form}
      onClick={props.onClick}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={`${classes} ${loading ? "cursor-progress opacity-75" : disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
    >
      {content}
    </button>
  );
}
