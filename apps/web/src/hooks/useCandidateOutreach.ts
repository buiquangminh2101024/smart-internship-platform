import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CandidateOutreachInvitationDto,
  CandidateSearchResultDto,
  OutreachInvitationAction,
  OutreachSettings,
  RespondOutreachInvitationResponse,
  SentOutreachInvitationDto,
} from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";

// Tìm & mời ứng viên (B3, AD-15) — docs/05-frontend/phases/candidate-outreach/PLAN.md.

const searchKey = (jobId: string) => ["employer", "job-posts", jobId, "candidate-search"] as const;
const sentKey = (jobId: string) => ["employer", "job-posts", jobId, "outreach-invitations"] as const;
const INBOX_KEY = ["candidate", "outreach-invitations"] as const;
const SETTINGS_KEY = ["candidate", "outreach-settings"] as const;

// ─── Employer ──────────────────────────────────────────────────────────────

/**
 * "Gợi ý" — mỗi lượt chạy hybrid (tốn) nên không tự tìm lại khi focus/mount lại;
 * chỉ tìm lại khi Employer bấm "Tìm lại" (refetch).
 */
export function useCandidateSearch(jobId: string) {
  return useQuery({
    queryKey: searchKey(jobId),
    queryFn: () => apiFetch<CandidateSearchResultDto[]>("employer", `/employer/job-posts/${jobId}/candidate-search`),
    enabled: !!jobId,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** "Đã mời" — không chấm lại điểm nên rẻ, refetch bình thường. */
export function useSentOutreachInvitations(jobId: string) {
  return useQuery({
    queryKey: sentKey(jobId),
    queryFn: () => apiFetch<SentOutreachInvitationDto[]>("employer", `/employer/job-posts/${jobId}/invitations`),
    enabled: !!jobId,
    retry: false,
  });
}

/**
 * Gửi xong: bỏ người đó khỏi cache "Gợi ý" và chèn DTO trả về vào đầu "Đã mời"
 * — không refetch "Gợi ý" (hybrid, tốn).
 */
export function useSendOutreachInvitation(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (candidateId: string) =>
      apiFetch<SentOutreachInvitationDto>(
        "employer",
        `/employer/job-posts/${jobId}/candidates/${candidateId}/invitations`,
        { method: "POST" },
      ),
    onSuccess: (sent) => {
      queryClient.setQueryData<CandidateSearchResultDto[]>(searchKey(jobId), (current) =>
        current?.filter((item) => item.candidateId !== sent.candidateId),
      );
      queryClient.setQueryData<SentOutreachInvitationDto[]>(sentKey(jobId), (current) =>
        current ? [sent, ...current.filter((item) => item.invitationId !== sent.invitationId)] : [sent],
      );
    },
  });
}

// ─── Candidate ─────────────────────────────────────────────────────────────

export function useOutreachInvitations(enabled: boolean) {
  return useQuery({
    queryKey: INBOX_KEY,
    queryFn: () => apiFetch<CandidateOutreachInvitationDto[]>("candidate", "/candidate/outreach-invitations"),
    enabled,
    retry: false,
  });
}

export function useRespondOutreachInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invitationId, action }: { invitationId: string; action: OutreachInvitationAction }) =>
      apiFetch<RespondOutreachInvitationResponse>("candidate", `/candidate/outreach-invitations/${invitationId}/respond`, {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
    // Cả khi lỗi (409 — lời mời vừa hết hạn) cũng tải lại để hiện đúng trạng thái.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: INBOX_KEY });
    },
  });
}

/**
 * Cờ isOpenToOutreach — đọc từ /candidates/me (không có endpoint GET riêng).
 * Dùng ở /job-invitations để nhắc khi đang tắt; /profile tự tải hồ sơ riêng.
 */
export function useOutreachSetting(enabled: boolean) {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const profile = await apiFetch<{ isOpenToOutreach?: boolean }>("candidate", "/candidates/me");
      return { isOpenToOutreach: profile.isOpenToOutreach === true } satisfies OutreachSettings;
    },
    enabled,
    retry: false,
  });
}

/** Ghi cache cờ cục bộ — không gọi lại toàn bộ hồ sơ. */
export function useUpdateOutreachSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: OutreachSettings) =>
      apiFetch<OutreachSettings>("candidate", "/candidate/outreach-settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      }),
    onSuccess: (settings) => {
      queryClient.setQueryData<OutreachSettings>(SETTINGS_KEY, settings);
    },
  });
}
