"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConfirmRequirementsRequest,
  EmployerJobPostListQuery,
  ExtractedJobRequirements,
  JobPost,
  JobPostSearchQuery,
  JobPostStats,
  JobPostStatus,
  PaginatedResponse,
  UpdateJobPostRequest,
} from "@sip/shared-types";
import { apiFetch, publicFetch } from "@/lib/api-client";

/**
 * `exactOptionalPropertyTypes` bật trong tsconfig nên object bộ lọc dựng động
 * ở component (có key mang giá trị `undefined` khi người dùng bỏ chọn) không
 * gán thẳng vào type gốc được — nới lỏng ở ranh giới hook, `toQueryString` tự
 * bỏ qua các key rỗng.
 */
export type OptionalQuery<T> = { [K in keyof T]?: T[K] | undefined };

function toQueryString(params: Record<string, string | number | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // Mảng (vd. skillIds) gửi dạng "a,b,c" — backend nhận cả dạng này lẫn lặp
    // key nhiều lần, chọn dạng gọn để query string dễ đọc.
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(","));
    } else if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// ─── Employer ──────────────────────────────────────────────────────────────

export function useEmployerJobPosts(query: OptionalQuery<EmployerJobPostListQuery>) {
  return useQuery({
    queryKey: ["employerJobPosts", query],
    queryFn: () =>
      apiFetch<PaginatedResponse<JobPost>>("employer", `/employer/job-posts${toQueryString({ ...query })}`),
  });
}

export function useEmployerJobPostStats() {
  return useQuery({
    queryKey: ["employerJobPostStats"],
    queryFn: () => apiFetch<JobPostStats>("employer", "/employer/job-posts/stats"),
  });
}

export function useEmployerJobPost(id: string) {
  return useQuery({
    queryKey: ["employerJobPost", id],
    queryFn: () => apiFetch<JobPost>("employer", `/employer/job-posts/${id}`),
    enabled: !!id,
  });
}

/**
 * "Phân tích yêu cầu bằng AI" (Job Matcher GĐ3). Backend đọc nội dung tin ĐÃ
 * LƯU, nên nếu Employer vừa sửa tiêu đề/mô tả/yêu cầu trong form thì truyền
 * `pendingText` để lưu nháp phần chữ đó trước rồi mới phân tích. Không tự retry
 * — 409/429/502 đã có thông báo tiếng Việt từ backend, Employer tự bấm lại.
 */
export function useExtractJobRequirements(jobPostId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (pendingText?: Pick<UpdateJobPostRequest, "title" | "description" | "requirements">) => {
      if (pendingText) {
        await apiFetch<JobPost>("employer", `/employer/job-posts/${jobPostId}`, {
          method: "PATCH",
          body: JSON.stringify(pendingText),
        });
        void queryClient.invalidateQueries({ queryKey: ["employerJobPost", jobPostId] });
      }
      return apiFetch<ExtractedJobRequirements>("employer", `/employer/job-posts/${jobPostId}/requirements/extract`, {
        method: "POST",
      });
    },
  });
}

/** "Áp dụng" bảng xem trước — đồng bộ toàn bộ kỹ năng/ngành/số năm của tin. */
export function useConfirmJobRequirements(jobPostId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ConfirmRequirementsRequest) =>
      apiFetch<JobPost>("employer", `/employer/job-posts/${jobPostId}/requirements`, {
        method: "PUT",
        body: JSON.stringify(dto),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["employerJobPost", jobPostId] });
    },
  });
}

// ─── Admin ─────────────────────────────────────────────────────────────────

export function useAdminJobPosts(status: JobPostStatus | "ALL") {
  return useQuery({
    queryKey: ["adminJobPosts", status],
    queryFn: () =>
      apiFetch<PaginatedResponse<JobPost>>(
        "admin",
        `/admin/job-posts${toQueryString({ status: status === "ALL" ? undefined : status })}`,
      ),
  });
}

export function useAdminJobPostStats() {
  return useQuery({
    queryKey: ["adminJobPostStats"],
    queryFn: () => apiFetch<JobPostStats>("admin", "/admin/job-posts/stats"),
  });
}

export function useAdminJobPost(id: string) {
  return useQuery({
    queryKey: ["adminJobPost", id],
    queryFn: () => apiFetch<JobPost>("admin", `/admin/job-posts/${id}`),
    enabled: !!id,
  });
}

// ─── Public (Guest) ────────────────────────────────────────────────────────

export function usePublicJobPosts(query: OptionalQuery<JobPostSearchQuery>) {
  return useQuery({
    queryKey: ["publicJobPosts", query],
    queryFn: () => publicFetch<PaginatedResponse<JobPost>>(`/job-posts${toQueryString({ ...query })}`),
  });
}

/**
 * Chi tiết tin công khai. Mỗi lần gọi API tăng viewCount nên đặt
 * `staleTime: Infinity` + tắt refetch để 1 lượt xem không bị đếm nhiều lần khi
 * React Query remount/focus lại cửa sổ.
 */
export function usePublicJobPost(id: string) {
  return useQuery({
    queryKey: ["publicJobPost", id],
    queryFn: () => publicFetch<JobPost>(`/job-posts/${id}`),
    enabled: !!id,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
