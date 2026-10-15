import { z } from "zod";

// POST /candidate/outreach-invitations/:id/respond
export const respondOutreachInvitationSchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE"]),
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
