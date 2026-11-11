import type { EmployerHiringProgress, HiringProgressItem } from "@sip/shared-types";
import { ATTENTION_EXPIRING_DAYS } from "../job-posts/job-post.repository";
import type { HiringProgressRow } from "../match-scores/match-score.repository";

// Khối "Tiến độ tuyển" của trang tổng quan Employer (0.3) —
// docs/06-backend/hiring-progress/PLAN.md bước 5a. Hàm thuần, không đọc DB.

/** Số tin ở trang tổng quan (quyết định #7). */
export const HIRING_PROGRESS_LIMIT = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Thứ tự "cần chú ý":
 * 1. tin chưa đạt chỉ tiêu (`hired < hiringTarget`) trước;
 * 2. trong đó, tin còn ≤ 7 ngày tới hạn trước (cùng mốc với "Tin cần chú ý");
 * 3. tỉ lệ `hired / hiringTarget` thấp trước;
 * 4. hạn nộp gần trước (không có hạn thì sau cùng);
 * 5. cuối cùng theo id, để thứ tự ổn định giữa các lần tải.
 */
export function compareHiringProgress(a: HiringProgressRow, b: HiringProgressRow, now: Date): number {
  const aOpen = a.hired < a.hiringTarget;
  const bOpen = b.hired < b.hiringTarget;
  if (aOpen !== bOpen) return aOpen ? -1 : 1;

  if (aOpen) {
    const aSoon = expiresSoon(a.expiresAt, now);
    const bSoon = expiresSoon(b.expiresAt, now);
    if (aSoon !== bSoon) return aSoon ? -1 : 1;
  }

  const ratio = hiredRatio(a) - hiredRatio(b);
  if (ratio !== 0) return ratio;

  const deadline = compareDeadline(a.expiresAt, b.expiresAt);
  if (deadline !== 0) return deadline;

  return a.jobPostId < b.jobPostId ? -1 : a.jobPostId > b.jobPostId ? 1 : 0;
}

/**
 * Dựng response từ mọi tin đang hiển thị của công ty: tổng trên mọi tin, `items` là
 * 5 tin cần chú ý nhất, `scoredAt` là lần chấm cũ nhất trong các tin ở `items`.
 */
export function buildHiringProgress(rows: HiringProgressRow[], viewerEmployerId: string, now: Date): EmployerHiringProgress {
  const totals = { publishedJobs: rows.length, matched: 0, hired: 0, hiringTarget: 0 };
  for (const row of rows) {
    totals.matched += row.matched;
    totals.hired += row.hired;
    totals.hiringTarget += row.hiringTarget;
  }

  const top = [...rows].sort((a, b) => compareHiringProgress(a, b, now)).slice(0, HIRING_PROGRESS_LIMIT);

  let oldest: Date | null = null;
  for (const row of top) {
    if (row.matchScoresAt && (!oldest || row.matchScoresAt < oldest)) oldest = row.matchScoresAt;
  }

  return {
    totals,
    items: top.map((row) => toItem(row, viewerEmployerId)),
    scoredAt: oldest?.toISOString() ?? null,
  };
}

function toItem(row: HiringProgressRow, viewerEmployerId: string): HiringProgressItem {
  return {
    jobPostId: row.jobPostId,
    title: row.title,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    matched: row.matched,
    matchedApplied: row.matchedApplied,
    invited: row.invited,
    acceptedInvitations: row.acceptedInvitations,
    interviewing: row.interviewing,
    hired: row.hired,
    hiringTarget: row.hiringTarget,
    autoOutreachEnabled: row.autoOutreachEnabled,
    ownedByViewer: row.employerId === viewerEmployerId,
    matchScoresAt: row.matchScoresAt?.toISOString() ?? null,
  };
}

function expiresSoon(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() - now.getTime() <= ATTENTION_EXPIRING_DAYS * DAY_MS;
}

// hiringTarget là 1–100 (schema), chặn chia cho 0 phòng dữ liệu cũ.
function hiredRatio(row: HiringProgressRow): number {
  return row.hired / Math.max(1, row.hiringTarget);
}

// Không có hạn nộp thì sau cùng. Không trừ hai Infinity (ra NaN).
function compareDeadline(a: Date | null, b: Date | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return a.getTime() - b.getTime();
}
