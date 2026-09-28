// Ranh giới AI cho "Phân tích hồ sơ" (AD-14, docs/06-backend/candidate-insights/PLAN.md
// D9) — cùng khuôn RequirementExtractor: service chỉ biết interface này.

/**
 * Chỉ các trường ở D13. Không có ngành học (lệch ngành do code làm), tên công ty,
 * URL, ngày tháng — và không bao giờ có họ tên/SĐT/email/ngày sinh.
 */
export interface ProfileInsightInput {
  headline: string | null;
  bio: string | null;
  skills: string[];
  experiences: Array<{ position: string; description: string | null }>;
  projects: Array<{ name: string; description: string | null }>;
}

/** LLM chỉ viết 2 phần này (D11); SKILL_GAP/INDUSTRY_MISMATCH do code tạo. */
export interface GeneratedProfileInsight {
  strengths: string[];
  writingSuggestions: string[];
}

export interface ProfileInsightGenerator {
  /** Ném lỗi khi không gọi được model (thiếu key, timeout, JSON hỏng) để lớp Fallback chuyển tầng. */
  generate(input: ProfileInsightInput): Promise<GeneratedProfileInsight>;
}
