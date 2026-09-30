import type { InterviewMode } from "@sip/shared-types";
import { formatDayMonth, vnTodayIso } from "./dashboard-format";

/**
 * Ngày giờ của lịch phỏng vấn (FE-5). Người dùng chọn ngày + giờ theo giờ Việt
 * Nam; gửi lên server dạng ISO kèm `+07:00` (server không nhận giờ "trần").
 * Việt Nam không có giờ mùa hè nên lệch UTC luôn là +7.
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Giới hạn của server: lịch trong vòng 180 ngày tới. */
export const MAX_DAYS_AHEAD = 180;
/** Giới hạn của server cho một lô lên lịch hàng loạt (D12). */
export const BATCH_MAX = 20;
export const TZ_LABEL = "(GMT+7)";

const WEEKDAY_LONG = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `"2026-10-02"` + `"14:00"` → `"2026-10-02T14:00:00+07:00"`. */
export function vnIso(date: string, time: string): string {
  return `${date}T${time}:00+07:00`;
}

/** Ngày (YYYY-MM-DD) và số phút trong ngày của một mốc giờ, theo giờ Việt Nam. */
export function vnDateAndMinutes(value: string | number | Date): { date: string; minutes: number } {
  const shifted = new Date(new Date(value).getTime() + VN_OFFSET_MS);
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** Số phút trong ngày → `HH:mm` (quá nửa đêm thì quay vòng). */
export function hhmm(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/** `HH:mm` → số phút trong ngày. */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

/** Cộng ngày trên ngày lịch YYYY-MM-DD (không phụ thuộc múi giờ máy). */
export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Số ngày lịch từ `from` tới `to` (YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  const toUtc = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return Date.UTC(year!, month! - 1, day!);
  };
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

function weekdayLong(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return WEEKDAY_LONG[new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()]!;
}

/** `"2026-10-02"` → `"Thứ Sáu, 02/10/2026"`. */
export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${weekdayLong(isoDate)}, ${day}/${month}/${year}`;
}

/** Ngày gần: `Hôm nay`, `Ngày mai`, còn lại `Thứ Sáu 02/10`. */
export function formatRelativeDay(isoDate: string, today: string = vnTodayIso()): string {
  const diff = daysBetween(today, isoDate);
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Ngày mai";
  return `${weekdayLong(isoDate)} ${formatDayMonth(isoDate)}`;
}

/** Khung giờ của một buổi: `"14:00 – 14:45"` (giờ Việt Nam). */
export function formatInterviewSpan(scheduledAt: string, durationMinutes: number): string {
  const { minutes } = vnDateAndMinutes(scheduledAt);
  return `${hhmm(minutes)} – ${hhmm(minutes + durationMinutes)}`;
}

/** `"Thứ Sáu, 02/10/2026 · 14:00 – 14:45 (GMT+7)"`. */
export function formatInterviewWhen(scheduledAt: string, durationMinutes: number): string {
  const { date } = vnDateAndMinutes(scheduledAt);
  return `${formatLongDate(date)} · ${formatInterviewSpan(scheduledAt, durationMinutes)} ${TZ_LABEL}`;
}

export function interviewEndMs(scheduledAt: string, durationMinutes: number): number {
  return new Date(scheduledAt).getTime() + durationMinutes * MINUTE_MS;
}

export const MODE_LABEL: Record<InterviewMode, string> = {
  ONLINE: "Online",
  ONSITE: "Tại văn phòng",
};

export const MODE_ICON: Record<InterviewMode, string> = {
  ONLINE: "video",
  ONSITE: "building-2",
};

/** Liên kết họp hợp lệ: bắt đầu bằng http(s)://, không có khoảng trắng. */
export function isMeetingUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}
