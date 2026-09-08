import React from "react";
import { Icon } from "../core/Icon.jsx";

/** Checkbox with inline label. Also renders the indeterminate (partial) state. */
export function Checkbox({ label, description, checked = false, indeterminate = false, disabled, onChange, id, style }) {
  const uid = id || React.useId();
  const on = checked || indeterminate;
  return (
    <label
      htmlFor={uid}
      style={{
        display: "inline-flex",
        alignItems: description ? "flex-start" : "center",
        gap: "var(--space-2)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      <input
        id={uid}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
      />
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          flex: "none",
          marginTop: description ? 2 : 0,
          borderRadius: "var(--radius-xs)",
          border: "var(--border-w-thick) solid",
          borderColor: on ? "var(--pine-500)" : "var(--border-strong)",
          background: on ? "var(--pine-500)" : "var(--surface-card)",
          color: "var(--n-0)",
          transition: "var(--transition-control)",
        }}
      >
        {indeterminate ? <Icon name="minus" size={13} /> : checked ? <Icon name="check" size={13} /> : null}
      </span>
      <span>
        <span style={{ font: "var(--type-body)", color: "var(--text-body)" }}>{label}</span>
        {description ? (
          <span style={{ display: "block", font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{description}</span>
        ) : null}
      </span>
    </label>
  );
}
