import type {
  MatchComponentKey,
  MatchComponentResult,
  MatchConfidence,
  MatchEducationEvidence,
  MatchExperienceEvidence,
  MatchResult,
  MatchSkillEvidence,
} from "@sip/shared-types";
import type { JobMatcher, MatchInput } from "../../shared/ports/JobMatcher";
import { EXPERIENCE_PARTIAL_RATIO, RELATED_MAJOR_SCORE, SEMANTIC_CALIBRATION } from "./job-matching.config";
import type { MatchWeights, SemanticCalibration } from "./job-matching.types";

const COMPONENT_ORDER: MatchComponentKey[] = ["requiredSkills", "preferredSkills", "experience", "education", "semantic"];

const SEMANTIC_PENDING_NOTE = "Lần này chưa tính được mức tương đồng nội dung — điểm chỉ dựa trên kỹ năng và kinh nghiệm.";

/**
 * Bộ chấm điểm duy nhất của Job Matcher — mỗi cấu hình (rule / hybrid …) chỉ
 * là một bảng trọng số khác. Hàm thuần, đồng bộ. Công thức: PLAN GĐ1 mục
 * "Công thức chấm điểm (rule-v1)"; thành phần semantic: PLAN GĐ2.
 */
export class ScoringJobMatcher implements JobMatcher {
  private readonly config: MatchWeights;
  private readonly calibration: SemanticCalibration;
  private readonly relatedMajorScore: number;

  /** `relatedMajorScore` là tham số để bộ đánh giá quét lưới giá trị (PLAN GĐ3 bước 7). */
  constructor(
    config: MatchWeights,
    calibration: SemanticCalibration = SEMANTIC_CALIBRATION,
    relatedMajorScore: number = RELATED_MAJOR_SCORE,
  ) {
    if (!(calibration.hi > calibration.lo)) {
      throw new Error(`SemanticCalibration cần hi > lo (lo=${calibration.lo}, hi=${calibration.hi})`);
    }
    if (!(relatedMajorScore >= 0 && relatedMajorScore <= 1)) {
      throw new Error(`relatedMajorScore phải trong [0, 1] (nhận ${relatedMajorScore})`);
    }
    this.config = config;
    this.calibration = calibration;
    this.relatedMajorScore = relatedMajorScore;
  }

