import type { ApplicationStatus } from "@prisma/client";
import type { ApplicationMatchBand } from "@sip/shared-types";
import { AUTO_CLOSE_GRACE_DAYS, AUTO_CLOSE_INTERVIEWED_DAYS, AUTOMATION_DAILY_RUN_VN } from "./application-automation.config";

/*
 * Quy tắc của tự xử lý hồ sơ (AD-25, 0.4). Hàm thuần, không đụng DB, có unit test.
 * Phần SQL tương ứng phải giữ cùng quy tắc:
 *  - lọc `focus=reject`: `REJECT_SUGGEST_THRESHOLD` trong `applications.repository.ts`;
 *  - lọc hồ sơ tới hạn đóng: `CLOSE_DUE_AT` trong `application-automation.repository.ts`.
 */

/**
 * Ngưỡng đề xuất từ chối Y thực dùng. Luôn Y < X: API cài đặt đã chặn Y ≥ X, nhưng dữ liệu
 * sửa tay hoặc X hạ qua lối khác vẫn có thể vi phạm, nên kẹp Y = X − 1 lúc đọc (bước 1).
 */
export function effectiveRejectThreshold(matchThreshold: number, rejectSuggestBelowScore: number): number {
  return Math.max(0, Math.min(rejectSuggestBelowScore, matchThreshold - 1));
}

/**
 * Dải điểm theo ngưỡng của tin: ≥ X ⇒ `ABOVE`; < Y ⇒ `BELOW`; còn lại `MIDDLE`.
 * Không có điểm ⇒ `null` (giao diện hiện "Chưa có điểm").
 */
export function matchBand(
  score: number | null,
  matchThreshold: number,
  rejectSuggestBelowScore: number,
): ApplicationMatchBand | null {
  if (score === null) return null;
  if (score >= matchThreshold) return "ABOVE";
  if (score < effectiveRejectThreshold(matchThreshold, rejectSuggestBelowScore)) return "BELOW";
  return "MIDDLE";
}

// ─── Tự đóng (bước 4c) ──────────────────────────────────────────────────────

/**
 * Nhóm của hồ sơ chưa kết thúc ở tin đã đóng:
 * G1 Chờ duyệt; G2 chưa phỏng vấn; G3 có lịch sắp tới; G4 đã phỏng vấn, chưa có kết quả.
 */
export type AutoCloseGroup = "G1" | "G2" | "G3" | "G4";

/** Lời thông báo cho ứng viên: tin ngừng nhận hồ sơ (G1, G2) / chưa có kết quả (G4). */
export type CloseReason = "JOB_ENDED" | "NO_RESULT";

export interface CloseDueInput {
  status: ApplicationStatus;
  /** Mốc "ngày tin đóng" (bước 0): `closedAt` / `LEAST(expiresAt, updatedAt)` / lần gỡ tin. */
  jobClosedAt: Date;
  /** Buổi gần nhất đã diễn ra (lịch SCHEDULED, giờ đã qua). null ⇒ chưa phỏng vấn. */
  lastInterviewAt: Date | null;
  hasUpcomingInterview: boolean;
  autoCloseInterviewedEnabled: boolean;
}

export interface CloseDecision {
  group: AutoCloseGroup;
  /** null ⇒ nhóm này không tự đóng (G3, hoặc G4 khi tắt công tắc). */
  dueAt: Date | null;
  reason: CloseReason;
}

/** Trạng thái còn đang xử lý; các trạng thái khác đã kết thúc, không đóng nữa. */
const OPEN_STATUSES: ReadonlySet<ApplicationStatus> = new Set(["PENDING", "REVIEWING", "SHORTLISTED", "INTERVIEWING"]);

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Nhóm và ngày tới hạn tự đóng của một hồ sơ ở tin đã đóng (bảng G1–G4 của plan).
 * Trả `null` khi hồ sơ đã kết thúc (Được nhận, Từ chối, Đã huỷ, Tin đã đóng).
 */
export function closeDecision(input: CloseDueInput): CloseDecision | null {
  if (!OPEN_STATUSES.has(input.status)) return null;
  // Q2: Chờ duyệt đóng ngay ở lượt chạy đầu tiên sau khi tin đóng.
  if (input.status === "PENDING") return { group: "G1", dueAt: input.jobClosedAt, reason: "JOB_ENDED" };
  // Còn lịch sắp tới thì nhà tuyển dụng vẫn đang xử lý: không đóng.
  if (input.hasUpcomingInterview) return { group: "G3", dueAt: null, reason: "NO_RESULT" };
  if (input.lastInterviewAt) {
    const from = input.lastInterviewAt > input.jobClosedAt ? input.lastInterviewAt : input.jobClosedAt;
    return {
      group: "G4",
      dueAt: input.autoCloseInterviewedEnabled ? addDays(from, AUTO_CLOSE_INTERVIEWED_DAYS) : null,
      reason: "NO_RESULT",
    };
  }
  return { group: "G2", dueAt: addDays(input.jobClosedAt, AUTO_CLOSE_GRACE_DAYS), reason: "JOB_ENDED" };
}

/** Ngày tới hạn tự đóng, hoặc `null` nếu hồ sơ không tự đóng. */
export function closeDueAt(input: CloseDueInput): Date | null {
  return closeDecision(input)?.dueAt ?? null;
}

// ─── Nhắc tuần (bước 5) ─────────────────────────────────────────────────────

/** Việt Nam là UTC+7, không đổi giờ theo mùa. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Thứ Hai của tuần chứa `now`, theo giờ Việt Nam, dạng YYYY-MM-DD — phần cuối của `dedupeKey`
 * nhắc tuần: chạy lại trong cùng tuần (kể cả Chủ nhật) không tạo thông báo trùng.
 */
export function vnWeekKey(now: Date): string {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const daysSinceMonday = (vn.getUTCDay() + 6) % 7;
  return new Date(vn.getTime() - daysSinceMonday * DAY_MS).toISOString().slice(0, 10);
}

/** `dedupeKey` của nhắc tuần: một thông báo cho mỗi công ty + người nhận + tuần (giờ Việt Nam). */
export function weeklyReminderDedupeKey(companyId: string, userId: string, now: Date): string {
  return `APPLICATIONS_NEED_ATTENTION:${companyId}:${userId}:${vnWeekKey(now)}`;
}

/**
 * Lúc hồ sơ tới hạn `dueAt` thực sự bị đóng: lượt hằng ngày đầu tiên (8h30 giờ Việt Nam)
 * không sớm hơn cả `dueAt` lẫn `now`. Nhắc tuần ghi ngày này, không ghi `dueAt`, để ngày
 * báo trước khớp ngày ứng viên nhận thông báo đóng.
 */
export function nextAutoCloseRun(dueAt: Date, now: Date): Date {
  const from = dueAt > now ? dueAt : now;
  const vn = new Date(from.getTime() + VN_OFFSET_MS);
  const runVn = Date.UTC(
    vn.getUTCFullYear(),
    vn.getUTCMonth(),
    vn.getUTCDate(),
    AUTOMATION_DAILY_RUN_VN.hour,
    AUTOMATION_DAILY_RUN_VN.minute,
  );
  const sameDay = vn.getTime() <= runVn;
  return new Date((sameDay ? runVn : runVn + DAY_MS) - VN_OFFSET_MS);
}
