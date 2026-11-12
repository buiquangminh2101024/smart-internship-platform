import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JobApplicationAutomationSettings, UpdateJobApplicationAutomationRequest } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";
import { COMPANY_APPLICATIONS_KEY } from "@/hooks/useApplications";

// Tự xử lý hồ sơ chờ lâu theo tin (AD-25) — docs/05-frontend/phases/application-automation/PLAN.md (F4).

/** Giá trị mặc định của backend cho tin mới (`schema.prisma`, bảng job_posts). */
export const APPLICATION_AUTOMATION_DEFAULTS = {
  autoReviewEnabled: true,
  rejectSuggestBelowScore: 50,
  autoCloseInterviewedEnabled: false,
} as const;

/** Khớp `AUTO_CLOSE_GRACE_DAYS` / `AUTO_CLOSE_INTERVIEWED_DAYS` của backend (`application-automation.config.ts`). */
export const AUTO_CLOSE_GRACE_DAYS = 14;
export const AUTO_CLOSE_INTERVIEWED_DAYS = 30;

/**
 * Nằm dưới `["employer", "job-posts", jobId]`: lưu cài đặt tự mời (đổi X) đã làm mới cả nhóm
 * này, nên "Ngưỡng phù hợp" trên thẻ tự đổi theo. Không trùng `[…, "applications"]` của
 * danh sách hồ sơ theo tin.
 */
const jobAutomationKey = (jobId: string) => ["employer", "job-posts", jobId, "application-automation"] as const;

/** Chỉ người đăng tin đọc được (người khác nhận 404 ⇒ ẩn thẻ). */
export function useJobApplicationAutomation(jobId: string) {
  return useQuery({
    queryKey: jobAutomationKey(jobId),
    queryFn: () =>
      apiFetch<JobApplicationAutomationSettings>("employer", `/employer/job-posts/${jobId}/application-automation`),
    enabled: !!jobId,
    retry: false,
  });
}

/** PATCH cài đặt; dùng ở thẻ trên trang tin và sau khi tạo nháp ở form tạo tin. Y ≥ X ⇒ 400. */
export function useUpdateJobApplicationAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, patch }: { jobId: string; patch: UpdateJobApplicationAutomationRequest }) =>
      apiFetch<JobApplicationAutomationSettings>("employer", `/employer/job-posts/${jobId}/application-automation`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (dto, { jobId }) => {
      queryClient.setQueryData<JobApplicationAutomationSettings>(jobAutomationKey(jobId), dto);
      // Plan Phần 2: Y đổi thì số đề xuất từ chối (dải gợi ý) đổi; bật lại tự chuyển thì server
      // quét ngay hồ sơ Chờ duyệt của tin ⇒ trang "Ứng viên" và số trên dashboard đã cũ.
      void queryClient.invalidateQueries({ queryKey: COMPANY_APPLICATIONS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["employer", "dashboard"], refetchType: "none" });
    },
  });
}
