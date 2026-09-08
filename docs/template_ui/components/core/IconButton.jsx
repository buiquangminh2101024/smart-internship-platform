import React from "react";
import { Icon } from "./Icon.jsx";

const boxes = { sm: 32, md: 40, lg: 48 };

/** Square icon-only control for toolbars, cards and table rows. */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  active = false,
  disabled = false,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const box = boxes[size];
  const skins = {
    ghost: { background: "transparent", color: "var(--action-ghost-fg)", borderColor: "transparent" },
    outline: { background: "var(--surface-card)", color: "var(--text-body)", borderColor: "var(--border-default)" },
    solid: { background: "var(--action-primary-bg)", color: "var(--action-primary-fg)", borderColor: "transparent" },
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: box,
        height: box,
        flex: "none",
        borderRadius: "var(--radius-md)",
        border: "var(--border-w) solid",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "var(--transition-control)",
        ...skins[variant],
        ...(active ? { background: "var(--pine-50)", color: "var(--pine-700)", borderColor: "var(--pine-200)" } : null),
        ...(hover && !disabled && !active
          ? variant === "solid"
            ? { background: "var(--action-primary-bg-hover)" }
            : { background: "var(--surface-hover)", color: "var(--text-strong)" }
          : null),
        ...(disabled ? { color: "var(--text-subtle)", background: "transparent" } : null),
        ...style,
      }}
      {...rest}
    >
      <Icon name={icon} size={size === "sm" ? 16 : size === "lg" ? 22 : 18} />
    </button>
  );
}
