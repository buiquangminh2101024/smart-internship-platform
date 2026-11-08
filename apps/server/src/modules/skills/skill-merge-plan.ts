import type { SkillImportance } from "@prisma/client";

export interface JobPostSkillLink {
  jobPostId: string;
  importance: SkillImportance;
  minYears: number | null;
}

export interface CandidateSkillLink {
  candidateId: string;
  yearsOfExperience: number;
}

export interface SkillMergePlan {
  /** Liên kết tin–kỹ năng cần tạo cho kỹ năng đích (tin chưa có kỹ năng đích). */
  jobPostCreates: JobPostSkillLink[];
  /** Tin đã có kỹ năng đích nhưng cần sửa mức yêu cầu / số năm. */
  jobPostUpdates: JobPostSkillLink[];
  /** Liên kết hồ sơ–kỹ năng cần tạo cho kỹ năng đích. */
  candidateCreates: CandidateSkillLink[];
  /** Hồ sơ đã có kỹ năng đích nhưng khai ít năm hơn ở kỹ năng nguồn. */
  candidateUpdates: CandidateSkillLink[];
}

/**
 * Quyết định chuyển liên kết từ kỹ năng nguồn sang kỹ năng đích khi gộp
 * (docs/06-backend/large-demo-data/PLAN.md, "Gộp kỹ năng trùng"). Nguồn và đích
 * là hai tên của cùng một kỹ năng, nên khi tin / hồ sơ đã có cả hai thì giữ thông
 * tin mạnh hơn, không để mất gì:
 * - tin: REQUIRED thắng PREFERRED; `minYears` giữ của đích, đích null thì lấy của nguồn;
 * - hồ sơ: `yearsOfExperience` lấy số lớn hơn.
 */
export function planSkillMerge(
  source: { jobPosts: readonly JobPostSkillLink[]; candidates: readonly CandidateSkillLink[] },
  target: { jobPosts: readonly JobPostSkillLink[]; candidates: readonly CandidateSkillLink[] },
): SkillMergePlan {
  const plan: SkillMergePlan = { jobPostCreates: [], jobPostUpdates: [], candidateCreates: [], candidateUpdates: [] };

  const targetJobs = new Map(target.jobPosts.map((link) => [link.jobPostId, link]));
  for (const link of source.jobPosts) {
    const existing = targetJobs.get(link.jobPostId);
    if (!existing) {
      plan.jobPostCreates.push({ ...link });
      continue;
    }
    const importance = link.importance === "REQUIRED" ? "REQUIRED" : existing.importance;
    const minYears = existing.minYears ?? link.minYears;
    if (importance !== existing.importance || minYears !== existing.minYears) {
      plan.jobPostUpdates.push({ jobPostId: link.jobPostId, importance, minYears });
    }
  }

  const targetCandidates = new Map(target.candidates.map((link) => [link.candidateId, link]));
  for (const link of source.candidates) {
    const existing = targetCandidates.get(link.candidateId);
    if (!existing) {
      plan.candidateCreates.push({ ...link });
    } else if (link.yearsOfExperience > existing.yearsOfExperience) {
      plan.candidateUpdates.push({ ...link });
    }
  }

  return plan;
}
