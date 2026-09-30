/**
 * Định dạng số và ngày cho dashboard (sip-ui: chấm ngăn nghìn, `DD/MM/YYYY`,
 * giờ Việt Nam). Mọi mốc "ngày" của API dashboard đã theo giờ Việt Nam
 * (`DailyPoint.date` dạng YYYY-MM-DD), nên chỉ đổi cách viết, không đổi múi giờ.
 */

const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

const integerFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return integerFormat.format(value);
}

/** Một chữ số thập phân, dấu phẩy: `6,6`. */
export function formatDecimal(value: number): string {
  return decimalFormat.format(value);
}

export function formatVnd(value: number): string {
  return `${integerFormat.format(value)} ₫`;
}

/** Tiền rút gọn cho chỗ hẹp (số trên cột, cuối thanh): `42.500.000` → `42,5 tr`, `850.000` → `850 k`. */
export function formatVndShort(value: number): string {
  if (value >= 1_000_000) return `${decimalFormat.format(value / 1_000_000).replace(/,0$/, "")} tr`;
  if (value >= 1_000) return `${integerFormat.format(Math.round(value / 1_000))} k`;
  return integerFormat.format(value);
}

/** `+17 (+29%)` / `-3 (-12%)` / `0 (0%)`; kỳ trước bằng 0 thì bỏ phần trăm. */
export function formatChange(current: number, previous: number, format: (n: number) => string = formatNumber): string {
  const diff = current - previous;
  const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
  const absolute = `${sign}${format(Math.abs(diff))}`;
  if (previous === 0) return absolute;
  const percent = Math.round((Math.abs(diff) / previous) * 100);
  return `${absolute} (${sign}${percent}%)`;
}

export function trendOf(current: number, previous: number): "up" | "down" | "flat" {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

/** `2026-09-30` → `30/09`. */
export function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** `2026-09-30` → `T4` (tính trên ngày lịch, không phụ thuộc múi giờ máy). */
export function weekdayShort(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return WEEKDAY_SHORT[new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()]!;
}

function vnParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: VN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD (khớp `DailyPoint.date`). */
export function vnTodayIso(now: Date = new Date()): string {
  const p = vnParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** `DD/MM/YYYY` theo giờ Việt Nam. */
export function formatVnDate(value: Date | string | number): string {
  const p = vnParts(new Date(value));
  return `${p.day}/${p.month}/${p.year}`;
}

/** `DD/MM` theo giờ Việt Nam (cho mốc giờ ISO; ngày YYYY-MM-DD dùng `formatDayMonth`). */
export function formatVnDayMonth(value: Date | string | number): string {
  const p = vnParts(new Date(value));
  return `${p.day}/${p.month}`;
}

/** `HH:mm` theo giờ Việt Nam. */
export function formatVnTime(value: Date | string | number): string {
  const p = vnParts(new Date(value));
  return `${p.hour}:${p.minute}`;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Khoảng thời gian đã chờ: `12 phút`, `5 giờ`, `3 ngày`. */
export function formatWaited(since: string, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - new Date(since).getTime());
  if (elapsed < HOUR_MS) return `${Math.max(1, Math.floor(elapsed / 60_000))} phút`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)} giờ`;
  return `${Math.floor(elapsed / DAY_MS)} ngày`;
}

/** Đã chờ quá `days` ngày chưa (ngưỡng "Trên 2 ngày" của thanh thời gian chờ). */
export function waitedOverDays(since: string, days: number, now: number = Date.now()): boolean {
  return now - new Date(since).getTime() > days * DAY_MS;
}

/** Thời gian tương đối cho mốc đã qua: `vừa xong`, `5 phút trước`, `2 ngày trước`. */
export function formatRelativePast(value: string, now: number = Date.now()): string {
  if (now - new Date(value).getTime() < 60_000) return "vừa xong";
  return `${formatWaited(value, now)} trước`;
}

/** Chữ cái đầu cho ô "mặt" của hàng việc: "Nguyễn Văn An" → "NA". */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]!.charAt(0);
  const last = words.length > 1 ? words[words.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase();
}
