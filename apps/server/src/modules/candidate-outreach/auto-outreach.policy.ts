import type { AutoOutreachExhaustedReason, JobPostStatus } from "@prisma/client";
import type { AutoOutreachSettings, AutoOutreachState } from "@sip/shared-types";
import { AUTO_OUTREACH_NO_MATCH_RECHECK_HOURS } from "./candidate-outreach.config";
import { startOfUtcDay } from "./candidate-outreach.repository";

// Quy tắc thuần của tự động mời theo tin (AD-23), không chạm DB — để unit test, và để
// cài đặt (bước 4) lẫn lượt chạy nền (bước 5) dùng chung một cách hiểu.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Q5 — lúc tin "hết ứng viên" được kiểm lại. NO_MATCH (không ai đạt ngưỡng): sau 3 giờ.
 * CANDIDATE_CAP (người phù hợp đã nhận đủ lời mời hôm nay): mốc đặt lại hằng ngày kế
 * tiếp, 0h UTC = 7h sáng giờ Việt Nam.
 */
export function autoOutreachRecheckAt(reason: AutoOutreachExhaustedReason, exhaustedAt: Date): Date {
  if (reason === "NO_MATCH") return new Date(exhaustedAt.getTime() + AUTO_OUTREACH_NO_MATCH_RECHECK_HOURS * HOUR_MS);
  return new Date(startOfUtcDay(exhaustedAt).getTime() + DAY_MS);
}

export interface AutoOutreachStateInput {
  /** false với gói Dùng thử hoặc khi không có gói còn hiệu lực. */
  autoAllowed: boolean;
  enabled: boolean;
  jobStatus: JobPostStatus;
  hiringTarget: number;
  hiredCount: number;
  exhaustedAt: Date | null;
  exhaustedReason: AutoOutreachExhaustedReason | null;
}

/**
 * Trạng thái của thẻ "Tự động mời ứng viên", theo thứ tự ghi ở `AutoOutreachState`.
 * Dấu "hết ứng viên" đã qua lúc kiểm lại thì coi như đang chạy: lượt cron kế tiếp sẽ
 * xét lại tin và đặt dấu mới nếu vẫn hết.
 */
export function resolveAutoOutreachState(
  input: AutoOutreachStateInput,
  now: Date = new Date(),
): { state: AutoOutreachState; nextCheckAt: Date | null } {
  if (!input.autoAllowed) return { state: "PLAN_NOT_ALLOWED", nextCheckAt: null };
  if (!input.enabled) return { state: "OFF", nextCheckAt: null };
  if (input.hiredCount >= input.hiringTarget) return { state: "TARGET_MET", nextCheckAt: null };
  if (input.jobStatus !== "PUBLISHED") return { state: "NOT_PUBLISHED", nextCheckAt: null };
  if (input.exhaustedAt && input.exhaustedReason) {
    const nextCheckAt = autoOutreachRecheckAt(input.exhaustedReason, input.exhaustedAt);
    if (nextCheckAt > now) {
      return { state: input.exhaustedReason === "NO_MATCH" ? "NO_MATCH" : "CANDIDATES_CAPPED", nextCheckAt };
    }
  }
  return { state: "RUNNING", nextCheckAt: null };
}

/**
 * AD-23 mục 3 — thay đổi có thể làm tin tìm thêm được người: bật lại, hạ ngưỡng điểm,
 * tăng số người cần tuyển. Khi đó xoá dấu "hết ứng viên"; bước 5 dùng thêm điều kiện
 * này (cùng tin PUBLISHED và đang bật) để chạy một lượt ngay.
 */
export function reopensAutoOutreach(
  current: AutoOutreachSettings,
  patch: { [K in keyof AutoOutreachSettings]?: AutoOutreachSettings[K] | undefined },
): boolean {
  return (
    (patch.enabled === true && !current.enabled) ||
    (patch.minScore !== undefined && patch.minScore < current.minScore) ||
    (patch.hiringTarget !== undefined && patch.hiringTarget > current.hiringTarget)
  );
}

