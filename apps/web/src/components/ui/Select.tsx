import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { Field } from "./Field";

type Size = "sm" | "md" | "lg";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  options?: (string | SelectOption)[];
  size?: Size;
}

const sizeClasses: Record<Size, string> = {
  sm: "h-9 text-sm",
  md: "h-11 text-[15px]",
  lg: "h-[52px] text-base",
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, options = [], id, className = "", size = "md", ...rest },
  ref,
) {
  const selectEl = (
    <select
      ref={ref}
      id={id}
      aria-invalid={!!error}
      className={[
        "w-full rounded-lg border bg-white px-3 outline-none transition-colors",
        "focus:border-pine-500 focus:ring-2 focus:ring-pine-100",
        "disabled:bg-surface-page disabled:text-text-subtle",
        error ? "border-red-400" : "border-border-default",
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {options.map((option) => {
        const opt = typeof option === "string" ? { value: option, label: option } : option;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );

  if (!label && !hint && !error) {
    return selectEl;
  }

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={id}>
      {selectEl}
    </Field>
  );
});
