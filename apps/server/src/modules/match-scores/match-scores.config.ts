// Hằng số của bảng điểm lưu sẵn (0.3, AD-24) — docs/06-backend/hiring-progress/PLAN.md.
// Đặt trong code (không ở env), giống candidate-outreach.config.ts.

/**
 * Số embedding mới tối đa được tính cho mỗi khúc hồ sơ khi chấm một tin. Bước 0: trường
 * hợp xấu nhất ≈ 22 giây mỗi tin (≈ 112 ms một hồ sơ); hiện gần như không phải embed vì
 * 1.521/1.523 ứng viên đã có vector. Người vượt giới hạn có điểm rule-only,
 * `semanticPending = true`, và được chấm lại ở lượt đêm sau.
 */
export const MATCH_SCORE_MAX_NEW_EMBEDDINGS = 200;

/**
 * Số hồ sơ chấm trong một lần gọi `scoreProfiles`; giữa các khúc nhường event loop.
 * Pool lớn nhất ở bộ demo là 882 nên thường chỉ một khúc.
 */
export const MATCH_SCORE_CHUNK_SIZE = 1_000;

/** Số id mỗi lần nạp hồ sơ (`candidateMatchProfileLoader.loadMany`). */
export const MATCH_SCORE_PROFILE_LOAD_BATCH = 500;

/**
 * Trần số hồ sơ giữ trong cache của một lượt. Vượt trần thì xoá sạch cache rồi nạp tiếp.
 * Bộ demo có 1.523 ứng viên nên không bao giờ chạm; trần chỉ để bộ nhớ không phình khi
 * dữ liệu lớn. Số do thiết kế, không có nguồn.
 */
export const MATCH_SCORE_PROFILE_CACHE_MAX = 20_000;
