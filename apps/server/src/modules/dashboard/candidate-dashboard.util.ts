// Tiện ích thuần xử lý dữ liệu và logic hiển thị cho Dashboard Ứng viên (Candidate Dashboard).
// Tuân thủ nguyên tắc không phụ thuộc DB, dễ unit test.

export interface CandidateInterviewLike {
  id: string;
  status: string;
  scheduledAt: string | Date;
  location?: string | null;
}

export interface CandidateCvLike {
  id: string;
  fileName: string;
  fileUrl: string;
  isDefault: boolean;
  isBuilder?: boolean;
}

export interface CandidateApplicationLike {
  id: string;
  status: string;
  createdAt: string | Date;
}

/** Trạng thái hồ sơ còn đang trong quy trình tuyển dụng (chưa kết thúc) */
export const ACTIVE_APPLICATION_STATUSES = new Set([
  "SUBMITTED",
  "REVIEWING",
  "SHORTLISTED",
  "INTERVIEWING",
]);

/** Trạng thái hồ sơ đã kết thúc */
export const TERMINAL_APPLICATION_STATUSES = new Set([
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "JOB_CLOSED",
]);

/**
 * Lọc và sắp xếp các buổi phỏng vấn sắp tới (chưa bị hủy, thời gian >= now).
 * Kết quả sắp xếp tăng dần theo thời gian phỏng vấn (sớm nhất lên đầu).
 */
export function filterUpcomingInterviews<T extends CandidateInterviewLike>(
  interviews: T[],
  now: Date = new Date(),
): T[] {
  if (!Array.isArray(interviews)) return [];
  const nowMs = now.getTime();

  return interviews
    .filter((inv) => inv.status !== "CANCELLED" && new Date(inv.scheduledAt).getTime() >= nowMs)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}

/**
 * Xác định địa điểm phỏng vấn là đường dẫn họp online (Google Meet, Zoom, Teams, v.v.) hay địa chỉ trực tiếp.
 */
export function isOnlineMeetingLocation(location?: string | null): boolean {
  if (!location) return false;
  return /^https?:\/\//i.test(location.trim());
}

/**
 * Chọn CV mặc định để hiển thị nhanh trên Dashboard:
 * 1. Ưu tiên CV có cờ `isDefault === true`
 * 2. Nếu không có CV mặc định, chọn CV đầu tiên trong danh sách
 * 3. Nếu danh sách rỗng, trả về null
 */
export function resolvePrimaryCv<T extends CandidateCvLike>(cvs: T[]): T | null {
  if (!Array.isArray(cvs) || cvs.length === 0) return null;
  return cvs.find((c) => c.isDefault) || cvs[0] || null;
}

/**
 * Tính toán các chỉ số thống kê hồ sơ ứng tuyển cho Dashboard:
 * - total: Tổng số đơn nộp
 * - active: Số đơn đang được xử lý (SUBMITTED, REVIEWING, SHORTLISTED, INTERVIEWING)
 * - completed: Số đơn đã kết thúc (ACCEPTED, REJECTED, WITHDRAWN, JOB_CLOSED)
 */
export function computeApplicationMetrics(applications: CandidateApplicationLike[]): {
  total: number;
  active: number;
  completed: number;
} {
  if (!Array.isArray(applications)) return { total: 0, active: 0, completed: 0 };

  let active = 0;
  let completed = 0;

  for (const app of applications) {
    if (ACTIVE_APPLICATION_STATUSES.has(app.status)) {
      active++;
    } else if (TERMINAL_APPLICATION_STATUSES.has(app.status)) {
      completed++;
    }
  }

  return {
    total: applications.length,
    active,
    completed,
  };
}

/**
 * Cắt danh sách hồ sơ ứng tuyển gần đây nhất (tối đa `limit` mục, mặc định 5),
 * sắp xếp giảm dần theo ngày nộp (mới nhất lên đầu).
 */
export function getRecentApplications<T extends CandidateApplicationLike>(
  applications: T[],
  limit: number = 5,
): T[] {
  if (!Array.isArray(applications)) return [];

  return [...applications]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, Math.max(0, limit));
}
