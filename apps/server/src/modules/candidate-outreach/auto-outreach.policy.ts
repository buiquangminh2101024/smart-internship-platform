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
