import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { ProfileCompleteness } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";
import { JOB_RECOMMENDATIONS_KEY } from "@/hooks/useJobRecommendations";

// Độ hoàn thiện hồ sơ (AD-26 mục 8) — GET /candidate/profile-completeness. Tính bằng code,
// không LLM, không hạn mức. Dùng ở /recommended-jobs (thẻ gọn) và /profile (thẻ đầy đủ).

export const PROFILE_COMPLETENESS_KEY = ["candidate", "profile-completeness"] as const;

/**
 * staleTime 0: CV được sửa ở /cv, ngoài trang này, nên quay lại là đọc lại (vẫn hiện số cũ
 * trong lúc chờ).
 */
export function useProfileCompleteness(enabled: boolean) {
  return useQuery({
    queryKey: PROFILE_COMPLETENESS_KEY,
    queryFn: () => apiFetch<ProfileCompleteness>("candidate", "/candidate/profile-completeness"),
    enabled,
    staleTime: 0,
    retry: false,
  });
}

/** Gọi sau mỗi lần sửa hồ sơ ở /profile: độ hoàn thiện và "Việc làm phù hợp" đều phụ thuộc hồ sơ. */
export function useInvalidateProfileDerived() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PROFILE_COMPLETENESS_KEY });
    void queryClient.invalidateQueries({ queryKey: JOB_RECOMMENDATIONS_KEY });
  }, [queryClient]);
}
