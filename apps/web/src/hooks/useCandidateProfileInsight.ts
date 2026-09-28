import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProfileInsight } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";

// "Phân tích hồ sơ" — docs/05-frontend/phases/candidate-insights/PLAN.md (Phần 1).
// GET chỉ đọc kết quả đã lưu (không tốn hạn mức); chỉ POST mới gọi LLM.

const PROFILE_INSIGHT_KEY = ["candidate", "profile", "insights"] as const;

/** `null` khi Candidate chưa từng bấm "Phân tích hồ sơ". */
export function useCandidateProfileInsight(enabled: boolean) {
  return useQuery({
    queryKey: PROFILE_INSIGHT_KEY,
    queryFn: () => apiFetch<ProfileInsight | null>("candidate", "/candidate/profile/insights"),
    enabled,
    retry: false,
  });
}

/**
 * Không retry (mặc định của useMutation) — tự gọi lại sẽ tốn thêm hạn mức LLM
 * ngoài ý muốn.
 */
export function useGenerateProfileInsight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<ProfileInsight>("candidate", "/candidate/profile/insights", { method: "POST" }),
    onSuccess: (insight) => {
      queryClient.setQueryData(PROFILE_INSIGHT_KEY, insight);
    },
  });
}
