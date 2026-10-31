import { z } from "zod";
import { ApplicationStatus } from "@prisma/client";

export const createApplicationSchema = z.object({
  jobPostId: z.string().cuid(),
  cvId: z.string().cuid(),
  coverLetter: z.string().max(2000).optional(),
});

export const updateApplicationStatusSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
});

export const updateApplicationEvaluationSchema = z.object({
  employerNotes: z.string().max(2000).optional().nullable(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
});


/** Trang "Ứng viên": 20 hồ sơ mỗi trang, tối đa 50 (D1). */
export const COMPANY_APPLICATIONS_PAGE_DEFAULT = 20;
export const COMPANY_APPLICATIONS_PAGE_MAX = 50;

// Query string luôn là chuỗi; `q` rỗng coi như không tìm.
/**
 * Phân trang theo số trang (ngoại lệ của API_CONVENTIONS.md, như D18). `sort` để
 * trống thì service chọn theo `status`. `page` vượt trang cuối → trang cuối.
 */
export const listCompanyApplicationsQuerySchema = z.object({
  status: z.nativeEnum(ApplicationStatus).optional(),
  jobPostId: z.string().min(1).optional(),
  q: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(2, "Từ khoá tìm cần ít nhất 2 ký tự").max(100, "Từ khoá tìm tối đa 100 ký tự").optional(),
  ),
  sort: z.enum(["oldest", "newest", "skills"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(COMPANY_APPLICATIONS_PAGE_MAX).default(COMPANY_APPLICATIONS_PAGE_DEFAULT),
});
export type ListCompanyApplicationsQuery = z.infer<typeof listCompanyApplicationsQuerySchema>;

/** D6 — tối đa 50 hồ sơ mỗi lần. */
export const BULK_STATUS_MAX_APPLICATIONS = 50;

/** D4 — "Được nhận" không có trong danh sách: chỉ làm từng hồ sơ. */
export const bulkUpdateApplicationStatusSchema = z.object({
  applicationIds: z
    .array(z.string().min(1))
    .min(1, "Cần chọn ít nhất một hồ sơ")
    .max(BULK_STATUS_MAX_APPLICATIONS, `Tối đa ${BULK_STATUS_MAX_APPLICATIONS} hồ sơ mỗi lần`)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Danh sách hồ sơ bị trùng" }),
  status: z.enum(["REVIEWING", "SHORTLISTED", "REJECTED"]),
});
export type BulkUpdateApplicationStatusDto = z.infer<typeof bulkUpdateApplicationStatusSchema>;
