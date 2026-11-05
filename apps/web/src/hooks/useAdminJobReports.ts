"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminJobReportListItem,
  AdminJobReportListQuery,
  AdminJobReportListResponse,
  AdminJobReportStats,
  JobReportActionRequest,
} from "@sip/shared-types";
import { ApiError, apiFetch } from "@/lib/api-client";

export const ADMIN_JOB_REPORTS_QUERY_KEY = ["adminJobReports"] as const;
export const ADMIN_JOB_REPORT_STATS_QUERY_KEY = ["adminJobReportStats"] as const;

export function useAdminJobReports(query: AdminJobReportListQuery) {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  if (query.status && query.status !== "ALL") params.set("status", query.status);
  if (query.resolution && query.resolution !== "ALL") params.set("resolution", query.resolution);
  if (query.reason && query.reason !== "ALL") params.set("reason", query.reason);
  if (query.q) params.set("q", query.q);

  const queryString = params.toString();
  const endpoint = queryString ? `/admin/job-reports?${queryString}` : "/admin/job-reports";

  return useQuery({
    queryKey: [...ADMIN_JOB_REPORTS_QUERY_KEY, query],
    queryFn: () => apiFetch<AdminJobReportListResponse>("admin", endpoint),
  });
}

export function useAdminJobReportStats() {
  return useQuery({
    queryKey: ADMIN_JOB_REPORT_STATS_QUERY_KEY,
    queryFn: () => apiFetch<AdminJobReportStats>("admin", "/admin/job-reports/stats"),
  });
}

export function useAdminJobReportDetail(id: string | null) {
  return useQuery({
    queryKey: ["adminJobReportDetail", id],
    queryFn: () => apiFetch<AdminJobReportListItem>("admin", `/admin/job-reports/${id}`),
    enabled: Boolean(id),
    // Id sai (link cũ, gõ tay) trả 4xx: báo ngay, không thử lại 3 lần.
    retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 3,
  });
}

export function useExecuteAdminJobReportAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: JobReportActionRequest }) =>
      apiFetch<AdminJobReportListItem>("admin", `/admin/job-reports/${id}/action`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_JOB_REPORTS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ADMIN_JOB_REPORT_STATS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["adminJobPosts"] });
      void queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
    },
  });
}
