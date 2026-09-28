// Hằng số của "Phân tích hồ sơ" — docs/06-backend/candidate-insights/PLAN.md.

/** D10 — trọng số completenessScore theo 4 cờ completeness của CandidateMatchProfileLoader (tổng 100). */
export const COMPLETENESS_WEIGHTS = {
  hasSkills: 40,
  hasWorkExperience: 25,
  hasEducation: 25,
  hasHeadlineOrBio: 10,
} as const;

/** Số tin top dùng làm nguồn cho gợi ý do code tạo (cùng tham số "Việc làm phù hợp"). */
export const INSIGHT_TOP_JOBS_LIMIT = 10;
export const INSIGHT_MIN_JOB_SCORE = 20;

/** D11 — SKILL_GAP: kỹ năng thiếu phải xuất hiện ở ≥ 3 tin, lấy tối đa 5. */
export const SKILL_GAP_MIN_JOBS = 3;
export const SKILL_GAP_MAX_SUGGESTIONS = 5;

/** D11 — INDUSTRY_MISMATCH: cần ≥ 2 tin đối chiếu được ngành, và ≥ một nửa trong đó lệch ngành. */
export const INDUSTRY_MISMATCH_MIN_JOBS = 2;
export const INDUSTRY_MISMATCH_MIN_RATIO = 0.5;
