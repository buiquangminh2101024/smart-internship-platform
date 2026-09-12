import type { JobPostStatus, JobPostType } from "@sip/shared-types";

/**
 * Từ vựng trạng thái tin tuyển dụng — lấy nguyên từ
 * `docs/template_ui/components/feedback/StatusPill.jsx`, không đặt từ mới.
 * Tone map sang `Badge` (components/ui/Badge.tsx).
 */
type BadgeTone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";

export const JOB_STATUS_LABEL: Record<JobPostStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Nháp", tone: "neutral" },
  PENDING: { label: "Chờ duyệt", tone: "warning" },
  PUBLISHED: { label: "Đang hiển thị", tone: "success" },
  CLOSED: { label: "Đã đóng", tone: "neutral" },
  EXPIRED: { label: "Hết hạn", tone: "neutral" },
  TAKEN_DOWN: { label: "Đã hạ", tone: "danger" },
};

export const JOB_TYPE_LABEL: Record<JobPostType, string> = {
  INTERNSHIP: "Thực tập sinh",
  PART_TIME: "Bán thời gian",
  FULL_TIME: "Toàn thời gian",
  CONTRACT: "Hợp đồng",
};

export const JOB_TYPE_OPTIONS = (Object.keys(JOB_TYPE_LABEL) as JobPostType[]).map((value) => ({
  value,
  label: JOB_TYPE_LABEL[value],
}));

/** Hạn nộp hồ sơ tối đa 90 ngày kể từ lúc đặt — khớp MAX_EXPIRY_DAYS phía server. */
export const MAX_EXPIRY_DAYS = 90;

export function formatSalary(job: { salaryMin: number | null; salaryMax: number | null; isNegotiable: boolean }): string {
  if (job.isNegotiable || (job.salaryMin === null && job.salaryMax === null)) return "Thỏa thuận";
  const toMillion = (value: number) => Number((value / 1_000_000).toFixed(1));
  if (job.salaryMin !== null && job.salaryMax !== null) {
    return `${toMillion(job.salaryMin)} – ${toMillion(job.salaryMax)} triệu / tháng`;
  }
  const single = job.salaryMin ?? job.salaryMax!;
  return `${job.salaryMin !== null ? "Từ" : "Tới"} ${toMillion(single)} triệu / tháng`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN");
}

/** Số ngày còn lại tới hạn nộp — âm nghĩa là đã quá hạn, null khi chưa đặt hạn. */
export function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

export function formatDeadline(expiresAt: string | null): string {
  const left = daysLeft(expiresAt);
  if (left === null) return "Chưa đặt hạn";
  if (left < 0) return "Đã hết hạn";
  if (left === 0) return "Hết hạn hôm nay";
  return `Còn ${left} ngày`;
}

/** Giá trị mặc định cho <input type="date"> (yyyy-mm-dd theo giờ địa phương). */
export function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Kiểm tra giá trị ô <input type="date"> hạn nộp — trả về thông báo lỗi tiếng
 * Việt hoặc null nếu hợp lệ. Đặt ở lib (không nằm trong component) vì phép so
 * sánh phụ thuộc thời điểm hiện tại, giống formatDeadline/daysLeft ở trên.
 */
export function validateExpiryInput(value: string): string | null {
  // Chốt cuối ngày để tin còn hiệu lực trọn ngày hết hạn.
  const picked = new Date(`${value}T23:59:59`);
  if (Number.isNaN(picked.getTime())) return "Hạn nộp hồ sơ không hợp lệ";
  const now = Date.now();
  if (picked.getTime() <= now) return "Hạn nộp hồ sơ phải ở tương lai";
  if (picked.getTime() > now + MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000) {
    return `Hạn nộp hồ sơ không được quá ${MAX_EXPIRY_DAYS} ngày kể từ hôm nay`;
  }
  return null;
}

/** Chuyển giá trị ô date sang ISO cuối ngày để gửi lên API. */
export function expiryInputToIso(value: string): string {
  return new Date(`${value}T23:59:59`).toISOString();
}

/** Tin đăng trong 7 ngày gần đây — dùng cho nhãn "Mới" trên JobCard. */
export function isRecentlyPublished(publishedAt: string | null): boolean {
  if (!publishedAt) return false;
  return Date.now() - new Date(publishedAt).getTime() < 7 * 24 * 60 * 60 * 1000;
}

export function maxExpiryInputValue(): string {
  return toDateInputValue(new Date(Date.now() + MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString());
}

export function minExpiryInputValue(): string {
  return toDateInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
}
