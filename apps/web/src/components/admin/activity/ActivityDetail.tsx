import Link from "next/link";
import type { ReactNode } from "react";
import type { AuditActivityItem } from "@sip/shared-types";
import { ENTITY_LABEL, GROUP_META, actionLabel, entityHref } from "@/lib/audit-activity";
import { Icon } from "@/components/ui/Icon";
import { GroupSwatch, roleLabelOf } from "./ActivityMeta";

const fullTime = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 border-t border-border-subtle py-2.5 first:border-t-0">
      <dt className="text-[13px] text-text-muted">{term}</dt>
      <dd className="min-w-0 text-sm text-text-strong [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** Tab "Chi tiết" của ngăn kéo: mọi trường của một dòng nhật ký. */
export function ActivityDetail({ item }: { item: AuditActivityItem }) {
  const link = entityHref(item);
  return (
    <div className="grid gap-4">
      <p className="rounded-xl bg-surface-page px-3.5 py-3 text-sm text-text-body">{item.summary}</p>
      <dl>
        <Row term="Thời gian">
          <time dateTime={item.createdAt} className="font-num tabular-nums">
            {fullTime.format(new Date(item.createdAt))}
          </time>
        </Row>
        <Row term="Người làm">
          {item.actorId ? (item.actorEmail ?? "Tài khoản đã xoá") : "Hệ thống"}
          {item.actorId ? (
            <Link
              href={`/admin/users/${encodeURIComponent(item.actorId)}`}
              className="ml-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline"
            >
              Mở người dùng
              <Icon name="arrow-up-right" size={14} />
            </Link>
          ) : null}
        </Row>
        <Row term="Vai trò">{roleLabelOf(item.actorRole)}</Row>
        <Row term="Hành động">
          {actionLabel(item.action, item.resubmit)}
          <span className="ml-2 font-num text-[13px] text-text-muted">{item.action}</span>
        </Row>
        <Row term="Nhóm">
          <span className="inline-flex items-center gap-2">
            <GroupSwatch group={item.group} size={20} />
            {GROUP_META[item.group].label}
          </span>
        </Row>
        <Row term="Đối tượng">
          {ENTITY_LABEL[item.entityType] ?? item.entityType}{" "}
          <span className="font-num text-[13px] text-text-muted">{item.entityId}</span>
          {link ? (
            <Link
              href={link.href}
              className="mt-1 flex w-fit items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline"
            >
              {link.label}
              <Icon name="arrow-up-right" size={14} />
            </Link>
          ) : null}
        </Row>
        {item.reason ? <Row term="Lý do">{item.reason}</Row> : null}
        {item.ip ? (
          <Row term="IP">
            <span className="font-num tabular-nums">{item.ip}</span>
          </Row>
        ) : null}
        {item.resubmit !== null ? (
          <Row term="Gửi lại">{item.resubmit ? "Có, gửi lại sau khi bị từ chối" : "Không, gửi lần đầu"}</Row>
        ) : null}
      </dl>
    </div>
  );
}
