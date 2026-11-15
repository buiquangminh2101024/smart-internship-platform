import type {
  MatchResult,
  ProfileCompleteness,
  ProfileCompletenessItem,
  ProfileCompletenessKey,
  ProfileCompletenessNextStep,
} from "@sip/shared-types";
import { PROFILE_COMPLETENESS_ITEMS, SKILL_GAP_MIN_JOBS } from "./candidate-insights.config";

// Hàm thuần — test được không cần DB (AD-26 mục 8, docs/06-backend/job-discovery/PLAN.md
// bước 3). Chỉ để hiển thị: không ảnh hưởng điểm phù hợp hay độ tin cậy của bộ chấm.

/** Mục nào đã có — repository đếm quan hệ, không nạp cả hồ sơ. */
export type ProfileCompletenessFacts = Record<ProfileCompletenessKey, boolean>;

export function buildCompletenessItems(facts: ProfileCompletenessFacts): ProfileCompletenessItem[] {
  return PROFILE_COMPLETENESS_ITEMS.map(({ key, weight, group }) => ({ key, done: facts[key], weight, group }));
}

export function computeCompletenessScore(facts: ProfileCompletenessFacts): number {
  return PROFILE_COMPLETENESS_ITEMS.reduce((sum, { key, weight }) => sum + (facts[key] ? weight : 0), 0);
}

/**
 * Mục có thể lấy bằng chứng từ `MatchResult` của các tin hợp nhất: tin yêu cầu kinh
 * nghiệm mà hồ sơ chưa có (`experience.status = UNKNOWN`), tin ghi ngành mà hồ sơ chưa
 * chọn ngành (`education.status = UNKNOWN`).
 */
const EVIDENCE_KEYS = ["experience", "educationMajor"] as const satisfies readonly ProfileCompletenessKey[];

/** Cần chấm trang đầu "Việc làm phù hợp" thì "Nên làm trước" mới có thể dùng bằng chứng. */
export function needsTopMatchesForNextStep(facts: ProfileCompletenessFacts): boolean {
  return facts.skills && EVIDENCE_KEYS.some((key) => !facts[key]);
}

/**
 * "Nên làm trước":
 * 1. thiếu kỹ năng → kỹ năng (không có bằng chứng — chưa có tin hợp để đếm);
 * 2. mục thiếu mà ≥ SKILL_GAP_MIN_JOBS tin hợp nhất cần, nhiều tin hơn thì chọn
 *    (hoà theo thứ tự PROFILE_COMPLETENESS_ITEMS), kèm số tin;
 * 3. mục thiếu có trọng số cao nhất (hoà theo thứ tự PROFILE_COMPLETENESS_ITEMS);
 * 4. đủ cả tám mục → null.
 */
export function pickNextStep(
  facts: ProfileCompletenessFacts,
  topMatches: MatchResult[],
): ProfileCompletenessNextStep | null {
  if (!facts.skills) return { key: "skills", evidence: null };

  const counts: Record<(typeof EVIDENCE_KEYS)[number], number> = {
    experience: topMatches.filter((match) => match.experience.status === "UNKNOWN").length,
    educationMajor: topMatches.filter((match) => match.education.status === "UNKNOWN").length,
  };
  const withEvidence = EVIDENCE_KEYS.filter((key) => !facts[key] && counts[key] >= SKILL_GAP_MIN_JOBS).sort(
    (left, right) => counts[right] - counts[left] || order(left) - order(right),
  );
  const evidenced = withEvidence[0];
  if (evidenced) return { key: evidenced, evidence: { jobCount: counts[evidenced], ofJobs: topMatches.length } };

  const heaviest = PROFILE_COMPLETENESS_ITEMS.filter(({ key }) => !facts[key]).reduce<
    (typeof PROFILE_COMPLETENESS_ITEMS)[number] | null
  >((best, item) => (best === null || item.weight > best.weight ? item : best), null);
  return heaviest ? { key: heaviest.key, evidence: null } : null;
}

export function buildProfileCompleteness(
  facts: ProfileCompletenessFacts,
  topMatches: MatchResult[],
): ProfileCompleteness {
  return {
    score: computeCompletenessScore(facts),
    items: buildCompletenessItems(facts),
    nextStep: pickNextStep(facts, topMatches),
  };
}

function order(key: ProfileCompletenessKey): number {
  return PROFILE_COMPLETENESS_ITEMS.findIndex((item) => item.key === key);
}
