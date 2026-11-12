import { z } from "zod";

// PATCH /employer/job-posts/:jobId/application-automation (0.4 bước 6). Y < X kiểm ở service
// vì cần X của tin; ở đây chỉ chặn ngoài khoảng 0–100.
export const updateJobApplicationAutomationSchema = z
  .object({
    autoReviewEnabled: z.boolean().optional(),
    rejectSuggestBelowScore: z.number().int().min(0).max(100).optional(),
    autoCloseInterviewedEnabled: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.autoReviewEnabled !== undefined ||
      body.rejectSuggestBelowScore !== undefined ||
      body.autoCloseInterviewedEnabled !== undefined,
    { message: "Cần gửi ít nhất một trong autoReviewEnabled, rejectSuggestBelowScore, autoCloseInterviewedEnabled." },
  );
export type UpdateJobApplicationAutomationInput = z.infer<typeof updateJobApplicationAutomationSchema>;
