"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SavedJobEntry, SavedJobCheckResponse } from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";

// ─── Query keys ────────────────────────────────────────────────────────────

const LIST_KEY = ["candidateSavedJobs"] as const;
const checkKey = (jobPostId: string) => ["candidateSavedJobCheck", jobPostId] as const;

// ─── Hooks ─────────────────────────────────────────────────────────────────

/** Danh sách tin đã lưu của candidate. */
export function useSavedJobs() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () => apiFetch<SavedJobEntry[]>("candidate", "/candidates/me/saved-jobs"),
  });
}

/**
 * Kiểm tra trạng thái lưu của một JobPost. Dùng trên Job Detail page để
 * lấy saved state từ backend thay vì chỉ dựa vào local state.
 */
export function useSavedJobCheck(jobPostId: string, enabled: boolean) {
  return useQuery({
    queryKey: checkKey(jobPostId),
    queryFn: () => apiFetch<SavedJobCheckResponse>("candidate", `/candidates/me/saved-jobs/${jobPostId}`),
    enabled: !!jobPostId && enabled,
  });
}

/** Lưu một JobPost. */
export function useSaveJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobPostId: string) =>
      apiFetch<SavedJobEntry>("candidate", `/candidates/me/saved-jobs/${jobPostId}`, { method: "POST" }),
    onSuccess: (_data, jobPostId) => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      void queryClient.invalidateQueries({ queryKey: checkKey(jobPostId) });
    },
  });
}

/** Bỏ lưu một JobPost. */
export function useUnsaveJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobPostId: string) =>
      apiFetch<{ deleted: boolean; jobPostId: string }>("candidate", `/candidates/me/saved-jobs/${jobPostId}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, jobPostId) => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
      void queryClient.invalidateQueries({ queryKey: checkKey(jobPostId) });
    },
  });
}
