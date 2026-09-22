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
  // Ghi đè toàn bộ danh sách kỹ năng của tin khi có mặt. Trần 30 để một tin
  // không gắn cả trăm tag làm nhiễu phần matching sau này (Phase 11).
  skillIds: z.array(z.string().trim().min(1)).max(30).optional(),
  // Kỹ năng ưu tiên — chỉ được ghi cùng skillIds (một khối), xem
  // docs/06-backend/job-matcher-phase1/PLAN.md quyết định #6.
  preferredSkillIds: z.array(z.string().trim().min(1)).max(30).optional(),
  // null = xoá yêu cầu; 0 cũng được coi là "không yêu cầu".
  minExperienceYears: z.number().min(0).max(20).nullable().optional(),
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
  // Express cho ra string khi có 1 giá trị và string[] khi lặp `?skillIds=`
  // nhiều lần — quy cả hai (và dạng "a,b,c") về mảng để service chỉ xử lý 1 kiểu.
  skillIds: z
    .preprocess((value) => {
      if (value === undefined || value === "") return undefined;
      const list = Array.isArray(value) ? value : String(value).split(",");
      return list.map((item) => String(item).trim()).filter(Boolean);
    }, z.array(z.string().min(1)).max(10))
    .optional(),
  cursor: z.string().optional(),
});

export const rejectJobPostSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required"),
});

export const retractJobPostSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required"),
});
