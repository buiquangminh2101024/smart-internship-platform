"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CandidateCvRecord, ImportFromCvRequest, ImportFromCvResponse } from "@sip/shared-types";
import { apiFetch, apiUpload } from "@/lib/api-client";

// ─── Query keys ────────────────────────────────────────────────────────────

const QUERY_KEY = ["candidateCvs"] as const;
const PROFILE_QUERY_KEY = ["candidateProfile"] as const;

/**
 * Chỉ những field preview CV cần để quyết định mặc định "Giữ" / "Dùng mới"
 * (docs/05-frontend/phases/cv-ai-extraction-phase2/PLAN.md Quyết định #2).
 * GET /candidates/me còn trả nhiều thứ khác, không cần khai báo hết ở đây.
 */
export interface CandidateProfileSnapshot {
  headline: string | null;
  bio: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  cityId: string | null;
  city: { id: string; name: string } | null;
}

type CatalogItem = { id: string; name: string };
type Resource = Record<string, unknown> & { id: string };

export interface CandidateFullProfile extends CandidateProfileSnapshot {
  fullName: string | null;
  avatarUrl: string | null;
  educations: Array<Resource & {
    universityId: string | null; majorId: string | null; degree: string | null; startYear: number | null; endYear: number | null; isCurrent: boolean; description: string | null;
    university: CatalogItem | null; major: CatalogItem | null;
  }>;
  workExperiences: Array<Resource & { company: string | null; position: string | null; startDate: string | null; endDate: string | null; isCurrent: boolean; description: string | null }>;
  projects: Array<Resource & { name: string | null; url: string | null; startDate: string | null; endDate: string | null; isWorkingOn: boolean; description: string | null }>;
  certificates: Array<Resource & { name: string | null; issuer: string | null; issueDate: string | null; credentialUrl: string | null; description: string | null }>;
  awards: Array<Resource & { name: string | null; issuer: string | null; date: string | null; description: string | null }>;
  skills: Array<Resource & { skill: CatalogItem & { status?: string }; yearsOfExperience: number }>;
}


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

/** Lưu CV từ builder. */
export function useSaveBuilderCv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cvId, templateId, builderData, file }: { cvId?: string, templateId: string, builderData: any, file?: File }) => {
      const formData = new FormData();
      if (cvId) formData.append("cvId", cvId);
      formData.append("templateId", templateId);
      formData.append("builderData", JSON.stringify(builderData));
      if (file) formData.append("file", file);
      
      return apiUpload<CandidateCvRecord>("candidate", "/candidates/me/cvs/builder", formData);
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

/** Hồ sơ hiện tại — để preview CV so sánh field đơn lẻ trước khi import. */
export function useCandidateProfile() {
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => apiFetch<CandidateProfileSnapshot>("candidate", "/candidates/me"),
  });
}

export function useCandidateFullProfile() {
  return useQuery({
    queryKey: [...PROFILE_QUERY_KEY, "full"],
    queryFn: () => apiFetch<CandidateFullProfile>("candidate", "/candidates/me"),
  });
}

/**
 * "Lưu vào hồ sơ" — POST /candidates/me/profile/import-from-cv. Trang hồ sơ
 * (CandidateProfileClient) tự fetch lại khi mở nên chỉ cần làm mới snapshot ở đây.
 */
export function useCvProfileImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ImportFromCvRequest) =>
      apiFetch<ImportFromCvResponse>("candidate", "/candidates/me/profile/import-from-cv", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
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
