// Chấm lại theo ứng viên gần thời gian thực (0.6, AD-27). Các con số ở đây là số do
// thiết kế (AD-27 mục 5), chỉnh theo số đo ở bước 10 của
// docs/06-backend/live-rescore/PLAN.md.

/**
 * Khoảng chờ người dùng ngừng sửa (D3): mỗi lần đánh dấu thì đặt lại hẹn giờ của ứng
 * viên đó; hết khoảng này mà không sửa thêm thì gọi lượt chấm. Chủ dự án duyệt 30–60 giây.
 */
export const LIVE_RESCORE_DEBOUNCE_MS = 45_000;

/**
 * Trần số hẹn giờ cùng lúc trong bộ nhớ. Vượt thì không đặt hẹn giờ cho người mới: dấu
 * vẫn nằm trong DB, cron 15 phút chấm sau. Chặn trường hợp một đợt đổ dữ liệu rất lớn
 * làm `Map` phình mãi.
 */
export const LIVE_RESCORE_MAX_TIMERS = 5_000;
