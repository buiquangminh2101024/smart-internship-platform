import React from "react";
import { Card } from "../core/Card.jsx";
import { Icon } from "../core/Icon.jsx";

/** Single dashboard metric. Deltas are neutral facts, not celebrations. */
export function StatCard({ label, value, unit, icon, delta, deltaTone = "neutral", hint, style }) {
  const tone = { up: "var(--green-600)", down: "var(--red-600)", neutral: "var(--text-muted)" }[deltaTone];
  return (
    <Card padding="md" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        {icon ? (
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "var(--radius-sm)", background: "var(--pine-50)", color: "var(--pine-600)" }}>
            <Icon name={icon} size={16} />
          </span>
        ) : null}
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-15)" }}>
        <span style={{ font: "var(--type-h1)", color: "var(--text-strong)", letterSpacing: "var(--tracking-tight)" }}>{value}</span>
        {unit ? <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)" }}>{unit}</span> : null}
      </div>
      {delta || hint ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", font: "var(--type-body-sm)", color: tone }}>
          {delta ? <Icon name={deltaTone === "down" ? "trending-down" : "trending-up"} size={14} /> : null}
          {delta}
          {hint ? <span style={{ color: "var(--text-muted)" }}>{hint}</span> : null}
        </div>
      ) : null}
    </Card>
  );
}
