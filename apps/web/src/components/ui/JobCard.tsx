import { Card } from "./Card";
import { Icon } from "./Icon";
import { Badge } from "./Badge";

export interface JobCardProps {
  title: string;
  company: string;
  location?: string;
  /** Chuỗi lương đã format sẵn, vd. "4 – 6 triệu / tháng". */
  salary?: string;
  tags?: string[];
  isNew?: boolean;
  onClick?: () => void;
}

export function JobCard({ title, company, location, salary, tags = [], isNew, onClick }: JobCardProps) {
  return (
    <Card padding="md" interactive={!!onClick} onClick={onClick} className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-page text-sm font-semibold text-text-muted">
            {company.charAt(0).toUpperCase()}
          </span>
          <div className="grid gap-0.5">
            <span className="font-semibold text-text-strong">{title}</span>
            <span className="text-sm text-text-muted">{company}</span>
          </div>
        </div>
        {isNew ? <Badge tone="accent">Mới</Badge> : null}
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
    </Card>
  );
}
