import React from "react";
import { Icon } from "../core/Icon.jsx";

export const fieldShell = {
  width: "100%",
  fontFamily: "var(--font-core)",
  fontSize: "var(--text-base)",
  color: "var(--text-strong)",
  background: "var(--surface-card)",
  border: "var(--border-w) solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  transition: "var(--transition-control)",
  outline: "none",
};

/** Label + hint + error wrapper shared by every form control. */
export function Field({ label, hint, error, required, htmlFor, children, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-15)", ...style }}>
      {label ? (
        <label htmlFor={htmlFor} style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>
          {label}
          {required ? <span style={{ color: "var(--text-danger)", marginLeft: 2 }}>*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-danger)", display: "inline-flex", gap: "var(--space-1)", alignItems: "center" }}>
          <Icon name="circle-alert" size={14} />
          {error}
        </span>
      ) : hint ? (
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{hint}</span>
      ) : null}
    </div>
  );
}

/** Single-line text field, optionally with leading/trailing icons. */
export function Input({
  label,
  hint,
  error,
  required,
  icon,
  iconAfter,
  size = "md",
  disabled,
  id,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const uid = id || React.useId();
  const h = size === "sm" ? "var(--control-sm)" : size === "lg" ? "var(--control-lg)" : "var(--control-md)";
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={uid} style={style}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {icon ? (
          <span style={{ position: "absolute", left: 12, display: "inline-flex", color: focus ? "var(--pine-500)" : "var(--text-subtle)", pointerEvents: "none" }}>
            <Icon name={icon} size={17} />
          </span>
        ) : null}
        <input
          id={uid}
          disabled={disabled}
          aria-invalid={!!error || undefined}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            ...fieldShell,
            height: h,
            paddingLeft: icon ? 38 : "var(--space-3)",
            paddingRight: iconAfter ? 38 : "var(--space-3)",
            fontSize: size === "sm" ? "var(--text-sm)" : "var(--text-base)",
            ...(focus ? { borderColor: "var(--border-focus)", boxShadow: "var(--ring-focus)" } : null),
            ...(error ? { borderColor: "var(--red-500)", boxShadow: focus ? "var(--ring-danger)" : "none" } : null),
            ...(disabled ? { background: "var(--surface-disabled)", color: "var(--text-subtle)", cursor: "not-allowed" } : null),
          }}
          {...rest}
        />
        {iconAfter ? (
          <span style={{ position: "absolute", right: 12, display: "inline-flex", color: "var(--text-subtle)", pointerEvents: "none" }}>
            <Icon name={iconAfter} size={17} />
          </span>
        ) : null}
      </div>
    </Field>
  );
}
