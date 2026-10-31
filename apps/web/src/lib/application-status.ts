import type { ApplicationStatus } from "@sip/shared-types";

/**
 * Từ vựng trạng thái hồ sơ ứng tuyển — lấy nguyên `APPLICATION_STATUS_LABEL` của
 * server (`notifications/templates/notification-templates.ts`), để chữ trên giao
 * diện khớp email và thông báo ứng viên nhận. Tone map sang `Badge`.
 */
type BadgeTone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Chờ duyệt", tone: "warning" },
  REVIEWING: { label: "Đang xem xét", tone: "brand" },
  SHORTLISTED: { label: "Vào danh sách rút gọn", tone: "brand" },
  INTERVIEWING: { label: "Mời phỏng vấn", tone: "brand" },
  ACCEPTED: { label: "Được nhận", tone: "success" },
  REJECTED: { label: "Bị từ chối", tone: "danger" },
  CANCELLED: { label: "Đã huỷ", tone: "neutral" },
};

/** Thứ tự theo state machine (H3 plan backend `employer-applications`). */
export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "PENDING",
  "REVIEWING",
  "SHORTLISTED",
  "INTERVIEWING",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
];

/** Trạng thái cuối: không chuyển tiếp được nữa. */
export function isFinalApplicationStatus(status: ApplicationStatus): boolean {
  return status === "ACCEPTED" || status === "REJECTED" || status === "CANCELLED";
}
