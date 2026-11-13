import { useInfiniteQuery } from "@tanstack/react-query";
import type { JobRecommendationList } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";

// "Việc làm phù hợp" — AD-26, docs/05-frontend/phases/job-discovery/PLAN.md bước F1.
// Không LLM, không hạn mức. Mỗi trang 10 tin; "Xem thêm" gửi lại `nextCursor`.
// Đường LIVE (ứng viên chưa có điểm lưu sẵn) chỉ có một trang (`nextCursor = null`).

/** Khoá dùng chung: /profile và thông báo JOB_ALERT (F5) invalidate khoá này. */
export const JOB_RECOMMENDATIONS_KEY = ["candidate", "job-recommendations"] as const;

/**
 * staleTime ngắn: danh sách phụ thuộc hồ sơ, mà /cv và các trang khác không invalidate khoá
 * này — quay lại trang là đọc lại.
 */
export function useJobRecommendations(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: JOB_RECOMMENDATIONS_KEY,
    queryFn: ({ pageParam }) =>
      apiFetch<JobRecommendationList>(
        "candidate",
        `/candidate/job-recommendations${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}
