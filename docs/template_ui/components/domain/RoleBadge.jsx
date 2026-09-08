import React from "react";
import { Icon } from "../core/Icon.jsx";

const ROLES = {
  candidate: { label: "Ứng viên", icon: "graduation-cap", fg: "var(--role-candidate-ink)", bg: "var(--role-candidate-soft)", solid: "var(--role-candidate)" },
  employer: { label: "Nhà tuyển dụng", icon: "building-2", fg: "var(--role-employer-ink)", bg: "var(--role-employer-soft)", solid: "var(--role-employer)" },
  admin: { label: "Quản trị viên", icon: "shield-check", fg: "var(--role-admin-ink)", bg: "var(--role-admin-soft)", solid: "var(--role-admin)" },
};

/** Names which of the three actors an object or session belongs to. */
export function RoleBadge({ role = "candidate", label, variant = "soft", showIcon = true, style }) {
  const r = ROLES[role] || ROLES.candidate;
  const solid = variant === "solid";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        height: 24,
        padding: "0 var(--space-2)",
        borderRadius: "var(--radius-sm)",
        background: solid ? r.solid : r.bg,
        color: solid ? "var(--n-0)" : r.fg,
        font: "var(--type-meta)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {showIcon ? <Icon name={r.icon} size={13} /> : null}
      {label || r.label}
    </span>
  );
}

export const roleVocabulary = ROLES;