  match(input: MatchInput): MatchResult {
    const { candidate, job } = input;
    const weights = this.config.weights;
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
          requiredYears: skill.minYears !== null && skill.minYears > 0 ? skill.minYears : null,
        };
      });

    const required = skills.filter((skill) => skill.importance === "REQUIRED");
    const preferred = skills.filter((skill) => skill.importance === "PREFERRED");
    const experience = this.experienceEvidence(job.minExperienceYears, candidate.totalExperienceYears);
    const education = this.educationEvidence(input);

    // Cấu hình không dùng semantic (rule) bỏ qua cosine hoàn toàn ⇒ kết quả y hệt GĐ1.
    const semanticEnabled = weights.semantic > 0;
    const similarity = semanticEnabled ? input.semanticSimilarity : null;
    const semanticScore = similarity === null ? null : this.normalizeSimilarity(similarity);

    const rawScores: Record<MatchComponentKey, number | null> = {
      requiredSkills: required.length > 0 ? matchedRatio(required) : null,
      preferredSkills: preferred.length > 0 ? matchedRatio(preferred) : null,
      experience: experienceScore(experience, skills),
      education: this.educationScore(education.status),
      semantic: semanticScore,
    };

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
      education,
      semantic: {
        enabled: semanticEnabled,
        available: semanticScore !== null,
        similarity,
        normalized: semanticScore,
      },
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
        notes: [
          // Cấu hình chỉ có semantic (bộ đánh giá) mà thiếu cosine: lý do không nằm ở tin.
          COMPONENT_ORDER.every((key) => key === "semantic" || weights[key] === 0)
            ? "Chưa tính được mức tương đồng nội dung nên chưa tính được mức phù hợp."
            : "Tin chưa có kỹ năng đã duyệt, yêu cầu kinh nghiệm hay ngành học nên chưa tính được mức phù hợp.",
        ],
      };
    }

    const total = components.reduce((sum, component) => sum + component.effectiveWeight * (component.score ?? 0), 0);
    // rule-v1 không có trọng số học vấn — không giải thích một thành phần không được tính.
    const notes = this.notes(required, preferred, experience, weights.education > 0 ? education : null, confidence);
    if (semanticScore !== null) {
      notes.push(`Mức tương đồng nội dung giữa hồ sơ và tin (so bằng mô hình ngôn ngữ): ${Math.round(100 * semanticScore)}/100.`);
    } else if (semanticEnabled) {
      notes.push(SEMANTIC_PENDING_NOTE);
    }
    return { ...base, status: "SCORED", score: Math.round(100 * total), notes };
  }

  /** clamp((cosine − lo) / (hi − lo), 0, 1) — cosine thô của model hiếm khi ra ngoài 0.2–0.9. */
  private normalizeSimilarity(similarity: number): number {
    const { lo, hi } = this.calibration;
    return Math.min(1, Math.max(0, (similarity - lo) / (hi - lo)));
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

  /** GĐ3: đối chiếu toàn bộ học vấn có majorId với tập ngành tin đã xác nhận. */
  private educationEvidence({ candidate, job }: MatchInput): MatchEducationEvidence {
    const requiredMajors = [...job.majors]
      .sort(
        (left, right) =>
          Number(left.relevance === "RELATED") - Number(right.relevance === "RELATED") ||
          left.name.localeCompare(right.name),
      )
      .map((major) => major.name);
    if (job.majors.length === 0) {
      return { status: "NOT_REQUIRED", matchedMajorName: null, requiredMajors };
    }
    // Học vấn không gắn ngành trong danh mục thì không đối chiếu được — coi như
    // chưa có dữ liệu (không trừ điểm), giống D1 với số năm chưa khai.
    const comparable = candidate.educations.filter((education) => education.majorId !== null);
    if (comparable.length === 0) {
      return { status: "UNKNOWN", matchedMajorName: null, requiredMajors };
    }
    for (const relevance of ["PRIMARY", "RELATED"] as const) {
      const ids = new Set(job.majors.filter((major) => major.relevance === relevance).map((major) => major.majorId));
      const matched = comparable.find((education) => ids.has(education.majorId!));
      if (matched) {
        return { status: relevance, matchedMajorName: matched.majorName, requiredMajors };
      }
    }
    return { status: "NONE", matchedMajorName: null, requiredMajors };
  }

  private educationScore(status: MatchEducationEvidence["status"]): number | null {
    switch (status) {
      case "PRIMARY":
        return 1;
      case "RELATED":
        return this.relatedMajorScore;
      case "NONE":
        return 0;
      default:
        return null;
    }
  }

  private notes(
    required: MatchSkillEvidence[],
    preferred: MatchSkillEvidence[],
    experience: MatchExperienceEvidence,
    education: MatchEducationEvidence | null,
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

    // Kỹ năng còn thiếu đã được nêu ở câu kỹ năng — không nhắc lại ở đây.
    const perSkill = [...required, ...preferred].filter(
      (skill) => skill.requiredYears !== null && skill.status === "MATCHED",
    );
    if (perSkill.length > 0) {
      const parts = perSkill.map((skill) =>
        skill.candidateYears === null
          ? `${skill.name} chưa khai số năm (tin yêu cầu ${formatYears(skill.requiredYears!)})`
          : `${skill.name} ${formatYears(skill.candidateYears)}/${formatYears(skill.requiredYears!)} năm`,
      );
      notes.push(`Số năm theo từng kỹ năng (ứng viên/tin yêu cầu): ${parts.join("; ")}.`);
    }

    if (education) {
      const majors = education.requiredMajors.join(", ");
      switch (education.status) {
        case "PRIMARY":
          notes.push(`Học đúng ngành tin yêu cầu (${education.matchedMajorName}).`);
          break;
        case "RELATED":
          notes.push(`Học ngành liên quan mà tin chấp nhận (${education.matchedMajorName}), chưa phải ngành chính.`);
          break;
        case "NONE":
          notes.push(`Ngành học chưa khớp với ngành tin yêu cầu (${majors}).`);
          break;
        case "UNKNOWN":
          notes.push(`Tin yêu cầu ngành ${majors} nhưng hồ sơ chưa có ngành học để đối chiếu — phần học vấn không được tính.`);
          break;
        case "NOT_REQUIRED":
          break;
      }
    }

    if (confidence === "LOW") {
      notes.push("Hồ sơ còn thiếu nhiều thông tin nên độ tin cậy của điểm thấp.");
    }
    return notes;
  }
}

/**
 * Kết quả rule-v1 dùng thay hybrid khi thiếu cosine (PLAN GĐ2 quyết định #5):
 * giữ nguyên điểm và weightsVersion, chỉ báo rằng semantic đang bật nhưng chưa có.
 */
export function markSemanticPending(result: MatchResult): MatchResult {
  return {
    ...result,
    semantic: { enabled: true, available: false, similarity: null, normalized: null },
    notes: result.status === "SCORED" ? [...result.notes, SEMANTIC_PENDING_NOTE] : result.notes,
  };
}

/**
 * GĐ3: trung bình cộng các phần đo được — (a) tổng thời gian làm việc so
 * minExperienceYears, (b) mỗi kỹ năng có số năm yêu cầu riêng. Kỹ năng ứng
 * viên có nhưng chưa khai năm (D1) hoặc không có (đã bị trừ ở requiredSkills/
 * preferredSkills — không phạt hai lần) thì bỏ khỏi trung bình. Không còn phần
 * nào ⇒ null (không áp dụng), y hệt GĐ1 khi tin không có số năm riêng.
 */
function experienceScore(experience: MatchExperienceEvidence, skills: MatchSkillEvidence[]): number | null {
  const parts: number[] = [];
  if (experience.requiredYears !== null && experience.candidateYears !== null) {
    parts.push(Math.min(1, experience.candidateYears / experience.requiredYears));
  }
  for (const skill of skills) {
    if (skill.requiredYears === null || skill.status !== "MATCHED" || skill.candidateYears === null) continue;
    parts.push(Math.min(1, skill.candidateYears / skill.requiredYears));
  }
  return parts.length > 0 ? parts.reduce((sum, part) => sum + part, 0) / parts.length : null;
}

function matchedRatio(skills: MatchSkillEvidence[]): number {
  return skills.filter((skill) => skill.status === "MATCHED").length / skills.length;
}

function formatYears(years: number): string {
  return (Math.round(years * 10) / 10).toLocaleString("vi-VN");
}
