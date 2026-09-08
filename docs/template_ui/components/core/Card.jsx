import React from "react";

const pads = { none: 0, sm: "var(--space-3)", md: "var(--space-4)", lg: "var(--space-6)" };

/** The house surface: white, 1px --border-subtle, 10px radius, --shadow-xs. */
export function Card({
  padding = "md",
  interactive = false,
  selected = false,
  tone = "default",
  as = "div",
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const Tag = as;
  const tones = {
    default: { background: "var(--surface-card)", borderColor: "var(--border-subtle)" },
    brand: { background: "var(--surface-brand-soft)", borderColor: "var(--pine-100)" },
    sunken: { background: "var(--surface-sunken)", borderColor: "transparent", boxShadow: "none" },
    warning: { background: "var(--feedback-warning-soft)", borderColor: "var(--marigold-100)" },
  };
  return (
    <Tag
      onMouseEnter={interactive ? () => setHover(true) : undefined}
      onMouseLeave={interactive ? () => setHover(false) : undefined}
      style={{
        borderRadius: "var(--radius-lg)",
        border: "var(--border-w) solid",
        boxShadow: "var(--shadow-xs)",
        padding: pads[padding],
        transition: "var(--transition-surface)",
        ...tones[tone],
        ...(interactive ? { cursor: "pointer" } : null),
        ...(hover ? { boxShadow: "var(--shadow-md)", borderColor: "var(--border-default)" } : null),
        ...(selected
          ? { borderColor: "var(--border-brand)", boxShadow: "var(--shadow-xs), inset 0 0 0 1px var(--pine-500)" }
          : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
