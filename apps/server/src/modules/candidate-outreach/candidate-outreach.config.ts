import type { OutreachInvitationStatus } from "@prisma/client";

// Hằng số của "Tìm & mời ứng viên" (B3, AD-15) — docs/06-backend/candidate-outreach/PLAN.md.
// Đặt trong code (không ở env), giống job-matching.config.ts.

/** Giai đoạn A: số ứng viên tối đa lấy từ SQL lọc thô trước khi chấm hybrid. */
export const PREFILTER_LIMIT = 50;
/** Số ứng viên trả về sau khi xếp hạng — top cố định, không phân trang. */
export const TOP_RESULT_COUNT = 10;
/** D3 — lời mời hết hạn sau N ngày. */
export const INVITATION_EXPIRY_DAYS = 14;
/** D4/Q1 — hạn mức lời mời/ngày/công ty khi gói không đặt riêng hoặc công ty đang TRIAL. */
export const DEFAULT_OUTREACH_DAILY_QUOTA = 3;

/** Q4 — cặp (candidateId, jobPostId) đã có lời mời ở các trạng thái này thì không được mời lại. */
export const BLOCKING_INVITATION_STATUSES: OutreachInvitationStatus[] = ["PENDING", "ACCEPTED", "DECLINED"];
