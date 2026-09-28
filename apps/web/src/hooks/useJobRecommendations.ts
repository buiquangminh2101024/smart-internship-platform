import { useQuery } from "@tanstack/react-query";
import type { JobRecommendationList } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";

// "Việc làm phù hợp" — docs/05-frontend/phases/candidate-insights/PLAN.md (Phần 2).
// Không LLM, không hạn mức: tự chạy khi vào trang, không có nút "tính lại".

/**
 * Danh sách phụ thuộc hồ sơ Candidate, mà các thao tác ở /profile không đi qua
 * react-query nên không invalidate được — staleTime ngắn (cùng lý do
 * useCandidateJobMatch) để quay lại trang là thấy kết quả mới.
 */
export function useJobRecommendations(enabled: boolean) {
  return useQuery({
    queryKey: ["candidate", "job-recommendations"],
    queryFn: () => apiFetch<JobRecommendationList>("candidate", "/candidate/job-recommendations"),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}
