import React from "react";
import { Icon } from "../core/Icon.jsx";

const STATUS = {
  draft: { label: "Nháp", icon: "file-pen", fg: "var(--status-draft-fg)", bg: "var(--status-draft-bg)" },
  review: { label: "Chờ duyệt", icon: "clock", fg: "var(--status-review-fg)", bg: "var(--status-review-bg)" },
  published: { label: "Đang hiển thị", icon: "circle-check", fg: "var(--status-published-fg)", bg: "var(--status-published-bg)" },
  closed: { label: "Đã đóng", icon: "archive", fg: "var(--status-closed-fg)", bg: "var(--status-closed-bg)" },
  expired: { label: "Hết hạn", icon: "calendar-x", fg: "var(--status-expired-fg)", bg: "var(--status-expired-bg)" },
  takendown: { label: "Đã hạ", icon: "shield-alert", fg: "var(--status-takendown-fg)", bg: "var(--status-takendown-bg)" },
};

/** The canonical job-post lifecycle state. One vocabulary across all three roles. */
export function StatusPill({ status = "draft", label, size = "md", showIcon = true, style }) {
  const s = STATUS[status] || STATUS.draft;
  const sm = size === "sm";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        height: sm ? 20 : 24,
        padding: sm ? "0 var(--space-15)" : "0 var(--space-2)",
        borderRadius: "var(--radius-pill)",
        background: s.bg,
        color: s.fg,
        font: "var(--type-meta)",
        fontSize: sm ? "var(--text-2xs)" : "var(--text-xs)",
        border: status === "expired" ? "var(--border-w) solid var(--border-default)" : "var(--border-w) solid transparent",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {showIcon ? <Icon name={s.icon} size={sm ? 11 : 13} /> : null}
      {label || s.label}
    </span>
  );
}

export const statusVocabulary = STATUS;
