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

/** Thời gian tối đa của một lượt chấm (D5). Hết giờ thì dừng trước lô kế tiếp. */
export const LIVE_RESCORE_RUN_BUDGET_MS = 60_000;

/**
 * Số ứng viên mỗi lô (Q8). Bước 0: ~17 round trip mỗi lô ≈ 0,8 giây; lô 50 người × ~100
 * tin ≈ 5.000 dòng điểm trong một transaction.
 */
export const LIVE_RESCORE_BATCH_SIZE = 50;

/**
 * Số vector mới tối đa mỗi lượt (D5): ~25 ms mỗi vector (bước 0, trong worker) ⇒ 300
 * vector ≈ 7,5 giây, đủ cho một đợt 200 ứng viên mới. Người vượt có điểm rule-only
 * (`semanticPending`) và giữ dấu cho lượt sau.
 */
export const LIVE_RESCORE_MAX_NEW_EMBEDDINGS = 300;

/**
 * Lượt dừng vì hết giờ, hoặc có yêu cầu chấm trong lúc đang chạy, thì chạy tiếp lượt sau
 * khoảng nghỉ này, không chờ cron 15 phút.
 */
export const LIVE_RESCORE_CONTINUE_DELAY_MS = 1_000;

/** Cache hồ sơ tin (D5): hạn của một mục và trần số mục (vượt thì bỏ mục dùng lâu nhất). */
export const JOB_PROFILE_CACHE_TTL_MS = 60 * 60 * 1000;
export const JOB_PROFILE_CACHE_MAX_ENTRIES = 5_000;
