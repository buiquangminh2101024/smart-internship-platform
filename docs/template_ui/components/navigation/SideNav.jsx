import React from "react";
import { Icon } from "../core/Icon.jsx";

const roleInk = {
  candidate: ["var(--role-candidate)", "var(--role-candidate-soft)", "var(--role-candidate-ink)"],
  employer: ["var(--role-employer)", "var(--role-employer-soft)", "var(--role-employer-ink)"],
  admin: ["var(--role-admin)", "var(--role-admin-soft)", "var(--role-admin-ink)"],
};

/** App-shell left navigation. The role tints the active item and the rail edge. */
export function SideNav({ role = "candidate", items = [], value, onChange, header, footer, style }) {
  const [hover, setHover] = React.useState(null);
  const [accent, soft, ink] = roleInk[role] || roleInk.candidate;
  return (
    <nav
      style={{
        width: "var(--sidenav-w)",
        flex: "none",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
        padding: "var(--space-4) var(--space-3)",
        background: "var(--surface-card)",
        borderRight: "var(--border-w) solid var(--border-subtle)",
        boxShadow: `inset 3px 0 0 ${accent}`,
        ...style,
      }}
    >
      {header ? <div style={{ padding: "0 var(--space-2) var(--space-4)" }}>{header}</div> : null}
      {items.map((raw) => {
        if (raw.section) {
          return (
            <div
              key={`s-${raw.section}`}
              style={{
                font: "var(--type-eyebrow)",
                textTransform: "uppercase",
                letterSpacing: "var(--tracking-caps)",
                color: "var(--text-subtle)",
                padding: "var(--space-4) var(--space-2) var(--space-1)",
              }}
            >
              {raw.section}
            </div>
          );
        }
        const on = raw.value === value;
        return (
          <button
            key={raw.value}
            onClick={() => onChange && onChange(raw.value)}
            onMouseEnter={() => setHover(raw.value)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              width: "100%",
              minHeight: 38,
              padding: "0 var(--space-2)",
              borderRadius: "var(--radius-md)",
              border: "none",
              textAlign: "left",
              cursor: "pointer",
              font: "var(--type-label)",
              background: on ? soft : hover === raw.value ? "var(--surface-hover)" : "transparent",
              color: on ? ink : "var(--text-body)",
              transition: "var(--transition-control)",
            }}
          >
            <Icon name={raw.icon} size={18} style={{ color: on ? accent : "var(--text-muted)" }} />
            <span style={{ flex: 1 }}>{raw.label}</span>
            {raw.count != null ? (
              <span
                style={{
                  font: "var(--type-meta)",
                  padding: "1px var(--space-15)",
                  borderRadius: "var(--radius-pill)",
                  background: on ? "var(--surface-card)" : "var(--surface-sunken)",
                  color: on ? ink : "var(--text-muted)",
                }}
              >
                {raw.count}
              </span>
            ) : null}
          </button>
        );
      })}
      {footer ? <div style={{ marginTop: "auto", paddingTop: "var(--space-4)" }}>{footer}</div> : null}
    </nav>
  );
}
