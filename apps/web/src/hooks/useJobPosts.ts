"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  EmployerJobPostListQuery,
  JobPost,
  JobPostSearchQuery,
  JobPostStats,
  JobPostStatus,
  PaginatedResponse,
} from "@sip/shared-types";
import { apiFetch, publicFetch } from "@/lib/api-client";

/**
 * `exactOptionalPropertyTypes` bật trong tsconfig nên object bộ lọc dựng động
 * ở component (có key mang giá trị `undefined` khi người dùng bỏ chọn) không
 * gán thẳng vào type gốc được — nới lỏng ở ranh giới hook, `toQueryString` tự
 * bỏ qua các key rỗng.
 */
export type OptionalQuery<T> = { [K in keyof T]?: T[K] | undefined };

function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
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
