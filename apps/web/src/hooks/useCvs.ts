"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CandidateCvRecord } from "@sip/shared-types";
import { apiFetch, apiUpload } from "@/lib/api-client";

// ─── Query keys ────────────────────────────────────────────────────────────

const QUERY_KEY = ["candidateCvs"] as const;

// ─── Hooks ─────────────────────────────────────────────────────────────────

/** Danh sách CV của candidate đang đăng nhập. */
export function useCvList() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<CandidateCvRecord[]>("candidate", "/candidates/me/cvs"),
  });
}

/** Upload CV mới qua apiUpload (multipart). */
export function useCvUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiUpload<CandidateCvRecord>("candidate", "/candidates/me/cvs", formData);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/**
 * Phân tích CV bằng AI (POST /candidates/me/cvs/:id/extract). Backend chạy
 * đồng bộ, có thể mất vài chục giây — axios không đặt timeout nên không cần
 * cấu hình riêng. Trả CV đã có extractedData; ghi thẳng vào cache để preview
 * hiện ngay, rồi invalidate để đồng bộ lại danh sách.
 */
export function useCvExtract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cvId: string) =>
      apiFetch<CandidateCvRecord>("candidate", `/candidates/me/cvs/${cvId}/extract`, { method: "POST" }),
    onSuccess: (updated) => {
      queryClient.setQueryData<CandidateCvRecord[]>(QUERY_KEY, (prev) =>
        prev?.map((cv) => (cv.id === updated.id ? updated : cv)),
      );
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/** Đặt một CV làm CV mặc định. */
export function useCvSetDefault() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cvId: string) =>
      apiFetch<CandidateCvRecord>("candidate", `/candidates/me/cvs/${cvId}/default`, { method: "PATCH" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/** Xóa một CV. */
export function useCvDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cvId: string) =>
      apiFetch<{ deleted: boolean }>("candidate", `/candidates/me/cvs/${cvId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
