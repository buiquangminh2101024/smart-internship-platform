"use client";

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BulkApproveRequest,
  BulkModerationResult,
  BulkRejectRequest,
  ConfirmRequirementsRequest,
  EmployerJobPostListQuery,
  ExtractedJobRequirements,
  JobPost,
  JobPostSearchQuery,
  JobPostStats,
  JobPostStatus,
  JobQualityBandFilter,
  JobQualityDto,
  ModerationQueueIdsResponse,
  ModerationQueueSort,
  PaginatedResponse,
  SimilarJobItem,
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

/** Trần số trang khi tải mọi tin cho ô lọc (20 tin mỗi trang). */
const JOB_OPTIONS_MAX_PAGES = 20;

/** Mọi tin của công ty (id + tên, mới nhất trước), tải lần lượt từng trang — cho ô lọc theo tin. */
export function useEmployerJobPostOptions() {
  return useQuery({
    queryKey: ["employerJobPosts", "options"],
    queryFn: async () => {
      const options: { id: string; title: string }[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < JOB_OPTIONS_MAX_PAGES; page++) {
        const res = await apiFetch<PaginatedResponse<JobPost>>("employer", `/employer/job-posts${toQueryString({ cursor })}`);
        options.push(...res.items.map((job) => ({ id: job.id, title: job.title })));
        if (!res.hasMore || !res.nextCursor) break;
        cursor = res.nextCursor;
      }
      return options;
    },
    staleTime: 5 * 60_000,
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

/** Bộ lọc hàng đợi Admin (AD-29). `status: "ALL"` = không lọc trạng thái. */
export interface AdminJobPostsFilter {
  status: JobPostStatus | "ALL";
  band?: JobQualityBandFilter | undefined;
  sort?: ModerationQueueSort | undefined;
}

function moderationQuery(filter: AdminJobPostsFilter) {
  return {
    status: filter.status === "ALL" ? undefined : filter.status,
    band: filter.band,
    sort: filter.sort,
  };
}

/**
 * Hàng đợi kiểm duyệt có "Xem thêm" (AD-29 F1, điểm 1): tải tiếp theo `nextCursor`.
 * `total` (số tin khớp bộ lọc) lấy ở trang đầu: `pages[0].total`.
 */
export function useAdminJobPosts(filter: AdminJobPostsFilter) {
  return useInfiniteQuery({
    queryKey: ["adminJobPosts", filter.status, filter.band ?? null, filter.sort ?? null],
    queryFn: ({ pageParam }) =>
      apiFetch<PaginatedResponse<JobPost>>(
        "admin",
        `/admin/job-posts${toQueryString({ ...moderationQuery(filter), cursor: pageParam ?? undefined })}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : null),
    placeholderData: keepPreviousData,
  });
}

/**
 * Lấy tối đa 50 id khớp bộ lọc cho nút "Chọn tất cả tin trong vùng" (F3). Gọi khi bấm nút
 * (không tự chạy), nên là mutation chứ không phải query.
 */
export function useAdminJobPostIds() {
  return useMutation({
    mutationFn: (filter: AdminJobPostsFilter) =>
      apiFetch<ModerationQueueIdsResponse>("admin", `/admin/job-posts/ids${toQueryString(moderationQuery(filter))}`),
  });
}

function invalidateAdminJobPosts(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["adminJobPosts"] });
  void queryClient.invalidateQueries({ queryKey: ["adminJobPostStats"] });
  void queryClient.invalidateQueries({ queryKey: ["adminJobPost"] });
}

/**
 * Duyệt / từ chối hàng loạt (AD-29 bước 7). `reason` chỉ dùng khi từ chối; bỏ trống thì mỗi tin
 * dùng lý do tự sinh của nó. Kết quả có thể còn `pending` (lô chạy tiếp ở nền).
 */
export function useBulkModerateJobPosts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { action: "APPROVE" } & BulkApproveRequest | { action: "REJECT" } & BulkRejectRequest) => {
      const { action, ...body } = input;
      return apiFetch<BulkModerationResult>(
        "admin",
        `/admin/job-posts/${action === "APPROVE" ? "bulk-approve" : "bulk-reject"}`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
    onSettled: () => invalidateAdminJobPosts(queryClient),
  });
}

/** Hỏi lại kết quả một lô chưa xong (`pending` khác rỗng). */
export function fetchBulkModerationResult(batchId: string) {
  return apiFetch<BulkModerationResult>("admin", `/admin/job-posts/bulk/${batchId}`);
}

/** Nút "Chấm lại" ở thẻ điểm (F4). */
export function useRescoreJobQuality(jobPostId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<JobQualityDto>("admin", `/admin/job-posts/${jobPostId}/quality/rescore`, { method: "POST" }),
    onSettled: () => invalidateAdminJobPosts(queryClient),
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
 * Danh sách /jobs có "Xem thêm" (AD-26, docs/05-frontend/phases/job-discovery/PLAN.md bước F2).
 * Ứng viên đăng nhập gọi bằng token để có `viewer` (điểm, đã lưu, đã ứng tuyển) và sắp theo
 * điểm; khách gọi không token. Khoá có `viewer` để không lẫn cache giữa khách và ứng viên.
 * Giữ trang cũ trong lúc đổi bộ lọc (`keepPreviousData`), và cache giữ các trang đã tải nên
 * quay lại từ trang chi tiết vẫn đúng chỗ.
 */
export function useJobPostSearch(query: JobPostSearchQuery, viewer: "guest" | "candidate", enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["publicJobPosts", "search", viewer, query],
    queryFn: ({ pageParam }) => {
      const path = `/job-posts${toQueryString({ ...query, cursor: pageParam ?? undefined })}`;
      return viewer === "candidate"
        ? apiFetch<PaginatedResponse<JobPost>>("candidate", path)
        : publicFetch<PaginatedResponse<JobPost>>(path);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : null),
    placeholderData: keepPreviousData,
    enabled,
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

/**
 * "Việc làm tương tự" (docs/05-frontend/phases/similar-jobs/PLAN.md). Tải riêng,
 * không chặn nội dung tin; lỗi thì khối tự ẩn nên không retry.
 */
export function useSimilarJobs(jobId: string) {
  return useQuery({
    queryKey: ["job-posts", jobId, "similar"],
    queryFn: () => publicFetch<SimilarJobItem[]>(`/job-posts/${jobId}/similar`),
    enabled: !!jobId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
