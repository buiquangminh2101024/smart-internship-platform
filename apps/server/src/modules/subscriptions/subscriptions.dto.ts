import { z } from "zod";

export const checkoutSchema = z.object({
  planId: z.string().trim().min(1, "Plan is required"),
  provider: z.enum(["VNPAY", "MOMO"]),
});

export const historyQuerySchema = z.object({
  cursor: z.string().optional(),
});

export const createSubscriptionPlanSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().min(1).optional(),
  jobPostQuota: z.number().int().positive(),
  durationDays: z.number().int().positive(),
  price: z.number().int().min(0),
});

export const updateSubscriptionPlanSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  jobPostQuota: z.number().int().positive().optional(),
  durationDays: z.number().int().positive().optional(),
  price: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