// ─── Lượt chạy nền (bước 5) ──────────────────────────────────────────────────

/** Tin có dấu "hết ứng viên" và chưa tới lúc kiểm lại ⇒ lượt chạy bỏ qua tin này. */
export function isAwaitingRecheck(
  job: { exhaustedAt: Date | null; exhaustedReason: AutoOutreachExhaustedReason | null },
  now: Date = new Date(),
): boolean {
  if (!job.exhaustedAt || !job.exhaustedReason) return false;
  return autoOutreachRecheckAt(job.exhaustedReason, job.exhaustedAt) > now;
}

/**
 * Số lời mời tự động còn gửi được hôm nay (bước 5, mục 3):
 * R = min(⌊quota × share / 100⌋ − autoUsed, quota − totalUsed), không âm.
 * Mời tay dùng chung tổng hạn mức nên có thể làm R nhỏ hơn phần tự động còn lại.
 */
export function autoRunRemaining(dailyQuota: number, autoLimit: number, usage: { total: number; auto: number }): number {
  return Math.max(0, Math.min(autoLimit - usage.auto, dailyQuota - usage.total));
}

export interface AllocationJob {
  jobPostId: string;
  /** Số lời mời còn thiếu (target − active), > 0. */
  deficit: number;
  /** hiringTarget × H, > 0. */
  target: number;
  expiresAt: Date | null;
  /** Số ứng viên đạt ngưỡng còn trong hàng chờ của tin. */
  available: number;
}

/**
 * AD-23 mục 3 — chia R lượt cho các tin theo vòng: mỗi vòng cấp 1 lượt cho mỗi tin còn
 * thiếu và còn ứng viên. Thứ tự trong một vòng: tỉ lệ thiếu (deficit / target) giảm dần,
 * rồi tin hết hạn sớm trước (không có hạn xếp cuối), rồi id để kết quả cố định.
 * Trả về dãy id tin theo đúng thứ tự gửi; độ dài ≤ R. Ví dụ AD-23: R = 12, thiếu
 * 10/3/1 (đủ ứng viên) ⇒ 8/3/1.
 */
export function allocateRoundRobin(jobs: AllocationJob[], remaining: number): string[] {
  const ordered = [...jobs].sort(compareAllocationJobs);
  const capacity = new Map(ordered.map((job) => [job.jobPostId, Math.max(0, Math.min(job.deficit, job.available))]));
  const slots: string[] = [];
  let progressed = true;
  while (slots.length < remaining && progressed) {
    progressed = false;
    for (const job of ordered) {
      if (slots.length >= remaining) break;
      const left = capacity.get(job.jobPostId)!;
      if (left <= 0) continue;
      capacity.set(job.jobPostId, left - 1);
      slots.push(job.jobPostId);
      progressed = true;
    }
  }
  return slots;
}

function compareAllocationJobs(left: AllocationJob, right: AllocationJob): number {
  const ratio = right.deficit / right.target - left.deficit / left.target;
  if (ratio !== 0) return ratio;
  if (left.expiresAt?.getTime() !== right.expiresAt?.getTime()) {
    if (!left.expiresAt) return 1;
    if (!right.expiresAt) return -1;
    return left.expiresAt.getTime() - right.expiresAt.getTime();
  }
  return left.jobPostId < right.jobPostId ? -1 : left.jobPostId > right.jobPostId ? 1 : 0;
}

/**
 * Q4 — thứ tự công ty trong một lượt cron: lần chạy gần nhất cũ nhất trước, công ty chưa
 * chạy bao giờ đứng đầu, để công ty không tới lượt (hết thời gian) được ưu tiên lượt sau.
 */
export function orderCompaniesByLastRun(companyIds: string[], lastRunAt: Map<string, number>): string[] {
  return [...companyIds].sort((left, right) => {
    const diff = (lastRunAt.get(left) ?? -Infinity) - (lastRunAt.get(right) ?? -Infinity);
    if (diff !== 0 && !Number.isNaN(diff)) return diff;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}
