// Hằng số của job alert (0.5, AD-26 D7–D9) — docs/06-backend/job-discovery/PLAN.md bước 5–6.
// Đặt trong code (không ở env), giống match-scores.config.ts.

/**
 * Sàn điểm để báo: tin báo cho ứng viên có điểm ≥ max(ngưỡng tự mời của tin, sàn này).
 * Nhà tuyển dụng hạ ngưỡng của tin xuống thấp thì ứng viên vẫn không nhận tin kém phù hợp
 * (AD-26 mục 6). Cùng mốc 70 với bộ lọc "Chỉ tin phù hợp với tôi" ở /jobs.
 */
export const JOB_ALERT_MIN_SCORE_FLOOR = 70;

/** Giờ Việt Nam (UTC+7, không có giờ mùa hè) — dùng để chia "một ngày" của thông báo gộp. */
export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Lượt hằng ngày, 8h giờ Việt Nam (AD-26 D8): email gộp rồi nhắc thêm kỹ năng. Cùng giờ với các
 * thông báo hằng ngày khác (tin / gói sắp hết hạn, nhắc phỏng vấn); sau lượt chấm đêm 3h30.
 */
export const JOB_ALERT_DAILY_CRON = "0 8 * * *";

/** Số tin tối đa liệt kê trong một email gộp (điểm cao trước); còn lại ghi "và N tin khác". */
export const JOB_ALERT_DIGEST_MAX_JOBS = 10;

/** AD-26 D10: chỉ nhắc tài khoản đã tạo ít nhất chừng này giờ mà chưa có kỹ năng. */
export const SKILLS_REMINDER_MIN_ACCOUNT_AGE_HOURS = 24;
