// Yêu cầu có cấu trúc "Employer đã xác nhận" cho các tin demo — đầu vào cấu hình GĐ3 của
// bộ đánh giá (docs/06-backend/job-matcher-phase3/PLAN.md, bước 7). Để RIÊNG khỏi
// match-demo.json / labels.json (dữ liệu GĐ2 đã chốt, không sửa) và chỉ áp trong bộ nhớ lúc
// đánh giá — không ghi DB. Hàm thuần để test được.
import { z } from "zod";
import type { JobMatchProfile } from "../../src/shared/ports/JobMatcher";

const MAX_MAJORS_PER_JOB = 10; // khớp trần của PUT /employer/job-posts/:id/requirements

const confirmedJobSchema = z.strictObject({
  jobTitle: z.string().trim().min(1),
  /** Câu trong `requirements` của tin làm căn cứ — để người đọc đối chiếu. */
  evidence: z.string().trim().min(1),
  majors: z
    .array(z.strictObject({ name: z.string().trim().min(1), relevance: z.enum(["PRIMARY", "RELATED"]) }))
    .max(MAX_MAJORS_PER_JOB),
  /** Số năm theo tên kỹ năng của tin; chỉ ghi khi văn bản tin nêu số cụ thể. */
  skillMinYears: z.record(z.string(), z.number().positive().max(20)),
});

export const confirmedRequirementsSchema = z.strictObject({
  description: z.string(),
  jobs: z.array(confirmedJobSchema),
});

export type ConfirmedRequirements = z.infer<typeof confirmedRequirementsSchema>;
export type ConfirmedJob = ConfirmedRequirements["jobs"][number];

export interface ConfirmedValidation {
  data: ConfirmedRequirements | null;
  errors: string[];
}

/**
 * Kiểm cú pháp + tham chiếu: tin phải có trong fixture, ngành phải đúng tên một Major APPROVED,
 * kỹ năng trong `skillMinYears` phải là kỹ năng của chính tin đó.
 */
export function validateConfirmedRequirements(
  raw: unknown,
  known: { jobs: { title: string; skills: string[] }[]; majors: string[] },
): ConfirmedValidation {
  const parsed = confirmedRequirementsSchema.safeParse(raw);
  if (!parsed.success) {
    return { data: null, errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(gốc)"}: ${issue.message}`) };
  }
  const errors: string[] = [];
  const jobs = new Map(known.jobs.map((job) => [job.title, new Set(job.skills)]));
  const majors = new Set(known.majors);
  const seenJobs = new Set<string>();
  for (const job of parsed.data.jobs) {
    const where = `jobs[${job.jobTitle}]`;
    if (seenJobs.has(job.jobTitle)) errors.push(`${where}: tin bị lặp`);
    seenJobs.add(job.jobTitle);
    const skills = jobs.get(job.jobTitle);
    if (!skills) {
      errors.push(`${where}: không có tin này trong fixture demo`);
      continue;
    }
    const seenMajors = new Set<string>();
    for (const major of job.majors) {
      if (seenMajors.has(major.name)) errors.push(`${where}: ngành "${major.name}" bị lặp`);
      seenMajors.add(major.name);
      if (!majors.has(major.name)) errors.push(`${where}: ngành "${major.name}" không có trong catalog Major (APPROVED)`);
    }
    for (const name of Object.keys(job.skillMinYears)) {
      if (!skills.has(name)) errors.push(`${where}: kỹ năng "${name}" không thuộc tin này`);
    }
  }
  return { data: errors.length === 0 ? parsed.data : null, errors };
}

/** Hồ sơ tin đúng như GĐ2 thấy: chưa có ngành, chưa có số năm theo kỹ năng. */
export function withoutPhase3Requirements(job: JobMatchProfile): JobMatchProfile {
  return { ...job, majors: [], skills: job.skills.map((skill) => ({ ...skill, minYears: null })) };
}

/**
 * Áp phần xác nhận lên hồ sơ tin (thay toàn bộ ngành + số năm — cùng ngữ nghĩa "đồng bộ toàn bộ
 * tập" của PUT requirements). Tin không có trong danh sách giữ nguyên dạng GĐ2.
 */
export function applyConfirmedRequirements(
  job: JobMatchProfile,
  confirmed: ConfirmedJob | undefined,
  majorIdByName: Map<string, string>,
): JobMatchProfile {
  const base = withoutPhase3Requirements(job);
  if (!confirmed) return base;
  return {
    ...base,
    skills: base.skills.map((skill) => ({ ...skill, minYears: confirmed.skillMinYears[skill.name] ?? null })),
    majors: confirmed.majors.map((major) => {
      const majorId = majorIdByName.get(major.name);
      if (!majorId) throw new Error(`Thiếu id của ngành "${major.name}"`);
      return { majorId, name: major.name, relevance: major.relevance };
    }),
  };
}
