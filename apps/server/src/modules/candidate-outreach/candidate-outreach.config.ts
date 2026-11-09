import type { OutreachInvitationStatus } from "@prisma/client";

// Hằng số của "Tìm & mời ứng viên" (B3, AD-15) — docs/06-backend/candidate-outreach/PLAN.md.
// Đặt trong code (không ở env), giống job-matching.config.ts.

/** Giai đoạn A: số ứng viên tối đa lấy từ SQL lọc thô trước khi chấm hybrid. */
export const PREFILTER_LIMIT = 50;
/** Số ứng viên trả về sau khi xếp hạng — top cố định, không phân trang. */
export const TOP_RESULT_COUNT = 10;
/** D3 — lời mời hết hạn sau N ngày. */
export const INVITATION_EXPIRY_DAYS = 14;

// ─── Hạn mức lời mời/ngày theo gói (AD-23 mục 4, sửa AD-15 mục 5) ────────────
//
//   hạn mức/ngày = max( S × C × H / T , C × H )
//
//   S  số tin của gói (jobPostQuota)
//   C  số người cần tuyển trung bình một tin = 2 (giả định, không có nguồn)
//   H  hệ số mời của gói: mỗi tin giữ hiringTarget × H lời mời đang hoạt động
//   T  số ngày hiệu lực của lời mời = INVITATION_EXPIRY_DAYS = 14
//
//   Vế trái: đủ giữ đầy lời mời cho mọi tin (tổng số chỗ / thời gian một lời mời chiếm chỗ).
//   Vế phải: mức sàn, đủ lấp đầy lời mời cho một tin ngay trong ngày đăng.
//
//   Gói           S    H   hạn mức/ngày
//   Dùng thử      2    3   6   (chỉ mời tay)
//   Cơ bản        5    4   8
//   Tiêu chuẩn    20   5   14
//   Doanh nghiệp  100  6   86
//
// Số của ba gói trả phí lưu trên SubscriptionPlan (outreachInvitationDailyQuota,
// outreachPoolMultiplier), ghi bằng migration 20261109120000_add_auto_outreach.
// Đổi C, H hay T thì tính lại bảng trên rồi cập nhật cả gói trong DB lẫn scripts/seed.ts.

/** Hạn mức/ngày của công ty đang dùng thử (S = 2, H = 3). Dùng thử không có tự động mời. */
export const TRIAL_OUTREACH_DAILY_QUOTA = 6;
/**
 * Hạn mức/ngày khi gói để outreachInvitationDailyQuota = null — KHÔNG phải "không
 * giới hạn". Lấy bằng mức của gói Cơ bản.
 */
export const DEFAULT_OUTREACH_DAILY_QUOTA = 8;
/** Hệ số mời H khi gói để outreachPoolMultiplier = null. Lấy bằng mức của gói Cơ bản. */
export const DEFAULT_POOL_MULTIPLIER = 4;

/** Q4 — cặp (candidateId, jobPostId) đã có lời mời ở các trạng thái này thì không được mời lại. */
export const BLOCKING_INVITATION_STATUSES: OutreachInvitationStatus[] = ["PENDING", "ACCEPTED", "DECLINED"];

// ─── Tự động mời theo tin (AD-23) — docs/06-backend/auto-outreach/PLAN.md ────

/**
 * AD-23 mục 7 — mỗi ứng viên nhận tối đa N lời mời/ngày (0h UTC), tính trên mọi
 * công ty, cả mời tay lẫn tự động. Con số do chủ dự án chọn.
 */
export const CANDIDATE_DAILY_INVITATION_CAP = 10;
/** Số ứng viên tối đa lấy từ SQL lọc thô cho mỗi tin trong một lượt tự động mời. */
export const AUTO_OUTREACH_PREFILTER_LIMIT = 50;
/**
 * Số embedding mới tối đa được tính cho mỗi tin trong một lượt chạy nền. Cao hơn
 * MAX_NEW_EMBEDDINGS_PER_REQUEST (30) của một request thường vì không có người chờ.
 */
export const AUTO_OUTREACH_MAX_NEW_EMBEDDINGS = 50;
/** Q4 — thời gian tối đa của một lượt cron (mọi công ty dùng chung một mốc dừng). */
export const AUTO_OUTREACH_RUN_BUDGET_MS = 60_000;
/** Q5 — tin dừng vì NO_MATCH được kiểm lại sau N giờ. CANDIDATE_CAP chờ tới 0h UTC kế tiếp. */
export const AUTO_OUTREACH_NO_MATCH_RECHECK_HOURS = 3;
