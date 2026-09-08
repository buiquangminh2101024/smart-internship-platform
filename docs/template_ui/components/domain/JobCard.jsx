import React from "react";
import { Card } from "../core/Card.jsx";
import { Avatar } from "../core/Avatar.jsx";
import { Badge } from "../core/Badge.jsx";
import { Icon } from "../core/Icon.jsx";
import { IconButton } from "../core/IconButton.jsx";
import { StatusPill } from "../feedback/StatusPill.jsx";

function Meta({ icon, children }) {
  if (!children) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", font: "var(--type-body-sm)", color: "var(--text-muted)" }}>
      <Icon name={icon} size={14} />
      {children}
    </span>
  );
}

/** The job posting row/tile — the most repeated object in the product. */
export function JobCard({
  title,
  company,
  logo,
  location,
  salary,
  deadline,
  tags = [],
  status,
  verified = false,
  isNew = false,
  saved = false,
  selected = false,
  onSave,
  onClick,
  footer,
  style,
}) {
  return (
    <Card interactive={!!onClick} selected={selected} onClick={onClick} padding="md" style={{ display: "flex", gap: "var(--space-3)", ...style }}>
      <Avatar name={company} src={logo} role="employer" size="lg" />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-15)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <span style={{ font: "var(--type-h3)", color: "var(--text-strong)" }}>{title}</span>
              {isNew ? <Badge tone="accent">Mới</Badge> : null}
              {status ? <StatusPill status={status} size="sm" /> : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", font: "var(--type-body-sm)", color: "var(--text-body)" }}>
              {company}
              {verified ? <Icon name="badge-check" size={14} style={{ color: "var(--pine-500)" }} title="Đã xác thực" /> : null}
            </div>
          </div>
          {onSave ? (
            <IconButton icon="bookmark" label={saved ? "Bỏ lưu" : "Lưu tin"} active={saved} size="sm" onClick={(e) => { e.stopPropagation(); onSave(); }} />
          ) : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)", marginTop: 2 }}>
          <Meta icon="map-pin">{location}</Meta>
          <Meta icon="wallet">{salary}</Meta>
          <Meta icon="calendar-clock">{deadline}</Meta>
        </div>
        {tags.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-15)", marginTop: "var(--space-1)" }}>
            {tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        ) : null}
        {footer ? <div style={{ marginTop: "var(--space-2)" }}>{footer}</div> : null}
      </div>
    </Card>
  );
}
