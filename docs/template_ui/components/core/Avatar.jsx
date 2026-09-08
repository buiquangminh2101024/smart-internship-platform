import React from "react";

const boxes = { xs: 24, sm: 32, md: 40, lg: 56, xl: 80 };

function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  const last = parts[parts.length - 1];
  return (parts.length > 1 ? last[0] + parts[0][0] : parts[0].slice(0, 2)).toUpperCase();
}

/** Person or company identity chip. Companies get a squared radius, people a circle. */
export function Avatar({ name = "", src, size = "md", shape, role, style, ...rest }) {
  const box = boxes[size] || boxes.md;
  const kind = shape || (role === "employer" ? "square" : "circle");
  const ring = role
    ? { employer: "var(--role-employer)", admin: "var(--role-admin)", candidate: "var(--role-candidate)" }[role]
    : null;
  return (
    <span
      title={name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        width: box,
        height: box,
        borderRadius: kind === "square" ? "var(--radius-md)" : "var(--radius-pill)",
        background: src ? "var(--surface-sunken)" : "var(--pine-100)",
        color: "var(--pine-800)",
        font: "var(--type-label)",
        fontSize: Math.max(11, Math.round(box * 0.36)),
        letterSpacing: "var(--tracking-wide)",
        overflow: "hidden",
        boxShadow: ring ? `0 0 0 2px var(--surface-card), 0 0 0 3px ${ring}` : "none",
        ...style,
      }}
      {...rest}
    >
      {src ? (
        <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials(name)
      )}
    </span>
  );
}
