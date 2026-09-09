import { forwardRef, useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import { Field } from "./Field";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, id, className = "", rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const textareaEl = (
    <textarea
      ref={ref}
      id={textareaId}
      rows={rows}
      aria-invalid={!!error}
      className={[
        "w-full rounded-lg border bg-white px-3 py-2 text-[15px] outline-none transition-colors",
        "placeholder:text-text-subtle focus:border-pine-500 focus:ring-2 focus:ring-pine-100",
        "disabled:bg-surface-page disabled:text-text-subtle",
        error ? "border-red-400" : "border-border-default",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );

  if (!label && !hint && !error) {
    return textareaEl;
  }

  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={textareaId}>
      {textareaEl}
    </Field>
  );
});
