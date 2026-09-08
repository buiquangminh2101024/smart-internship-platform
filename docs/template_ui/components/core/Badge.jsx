import React from "react";
import { Icon } from "./Icon.jsx";

const tones = {
  neutral: ["var(--n-100)", "var(--n-700)"],
  brand: ["var(--pine-50)", "var(--pine-700)"],
  accent: ["var(--marigold-50)", "var(--marigold-600)"],
  success: ["var(--green-50)", "var(--green-600)"],
  warning: ["var(--marigold-50)", "var(--marigold-600)"],
  danger: ["var(--red-50)", "var(--red-600)"],
  info: ["var(--blue-50)", "var(--blue-600)"],
};

/** Small non-interactive label for counts, categories and attributes. */
export function Badge({ tone = "neutral", icon, variant = "soft", children, style, ...rest }) {
  const [bg, fg] = tones[tone] || tones.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        height: 22,
        padding: "0 var(--space-2)",
        borderRadius: "var(--radius-sm)",
        font: "var(--type-meta)",
        letterSpacing: "var(--tracking-normal)",
        background: variant === "outline" ? "transparent" : bg,
        color: fg,
        border: variant === "outline" ? "var(--border-w) solid currentColor" : "var(--border-w) solid transparent",
        ...style,
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}
