import { z } from "zod";

// PATCH /candidate/job-alert-settings — mỗi công tắc gửi riêng được; phải có ít nhất một.
export const updateJobAlertSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    sameCityOnly: z.boolean().optional(),
  })
  .refine(
    (body) => body.enabled !== undefined || body.emailEnabled !== undefined || body.sameCityOnly !== undefined,
    "At least one setting is required",
  );
