import type { MatchWeights } from "./job-matching.types";

// Trọng số đặt trong code (không ở env) để có version và đi cùng code được
// review. 0.60/0.15/0.25 là đề xuất ban đầu, CHƯA có căn cứ thực nghiệm — GĐ2
// hiệu chỉnh trên tập dev của bộ đánh giá (docs/06-backend/job-matcher-phase2/PLAN.md).
export const RULE_WEIGHTS_V1: MatchWeights = {
  version: "rule-v1",
  weights: { requiredSkills: 0.6, preferredSkills: 0.15, experience: 0.25, education: 0, semantic: 0 },
};

/** Tỉ lệ số năm tối thiểu để kinh nghiệm được xếp PARTIAL thay vì BELOW. */
export const EXPERIENCE_PARTIAL_RATIO = 0.5;
