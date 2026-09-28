import { z } from "zod";

// POST /candidate/outreach-invitations/:id/respond
export const respondOutreachInvitationSchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE"]),
});

// PATCH /candidate/outreach-settings — chỉ ghi đúng 1 cột isOpenToOutreach.
export const updateOutreachSettingsSchema = z.object({
  isOpenToOutreach: z.boolean(),
});
