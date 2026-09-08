import React from "react";
import { Icon } from "../core/Icon.jsx";

/** Zero-results / nothing-yet state. Always names the next useful action. */
export function EmptyState({ icon = "inbox", title, description, action, tone = "default", compact = false, style }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: "var(--space-2)",
        padding: compact ? "var(--space-6) var(--space-4)" : "var(--space-12) var(--space-6)",
        borderRadius: "var(--radius-lg)",
        border: "var(--border-w) dashed var(--border-default)",
        background: tone === "brand" ? "var(--surface-brand-soft)" : "var(--surface-card)",
        ...style,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 44,
          height: 44,
          borderRadius: "var(--radius-pill)",
          background: tone === "brand" ? "var(--pine-100)" : "var(--surface-sunken)",
          color: tone === "brand" ? "var(--pine-700)" : "var(--text-muted)",
          marginBottom: "var(--space-1)",
        }}
      >
        <Icon name={icon} size={22} />
      </span>
      <div style={{ font: "var(--type-h3)", color: "var(--text-strong)" }}>{title}</div>
      {description ? (
        <p style={{ font: "var(--type-body-sm)", color: "var(--text-muted)", maxWidth: 380 }}>{description}</p>
      ) : null}
      {action ? <div style={{ marginTop: "var(--space-2)" }}>{action}</div> : null}
    </div>
  );
}
