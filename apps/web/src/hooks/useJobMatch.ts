import { useQuery } from "@tanstack/react-query";
import type { ApplicationMatchSummary, MatchResult } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";

// Job Matcher — docs/05-frontend/phases/job-matcher-phase1/PLAN.md. Điểm chỉ
// để tham khảo: lỗi của các query này không được chặn trang.

/**
 * Điểm phụ thuộc hồ sơ Candidate, mà các thao tác ở /profile không đi qua
 * react-query nên không invalidate được — staleTime ngắn để mở lại trang tin là
 * thấy điểm mới.
 */
export function useCandidateJobMatch(jobId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["candidate", "job-posts", jobId, "match"],
    queryFn: () => apiFetch<MatchResult>("candidate", `/candidate/job-posts/${jobId}/match`),
    enabled: enabled && !!jobId,
    staleTime: 30_000,
    retry: false,
  });
}

export function useEmployerApplicationMatches(jobId: string) {
  return useQuery({
    queryKey: ["employer", "job-posts", jobId, "application-matches"],
    queryFn: () =>
      apiFetch<ApplicationMatchSummary[]>("employer", `/employer/job-posts/${jobId}/application-matches`),
    enabled: !!jobId,
    retry: false,
  });
}

export function useEmployerApplicationMatch(applicationId: string) {
  return useQuery({
    queryKey: ["employer", "applications", applicationId, "match"],
    queryFn: () => apiFetch<MatchResult>("employer", `/employer/applications/${applicationId}/match`),
    enabled: !!applicationId,
    retry: false,
  });
}
