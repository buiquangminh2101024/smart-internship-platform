import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { 
  CandidateApplicationSummary, 
  CreateApplicationRequest, 
  PaginatedResponse,
  EmployerApplicationDetail,
  UpdateApplicationStatusRequest,
  UpdateApplicationEvaluationRequest,
  ApplicationStatus
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
      return apiFetch<EmployerApplicationDetail>("employer", "/employer/applications/" + id);
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
