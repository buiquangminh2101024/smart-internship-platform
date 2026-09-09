import { z } from "zod";

export const listCompaniesQuerySchema = z.object({
  status: z.enum(["PENDING", "VERIFIED", "REJECTED"]).optional(),
  cursor: z.string().optional(),
});

export const rejectCompanySchema = z.object({
  reason: z.string().trim().min(1, "Reason is required"),
});

export const setRequiresApprovalSchema = z.object({
  requiresApproval: z.boolean(),
});
