"use client";

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  AwaitingScheduleApplication,
  AwaitingSchedulePage,
  AwaitingScheduleSort,
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

/** Cỡ trang mặc định của tab "Chờ đặt lịch" (`/employer/interviews`). */
export const AWAITING_PAGE_SIZE = 50;
/** Trần `pageSize` của API "chờ đặt lịch". */
const AWAITING_PAGE_MAX = 100;

export interface AwaitingPageQuery {
  jobPostId?: string | undefined;
  sort: AwaitingScheduleSort;
  /** Nhóm theo tin; API bỏ qua khi có `jobPostId`. */
  group: boolean;
  page: number;
  pageSize?: number;
}

function awaitingPageUrl({ jobPostId, sort, group, page, pageSize = AWAITING_PAGE_SIZE }: AwaitingPageQuery): string {
  const params = new URLSearchParams({ sort, group: group ? "job" : "none", page: String(page), pageSize: String(pageSize) });
  if (jobPostId) params.set("jobPostId", jobPostId);
  return `/employer/interviews/awaiting?${params}`;
}

/**
 * Một trang hồ sơ chờ đặt lịch (tab "Chờ đặt lịch"). Trong lúc tải trang mới,
 * trang cũ vẫn còn (`isPlaceholderData`) để danh sách không nhảy. `requestedAt`
 * (lúc gửi yêu cầu) đi cùng dữ liệu, kể cả khi là dữ liệu tạm, để trang biết
 * lịch nào đặt sau khi số liệu được lấy.
 */
export function useAwaitingSchedulePage(query: AwaitingPageQuery, enabled = true) {
  return useQuery({
    queryKey: [...EMPLOYER_INTERVIEWS_KEY, "awaiting-page", query],
    queryFn: async () => {
      const requestedAt = Date.now();
      const res = await apiFetch<AwaitingSchedulePage>("employer", awaitingPageUrl(query));
      return { ...res, requestedAt };
    },
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Mọi hồ sơ chờ đặt lịch (chờ lâu nhất trước), tải lần lượt từng trang 100 hồ sơ.
 * Trang hồ sơ theo tin cần đủ danh sách để biết hồ sơ nào chọn được.
 */
export function useAwaitingSchedule(jobPostId?: string, enabled = true) {
  return useQuery({
    queryKey: [...EMPLOYER_INTERVIEWS_KEY, "awaiting", jobPostId ?? "all"],
    queryFn: async () => {
      const items: AwaitingScheduleApplication[] = [];
      for (let page = 1; ; page++) {
        const res = await apiFetch<AwaitingSchedulePage>(
          "employer",
          awaitingPageUrl({ jobPostId, sort: "oldest", group: false, page, pageSize: AWAITING_PAGE_MAX }),
        );
        // `res.page < page`: danh sách ngắn đi giữa chừng, API trả lại trang cuối đã có — bỏ, không lặp hồ sơ.
        if (res.page < page) break;
        items.push(...res.items);
        if (res.items.length < AWAITING_PAGE_MAX || items.length >= res.total) break;
      }
      return items;
    },
    enabled,
    staleTime: 30_000,
  });
}

export interface InterviewListFilter {
  /** Chỉ lịch của một tin. */
  jobPostId?: string | undefined;
  /** Kèm lịch đã huỷ. */
  includeCancelled?: boolean | undefined;
}

function interviewListParams({ jobPostId, includeCancelled }: InterviewListFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (jobPostId) params.set("jobPostId", jobPostId);
  if (includeCancelled) params.set("includeCancelled", "true");
  return params;
}

/**
 * Lịch của cả công ty trong khoảng [from, to) (ISO, tối đa 92 ngày), sớm nhất
 * trước. Mặc định không gồm lịch đã huỷ.
 */
export function useEmployerInterviews(range: { from: string; to: string } | null, filter: InterviewListFilter = {}) {
  const jobPostId = filter.jobPostId ?? null;
  const includeCancelled = filter.includeCancelled ?? false;
  return useQuery({
    queryKey: [...EMPLOYER_INTERVIEWS_KEY, "list", range?.from, range?.to, jobPostId, includeCancelled],
    queryFn: async () => {
      const params = interviewListParams(filter);
      params.set("from", range!.from);
      params.set("to", range!.to);
      const res = await apiFetch<PaginatedResponse<EmployerInterview>>("employer", `/employer/interviews?${params}`);
      return res.items;
    },
    enabled: range !== null,
    staleTime: 30_000,
  });
}

/**
 * Lịch từ đầu ngày hôm nay trở đi (chế độ "Sắp tới"), mỗi trang khoảng 20 buổi
 * và không cắt ngang một ngày. API không trả tổng số buổi.
 */
export function useUpcomingInterviews(filter: InterviewListFilter, enabled = true) {
  const jobPostId = filter.jobPostId ?? null;
  const includeCancelled = filter.includeCancelled ?? false;
  return useInfiniteQuery({
    queryKey: [...EMPLOYER_INTERVIEWS_KEY, "upcoming", jobPostId, includeCancelled],
    queryFn: ({ pageParam }) => {
      const params = interviewListParams(filter);
      params.set("scope", "upcoming");
      if (pageParam) params.set("cursor", pageParam);
      return apiFetch<PaginatedResponse<EmployerInterview>>("employer", `/employer/interviews?${params}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    // Thử lại một lần thôi để lỗi "Tải thêm" hiện sớm; người dùng bấm lại được.
    retry: 1,
    enabled,
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
