// Ranh giới AI cho việc đọc yêu cầu của tin tuyển dụng (Job Matcher GĐ3,
// docs/06-backend/job-matcher-phase3/PLAN.md) — cùng khuôn CvExtractor: service
// chỉ biết interface này, không biết Gemini/OpenRouter.
import type { ExtractedJobRequirements, ExtractionConfidence } from "@sip/shared-types";

export interface RequirementExtractionInput {
  title: string;
  description: string;
  requirements: string | null;
}

type ExtractedSkill = ExtractedJobRequirements["skills"][number];
type ExtractedMajor = ExtractedJobRequirements["majors"][number];

/**
 * Model chỉ trả tên thô. Việc khớp tên vào catalog APPROVED (`resolved`) là
 * tra cứu DB thuần, làm ở service bằng findBestApproved — không để LLM tự chọn id.
 */
export interface RawJobRequirements {
  skills: Array<Omit<ExtractedSkill, "resolved">>;
  overallMinExperienceYears: number | null;
  majors: Array<Omit<ExtractedMajor, "resolved">>;
  languages: ExtractedJobRequirements["languages"];
  other: string[];
  confidence: ExtractionConfidence;
}

export interface RequirementExtractor {
  /** Ném lỗi khi không gọi được model (thiếu key, timeout, JSON hỏng) để lớp Fallback chuyển tầng. */
  extract(input: RequirementExtractionInput): Promise<RawJobRequirements>;
}
