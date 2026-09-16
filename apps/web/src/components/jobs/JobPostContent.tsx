import type { ReactNode } from "react";
import type { JobPost } from "@sip/shared-types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { JOB_TYPE_LABEL, formatDeadline, formatSalary } from "@/lib/job-post-display";

/** Đoạn văn nhiều dòng (mô tả/yêu cầu/quyền lợi lưu dạng text thuần). */
function TextBlock({ icon, title, value }: { icon: string; title: string; value: string | null }) {
  if (!value?.trim()) return null;
  return (
    <Card padding="lg" className="grid gap-3">
      <h2 className="inline-flex items-center gap-2 text-base font-semibold text-text-strong">
        <Icon name={icon} size={17} className="text-pine-600" />
        {title}
      </h2>
      <div className="grid gap-2 text-[15px] text-text-body">
        {value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line, index) => (
            <p key={index}>{line}</p>
          ))}
      </div>
    </Card>
  );
}

/**
 * Kỹ năng yêu cầu của tin. Trang công khai chỉ nhận về skill đã duyệt (backend
 * lọc), còn ở xem trước/chi tiết của Employer có thể kèm skill PENDING — đánh
 * dấu rõ để họ biết kỹ năng đó chưa hiển thị với ứng viên.
 */
function SkillBlock({ job }: { job: JobPost }) {
  if (job.skills.length === 0) return null;
  return (
    <Card padding="lg" className="grid gap-3">
      <h2 className="inline-flex items-center gap-2 text-base font-semibold text-text-strong">
        <Icon name="sparkles" size={17} className="text-pine-600" />
        Kỹ năng yêu cầu
      </h2>
      <div className="flex flex-wrap gap-2">
        {job.skills.map((skill) => (
          <Badge key={skill.id} tone={skill.status === "PENDING" ? "warning" : "brand"}>
            {skill.name}
            {skill.status === "PENDING" ? " · chờ duyệt" : ""}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

/** Card "Thông tin công ty" ở cột phải — dùng chung ở xem trước/review/công khai. */
export function JobPostCompanyCard({ job, footer }: { job: JobPost; footer?: ReactNode }) {
  const rows = [
    { icon: "building-2", label: "Lĩnh vực", value: job.industryName },
    { icon: "map-pin", label: "Địa chỉ", value: job.company.address },
    { icon: "hash", label: "Mã số thuế", value: job.company.taxCode },
  ].filter((row) => !!row.value);

  return (
    <Card padding="lg" className="grid gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-page text-sm font-semibold text-text-muted">
          {job.company.name.charAt(0).toUpperCase()}
        </span>
        <div className="grid min-w-0 gap-0.5">
          <span className="truncate font-semibold text-text-strong">{job.company.name}</span>
          {job.company.isVerified ? (
            <span className="inline-flex items-center gap-1 text-xs text-pine-700">
              <Icon name="badge-check" size={13} />
              Đã xác minh
            </span>
          ) : null}
        </div>
      </div>
      <dl className="grid gap-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 text-text-muted">
              <Icon name={row.icon} size={14} />
              {row.label}
            </dt>
            <dd className="text-right text-text-body">{row.value}</dd>
          </div>
        ))}
        {job.company.website ? (
          <div className="flex items-start justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 text-text-muted">
              <Icon name="globe" size={14} />
              Website
            </dt>
            <dd className="text-right">
              <a href={job.company.website} target="_blank" rel="noreferrer" className="text-pine-700 hover:underline">
                {job.company.website}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      {footer}
    </Card>
  );
}

/** Tiêu đề tin + dải chip thông tin nhanh (địa điểm / lương / loại hình / hạn). */
export function JobPostHeaderCard({ job, action }: { job: JobPost; action?: ReactNode }) {
  const chips = [
    { icon: "map-pin", text: job.cityName ?? job.address ?? "Chưa rõ địa điểm" },
    { icon: "wallet", text: formatSalary(job) },
    { icon: "briefcase", text: JOB_TYPE_LABEL[job.jobType] },
    { icon: "calendar-clock", text: formatDeadline(job.expiresAt) },
  ];

  return (
    <Card padding="lg" className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold text-text-strong">{job.title}</h1>
          <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
            {job.company.name}
            {job.company.isVerified ? <Icon name="badge-check" size={14} className="text-pine-600" /> : null}
          </span>
        </div>
        {action}
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Badge key={chip.text} tone="neutral" icon={chip.icon}>
            {chip.text}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

/**
 * Bố cục 2 cột dùng lại ở trang xem trước (6-FE-1), trang review của Admin
 * (6-FE-2), chi tiết quản lý (6-FE-3) và chi tiết công khai (6-FE-4) — khớp
 * ảnh mẫu `Screenshot 2026-09-12 134155/134326/135146/135704.png`.
 */
export function JobPostContent({ job, aside }: { job: JobPost; aside?: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_0.9fr] lg:items-start">
      <div className="grid gap-4">
        <TextBlock icon="file-text" title="Mô tả công việc" value={job.description} />
        <TextBlock icon="circle-check" title="Yêu cầu ứng viên" value={job.requirements} />
        <SkillBlock job={job} />
        <TextBlock icon="gift" title="Quyền lợi" value={job.benefits} />
      </div>
      <div className="grid gap-4 lg:sticky lg:top-6">{aside ?? <JobPostCompanyCard job={job} />}</div>
    </div>
  );
}
