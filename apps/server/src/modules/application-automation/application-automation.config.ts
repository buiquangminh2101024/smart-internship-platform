/*
 * Hằng số của tự xử lý hồ sơ (AD-25, 0.4). Mọi con số là số do thiết kế (xem AD-25),
 * không có nguồn ngoài. Công ty không chỉnh được (ngoài phạm vi 0.4).
 */

/** Hồ sơ Đang xem xét / Rút gọn chưa phỏng vấn (G2) tự đóng sau ngày tin đóng bấy nhiêu ngày. */
export const AUTO_CLOSE_GRACE_DAYS = 14;

/** Hồ sơ đã phỏng vấn chưa có kết quả (G4, khi bật công tắc) tự đóng sau bấy nhiêu ngày. */
export const AUTO_CLOSE_INTERVIEWED_DAYS = 30;

/** Mỗi lượt xử lý tối đa bấy nhiêu hồ sơ cho mỗi loại (tự chuyển, tự đóng); còn lại để lượt sau. */
export const AUTOMATION_MAX_PER_RUN = 500;

/** Nhường event loop cho request web sau mỗi bấy nhiêu hồ sơ. */
export const AUTOMATION_YIELD_EVERY = 50;

/**
 * Giờ lượt hằng ngày (giờ Việt Nam). Cron ở bước 7 dựng từ hằng này; nhắc tuần dùng nó để
 * tính ngày hồ sơ thực sự bị đóng (lượt đầu tiên từ lúc tới hạn).
 */
export const AUTOMATION_DAILY_RUN_VN = { hour: 8, minute: 30 } as const;

/** Nhắc tuần (quyết định #4): hồ sơ đứng yên quá bấy nhiêu ngày là "tồn". */
export const STALE_AFTER_DAYS = 7;

/** Nhắc tuần: báo trước các hồ sơ sẽ tự đóng trong bấy nhiêu ngày tới. */
export const CLOSING_SOON_DAYS = 7;
