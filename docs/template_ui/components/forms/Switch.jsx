import React from "react";

/** Binary setting that applies immediately (no Save button). */
export function Switch({ label, description, checked = false, disabled, onChange, id, style }) {
  const uid = id || React.useId();
  return (
    <label
      htmlFor={uid}
      style={{
        display: "inline-flex",
        alignItems: description ? "flex-start" : "center",
        gap: "var(--space-3)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      <input
        id={uid}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "relative",
          width: 38,
          height: 22,
          flex: "none",
          borderRadius: "var(--radius-pill)",
          background: checked ? "var(--pine-500)" : "var(--n-300)",
          transition: "background-color var(--duration-base) var(--ease-standard)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 19 : 3,
            width: 16,
            height: 16,
            borderRadius: "var(--radius-pill)",
            background: "var(--n-0)",
            boxShadow: "var(--shadow-sm)",
            transition: "left var(--duration-base) var(--ease-standard)",
          }}
        />
      </span>
      {label || description ? (
        <span>
          <span style={{ font: "var(--type-body)", color: "var(--text-body)" }}>{label}</span>
          {description ? (
            <span style={{ display: "block", font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{description}</span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}
