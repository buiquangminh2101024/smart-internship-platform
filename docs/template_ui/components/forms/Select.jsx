import React from "react";
import { Field, fieldShell } from "./Input.jsx";
import { Icon } from "../core/Icon.jsx";

/** Native select styled to match Input, with the house chevron. */
export function Select({ label, hint, error, required, options = [], size = "md", disabled, id, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const uid = id || React.useId();
  const h = size === "sm" ? "var(--control-sm)" : size === "lg" ? "var(--control-lg)" : "var(--control-md)";
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={uid} style={style}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <select
          id={uid}
          disabled={disabled}
          aria-invalid={!!error || undefined}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            ...fieldShell,
            height: h,
            padding: "0 34px 0 var(--space-3)",
            fontSize: size === "sm" ? "var(--text-sm)" : "var(--text-base)",
            appearance: "none",
            cursor: disabled ? "not-allowed" : "pointer",
            ...(focus ? { borderColor: "var(--border-focus)", boxShadow: "var(--ring-focus)" } : null),
            ...(error ? { borderColor: "var(--red-500)" } : null),
            ...(disabled ? { background: "var(--surface-disabled)", color: "var(--text-subtle)" } : null),
          }}
          {...rest}
        >
          {options.map((o) => {
            const opt = typeof o === "string" ? { value: o, label: o } : o;
            return (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            );
          })}
        </select>
        <span style={{ position: "absolute", right: 11, color: "var(--text-muted)", pointerEvents: "none", display: "inline-flex" }}>
          <Icon name="chevron-down" size={16} />
        </span>
      </div>
    </Field>
  );
}
