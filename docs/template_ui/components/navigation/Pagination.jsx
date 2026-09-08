import React from "react";
import { Icon } from "../core/Icon.jsx";

function pages(page, total) {
  const out = [];
  for (let i = 1; i <= total; i += 1) {
    if (i === 1 || i === total || Math.abs(i - page) <= 1) out.push(i);
    else if (out[out.length - 1] !== "…") out.push("…");
  }
  return out;
}

/** Numbered pagination for job lists, applicant tables and moderation queues. */
export function Pagination({ page = 1, total = 1, onChange, summary, style }) {
  const step = (n) => onChange && onChange(Math.min(total, Math.max(1, n)));
  const cell = (on) => ({
    minWidth: 32,
    height: 32,
    padding: "0 var(--space-2)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--radius-md)",
    border: "var(--border-w) solid",
    borderColor: on ? "var(--pine-500)" : "var(--border-default)",
    background: on ? "var(--pine-50)" : "var(--surface-card)",
    color: on ? "var(--pine-700)" : "var(--text-body)",
    font: "var(--type-label)",
    cursor: "pointer",
    transition: "var(--transition-control)",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", ...style }}>
      {summary ? (
        <span style={{ font: "var(--type-body-sm)", color: "var(--text-muted)", marginRight: "auto" }}>{summary}</span>
      ) : null}
      <button onClick={() => step(page - 1)} disabled={page === 1} style={{ ...cell(false), opacity: page === 1 ? 0.45 : 1 }} aria-label="Trang trước">
        <Icon name="chevron-left" size={16} />
      </button>
      {pages(page, total).map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} style={{ color: "var(--text-subtle)", padding: "0 2px" }}>
            …
          </span>
        ) : (
          <button key={p} onClick={() => step(p)} style={cell(p === page)} aria-current={p === page || undefined}>
            {p}
          </button>
        )
      )}
      <button onClick={() => step(page + 1)} disabled={page === total} style={{ ...cell(false), opacity: page === total ? 0.45 : 1 }} aria-label="Trang sau">
        <Icon name="chevron-right" size={16} />
      </button>
    </div>
  );
}
