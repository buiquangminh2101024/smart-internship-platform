import type { ReactNode } from "react";

export interface FieldProps {
  label?: string | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  htmlFor?: string | undefined;
  children?: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, htmlFor, children, className = "" }: FieldProps) {
  return (
    <div className={["grid gap-1.5", className].join(" ")}>
      {label ? (
        <label htmlFor={htmlFor} className="text-sm font-medium text-text-strong">
          {label}
          {required ? <span className="text-red-600"> *</span> : null}
        </label>
      ) : null}
      {children}
      {/* id `${htmlFor}-msg`: ô nhập trỏ `aria-describedby` vào đây để trình đọc màn hình đọc lỗi/gợi ý. */}
      {error ? (
        <span id={htmlFor ? `${htmlFor}-msg` : undefined} className="text-sm text-red-600">
          {error}
        </span>
      ) : hint ? (
        <span id={htmlFor ? `${htmlFor}-msg` : undefined} className="text-sm text-text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
