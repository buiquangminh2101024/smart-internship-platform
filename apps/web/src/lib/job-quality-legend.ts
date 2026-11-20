import type { JobQualityBand, JobQualityCriterionKey, JobQualityScoredReason } from "@sip/shared-types";

/*
 * Nội dung hộp "Cách tính điểm" (AD-29 F5) — tóm tắt mục "Thuật toán chấm điểm" của
 * docs/06-backend/job-quality-moderation/PLAN.md cho Admin đọc. Server mới là nơi tính điểm;
 * đổi ngưỡng / trọng số ở `apps/server/src/modules/job-posts/job-quality.config.ts` (và tăng
 * QUALITY_SCORE_VERSION) thì sửa luôn file này.
 */

/** Phiên bản bộ chấm mà nội dung dưới đây mô tả. */
export const QUALITY_LEGEND_VERSION = 1;

export const QUALITY_CRITERIA_LEGEND: { key: JobQualityCriterionKey; label: string; weight: number; summary: string }[] = [
  {
    key: "COMPLETENESS",
    label: "Độ đầy đủ",
    weight: 20,
    summary: "Có yêu cầu ứng viên, kỹ năng bắt buộc, quyền lợi và ngành học phù hợp.",
  },
  {
    key: "CONTENT",
    label: "Chất lượng nội dung",
    weight: 20,
    summary: "Mô tả đủ dài (từ 150 ký tự, tốt nhất từ 300), tiêu đề vừa phải, không viết hoa toàn bộ, không chèn số điện thoại / email.",
  },
  {
    key: "TRANSPARENCY",
    label: "Minh bạch",
    weight: 15,
    summary: "Có mức lương cụ thể và hợp lý, địa chỉ rõ ràng, hạn nộp không quá gấp.",
  },
  {
    key: "INTERNSHIP_FIT",
    label: "Phù hợp với thực tập",
    weight: 10,
    summary: "Không đòi nhiều năm kinh nghiệm, không quá nhiều kỹ năng bắt buộc.",
  },
  {
    key: "RISK",
    label: "Dấu hiệu rủi ro",
    weight: 25,
    summary: "Đòi nộp tiền, kéo ứng viên liên hệ ngoài nền tảng, hứa hẹn quá mức, gửi lại không sửa sau khi bị từ chối.",
  },
  {
    key: "COMPANY",
    label: "Uy tín công ty",
    weight: 10,
    summary: "Lịch sử của công ty: tin bị thu hồi, báo cáo vi phạm, tỉ lệ tin bị từ chối.",
  },
];

export const QUALITY_BAND_LEGEND: { band: JobQualityBand; rule: string }[] = [
  { band: "SUGGEST_APPROVE", rule: "Từ 80 điểm và không tiêu chí nào dưới 50." },
  { band: "NEEDS_REVIEW", rule: "Các trường hợp còn lại." },
  {
    band: "SUGGEST_REJECT",
    rule: "Dưới 50 điểm, hoặc có cờ chặn, hoặc một trong năm tiêu chí đầu dưới 40 (tiêu chí Uy tín công ty không tính).",
  },
];

export const QUALITY_FLAG_LEGEND =
  "Cờ chặn: tin yêu cầu ứng viên nộp tiền (phí đào tạo, đặt cọc...). Có cờ này thì tin luôn ở vùng đề xuất từ chối, dù tổng điểm cao.";

export const QUALITY_TOTAL_LEGEND =
  "Mỗi tiêu chí bắt đầu từ 100 điểm và bị trừ theo từng lỗi tìm thấy (không xuống dưới 0). Điểm tổng là trung bình có trọng số của sáu tiêu chí, làm tròn.";

export const QUALITY_NOTE_LEGEND =
  "Điểm chỉ là gợi ý để xếp hàng đợi. Admin vẫn là người quyết định duyệt hay từ chối.";

/** Vì sao tin được chấm lần gần nhất (dòng "Chấm lúc …"). */
export const QUALITY_SCORED_REASON_LABEL: Record<JobQualityScoredReason, string> = {
  SUBMITTED: "khi gửi duyệt",
  COMPANY_EVENT: "khi công ty có báo cáo vi phạm hoặc bị thu hồi tin",
  PUBLISHED_EDIT: "khi tin đang hiển thị được sửa",
  MANUAL: "do Admin chấm lại",
  SCRIPT: "do hệ thống chấm bổ sung",
};
