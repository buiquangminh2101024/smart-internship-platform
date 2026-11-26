"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateJobReportRequest, JobReportDto } from "@sip/shared-types";
import { apiFetch, apiUpload } from "@/lib/api-client";

const checkKey = (jobId: string) => ["candidateJobReportCheck", jobId] as const;

export function useCheckJobReport(jobId: string, enabled: boolean) {
  return useQuery({
    queryKey: checkKey(jobId),
    queryFn: () =>
      apiFetch<{ hasPendingReport: boolean; reportId?: string }>(
        "candidate",
        `/jobs/${jobId}/reports/check`,
      ),
    enabled: Boolean(jobId) && enabled,
  });
}

export function useCreateJobReport(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateJobReportRequest) =>
      apiFetch<JobReportDto>("candidate", `/jobs/${jobId}/reports`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: checkKey(jobId) });
    },
  });
}

export function useUploadJobReportEvidence() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiUpload<{ url: string }>(
        "candidate",
        "/job-reports/upload-evidence",
        formData,
      );
      return res.url;
    },
  });
}
