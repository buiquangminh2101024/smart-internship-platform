"use client";

import type { JobPost, JobQualityCriterionDto } from "@sip/shared-types";
import { DashButton } from "@/components/dashboard/DashButton";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { JobQualityLegendButton } from "@/components/admin/JobQualityLegendDialog";
import { useRescoreJobQuality } from "@/hooks/useJobPosts";
import { ApiError } from "@/lib/api-client";
import { formatVnDate, formatVnTime } from "@/lib/dashboard-format";
import { JOB_QUALITY_BAND_LABEL } from "@/lib/job-post-display";
import { QUALITY_SCORED_REASON_LABEL } from "@/lib/job-quality-legend";

/** Màu thanh điểm theo ngưỡng của bộ chấm: dưới 40 (điểm sàn) đỏ, dưới 80 marigold. */
function barTone(score: number): string {
  if (score < 40) return "bg-red-500";
  if (score < 80) return "bg-marigold-500";
  return "bg-success-600";
}

function CriterionRow({ criterion, index }: { criterion: JobQualityCriterionDto; index: number }) {
  const head = (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
      <span className="flex min-w-0 items-center gap-1.5 font-semibold text-text-strong">
        {criterion.issues.length > 0 ? (
          <Icon name="chevron-right" size={16} className="shrink-0 text-text-muted transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
        ) : (
          <Icon name="check" size={16} className="shrink-0 text-success-600" />
        )}
        <span className="min-w-0">
          {index + 1}. {criterion.label}
          <span className="ml-1.5 text-[13px] font-normal text-text-muted">
            · trọng số <span className="tabular-nums">{criterion.weight}%</span>
          </span>
        </span>
      </span>
      <span aria-hidden className="col-span-2 row-start-2 h-1.5 overflow-hidden rounded-full bg-surface-hover sm:col-span-1 sm:row-start-auto">
        <span className={`block h-full rounded-full ${barTone(criterion.score)}`} style={{ width: `${criterion.score}%` }} />
      </span>
      <span className="col-start-2 row-start-1 text-right font-num font-bold tabular-nums text-text-strong sm:col-start-auto sm:row-start-auto">
        {criterion.score}
        <span className="sr-only"> / 100 điểm</span>
      </span>
    </div>
  );

  if (criterion.issues.length === 0) {
    return <li className="px-4 py-3">{head}</li>;
  }

  return (
    <li>
      <details className="group">
        <summary className="cursor-pointer list-none px-4 py-3 hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
          {head}
          <span className="sr-only">, {criterion.issues.length} lỗi, bấm để xem</span>
        </summary>
        <ul className="grid gap-1.5 bg-surface-page px-4 py-3 pl-10 text-[13px]">
          {criterion.issues.map((issue) => (
            <li key={issue.code} className="flex items-start justify-between gap-3">
              <span className="text-text-body">{issue.message}</span>
              <span className="shrink-0 font-num font-bold tabular-nums text-red-700">−{issue.penalty}</span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

/**
 * Thẻ "Điểm chất lượng" ở trang chi tiết tin của Admin (AD-29 F4): điểm tổng + vùng, cờ chặn,
 * sáu tiêu chí (mở ra xem lỗi và mức trừ), thời điểm / lý do chấm, nút Chấm lại. Hiện ở mọi
 * trạng thái của tin. Frontend không tự tính điểm.
 */
export function JobQualityCard({ job }: { job: JobPost }) {
  const rescore = useRescoreJobQuality(job.id);
  const quality = job.quality;
  const flagIssues = quality
    ? quality.criteria.flatMap((c) => c.issues).filter((issue) => quality.flags.includes(issue.code))
    : [];
  const rescoreError = rescore.error
    ? rescore.error instanceof ApiError
      ? rescore.error.message
      : "Không chấm lại được, thử lại sau"
    : null;

  const rescoreButton = (
    <DashButton variant="secondary" size="sm" icon="refresh-cw" loading={rescore.isPending} onClick={() => rescore.mutate()}>
      Chấm lại
    </DashButton>
  );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <h2 className="font-semibold text-text-strong">Điểm chất lượng</h2>
        <JobQualityLegendButton />
      </div>

      {!quality ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <p className="text-text-muted">Tin chưa được chấm.</p>
          {rescoreButton}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 px-4 py-4">
            <span className="font-num text-[36px] leading-none font-bold tabular-nums text-text-strong">
              {quality.score}
              <span className="text-base font-semibold text-text-muted">/100</span>
            </span>
            <Badge tone={JOB_QUALITY_BAND_LABEL[quality.band].tone}>{JOB_QUALITY_BAND_LABEL[quality.band].label}</Badge>
          </div>

          {flagIssues.length > 0 ? (
            <div className="mx-4 mb-4 grid gap-1 rounded-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-red-700">
              {flagIssues.map((issue) => (
                <p key={issue.code} className="flex items-start gap-2 font-semibold">
                  <Icon name="triangle-alert" size={16} className="mt-0.5 shrink-0" />
                  {issue.message.replace(/\.$/, "")} — không thể vào vùng đề xuất duyệt.
                </p>
              ))}
            </div>
          ) : null}

          <ul className="divide-y divide-border-subtle border-y border-border-subtle">
            {quality.criteria.map((criterion, index) => (
              <CriterionRow key={criterion.key} criterion={criterion} index={index} />
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-[13px] text-text-muted">
              Chấm lúc{" "}
              <span className="tabular-nums">
                {formatVnTime(quality.scoredAt)} {formatVnDate(quality.scoredAt)}
              </span>
              {quality.scoredReason ? ` ${QUALITY_SCORED_REASON_LABEL[quality.scoredReason]}` : ""} · phiên bản thuật toán v
              {quality.version}
              {quality.outdated ? (
                <span className="font-semibold text-marigold-800"> · Đã có phiên bản mới</span>
              ) : null}
            </p>
            {rescoreButton}
          </div>
        </>
      )}

      {rescoreError ? (
        <p role="alert" className="border-t border-border-subtle px-4 py-2 text-[13px] text-red-700">
          {rescoreError}
        </p>
      ) : null}
    </Card>
  );
}
