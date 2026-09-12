import { z } from "zod";

const JOB_POST_TYPES = ["INTERNSHIP", "PART_TIME", "FULL_TIME", "CONTRACT"] as const;
const JOB_POST_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "EXPIRED", "CLOSED", "TAKEN_DOWN"] as const;

// Chuỗi rỗng từ form (select/textarea chưa chọn) được coi như "bỏ trống" chứ
// không phải lỗi validate — service tự quy về null khi ghi DB.
const optionalText = z.string().trim().optional();

const jobPostFields = {
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().min(1, "Description is required"),
  jobType: z.enum(JOB_POST_TYPES),
  industryId: optionalText,
  cityId: optionalText,
  address: optionalText,
  salaryMin: z.number().int().min(0).optional(),
  salaryMax: z.number().int().min(0).optional(),
  isNegotiable: z.boolean().optional(),
  requirements: optionalText,
  benefits: optionalText,
  expiresAt: z.string().trim().optional(),
};

export const createJobPostSchema = z.object(jobPostFields);

export const updateJobPostSchema = z.object(jobPostFields).partial();

export const employerJobPostListQuerySchema = z.object({
  status: z.enum(JOB_POST_STATUSES).optional(),
  q: optionalText,
  cursor: z.string().optional(),
});

export const moderationQueueQuerySchema = z.object({
  status: z.enum(JOB_POST_STATUSES).optional(),
  cursor: z.string().optional(),
});

export const jobPostSearchQuerySchema = z.object({
  q: optionalText,
  cityId: optionalText,
  industryId: optionalText,
  jobType: z.enum(JOB_POST_TYPES).optional(),
  // Query string luôn là chuỗi — coerce sang number để service so sánh được.
  salaryMin: z.coerce.number().int().min(0).optional(),
  cursor: z.string().optional(),
});

export const rejectJobPostSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required"),
});

export const retractJobPostSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required"),
});
