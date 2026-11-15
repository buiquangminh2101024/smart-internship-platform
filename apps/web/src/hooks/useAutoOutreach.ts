import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JobAutoOutreachDto, UpdateAutoOutreachSettingsRequest } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";
import { COMPANY_APPLICATIONS_KEY } from "@/hooks/useApplications";
import { OUTREACH_KEY } from "@/hooks/useCandidateOutreach";
import { HIRING_PROGRESS_KEY } from "@/hooks/useEmployerDashboard";

// Tự động mời theo tin (AD-23) — docs/05-frontend/phases/auto-outreach/PLAN.md (F2, F3).

/** Khớp `HIRING_TARGET_MAX` và `updateJobAutoOutreachSchema` của backend. */
export const HIRING_TARGET_MAX = 100;
export const DEFAULT_MIN_SCORE = 80;

/**
 * Nằm dưới OUTREACH_KEY: SocketProvider làm mới cả nhóm khi có AUTO_OUTREACH_SENT hoặc
 * ứng viên trả lời lời mời, nên thẻ trên trang tin tự cập nhật số đếm.
 */
export const jobAutoKey = (jobId: string) => [...OUTREACH_KEY, "job-auto", jobId] as const;

/** Số nguyên trong [min, max]; sai thì null. Dùng cho ô nhập của thẻ và form tạo tin. */
export function parseIntInRange(value: string, min: number, max: number): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed >= min && parsed <= max ? parsed : null;
}

/** Đang bật, tin đang hiển thị, chưa giữ đủ lời mời ⇒ lượt chạy nền có thể vừa gửi thêm. */
function isFilling(data: JobAutoOutreachDto | undefined): boolean {
  return (
    data !== undefined &&
    data.state === "RUNNING" &&
    data.status.target !== null &&
    data.status.active < data.status.target
  );
}

/**
 * Chỉ người đăng tin đọc được (người khác nhận 404 ⇒ ẩn thẻ). `pollUntil` (epoch ms):
 * sau khi lưu, lượt chạy nền gửi lời mời mất vài giây, nên đọc lại mỗi 3 giây tới mốc
 * này hoặc tới khi đã giữ đủ lời mời.
 */
export function useJobAutoOutreach(jobId: string, enabled: boolean, pollUntil = 0) {
  return useQuery({
    queryKey: jobAutoKey(jobId),
    queryFn: () => apiFetch<JobAutoOutreachDto>("employer", `/employer/job-posts/${jobId}/auto-outreach`),
    enabled: enabled && !!jobId,
    retry: false,
    refetchInterval: (query) => (Date.now() < pollUntil && isFilling(query.state.data) ? 3000 : false),
  });
}

/** PATCH cài đặt; dùng ở thẻ trên trang tin và sau khi tạo nháp ở form tạo tin. */
export function useUpdateJobAutoOutreach() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, patch }: { jobId: string; patch: UpdateAutoOutreachSettingsRequest }) =>
      apiFetch<JobAutoOutreachDto>("employer", `/employer/job-posts/${jobId}/auto-outreach`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (dto, { jobId, patch }) => {
      queryClient.setQueryData<JobAutoOutreachDto>(jobAutoKey(jobId), dto);
      // Plan Phần 2: lượt chạy nền có thể vừa mời người trong "Gợi ý" ⇒ "Gợi ý" / "Đã mời" của tin
      // (key bắt đầu bằng ["employer", "job-posts", jobId]) và số liệu trang "Lời mời" đã cũ.
      // "Gợi ý" có staleTime vô hạn nên chỉ tìm lại khi mở trang đó lần sau, không tìm ngay.
      void queryClient.invalidateQueries({ queryKey: ["employer", "job-posts", jobId] });
      void queryClient.invalidateQueries({ queryKey: [...OUTREACH_KEY, "summary"] });
      // 0.3: số Phù hợp so với ngưỡng lúc đọc, và chỉ tiêu nằm trong "Đã tuyển a/b" ⇒ khối tiến độ
      // tuyển ở trang tổng quan và "Phù hợp N" ở danh sách tin đã cũ ngay sau khi lưu.
      void queryClient.invalidateQueries({ queryKey: HIRING_PROGRESS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["employerJobPosts"] });
      // AD-25: X cũng là ngưỡng tự chuyển "Đang xem xét"; hạ X thì server quét ngay hồ sơ Chờ duyệt
      // của tin ⇒ trang "Ứng viên" đã cũ. Thẻ "Tự động xử lý hồ sơ" nằm dưới key của tin ở trên.
      if (patch.minScore !== undefined) void queryClient.invalidateQueries({ queryKey: COMPANY_APPLICATIONS_KEY });
    },
  });
}
