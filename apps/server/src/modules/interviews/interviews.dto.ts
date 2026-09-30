import { z } from "zod";
import { InterviewMode } from "@prisma/client";

// ISO 8601 có múi giờ (vd. 2026-10-02T09:00:00+07:00 hoặc ...Z) — không nhận giờ
// "trần" để server không phải đoán múi giờ của người dùng.
const isoDateTime = z.iso
  .datetime({ offset: true, message: "Thời gian phải là ISO 8601 có múi giờ" })
  .transform((value) => new Date(value));

const durationMinutes = z.number().int().min(15, "Thời lượng tối thiểu 15 phút").max(240, "Thời lượng tối đa 240 phút");
const location = z.string().trim().min(1, "Cần liên kết họp hoặc địa chỉ").max(500);
/** Chuỗi rỗng = không có ghi chú (null), để "xoá ghi chú" và "không ghi chú" là một. */
const note = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .transform((value) => (value ? value : null));

export const scheduleInterviewSchema = z.object({
  scheduledAt: isoDateTime,
  durationMinutes: durationMinutes.default(45),
  mode: z.nativeEnum(InterviewMode),
  location,
  note: note.optional(),
});
export type ScheduleInterviewDto = z.infer<typeof scheduleInterviewSchema>;

export const rescheduleInterviewSchema = z
  .object({
    scheduledAt: isoDateTime.optional(),
    durationMinutes: durationMinutes.optional(),
    mode: z.nativeEnum(InterviewMode).optional(),
    location: location.optional(),
    note: note.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Cần ít nhất một trường để đổi lịch",
  });
export type RescheduleInterviewDto = z.infer<typeof rescheduleInterviewSchema>;

export const cancelInterviewSchema = z.object({
  reason: z.string().trim().min(1, "Cần nhập lý do huỷ").max(500),
});
export type CancelInterviewDto = z.infer<typeof cancelInterviewSchema>;

/** D12 — tối đa 20 hồ sơ mỗi lô. */
export const BATCH_MAX_APPLICATIONS = 20;

export const batchScheduleInterviewsSchema = z.object({
  applicationIds: z
    .array(z.string().min(1))
    .min(1, "Cần chọn ít nhất một hồ sơ")
    .max(BATCH_MAX_APPLICATIONS, `Tối đa ${BATCH_MAX_APPLICATIONS} hồ sơ mỗi lần`)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Danh sách hồ sơ bị trùng" }),
  arrangement: z.enum(["SEQUENTIAL", "GROUP"]),
  startAt: isoDateTime,
  durationMinutes: durationMinutes.default(45),
  gapMinutes: z.number().int().min(0).max(120).default(0),
  mode: z.nativeEnum(InterviewMode),
  location,
  note: note.optional(),
});
export type BatchScheduleInterviewsDto = z.infer<typeof batchScheduleInterviewsSchema>;

// Query string luôn là chuỗi.
export const listEmployerInterviewsQuerySchema = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  includeCancelled: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});
export type ListEmployerInterviewsQuery = z.infer<typeof listEmployerInterviewsQuerySchema>;

export const listAwaitingScheduleQuerySchema = z.object({
  jobPostId: z.string().min(1).optional(),
});
export type ListAwaitingScheduleQuery = z.infer<typeof listAwaitingScheduleQuerySchema>;
