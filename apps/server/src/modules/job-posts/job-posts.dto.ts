import { z } from "zod";

const JOB_POST_TYPES = ["INTERNSHIP", "PART_TIME", "FULL_TIME", "CONTRACT"] as const;
const JOB_POST_STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "EXPIRED", "CLOSED", "TAKEN_DOWN"] as const;

// Chuỗi rỗng từ form (select/textarea chưa chọn) được coi như "bỏ trống" chứ
// không phải lỗi validate — service tự quy về null khi ghi DB.
const optionalText = z.string().trim().optional();

const IMPORTANCES = ["REQUIRED", "PREFERRED"] as const;

// Số năm tối thiểu cho một kỹ năng: null/0 = không yêu cầu (service quy 0 về null).
const yearsValue = z.number().min(0).max(20).nullable();

const majorList = z
  .array(z.object({ majorId: z.string().trim().min(1), relevance: z.enum(["PRIMARY", "RELATED"]) }))
  .max(10)
  .refine((majors) => new Set(majors.map((major) => major.majorId)).size === majors.length, "Duplicate major");

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
  // Job Matcher GĐ3: số năm theo từng kỹ năng (khoá = skillId), chỉ ghi cùng skillIds.
  skillMinYears: z.record(z.string().trim().min(1), yearsValue).optional(),
  majors: majorList.optional(),
};

export const createJobPostSchema = z.object(jobPostFields);

export const updateJobPostSchema = z.object(jobPostFields).partial();

export const employerJobPostListQuerySchema = z
  .object({
    status: z.enum(JOB_POST_STATUSES).optional(),
    // "1" = chỉ tin cần chú ý (bị từ chối hoặc hết hạn trong 7 ngày) — link từ dashboard.
    attention: z.literal("1").optional(),
    q: optionalText,
    cursor: z.string().optional(),
  })
  .refine((query) => !(query.attention && query.status), {
    message: "`attention` cannot be combined with `status`",
    path: ["attention"],
  });

/** AD-29 Q2 — trần số tin của một lần chọn / thao tác hàng loạt. */
export const MODERATION_BATCH_LIMIT = 50;

// AD-29 bước 6 — lọc theo vùng chất lượng (UNSCORED = chưa có điểm) và chọn thứ tự.
const QUALITY_BAND_FILTERS = ["SUGGEST_APPROVE", "NEEDS_REVIEW", "SUGGEST_REJECT", "UNSCORED"] as const;
const MODERATION_SORTS = ["submitted_asc", "score_desc", "score_asc", "created_desc"] as const;

const moderationFilterFields = {
  status: z.enum(JOB_POST_STATUSES).optional(),
  band: z.enum(QUALITY_BAND_FILTERS).optional(),
  sort: z.enum(MODERATION_SORTS).optional(),
};

export const moderationQueueQuerySchema = z.object({
  ...moderationFilterFields,
  cursor: z.string().optional(),
});

/** GET /admin/job-posts/ids — cùng bộ lọc với hàng đợi, không phân trang. */
export const moderationIdsQuerySchema = z.object(moderationFilterFields);

// AD-29 bước 7 — lô duyệt / từ chối: 1–50 id, không trùng.
const bulkIds = z
  .array(z.string().trim().min(1))
  .min(1)
  .max(MODERATION_BATCH_LIMIT)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate job post id");

export const bulkApproveSchema = z.object({ ids: bulkIds });

export const bulkRejectSchema = z.object({
  ids: bulkIds,
  // Bỏ trống ⇒ mỗi tin dùng lý do tự sinh từ điểm chất lượng.
  reason: z.string().trim().min(1).optional(),
});

export const jobPostSearchQuerySchema = z.object({
  q: optionalText,
  companyId: optionalText,
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
  // AD-26 (D6, Q3/Q4) — bộ lọc mới, chỉ dựa trên cột đã có.
  skillMode: z.enum(["any", "all"]).default("any"),
  experience: z.enum(["none", "lt1", "1to2", "gt2"]).optional(),
  salaryKind: z.enum(["disclosed", "negotiable"]).optional(),
  // `match` và `minMatch` chỉ có tác dụng với token ứng viên; khách gửi thì service bỏ qua.
  sort: z.enum(["newest", "match"]).default("newest"),
  minMatch: z
    .literal("70")
    .transform(() => 70 as const)
    .optional(),
  cursor: z.string().optional(),
});

export const rejectJobPostSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required"),
});

// PUT /employer/job-posts/:id/requirements — Job Matcher GĐ3. Trần khớp với
// form tin (30 kỹ năng) và bộ làm sạch output AI (10 ngành/5 ngoại ngữ/15 mục khác).
export const confirmRequirementsSchema = z.object({
  skills: z
    .array(z.object({ skillId: z.string().trim().min(1), importance: z.enum(IMPORTANCES), minYears: yearsValue }))
    .max(30)
    .refine((skills) => new Set(skills.map((skill) => skill.skillId)).size === skills.length, "Duplicate skill"),
  minExperienceYears: yearsValue,
  majors: majorList,
  languages: z
    .array(
      z.object({
        language: z.string().trim().min(1).max(100),
        level: z.string().trim().max(300).nullable(),
        importance: z.enum(IMPORTANCES),
      }),
    )
    .max(5),
  other: z.array(z.string().trim().min(1).max(300)).max(15),
});

export const retractJobPostSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required"),
});
