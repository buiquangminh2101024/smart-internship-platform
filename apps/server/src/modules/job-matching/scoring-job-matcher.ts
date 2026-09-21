import type {
  MatchComponentKey,
  MatchComponentResult,
  MatchConfidence,
  MatchExperienceEvidence,
  MatchResult,
  MatchSkillEvidence,
} from "@sip/shared-types";
import type { JobMatcher, MatchInput } from "../../shared/ports/JobMatcher";
import { EXPERIENCE_PARTIAL_RATIO } from "./job-matching.config";
import type { MatchWeights } from "./job-matching.types";

const COMPONENT_ORDER: MatchComponentKey[] = ["requiredSkills", "preferredSkills", "experience", "education", "semantic"];

/**
 * Bộ chấm điểm duy nhất của Job Matcher — mỗi cấu hình (rule / hybrid …) chỉ
 * là một bảng trọng số khác. Hàm thuần, đồng bộ. Công thức: PLAN GĐ1 mục
 * "Công thức chấm điểm (rule-v1)".
 */
export class ScoringJobMatcher implements JobMatcher {
  private readonly config: MatchWeights;

  constructor(config: MatchWeights) {
    this.config = config;
  }

  match(input: MatchInput): MatchResult {
    const { candidate, job } = input;
    const candidateSkills = new Map(candidate.skills.map((skill) => [skill.skillId, skill]));

    const skills: MatchSkillEvidence[] = [...job.skills]
      .sort(
        (left, right) =>
          Number(left.importance === "PREFERRED") - Number(right.importance === "PREFERRED") ||
          left.name.localeCompare(right.name),
      )
      .map((skill) => {
        const owned = candidateSkills.get(skill.skillId);
        return {
          skillId: skill.skillId,
          name: skill.name,
          importance: skill.importance,
          status: owned ? "MATCHED" : "MISSING",
          // D1: 0 = chưa khai.
          candidateYears: owned && owned.yearsOfExperience > 0 ? owned.yearsOfExperience : null,
        };
      });

    const required = skills.filter((skill) => skill.importance === "REQUIRED");
    const preferred = skills.filter((skill) => skill.importance === "PREFERRED");
    const experience = this.experienceEvidence(job.minExperienceYears, candidate.totalExperienceYears);

    const rawScores: Record<MatchComponentKey, number | null> = {
      requiredSkills: required.length > 0 ? matchedRatio(required) : null,
      preferredSkills: preferred.length > 0 ? matchedRatio(preferred) : null,
      experience:
        experience.requiredYears !== null && experience.candidateYears !== null
          ? Math.min(1, experience.candidateYears / experience.requiredYears)
          : null,
      // GĐ3 mới chấm học vấn; semantic do GĐ2 bổ sung.
      education: null,
      semantic: null,
    };

    const weights = this.config.weights;
    const applicableWeight = COMPONENT_ORDER.reduce(
      (sum, key) => (rawScores[key] !== null ? sum + weights[key] : sum),
      0,
    );
    const components: MatchComponentResult[] = COMPONENT_ORDER.map((key) => {
      const score = rawScores[key];
      const applicable = score !== null && weights[key] > 0;
      return {
        key,
        applicable,
        score,
        weight: weights[key],
        effectiveWeight: applicable && applicableWeight > 0 ? weights[key] / applicableWeight : 0,
      };
    });

    const confidence = this.confidence(input);
    const base = {
      confidence,
      weightsVersion: this.config.version,
      components,
      skills,
      experience,
      semantic: { enabled: weights.semantic > 0, available: false, similarity: null, normalized: null },
    };

    // Thứ tự kiểm tra: hồ sơ trước, tin sau (PLAN GĐ1).
    if (candidate.skills.length === 0) {
      return {
        ...base,
        status: "INSUFFICIENT_PROFILE",
        score: null,
        notes: ["Hồ sơ chưa có kỹ năng nào nên chưa tính được mức phù hợp."],
      };
    }
    if (!components.some((component) => component.applicable)) {
      return {
        ...base,
        status: "INSUFFICIENT_JOB_DATA",
        score: null,
        notes: ["Tin chưa có kỹ năng đã duyệt hay yêu cầu kinh nghiệm nên chưa tính được mức phù hợp."],
      };
    }

    const total = components.reduce((sum, component) => sum + component.effectiveWeight * (component.score ?? 0), 0);
    return {
      ...base,
      status: "SCORED",
      score: Math.round(100 * total),
      notes: this.notes(required, preferred, experience, confidence),
    };
  }

  private experienceEvidence(requiredYears: number | null, candidateYears: number | null): MatchExperienceEvidence {
    if (requiredYears === null || requiredYears <= 0) {
      return { status: "NOT_REQUIRED", requiredYears: null, candidateYears };
    }
    if (candidateYears === null) {
      return { status: "UNKNOWN", requiredYears, candidateYears: null };
    }
    const status =
      candidateYears >= requiredYears
        ? "MATCH"
        : candidateYears >= requiredYears * EXPERIENCE_PARTIAL_RATIO
          ? "PARTIAL"
          : "BELOW";
    return { status, requiredYears, candidateYears };
  }

  /** Chỉ theo độ đầy đủ hồ sơ — thiếu dữ liệu giảm độ tin cậy, không trừ điểm. */
  private confidence({ candidate }: MatchInput): MatchConfidence {
    const filled = Object.values(candidate.completeness).filter(Boolean).length;
    if (filled >= 3) return "HIGH";
    if (filled === 2) return "MEDIUM";
    return "LOW";
  }

  private notes(
    required: MatchSkillEvidence[],
    preferred: MatchSkillEvidence[],
    experience: MatchExperienceEvidence,
    confidence: MatchConfidence,
  ): string[] {
    const notes: string[] = [];
    if (required.length > 0) {
      const missing = required.filter((skill) => skill.status === "MISSING");
      notes.push(
        missing.length === 0
          ? `Có đủ ${required.length}/${required.length} kỹ năng bắt buộc.`
          : `Có ${required.length - missing.length}/${required.length} kỹ năng bắt buộc; còn thiếu: ${missing.map((skill) => skill.name).join(", ")}.`,
      );
    }
    if (preferred.length > 0) {
      const matched = preferred.filter((skill) => skill.status === "MATCHED").length;
      notes.push(`Có ${matched}/${preferred.length} kỹ năng ưu tiên.`);
    }

    const candidateYears = experience.candidateYears === null ? null : formatYears(experience.candidateYears);
    switch (experience.status) {
      case "UNKNOWN":
        notes.push(
          `Tin yêu cầu tối thiểu ${formatYears(experience.requiredYears!)} năm kinh nghiệm nhưng chưa xác định được thời gian làm việc của ứng viên — phần kinh nghiệm không được tính.`,
        );
        break;
      case "NOT_REQUIRED":
        break;
      default:
        notes.push(
          `Tổng thời gian làm việc: ${candidateYears} năm (chưa xét mức liên quan); tin yêu cầu tối thiểu ${formatYears(experience.requiredYears!)} năm.`,
        );
    }

    if (confidence === "LOW") {
      notes.push("Hồ sơ còn thiếu nhiều thông tin nên độ tin cậy của điểm thấp.");
    }
    return notes;
  }
}

function matchedRatio(skills: MatchSkillEvidence[]): number {
  return skills.filter((skill) => skill.status === "MATCHED").length / skills.length;
}

function formatYears(years: number): string {
  return (Math.round(years * 10) / 10).toLocaleString("vi-VN");
}
