import Link from "next/link";
import { formatNumber } from "@/lib/dashboard-format";

/** Trang tìm ứng viên của tin — nơi số "Phù hợp" dẫn tới. */
export function candidateSearchHref(jobId: string): string {
  return `/employer/jobs/${jobId}/candidate-search`;
}

export interface MatchedCountProps {
  jobId: string;
  matched: number;
  /** Phần của `matched` đã có đơn đang xét hoặc đã tuyển; 0 thì không ghi "(… đã nộp)". */
  matchedApplied?: number;
  /** Tin chưa được chấm lần nào (`matchScoresAt = null`) ⇒ "Đang chấm…", không hiện 0. */
  pending?: boolean;
  /** Chữ đứng trước số, nằm trong link (vd. "Phù hợp"). Bỏ trống khi cột bảng đã có tiêu đề. */
  label?: string;
}

/**
 * Số ứng viên phù hợp của một tin (0.3, docs/05-frontend/phases/hiring-progress/PLAN.md):
 * dùng chung ở trang tổng quan, danh sách tin và thẻ tự mời để cùng cách viết và cùng link.
 */
export function MatchedCount({ jobId, matched, matchedApplied = 0, pending = false, label }: MatchedCountProps) {
  if (pending) {
    return <span className="text-text-muted">{label ? `${label}: đang chấm…` : "Đang chấm…"}</span>;
  }
  return (
    <span className="whitespace-nowrap">
      <Link
        href={candidateSearchHref(jobId)}
        aria-label={`${formatNumber(matched)} ứng viên phù hợp, mở trang tìm ứng viên`}
        className="font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        {label ? `${label} ` : null}
        <b className="font-num font-bold tabular-nums">{formatNumber(matched)}</b>
      </Link>
      {matchedApplied > 0 ? (
        <span className="text-text-muted"> ({formatNumber(matchedApplied)} đã nộp)</span>
      ) : null}
    </span>
  );
}
