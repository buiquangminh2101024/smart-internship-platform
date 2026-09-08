import React from "react";
import { Icon } from "./Icon.jsx";

const base = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-2)",
  fontFamily: "var(--font-core)",
  fontWeight: "var(--weight-semibold)",
  letterSpacing: "var(--tracking-snug)",
  borderRadius: "var(--radius-md)",
  border: "var(--border-w) solid transparent",
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  transition: "var(--transition-control)",
};

const sizes = {
  sm: { height: "var(--control-sm)", padding: "0 var(--space-3)", fontSize: "var(--text-sm)" },
  md: { height: "var(--control-md)", padding: "0 var(--space-4)", fontSize: "var(--text-base)" },
  lg: { height: "var(--control-lg)", padding: "0 var(--space-5)", fontSize: "var(--text-md)" },
};

const variants = {
  primary: {
    rest: { background: "var(--action-primary-bg)", color: "var(--action-primary-fg)" },
    hover: { background: "var(--action-primary-bg-hover)" },
  },
  secondary: {
    rest: {
      background: "var(--action-secondary-bg)",
      color: "var(--action-secondary-fg)",
      borderColor: "var(--border-default)",
      boxShadow: "var(--shadow-xs)",
    },
    hover: { background: "var(--pine-50)", borderColor: "var(--pine-200)" },
  },
  ghost: {
    rest: { background: "transparent", color: "var(--action-ghost-fg)" },
    hover: { background: "var(--surface-hover)", color: "var(--text-strong)" },
  },
  accent: {
    rest: { background: "var(--action-accent-bg)", color: "var(--action-accent-fg)" },
    hover: { background: "var(--marigold-400)" },
  },
  danger: {
    rest: { background: "var(--action-danger-bg)", color: "var(--n-0)" },
    hover: { background: "var(--red-600)" },
  },
  link: {
    rest: { background: "transparent", color: "var(--text-link)", padding: 0, height: "auto" },
    hover: { color: "var(--text-link-hover)", textDecoration: "underline" },
  },
};

/** The primary action control. One primary button per view. */
export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconAfter,
  fullWidth = false,
  loading = false,
  disabled = false,
  as = "button",
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const v = variants[variant] || variants.primary;
  const off = disabled || loading;
  const Tag = as;

  return (
    <Tag
      disabled={Tag === "button" ? off : undefined}
      aria-busy={loading || undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        ...base,
        ...sizes[size],
        ...v.rest,
        ...(hover && !off ? v.hover : null),
        ...(press && !off ? { transform: "translateY(0.5px)", filter: "brightness(0.96)" } : null),
        ...(fullWidth ? { width: "100%" } : null),
        ...(off
          ? {
              background: variant === "ghost" || variant === "link" ? "transparent" : "var(--surface-disabled)",
              color: "var(--text-subtle)",
              borderColor: "transparent",
              boxShadow: "none",
              cursor: "not-allowed",
            }
          : null),
        ...style,
      }}
      {...rest}
    >
      {loading ? <Icon name="loader-circle" size={size === "sm" ? 15 : 17} style={{ animation: "none", opacity: 0.8 }} /> : icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} size={size === "sm" ? 15 : 17} /> : null}
    </Tag>
  );
}
