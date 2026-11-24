import type {
  BulkModerationSkipReason,
  JobPostStatus,
  JobPostType,
  JobQualityBandFilter,
  JobQualityDto,
  JobQualityIssueDto,
} from "@sip/shared-types";

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

/**
 * AD-29 — nhãn và màu ba vùng điểm chất lượng (+ "Chưa chấm"). Vùng do server tính; frontend
 * không tự tính điểm (docs/05-frontend/phases/job-quality-moderation/PLAN.md, F1).
 */
export const JOB_QUALITY_BAND_LABEL: Record<JobQualityBandFilter, { label: string; tone: BadgeTone }> = {
  SUGGEST_APPROVE: { label: "Đề xuất duyệt", tone: "success" },
  NEEDS_REVIEW: { label: "Cần xem kỹ", tone: "warning" },
  SUGGEST_REJECT: { label: "Đề xuất từ chối", tone: "danger" },
  UNSCORED: { label: "Chưa chấm", tone: "neutral" },
};

/** Thứ tự tab vùng ở hàng đợi chờ duyệt. */
export const JOB_QUALITY_BAND_ORDER: JobQualityBandFilter[] = ["SUGGEST_APPROVE", "NEEDS_REVIEW", "SUGGEST_REJECT", "UNSCORED"];

/**
 * Các lỗi nặng nhất của một tin (cờ chặn trước, rồi theo mức trừ giảm dần) — cho dòng tin ở
 * hàng đợi. Trả `message` của server, không tự đặt câu.
 */
export function topQualityIssues(quality: JobQualityDto | null, limit = 2): JobQualityIssueDto[] {
  if (!quality) return [];
  const flags = new Set(quality.flags);
  return quality.criteria
    .flatMap((criterion) => criterion.issues)
    .sort((a, b) => Number(flags.has(b.code)) - Number(flags.has(a.code)) || b.penalty - a.penalty)
    .slice(0, limit);
}

/** Trần số tin mỗi lần duyệt / từ chối hàng loạt — khớp `MODERATION_BATCH_LIMIT` phía server (Q2). */
export const BULK_MODERATION_LIMIT = 50;

/** Vì sao một tin bị bỏ qua trong lô (F3). */
export const BULK_SKIP_REASON_LABEL: Record<BulkModerationSkipReason, string> = {
  NOT_PENDING: "Đã được người khác xử lý",
  REASON_REQUIRED: "Chưa có lý do từ chối",
  NOT_FOUND: "Không còn tồn tại",
  FAILED: "Lỗi khi xử lý, thử lại sau",
};

/**
 * Lý do từ chối / thu hồi chọn sẵn (ảnh mẫu `Screenshot 2026-09-12 134745.png`). Dùng chung cho
 * `RejectJobModal` và hộp từ chối hàng loạt.
 */
export const JOB_REJECT_PRESET_REASONS = [
  "Thiếu thông tin",
  "Nội dung không phù hợp",
  "Thông tin không hợp lệ",
  "Vi phạm chính sách",
  "Khác",
];

/** Ghép lý do chọn sẵn + phần nhập tự do thành một chuỗi `reason`; "" khi không có gì. */
export function composeRejectReason(checked: string[], detail: string): string {
  return [checked.join(", "), detail.trim()].filter(Boolean).join(". ");
}

/**
 * Tách lý do tự sinh của server ("Thiếu thông tin, Vi phạm chính sách. Chi tiết…") thành các lý do
 * chọn sẵn + phần chi tiết, để điền sẵn vào `RejectJobModal` (F4). Phần đầu không khớp lý do chọn
 * sẵn nào thì đưa cả chuỗi vào phần chi tiết. Ngược với `composeRejectReason`.
 */
export function splitRejectReason(reason: string): { checked: string[]; detail: string } {
  const cut = reason.indexOf(". ");
  if (cut > 0) {
    const head = reason.slice(0, cut).split(", ");
    if (head.every((part) => JOB_REJECT_PRESET_REASONS.includes(part))) {
      return { checked: head, detail: reason.slice(cut + 2).trim() };
    }
  }
  return { checked: [], detail: reason.trim() };
}

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
