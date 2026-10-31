import { keepPreviousData, useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type {
  CandidateApplicationSummary,
  CreateApplicationRequest,
  PaginatedResponse,
  EmployerApplicationDetail,
  EmployerApplicationView,
  UpdateApplicationStatusRequest,
  UpdateApplicationEvaluationRequest,
  ApplicationStatus,
  BulkUpdateApplicationStatusRequest,
  BulkUpdateApplicationStatusResult,
  EmployerApplicationsPage,
  EmployerApplicationsSort,
} from "@sip/shared-types";

// --- Candidate Hooks ---

export function useCandidateApplications() {
  return useQuery({
    queryKey: ["candidate", "applications"],
    queryFn: async () => {
      const res = await apiFetch<PaginatedResponse<CandidateApplicationSummary>>("candidate", "/candidate/applications");
      return res.items;
    },
  });
}

/** Check application status for a specific job (dùng ở trang job detail để điều chỉnh nút Ứng tuyển) */
export function useJobApplicationStatus(jobPostId: string, enabled: boolean) {
  const { data: applications } = useCandidateApplications();
  if (!enabled || !applications) return { application: undefined, status: undefined };
  const application = applications.find((a) => a.jobPostId === jobPostId);
  return { application, status: application?.status };
}

export function useCandidateApplication(id: string) {
  return useQuery({
    queryKey: ["candidate", "applications", id],
    queryFn: async () => {
      return apiFetch<CandidateApplicationSummary>("candidate", "/candidate/applications/" + id);
    },
    enabled: !!id,
  });
}

export function useApplyJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateApplicationRequest) => {
      return apiFetch<CandidateApplicationSummary>("candidate", "/candidate/applications", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["candidate", "applications"] });
    },
  });
}

export function useCancelApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return apiFetch<CandidateApplicationSummary>("candidate", "/candidate/applications/" + id + "/cancel", { method: "PATCH" });
    },
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ["candidate", "applications"] });
      void queryClient.invalidateQueries({ queryKey: ["candidate", "applications", id] });
    },
  });
}

// --- Employer Hooks ---

export function useEmployerJobApplications(jobId: string, status?: ApplicationStatus) {
  return useQuery({
    queryKey: ["employer", "job-posts", jobId, "applications", status],
    queryFn: async () => {
      const query = status ? "?status=" + status : "";
      const res = await apiFetch<PaginatedResponse<EmployerApplicationDetail>>("employer", "/employer/job-posts/" + jobId + "/applications" + query);
      return res.items;
    },
    enabled: !!jobId,
  });
}

export function useEmployerApplication(id: string) {
  return useQuery({
    queryKey: ["employer", "applications", id],
    queryFn: async () => {
      return apiFetch<EmployerApplicationView>("employer", "/employer/applications/" + id);
    },
    enabled: !!id,
  });
}

export function useUpdateApplicationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateApplicationStatusRequest }) => {
      return apiFetch<EmployerApplicationDetail>("employer", "/employer/applications/" + id + "/status", {
        method: "PATCH",
        body: JSON.stringify(data)
      });
    },
    onSuccess: (data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["employer", "applications", id] });
      void queryClient.invalidateQueries({ queryKey: ["employer", "job-posts", data.jobPostId, "applications"] });
      // Chỉ đánh dấu cũ: dashboard tự tải lại khi mở lại; trang dashboard tự
      // chọn khối nào tải lại ngay (xem EmployerTaskBoard).
      void queryClient.invalidateQueries({ queryKey: ["employer", "dashboard"], refetchType: "none" });
      markCompanyListsStale(queryClient);
    },
  });
}

// --- Trang "Ứng viên" (mọi tin của công ty) ---
// docs/05-frontend/phases/employer-applications/PLAN.md

/** Không trùng `["employer", "applications", id]` của chi tiết hồ sơ ("list" không phải id). */
export const COMPANY_APPLICATIONS_KEY = ["employer", "applications", "list"] as const;
export const COMPANY_APPLICATIONS_PAGE_SIZE = 20;

export interface CompanyApplicationsQuery {
  status: ApplicationStatus | null;
  jobPostId: string | null;
  /** Đã cắt khoảng trắng; rỗng ⇒ không tìm. */
  q: string;
  sort: EmployerApplicationsSort;
  page: number;
}

function companyApplicationsUrl({ status, jobPostId, q, sort, page }: CompanyApplicationsQuery): string {
  const params = new URLSearchParams({ sort, page: String(page), pageSize: String(COMPANY_APPLICATIONS_PAGE_SIZE) });
  if (status) params.set("status", status);
  if (jobPostId) params.set("jobPostId", jobPostId);
  if (q) params.set("q", q);
  return `/employer/applications?${params}`;
}

/**
 * Một trang hồ sơ của mọi tin. Trong lúc tải trang / bộ lọc mới, trang cũ vẫn
 * hiện (`isPlaceholderData`) để danh sách không nháy trắng.
 */
export function useCompanyApplications(query: CompanyApplicationsQuery) {
  return useQuery({
    queryKey: [...COMPANY_APPLICATIONS_KEY, query],
    queryFn: () => apiFetch<EmployerApplicationsPage>("employer", companyApplicationsUrl(query)),
    placeholderData: keepPreviousData,
  });
}

/**
 * Sau khi đổi trạng thái hồ sơ: trang "Ứng viên" đang mở thì tải lại ngay (số trên
 * tab), còn danh sách theo tin và lịch phỏng vấn chỉ bị đánh dấu cũ.
 */
function markCompanyListsStale(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: COMPANY_APPLICATIONS_KEY });
  void queryClient.invalidateQueries({ queryKey: ["employer", "interviews"], refetchType: "none" });
}

export function useBulkUpdateApplicationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkUpdateApplicationStatusRequest) =>
      apiFetch<BulkUpdateApplicationStatusResult>("employer", "/employer/applications/bulk-status", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (result) => {
      for (const id of result.updated) {
        void queryClient.invalidateQueries({ queryKey: ["employer", "applications", id] });
      }
      // Không biết tin của từng hồ sơ ⇒ đánh dấu cũ mọi danh sách hồ sơ theo tin.
      void queryClient.invalidateQueries({
        predicate: ({ queryKey }) =>
          queryKey[0] === "employer" && queryKey[1] === "job-posts" && queryKey[3] === "applications",
        refetchType: "none",
      });
      void queryClient.invalidateQueries({ queryKey: ["employer", "dashboard"], refetchType: "none" });
      markCompanyListsStale(queryClient);
    },
  });
}

export function useUpdateApplicationEvaluation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateApplicationEvaluationRequest }) => {
      return apiFetch<EmployerApplicationDetail>("employer", "/employer/applications/" + id + "/evaluation", {
        method: "PATCH",
        body: JSON.stringify(data)
      });
    },
    onSuccess: (data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["employer", "applications", id] });
    },
  });
}
