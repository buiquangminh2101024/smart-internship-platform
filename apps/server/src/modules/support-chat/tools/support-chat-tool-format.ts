import type { ApplicationStatus } from "@prisma/client";

// Phần định dạng dùng chung cho tool Candidate và Employer (GĐ2, D12).

/** Số mục tối đa trả cho model trong một danh sách (D12). */
export const LIST_LIMIT = 10;
/** Chữ tự do do người khác nhập (tiêu đề tin, địa điểm, lý do huỷ) — cắt ngắn trước khi đưa vào prompt. */
const FREE_TEXT_MAX_LENGTH = 200;

/** Nhãn khớp FAQ `application-status` và `employer-applications`. */
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  PENDING: "Chờ duyệt",
  REVIEWING: "Đang xem xét",
  SHORTLISTED: "Vào danh sách rút gọn",
  INTERVIEWING: "Mời phỏng vấn",
  ACCEPTED: "Được nhận",
  REJECTED: "Bị từ chối",
  CANCELLED: "Đã huỷ",
};

export const DATE_FORMAT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
export const DATE_TIME_FORMAT = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function excerpt(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > FREE_TEXT_MAX_LENGTH ? `${text.slice(0, FREE_TEXT_MAX_LENGTH - 1).trimEnd()}…` : text;
}
