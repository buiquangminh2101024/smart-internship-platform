import React from "react";
import { Icon } from "../core/Icon.jsx";

const tones = {
  success: { icon: "circle-check", fg: "var(--green-600)", bar: "var(--green-500)", bg: "var(--green-50)" },
  info: { icon: "info", fg: "var(--blue-600)", bar: "var(--blue-500)", bg: "var(--blue-50)" },
  warning: { icon: "triangle-alert", fg: "var(--marigold-600)", bar: "var(--marigold-400)", bg: "var(--marigold-50)" },
  danger: { icon: "circle-x", fg: "var(--red-600)", bar: "var(--red-500)", bg: "var(--red-50)" },
};

/** Transient confirmation or error. Also usable inline as a static notice. */
export function Toast({ tone = "success", title, description, action, onDismiss, inline = false, style }) {
  const t = tones[tone] || tones.success;
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-3)",
        width: inline ? "100%" : 380,
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-lg)",
        background: inline ? t.bg : "var(--surface-card)",
        border: "var(--border-w) solid",
        borderColor: inline ? "transparent" : "var(--border-subtle)",
        boxShadow: inline ? "none" : "var(--shadow-lg)",
        borderLeft: `3px solid ${t.bar}`,
        ...style,
      }}
    >
      <span style={{ color: t.fg, display: "inline-flex", marginTop: 1 }}>
        <Icon name={t.icon} size={18} />
      </span>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ font: "var(--type-label)", color: "var(--text-strong)" }}>{title}</span>
        {description ? (
          <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{description}</span>
        ) : null}
        {action ? <div style={{ marginTop: "var(--space-2)" }}>{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          onClick={onDismiss}
          aria-label="Đóng"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-subtle)", padding: 2, display: "inline-flex" }}
        >
          <Icon name="x" size={16} />
        </button>
      ) : null}
    </div>
  );
}
