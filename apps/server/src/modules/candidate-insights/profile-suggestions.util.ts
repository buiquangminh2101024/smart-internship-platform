import type { JobRecommendation, ProfileInsightSuggestion } from "@sip/shared-types";
import type { CandidateMatchProfile } from "../../shared/ports/JobMatcher";
import {
  COMPLETENESS_WEIGHTS,
  INDUSTRY_MISMATCH_MIN_JOBS,
  INDUSTRY_MISMATCH_MIN_RATIO,
  SKILL_GAP_MAX_SUGGESTIONS,
  SKILL_GAP_MIN_JOBS,
} from "./candidate-insights.config";

// Hàm thuần — test được không cần DB/LLM. Gợi ý ở đây do CODE tạo từ kết quả
// getTopMatches (D11): evidence luôn là dữ liệu thật, LLM không tham gia.

/** D10 — chỉ để hiển thị, không ảnh hưởng điểm/độ tin cậy Job Matcher. */
export function computeCompletenessScore(completeness: CandidateMatchProfile["completeness"]): number {
  return (Object.keys(COMPLETENESS_WEIGHTS) as Array<keyof typeof COMPLETENESS_WEIGHTS>).reduce(
    (sum, key) => sum + (completeness[key] ? COMPLETENESS_WEIGHTS[key] : 0),
    0,
  );
}

export function buildCodeSuggestions(items: JobRecommendation[]): ProfileInsightSuggestion[] {
  if (items.length === 0) return [];
  const industry = buildIndustryMismatchSuggestion(items);
  return [...buildSkillGapSuggestions(items), ...(industry ? [industry] : [])];
}

interface SkillGap {
  name: string;
  jobLabels: string[];
  requiredInAnyJob: boolean;
}

/** Kỹ năng MISSING xuất hiện ở ≥ SKILL_GAP_MIN_JOBS tin; REQUIRED trước, rồi theo tần suất. */
export function buildSkillGapSuggestions(items: JobRecommendation[]): ProfileInsightSuggestion[] {
  const gaps = new Map<string, SkillGap>();
  for (const { jobPost, match } of items) {
    for (const skill of match.skills) {
      if (skill.status !== "MISSING") continue;
      const gap = gaps.get(skill.skillId) ?? { name: skill.name, jobLabels: [], requiredInAnyJob: false };
      // Một tin có thể liệt kê trùng kỹ năng — chỉ đếm tin một lần.
      if (!gap.jobLabels.includes(jobLabel(jobPost))) gap.jobLabels.push(jobLabel(jobPost));
      gap.requiredInAnyJob ||= skill.importance === "REQUIRED";
      gaps.set(skill.skillId, gap);
    }
  }

  return [...gaps.values()]
    .filter((gap) => gap.jobLabels.length >= SKILL_GAP_MIN_JOBS)
    .sort(
      (left, right) =>
        Number(right.requiredInAnyJob) - Number(left.requiredInAnyJob) ||
        right.jobLabels.length - left.jobLabels.length ||
        left.name.localeCompare(right.name),
    )
    .slice(0, SKILL_GAP_MAX_SUGGESTIONS)
    .map((gap) => ({
      kind: "SKILL_GAP",
      text: `${gap.name} — xuất hiện ở ${gap.jobLabels.length}/${items.length} tin bạn có thể phù hợp`,
      evidence: gap.jobLabels,
    }));
}

/**
 * Chỉ xét tin đối chiếu được ngành (PRIMARY/RELATED/NONE — bỏ NOT_REQUIRED và
 * UNKNOWN). Cần đủ số tin và tỉ lệ lệch ngành mới tạo, để không kết luận từ 1 tin.
 */
export function buildIndustryMismatchSuggestion(items: JobRecommendation[]): ProfileInsightSuggestion | null {
  const comparable = items.filter(({ match }) =>
    ["PRIMARY", "RELATED", "NONE"].includes(match.education.status),
  );
  const mismatched = comparable.filter(({ match }) => match.education.status === "NONE");
  if (comparable.length < INDUSTRY_MISMATCH_MIN_JOBS) return null;
  if (mismatched.length === 0 || mismatched.length < comparable.length * INDUSTRY_MISMATCH_MIN_RATIO) return null;

  const majorCounts = new Map<string, number>();
  for (const { match } of mismatched) {
    for (const major of new Set(match.education.requiredMajors)) {
      majorCounts.set(major, (majorCounts.get(major) ?? 0) + 1);
    }
  }
  const topMajors = [...majorCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([major]) => major);

  return {
    kind: "INDUSTRY_MISMATCH",
    text:
      `Ngành học trong hồ sơ chưa khớp yêu cầu ngành ở ${mismatched.length}/${comparable.length} tin phù hợp có nêu ngành` +
      (topMajors.length > 0 ? ` (thường yêu cầu: ${topMajors.join(", ")})` : "") +
      " — bạn có thể làm rõ kỹ năng, dự án liên quan hoặc cân nhắc thêm các tin đúng ngành.",
    evidence: mismatched.map(
      ({ jobPost, match }) => `${jobLabel(jobPost)} — yêu cầu: ${match.education.requiredMajors.join(", ")}`,
    ),
  };
}

function jobLabel(jobPost: JobRecommendation["jobPost"]): string {
  return `${jobPost.title} (${jobPost.company.name})`;
}
