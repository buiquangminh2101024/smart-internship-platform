import type { ReactNode } from "react";
import type { JobPostStatus } from "@sip/shared-types";
import { JOB_STATUS_LABEL } from "@/lib/job-post-display";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { Badge } from "./Badge";

export interface JobCardProps {
  title: string;
  company: string;
  location?: string | undefined;
  /** Chuỗi lương đã format sẵn, vd. "4 – 6 triệu / tháng". */
  salary?: string | undefined;
  tags?: string[] | undefined;
  isNew?: boolean | undefined;
  /** Trạng thái tin — hiện badge theo từ vựng chung (Nháp/Chờ duyệt/...). */
  status?: JobPostStatus | undefined;
  /** Công ty đã được Admin xác minh. */
  verified?: boolean | undefined;
  /** Chuỗi hạn nộp đã format sẵn, vd. "Còn 30 ngày". */
  deadline?: string | undefined;
  /** Khu vực hành động/ghi chú ở cuối card (vd. nút Sửa/Đóng tin). */
  footer?: ReactNode | undefined;
  onClick?: (() => void) | undefined;
}

export function JobCard({
  title,
  company,
  location,
  salary,
  tags = [],
  isNew,
  status,
  verified,
  deadline,
  footer,
  onClick,
}: JobCardProps) {
  const statusInfo = status ? JOB_STATUS_LABEL[status] : undefined;

  return (
    <Card padding="md" interactive={!!onClick} onClick={onClick} className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-page text-sm font-semibold text-text-muted">
            {company.charAt(0).toUpperCase()}
          </span>
          <div className="grid min-w-0 gap-0.5">
            <span className="truncate font-semibold text-text-strong">{title}</span>
            <span className="inline-flex items-center gap-1 truncate text-sm text-text-muted">
              {company}
              {verified ? <Icon name="badge-check" size={14} title="Đã xác minh" className="text-success-600" /> : null}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {statusInfo ? <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge> : null}
          {isNew ? <Badge tone="accent">Mới</Badge> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
        {location ? (
          <span className="inline-flex items-center gap-1">
            <Icon name="map-pin" size={14} />
            {location}
          </span>
        ) : null}
        {salary ? (
          <span className="inline-flex items-center gap-1">
            <Icon name="wallet" size={14} />
            {salary}
          </span>
        ) : null}
        {deadline ? (
          <span className="inline-flex items-center gap-1">
            <Icon name="calendar-clock" size={14} />
            {deadline}
          </span>
        ) : null}
      </div>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} tone="neutral">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
      {footer ? <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">{footer}</div> : null}
    </Card>
  );
}
