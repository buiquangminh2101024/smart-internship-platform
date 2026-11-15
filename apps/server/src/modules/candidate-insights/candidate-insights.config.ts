// Hằng số của "Phân tích hồ sơ" — docs/06-backend/candidate-insights/PLAN.md.

import type { ProfileCompletenessGroup, ProfileCompletenessKey } from "@sip/shared-types";

/**
 * AD-26 mục 8 (Q2/Q6 — docs/06-backend/job-discovery/PLAN.md): tám mục chia theo hậu quả
 * khi thiếu, tổng 100. Thứ tự giữa các nhóm có căn cứ trong code; số trong nhóm là số do
 * thiết kế (nhóm MATCH chỉnh theo NACE). Thứ tự mảng cũng là thứ tự hoà của "Nên làm trước".
 * Chỉ để hiển thị — độ tin cậy của bộ chấm vẫn dùng 4 cờ của CandidateMatchProfile.
 */
export const PROFILE_COMPLETENESS_ITEMS: ReadonlyArray<{
  key: ProfileCompletenessKey;
  weight: number;
  group: ProfileCompletenessGroup;
}> = [
  { key: "skills", weight: 30, group: "GATE" },
  { key: "cv", weight: 15, group: "GATE" },
  { key: "outreach", weight: 10, group: "GATE" },
  { key: "experience", weight: 15, group: "MATCH" },
  { key: "projects", weight: 10, group: "MATCH" },
  { key: "headlineOrBio", weight: 5, group: "MATCH" },
  { key: "educationMajor", weight: 10, group: "MATCH" },
  { key: "city", weight: 5, group: "FILTER" },
];

/** Số tin top dùng làm nguồn cho gợi ý do code tạo (cùng tham số "Việc làm phù hợp"). */
export const INSIGHT_TOP_JOBS_LIMIT = 10;
export const INSIGHT_MIN_JOB_SCORE = 20;

/** D11 — SKILL_GAP: kỹ năng thiếu phải xuất hiện ở ≥ 3 tin, lấy tối đa 5. Cũng là ngưỡng
 * bằng chứng của "Nên làm trước" (≥ 3 tin hợp nhất cần kinh nghiệm / ngành). */
export const SKILL_GAP_MIN_JOBS = 3;
export const SKILL_GAP_MAX_SUGGESTIONS = 5;

/** D11 — INDUSTRY_MISMATCH: cần ≥ 2 tin đối chiếu được ngành, và ≥ một nửa trong đó lệch ngành. */
export const INDUSTRY_MISMATCH_MIN_JOBS = 2;
export const INDUSTRY_MISMATCH_MIN_RATIO = 0.5;
