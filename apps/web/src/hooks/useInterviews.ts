"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  AwaitingScheduleApplication,
  BatchScheduleInterviewsFailure,
  BatchScheduleInterviewsRequest,
  BatchScheduleInterviewsResponse,
  CancelInterviewRequest,
  CandidateInterview,
  EmployerInterview,
  PaginatedResponse,
  RescheduleInterviewRequest,
  ScheduleInterviewRequest,
} from "@sip/shared-types";
import { ApiError, apiFetch } from "@/lib/api-client";

/**
 * Lịch phỏng vấn (FE-5, backend "Giai đoạn 5 — Interview"). Mọi key phía
 * Employer bắt đầu bằng `EMPLOYER_INTERVIEWS_KEY`.
 */
export const EMPLOYER_INTERVIEWS_KEY = ["employer", "interviews"] as const;
export const CANDIDATE_INTERVIEWS_KEY = ["candidate", "interviews"] as const;

/** Hồ sơ chờ đặt lịch (tối đa 100), chờ lâu nhất trước; `jobPostId` để lọc theo một tin. */
export function useAwaitingSchedule(jobPostId?: string, enabled = true) {
  return useQuery({
    queryKey: [...EMPLOYER_INTERVIEWS_KEY, "awaiting", jobPostId ?? "all"],
    queryFn: async () => {
      const query = jobPostId ? `?jobPostId=${encodeURIComponent(jobPostId)}` : "";
      const res = await apiFetch<PaginatedResponse<AwaitingScheduleApplication>>(
        "employer",
        `/employer/interviews/awaiting${query}`,
      );
      return res.items;
    },
    enabled,
    staleTime: 30_000,
  });
}

/** Lịch của cả công ty trong khoảng [from, to) (ISO, tối đa 92 ngày), không gồm lịch đã huỷ. */
export function useEmployerInterviews(range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: [...EMPLOYER_INTERVIEWS_KEY, "list", range?.from, range?.to],
    queryFn: async () => {
      const params = new URLSearchParams({ from: range!.from, to: range!.to });
      const res = await apiFetch<PaginatedResponse<EmployerInterview>>("employer", `/employer/interviews?${params}`);
      return res.items;
    },
    enabled: range !== null,
    staleTime: 30_000,
  });
}

export function useCandidateInterviews() {
  return useQuery({
    queryKey: CANDIDATE_INTERVIEWS_KEY,
    queryFn: async () => {
      const res = await apiFetch<PaginatedResponse<CandidateInterview>>("candidate", "/candidate/interviews");
      return res.items;
    },
  });
}

/**
 * Sau khi đặt / đổi / huỷ: chỉ đánh dấu dữ liệu liên quan là cũ, không tải lại
 * ngay — trang tự chọn khối nào tải lại (dashboard giữ hàng vừa xử lý kèm nhãn
 * tới lần mở trang kế tiếp, giống thao tác hồ sơ của FE-2).
 */
function markStale(queryClient: QueryClient, applicationIds: string[]) {
  void queryClient.invalidateQueries({ queryKey: EMPLOYER_INTERVIEWS_KEY, refetchType: "none" });
  void queryClient.invalidateQueries({ queryKey: ["employer", "dashboard"], refetchType: "none" });
  void queryClient.invalidateQueries({ queryKey: ["employer", "job-posts"], refetchType: "none" });
  for (const id of applicationIds) {
    void queryClient.invalidateQueries({ queryKey: ["employer", "applications", id] });
  }
}

export function useScheduleInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, data }: { applicationId: string; data: ScheduleInterviewRequest }) =>
      apiFetch<EmployerInterview>("employer", `/employer/applications/${applicationId}/interviews`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (interview) => markStale(queryClient, [interview.applicationId]),
  });
}

export function useRescheduleInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ interviewId, data }: { interviewId: string; data: RescheduleInterviewRequest }) =>
      apiFetch<EmployerInterview>("employer", `/employer/interviews/${interviewId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (interview) => markStale(queryClient, [interview.applicationId]),
  });
}

export function useCancelInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ interviewId, data }: { interviewId: string; data: CancelInterviewRequest }) =>
      apiFetch<EmployerInterview>("employer", `/employer/interviews/${interviewId}/cancel`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (interview) => markStale(queryClient, [interview.applicationId]),
  });
}

export function useBatchScheduleInterviews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BatchScheduleInterviewsRequest) =>
      apiFetch<BatchScheduleInterviewsResponse>("employer", "/employer/interviews/batch", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (result) =>
      markStale(
        queryClient,
        result.items.map((interview) => interview.applicationId),
      ),
  });
}

/** Lỗi 409 của lô: không lịch nào được tạo, `failures` chỉ ra từng hồ sơ lỗi. */
export function batchFailuresOf(error: unknown): BatchScheduleInterviewsFailure["failures"] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const data = error.data as Partial<BatchScheduleInterviewsFailure> | undefined;
  return Array.isArray(data?.failures) ? data.failures : null;
}
