import { z } from "zod";
import { HIRING_TARGET_MAX, TOP_RESULT_COUNT } from "./candidate-outreach.config";

// Cùng giới hạn với createApplicationSchema (applications.dto.ts).
const invitationApplicationFields = {
  cvId: z.string().cuid(),
  coverLetter: z.string().max(2000).optional(),
};

// POST /candidate/outreach-invitations/:id/respond — AD-28: nhận lời = ứng tuyển, nên ACCEPT kèm CV.
export const respondOutreachInvitationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("DECLINE") }),
  z.object({ action: z.literal("ACCEPT"), ...invitationApplicationFields }),
]);

// POST /candidate/outreach-invitations/:id/apply — AD-28 mục 5: lời mời ACCEPTED chưa có đơn.
export const applyFromInvitationSchema = z.object(invitationApplicationFields);

// POST /employer/job-posts/:jobId/invitations/bulk — "Mời tất cả gợi ý" (AD-23).
// Tối đa bằng số người của tab "Gợi ý"; id trùng được gộp ở service.
export const bulkInviteSchema = z.object({
  candidateIds: z.array(z.string().min(1)).min(1).max(TOP_RESULT_COUNT),
});

// PATCH /employer/job-posts/:jobId/auto-outreach (AD-23 mục 2) — gửi ít nhất một trường.
export const updateJobAutoOutreachSchema = z
  .object({
    enabled: z.boolean().optional(),
    minScore: z.number().int().min(0).max(100).optional(),
    hiringTarget: z.number().int().min(1).max(HIRING_TARGET_MAX).optional(),
  })
  .refine((body) => body.enabled !== undefined || body.minScore !== undefined || body.hiringTarget !== undefined, {
    message: "Cần gửi ít nhất một trong enabled, minScore, hiringTarget.",
  });
export type UpdateJobAutoOutreachInput = z.infer<typeof updateJobAutoOutreachSchema>;

// PATCH /employer/outreach/settings (AD-23 mục 5).
export const updateCompanyOutreachSettingsSchema = z.object({
  autoSharePercent: z.number().int().min(0).max(100),
});

// PATCH /candidate/outreach-settings — chỉ ghi đúng 1 cột isOpenToOutreach.
export const updateOutreachSettingsSchema = z.object({
  isOpenToOutreach: z.boolean(),
});

/** Trang "Lời mời": 20 dòng mỗi lần, tối đa 50. */
export const COMPANY_INVITATIONS_PAGE_DEFAULT = 20;
export const COMPANY_INVITATIONS_PAGE_MAX = 50;

// GET /employer/outreach/invitations — query string luôn là chuỗi.
export const listCompanyInvitationsQuerySchema = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "DECLINED", "EXPIRED"]).optional(),
  jobPostId: z.string().min(1).optional(),
  mine: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  cursor: z.string().min(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(COMPANY_INVITATIONS_PAGE_MAX)
    .default(COMPANY_INVITATIONS_PAGE_DEFAULT),
});
export type ListCompanyInvitationsQuery = z.infer<typeof listCompanyInvitationsQuerySchema>;
