import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";
import { Field } from "./Field";
import { Icon } from "./Icon";

type Size = "sm" | "md" | "lg";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  /** Tên icon Lucide hiển thị ở đầu ô nhập. */
  icon?: string;
  size?: Size;
}

const sizeClasses: Record<Size, string> = {
  sm: "h-9 text-sm",
  md: "h-11 text-[15px]",
  lg: "h-[52px] text-base",
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, icon, size = "md", id, className = "", ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputEl = (
    <div className="relative">
      {icon ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle">
          <Icon name={icon} size={16} />
        </span>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        // Trình quản lý mật khẩu (LastPass, Dashlane...) tự chèn attribute như
        // fdprocessedid vào input ngay trước khi React hydrate, gây cảnh báo
        // mismatch giả — không phải lỗi thật, chỉ tắt cảnh báo ở node này.
        suppressHydrationWarning
        className={[
          "w-full rounded-lg border bg-white px-3 outline-none transition-colors",
          "placeholder:text-text-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
          "disabled:bg-surface-page disabled:text-text-subtle",
          error ? "border-red-400" : "border-border-default",
          sizeClasses[size],
          icon ? "pl-9" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
    </div>
  );

  if (!label && !hint && !error) {
    return inputEl;
  }

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      {inputEl}
    </Field>
  );
});
