import { z } from "zod";
import type { ReportReason, ReportResolution, ReportStatus } from "@sip/shared-types";

export const REPORT_REASONS: [ReportReason, ...ReportReason[]] = [
  "SCAM",
  "CHARGING_FEE",
  "INAPPROPRIATE",
  "MISLEADING",
  "OTHER",
];

export const REPORT_STATUSES: [ReportStatus, ...ReportStatus[]] = [
  "PENDING",
  "RESOLVED",
];

export const REPORT_RESOLUTIONS: [ReportResolution, ...ReportResolution[]] = [
  "TAKE_DOWN",
  "DISMISS",
];

export const createJobReportSchema = z
  .object({
    reason: z.enum(REPORT_REASONS),
    description: z.string().trim().max(2000, "Mô tả tối đa 2000 ký tự").optional(),
  })
  .refine(
    (data) => data.reason !== "OTHER" || (!!data.description && data.description.trim().length >= 10),
    {
      message: "Vui lòng nhập mô tả chi tiết (tối thiểu 10 ký tự) khi chọn lý do 'Khác'",
      path: ["description"],
    },
  );

export type CreateJobReportDto = z.infer<typeof createJobReportSchema>;

export const adminJobReportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum([...REPORT_STATUSES, "ALL"]).optional().default("ALL"),
  resolution: z.enum([...REPORT_RESOLUTIONS, "ALL"]).optional().default("ALL"),
  reason: z.enum([...REPORT_REASONS, "ALL"]).optional().default("ALL"),
  q: z.string().trim().max(100).optional(),
});

export type AdminJobReportListQueryDto = z.infer<typeof adminJobReportListQuerySchema>;

export const jobReportActionSchema = z.object({
  resolution: z.enum(REPORT_RESOLUTIONS),
  adminNote: z.string().trim().max(1000, "Ghi chú admin tối đa 1000 ký tự").optional(),
  reason: z.string().trim().max(500, "Lý do xử lý tối đa 500 ký tự").optional(),
});

export type JobReportActionDto = z.infer<typeof jobReportActionSchema>;
