import React from "react";
import { Field, fieldShell } from "./Input.jsx";

/** Multi-line text with optional character counter. */
export function Textarea({ label, hint, error, required, rows = 4, maxLength, value, id, disabled, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const uid = id || React.useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={uid} style={style}>
      <textarea
        id={uid}
        rows={rows}
        maxLength={maxLength}
        value={value}
        disabled={disabled}
        aria-invalid={!!error || undefined}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          ...fieldShell,
          padding: "var(--space-3)",
          lineHeight: "var(--leading-normal)",
          resize: "vertical",
          ...(focus ? { borderColor: "var(--border-focus)", boxShadow: "var(--ring-focus)" } : null),
          ...(error ? { borderColor: "var(--red-500)" } : null),
          ...(disabled ? { background: "var(--surface-disabled)", cursor: "not-allowed" } : null),
        }}
        {...rest}
      />
      {maxLength ? (
        <span style={{ font: "var(--type-meta)", color: "var(--text-subtle)", textAlign: "right" }}>
          {(value || "").length}/{maxLength}
        </span>
      ) : null}
    </Field>
  );
}
