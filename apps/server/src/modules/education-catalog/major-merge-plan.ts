import type { MajorRelevance } from "@prisma/client";

export interface JobPostMajorLink {
  jobPostId: string;
  relevance: MajorRelevance;
}

export interface JobPostMajorMergePlan {
  /** Liên kết cần tạo cho ngành đích (tin chưa có ngành đích). */
  creates: JobPostMajorLink[];
  /** Tin đã có ngành đích ở mức RELATED, cần nâng lên PRIMARY. */
  promoteToPrimary: string[];
}

/**
 * Quyết định chuyển `JobPostMajor` từ ngành nguồn sang ngành đích khi gộp ngành
 * (docs/06-backend/major-merge-fix/PLAN.md, M1–M2). Nguồn và đích là hai tên của
 * cùng một ngành, nên tin đã có cả hai thì giữ mức mạnh hơn: PRIMARY thắng RELATED.
 */
export function planJobPostMajorMerge(
  sourceLinks: readonly JobPostMajorLink[],
  targetLinks: readonly JobPostMajorLink[],
): JobPostMajorMergePlan {
  const targetByJob = new Map(targetLinks.map((link) => [link.jobPostId, link.relevance]));
  const creates: JobPostMajorLink[] = [];
  const promoteToPrimary: string[] = [];

  for (const link of sourceLinks) {
    const targetRelevance = targetByJob.get(link.jobPostId);
    if (targetRelevance === undefined) {
      creates.push({ jobPostId: link.jobPostId, relevance: link.relevance });
    } else if (link.relevance === "PRIMARY" && targetRelevance === "RELATED") {
      promoteToPrimary.push(link.jobPostId);
    }
  }

  return { creates, promoteToPrimary };
}
