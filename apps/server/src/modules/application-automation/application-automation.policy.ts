import type { ApplicationMatchBand } from "@sip/shared-types";

/*
 * Quy tắc của tự xử lý hồ sơ (AD-25, 0.4). Hàm thuần, không đụng DB, có unit test.
 * Phần SQL tương ứng (lọc `focus=reject`) phải giữ cùng quy tắc — xem
 * `REJECT_SUGGEST_THRESHOLD` trong `applications.repository.ts`.
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
