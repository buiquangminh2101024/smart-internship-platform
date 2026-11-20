// AD-29 — cột `quality*` của `job_posts` → `JobQualityDto` (docs/06-backend/job-quality-moderation/PLAN.md,
// bước 4 và 9). Chỉ dùng cho API của Admin: nhà tuyển dụng không thấy điểm (Q1).
import type { JobQualityBand } from "@prisma/client";
import type { JobQualityCriterionDto, JobQualityDto, JobQualityScoredReason } from "@sip/shared-types";
import { buildRejectReason, type JobQualityCriterionResult } from "./job-quality";
import { QUALITY_SCORE_VERSION } from "./job-quality.config";

const SCORED_REASONS: ReadonlySet<string> = new Set<JobQualityScoredReason>([
  "SUBMITTED",
  "COMPANY_EVENT",
  "PUBLISHED_EDIT",
  "MANUAL",
  "SCRIPT",
]);

export interface JobQualityColumnsRow {
  qualityScore: number | null;
  qualityBand: JobQualityBand | null;
  /** Đọc từ DB (`JsonValue`) hoặc vừa ghi (`InputJsonValue`) — nên nhận `unknown` rồi tự kiểm. */
  qualityBreakdown: unknown;
  qualityVersion: number | null;
  qualityScoredAt: Date | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** null = tin chưa được chấm (hoặc lần chấm lúc gửi duyệt bị lỗi). */
export function toJobQualityDto(row: JobQualityColumnsRow): JobQualityDto | null {
  if (row.qualityScore === null || row.qualityBand === null || row.qualityVersion === null || row.qualityScoredAt === null) {
    return null;
  }
  const breakdown = asRecord(row.qualityBreakdown);
  // Breakdown do chính JobQualityService ghi (`StoredJobQualityBreakdown`) ⇒ tin hình dạng sau khi kiểm là mảng.
  const criteria = (Array.isArray(breakdown.criteria) ? breakdown.criteria : []) as JobQualityCriterionResult[];
  const flags = Array.isArray(breakdown.flags) ? breakdown.flags.filter((flag): flag is string => typeof flag === "string") : [];
  const reason = typeof breakdown.reason === "string" && SCORED_REASONS.has(breakdown.reason) ? (breakdown.reason as JobQualityScoredReason) : null;

  return {
    score: row.qualityScore,
    band: row.qualityBand,
    version: row.qualityVersion,
    scoredAt: row.qualityScoredAt.toISOString(),
    scoredReason: reason,
    criteria: criteria.map(
      (c): JobQualityCriterionDto => ({
        key: c.key,
        label: c.label,
        score: c.score,
        weight: c.weight,
        issues: c.issues.map((i) => ({ code: i.code, message: i.message, penalty: i.penalty })),
      }),
    ),
    flags,
    suggestedRejectReason: buildRejectReason({ criteria }),
    outdated: row.qualityVersion !== QUALITY_SCORE_VERSION,
  };
}
