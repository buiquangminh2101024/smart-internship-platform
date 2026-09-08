import React from "react";
import { Icon } from "../core/Icon.jsx";

/** Underlined tab bar for switching views inside a page. */
export function Tabs({ items = [], value, onChange, size = "md", style }) {
  const [hover, setHover] = React.useState(null);
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: "var(--space-5)",
        borderBottom: "var(--border-w) solid var(--border-default)",
        ...style,
      }}
    >
      {items.map((raw) => {
        const it = typeof raw === "string" ? { value: raw, label: raw } : raw;
        const on = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange && onChange(it.value)}
            onMouseEnter={() => setHover(it.value)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: size === "sm" ? "var(--space-2) 0" : "var(--space-3) 0",
              marginBottom: -1,
              background: "none",
              border: "none",
              borderBottom: "var(--border-w-thick) solid",
              borderColor: on ? "var(--pine-500)" : "transparent",
              color: on ? "var(--text-strong)" : hover === it.value ? "var(--text-body)" : "var(--text-muted)",
              font: "var(--type-label)",
              fontSize: size === "sm" ? "var(--text-sm)" : "var(--text-base)",
              cursor: "pointer",
              transition: "var(--transition-control)",
            }}
          >
            {it.icon ? <Icon name={it.icon} size={16} /> : null}
            {it.label}
            {it.count != null ? (
              <span
                style={{
                  font: "var(--type-meta)",
                  padding: "1px var(--space-15)",
                  borderRadius: "var(--radius-sm)",
                  background: on ? "var(--pine-50)" : "var(--surface-sunken)",
                  color: on ? "var(--pine-700)" : "var(--text-muted)",
                }}
              >
                {it.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
