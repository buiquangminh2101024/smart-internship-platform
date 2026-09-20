import { z } from "zod";

export const candidateProfileSchema = z.object({
  headline: z.string().trim().max(255).optional(),
  bio: z.string().trim().max(2000).optional(),
  phone: z.string().trim().min(9).max(15).optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  avatarUrl: z.string().trim().url().optional(),
  cityId: z.string().trim().min(1).optional(),
});

export const candidateProfilePatchSchema = candidateProfileSchema.partial();

export const educationSchema = z.object({
  universityId: z.string().trim().min(1).optional(),
  majorId: z.string().trim().min(1).optional(),
  degree: z.string().trim().max(120).optional(),
  startYear: z.coerce.number().int().min(1900).max(2100).optional(),
  endYear: z.coerce.number().int().min(1900).max(2100).optional(),
  isCurrent: z.boolean().optional(),
  description: z.string().trim().max(1000).optional(),
});

export const educationPatchSchema = educationSchema.partial();

export const workExperienceSchema = z.object({
  company: z.string().trim().min(1).max(200),
  position: z.string().trim().min(1).max(200),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  isCurrent: z.boolean().optional(),
  description: z.string().trim().max(2000).optional(),
});

export const workExperiencePatchSchema = workExperienceSchema.partial();

export const projectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  url: z.string().trim().url().optional(),
  isWorkingOn: z.boolean().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const projectPatchSchema = projectSchema.partial();

export const certificateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  issuer: z.string().trim().max(200).optional(),
  issueDate: z.coerce.date().optional(),
  credentialUrl: z.string().trim().url().optional(),
  description: z.string().trim().max(2000).optional(),
});

export const certificatePatchSchema = certificateSchema.partial();

export const awardSchema = z.object({
  name: z.string().trim().min(1).max(200),
  issuer: z.string().trim().max(200).optional(),
  date: z.coerce.date().optional(),
  description: z.string().trim().max(2000).optional(),
});

export const awardPatchSchema = awardSchema.partial();

export const skillSchema = z.object({
  skillId: z.string().trim().min(1),
  yearsOfExperience: z.coerce.number().min(0).max(60).optional(),
});

// ─── Import từ CV (docs/06-backend/cv-ai-extraction-phase2/PLAN.md) ───────
// Payload là extractedData (Phase 1) sau khi Candidate đã lọc ở preview. Không
// siết theo đúng quy tắc các form tay (url phải có scheme, phone 9-15 ký tự...):
// dữ liệu này do AI đọc từ CV, siết quá thì cả lần import vỡ vì một field phụ.
// Field đơn lẻ chỉ được kiểm tra kỹ khi Candidate chọn ghi đè (xem service).

const optionalText = (max: number) => z.string().trim().max(max).nullish();
const partialDate = z
  .string()
  .trim()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "Ngày phải có dạng YYYY, YYYY-MM hoặc YYYY-MM-DD")
  .nullish();
const year = z.number().int().min(1900).max(2100).nullish();

export const importFromCvSchema = z.object({
  cvId: z.string().trim().min(1).optional(),
  fieldOverrides: z
    .object({
      headline: z.boolean().optional(),
      bio: z.boolean().optional(),
      phone: z.boolean().optional(),
      dateOfBirth: z.boolean().optional(),
      gender: z.boolean().optional(),
      cityId: z.boolean().optional(),
    })
    .default({}),
  extractedData: z.object({
    candidate: z.object({
      fullName: optionalText(200),
      headline: optionalText(255),
      bio: optionalText(2000),
      phone: optionalText(30),
      dateOfBirth: partialDate,
      gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullish(),
      city: optionalText(100),
    }),
    educations: z
      .array(
        z.object({
          universityName: optionalText(200),
          majorName: optionalText(200),
          degree: optionalText(120),
          startYear: year,
          endYear: year,
          isCurrent: z.boolean().default(false),
          description: optionalText(1000),
        }),
      )
      .max(20)
      .default([]),
    workExperiences: z
      .array(
        z.object({
          company: z.string().trim().max(200).default(""),
          position: z.string().trim().max(200).default(""),
          startDate: partialDate,
          endDate: partialDate,
          isCurrent: z.boolean().default(false),
          description: optionalText(2000),
        }),
      )
      .max(50)
      .default([]),
    projects: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          description: optionalText(2000),
          url: optionalText(500),
          isWorkingOn: z.boolean().default(false),
          startDate: partialDate,
          endDate: partialDate,
        }),
      )
      .max(50)
      .default([]),
    certificates: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          issuer: optionalText(200),
          issueDate: partialDate,
          credentialUrl: optionalText(500),
          description: optionalText(2000),
        }),
      )
      .max(50)
      .default([]),
    awards: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          issuer: optionalText(200),
          date: partialDate,
          description: optionalText(2000),
        }),
      )
      .max(50)
      .default([]),
    // Số năm do Candidate nhập ở preview, không phải do AI đọc. 0 = chưa khai.
    skills: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(100),
          yearsOfExperience: z.coerce.number().min(0).max(60).default(0),
        }),
      )
      .max(100)
      .default([]),
  }),
});

export type ImportFromCvInput = z.infer<typeof importFromCvSchema>;
