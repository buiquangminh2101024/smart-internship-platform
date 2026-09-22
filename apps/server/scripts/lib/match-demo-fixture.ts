// Kiểu + bộ kiểm cho fixture dữ liệu demo của bộ đánh giá Job Matcher GĐ2
// (docs/06-backend/job-matcher-phase2/PLAN.md, bước 5). Fixture do LLM sinh nên
// KHÔNG tin đầu vào: mọi tham chiếu (kỹ năng, ngành học, ref, cặp cần gán nhãn)
// được đối chiếu với catalog thật trước khi seed chạm DB. Hàm thuần — không đọc DB,
// không đọc file — để test được.
import { z } from "zod";
import { normalizeSkillName } from "../../src/modules/skills/skill-normalize.util";

export const DEMO_EMAIL_DOMAIN = "match-demo.local";
export const DEMO_EMPLOYER_EMAIL = `employer@${DEMO_EMAIL_DOMAIN}`;
export const DEMO_COMPANY_NAME = "Công ty Demo Job Matcher";

/** Ca khó có chủ đích (PLAN mục "Bộ đánh giá"). Không phải nhãn — chỉ ghi kiểu đặc điểm để phân tích lỗi. */
export const HARD_CASES = [
  "irrelevant-experience", // WorkExperience toàn việc không liên quan nhưng đủ năm (hạn chế D2)
  "abbreviated-jd", //        tin viết tắt/không chuẩn
  "adjacent-field", //        gần lĩnh vực (CNTT ↔ Khoa học máy tính…)
  "synonym-skill", //         kỹ năng trùng nghĩa nhưng khác skillId
  "keyword-stuffing", //      liệt kê rất nhiều kỹ năng, thiếu chiều sâu
  "sparse-profile", //        hồ sơ rất ít thông tin
  "career-switch", //         đổi ngành
] as const;
export type HardCase = (typeof HARD_CASES)[number];
/** Bốn kiểu PLAN bắt buộc phải có mặt; ba kiểu còn lại là gợi ý thêm. */
export const REQUIRED_HARD_CASES: readonly HardCase[] = HARD_CASES.slice(0, 4);

export const PAIR_CATEGORIES = ["same-domain", "adjacent", "cross-domain", "hard-case"] as const;

const LIMITS = {
  candidates: { min: 12, max: 24 },
  jobs: { min: 6, max: 12 },
  pairs: { min: 30, max: 80 },
  pairsPerJob: 4,
  jobsPerSplit: 2,
  // Ngưỡng cắt của match-text.builder — vượt thì vẫn seed được nhưng phần đuôi không vào embedding.
  bio: 300,
  jobRequirements: 400,
  jobDescription: 300,
} as const;

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "cần dạng YYYY-MM");
const text = (max: number) => z.string().trim().min(1).max(max);
const year = z.number().int().min(1990).max(2040);

const candidateSchema = z.strictObject({
  ref: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "ref chỉ gồm chữ thường, số, gạch nối"),
  headline: text(200),
  bio: text(1000),
  hardCase: z.enum(HARD_CASES).optional(),
  skills: z.array(z.strictObject({ name: text(60), yearsOfExperience: z.number().min(0).max(10) })),
  educations: z.array(
    z.strictObject({
      majorName: text(200),
      degree: text(60),
      startYear: year,
      endYear: year.nullable(),
      isCurrent: z.boolean(),
    }),
  ),
  workExperiences: z.array(
    z.strictObject({
      company: text(120),
      position: text(120),
      start: yearMonth,
      end: yearMonth.nullable(),
      isCurrent: z.boolean(),
      description: text(500),
    }),
  ),
  projects: z.array(
    z.strictObject({ name: text(120), description: text(500), start: yearMonth, end: yearMonth.nullable() }),
  ),
});

const jobSchema = z.strictObject({
  title: text(200),
  description: text(2000),
  requirements: text(2000),
  minExperienceYears: z.number().min(0).max(10).nullable(),
  hardCase: z.enum(HARD_CASES).optional(),
  split: z.enum(["dev", "test"]),
  skills: z.array(z.strictObject({ name: text(60), importance: z.enum(["REQUIRED", "PREFERRED"]) })),
});

export const matchDemoFixtureSchema = z.strictObject({
  extraSkills: z.array(text(60)),
  jobs: z.array(jobSchema),
  candidates: z.array(candidateSchema),
  pairsToLabel: z.array(
    z.strictObject({ candidateRef: text(80), jobTitle: text(200), category: z.enum(PAIR_CATEGORIES) }),
  ),
});

export type MatchDemoFixture = z.infer<typeof matchDemoFixtureSchema>;
export type DemoCandidate = MatchDemoFixture["candidates"][number];
export type DemoJob = MatchDemoFixture["jobs"][number];

export interface DemoCatalog {
  /** Tên kỹ năng APPROVED sẵn có (không tính những kỹ năng do chính seed demo tạo). */
  skills: string[];
  majors: string[];
}

export interface FixtureValidation {
  fixture: MatchDemoFixture | null;
  errors: string[];
  warnings: string[];
}

const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_LIKE = /(?<!\d)(?:\+84|0)\d{9,10}(?!\d)|(?<!\d)0\d{2,3}[ .-]\d{3}[ .-]\d{3,4}(?!\d)/;

export function validateMatchDemoFixture(raw: unknown, catalog: DemoCatalog): FixtureValidation {
  const parsed = matchDemoFixtureSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(gốc)"}: ${issue.message}`);
    return { fixture: null, errors, warnings: [] };
  }
  const fixture = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- kỹ năng: đúng tên catalog hoặc extraSkills, extraSkills không trùng catalog ---
  const catalogByKey = new Map(catalog.skills.map((name) => [normalizeSkillName(name), name]));
  const extraByKey = new Map<string, string>();
  for (const name of fixture.extraSkills) {
    const key = normalizeSkillName(name);
    if (!key) errors.push(`extraSkills: "${name}" không có chữ nào`);
    else if (catalogByKey.has(key)) errors.push(`extraSkills: "${name}" trùng kỹ năng đã có trong catalog ("${catalogByKey.get(key)}") — bỏ khỏi extraSkills và dùng tên catalog`);
    else if (extraByKey.has(key)) errors.push(`extraSkills: "${name}" bị lặp`);
    else extraByKey.set(key, name);
  }
  const knownSkills = new Set([...catalog.skills, ...extraByKey.values()]);
  const checkSkill = (where: string, name: string) => {
    if (knownSkills.has(name)) return;
    const near = catalogByKey.get(normalizeSkillName(name)) ?? extraByKey.get(normalizeSkillName(name));
    errors.push(
      near
        ? `${where}: kỹ năng "${name}" gần giống "${near}" — phải dùng đúng từng ký tự`
        : `${where}: kỹ năng "${name}" không có trong catalog hoặc extraSkills`,
    );
  };
  const majors = new Set(catalog.majors);

  // --- ref / tiêu đề duy nhất ---
  const candidateRefs = new Set<string>();
  for (const candidate of fixture.candidates) {
    if (candidateRefs.has(candidate.ref)) errors.push(`candidates: ref "${candidate.ref}" bị lặp`);
    candidateRefs.add(candidate.ref);
  }
  const jobTitles = new Set<string>();
  for (const job of fixture.jobs) {
    if (jobTitles.has(job.title)) errors.push(`jobs: tiêu đề "${job.title}" bị lặp (tiêu đề là khoá tham chiếu của tin)`);
    jobTitles.add(job.title);
  }

  // --- từng hồ sơ ---
  for (const candidate of fixture.candidates) {
    const where = `candidates[${candidate.ref}]`;
    if (candidate.skills.length === 0) errors.push(`${where}: phải có ít nhất 1 kỹ năng (không có thì luôn INSUFFICIENT_PROFILE, không đo được gì)`);
    dedupe(candidate.skills.map((s) => s.name), (name) => errors.push(`${where}: kỹ năng "${name}" bị lặp`));
    for (const skill of candidate.skills) checkSkill(where, skill.name);
    for (const education of candidate.educations) {
      if (!majors.has(education.majorName)) errors.push(`${where}: ngành "${education.majorName}" không có trong catalog Major (APPROVED) — dùng đúng tên trong prompt`);
      if (education.endYear !== null && education.endYear < education.startYear) errors.push(`${where}: học vấn "${education.majorName}" có endYear < startYear`);
    }
    for (const experience of candidate.workExperiences) {
      if (experience.isCurrent && experience.end !== null) errors.push(`${where}: "${experience.position}" isCurrent=true thì end phải null`);
      if (!experience.isCurrent && experience.end === null) errors.push(`${where}: "${experience.position}" đã kết thúc nhưng end là null`);
      if (experience.end !== null && experience.end < experience.start) errors.push(`${where}: "${experience.position}" có end < start`);
    }
    for (const project of candidate.projects) {
      if (project.end !== null && project.end < project.start) errors.push(`${where}: dự án "${project.name}" có end < start`);
    }
    if (Array.from(candidate.bio).length > LIMITS.bio) warnings.push(`${where}: bio dài quá ${LIMITS.bio} ký tự — phần đuôi không vào embedding`);
  }

  // --- từng tin ---
  for (const job of fixture.jobs) {
    const where = `jobs[${job.title}]`;
    if (!job.skills.some((s) => s.importance === "REQUIRED")) errors.push(`${where}: phải có ít nhất 1 kỹ năng REQUIRED`);
    dedupe(job.skills.map((s) => s.name), (name) => errors.push(`${where}: kỹ năng "${name}" bị lặp`));
    for (const skill of job.skills) checkSkill(where, skill.name);
    if (Array.from(job.requirements).length > LIMITS.jobRequirements) warnings.push(`${where}: requirements dài quá ${LIMITS.jobRequirements} ký tự — phần đuôi không vào embedding`);
    if (Array.from(job.description).length > LIMITS.jobDescription) warnings.push(`${where}: description dài quá ${LIMITS.jobDescription} ký tự — phần đuôi không vào embedding`);
  }

  // --- không chứa thông tin liên lạc thật ---
  const freeTexts: [string, string][] = [];
  for (const c of fixture.candidates) {
    freeTexts.push([`candidates[${c.ref}].headline`, c.headline], [`candidates[${c.ref}].bio`, c.bio]);
    for (const w of c.workExperiences) freeTexts.push([`candidates[${c.ref}].work`, `${w.company} ${w.position} ${w.description}`]);
    for (const p of c.projects) freeTexts.push([`candidates[${c.ref}].project`, `${p.name} ${p.description}`]);
  }
  for (const j of fixture.jobs) freeTexts.push([`jobs[${j.title}]`, `${j.title} ${j.description} ${j.requirements}`]);
  for (const [where, value] of freeTexts) {
    if (EMAIL_LIKE.test(value)) errors.push(`${where}: có vẻ chứa địa chỉ email — dữ liệu demo không được chứa`);
    if (PHONE_LIKE.test(value)) errors.push(`${where}: có vẻ chứa số điện thoại — dữ liệu demo không được chứa`);
  }

  // --- quy mô ---
  if (fixture.candidates.length < LIMITS.candidates.min || fixture.candidates.length > LIMITS.candidates.max)
    errors.push(`Số hồ sơ ${fixture.candidates.length} ngoài khoảng ${LIMITS.candidates.min}–${LIMITS.candidates.max}`);
  if (fixture.jobs.length < LIMITS.jobs.min || fixture.jobs.length > LIMITS.jobs.max)
    errors.push(`Số tin ${fixture.jobs.length} ngoài khoảng ${LIMITS.jobs.min}–${LIMITS.jobs.max}`);

  // --- ca khó ---
  const present = new Set<HardCase>([...fixture.candidates, ...fixture.jobs].flatMap((item) => (item.hardCase ? [item.hardCase] : [])));
  for (const kind of REQUIRED_HARD_CASES) if (!present.has(kind)) errors.push(`Thiếu ca khó bắt buộc "${kind}" (không hồ sơ/tin nào có hardCase này)`);

  // --- chia dev/test: theo TIN (mọi cặp của một tin cùng tập) để NDCG@3 theo tin tính được và không rò rỉ ---
  for (const split of ["dev", "test"] as const) {
    const count = fixture.jobs.filter((job) => job.split === split).length;
    if (count < LIMITS.jobsPerSplit) errors.push(`Tập ${split} chỉ có ${count} tin, cần ≥ ${LIMITS.jobsPerSplit}`);
  }

  // --- cặp cần gán nhãn ---
  const seenPairs = new Set<string>();
  const perJob = new Map<string, number>();
  fixture.pairsToLabel.forEach((pair, index) => {
    const where = `pairsToLabel[${index}]`;
    if (!candidateRefs.has(pair.candidateRef)) errors.push(`${where}: candidateRef "${pair.candidateRef}" không có trong candidates`);
    if (!jobTitles.has(pair.jobTitle)) errors.push(`${where}: jobTitle "${pair.jobTitle}" không có trong jobs`);
    const key = `${pair.candidateRef}\u0000${pair.jobTitle}`;
    if (seenPairs.has(key)) errors.push(`${where}: cặp (${pair.candidateRef}, ${pair.jobTitle}) bị lặp`);
    seenPairs.add(key);
    perJob.set(pair.jobTitle, (perJob.get(pair.jobTitle) ?? 0) + 1);
  });
  const pairCount = fixture.pairsToLabel.length;
  if (pairCount < LIMITS.pairs.min || pairCount > LIMITS.pairs.max)
    errors.push(`Số cặp cần gán nhãn ${pairCount} ngoài khoảng ${LIMITS.pairs.min}–${LIMITS.pairs.max}`);
  for (const job of fixture.jobs) {
    const count = perJob.get(job.title) ?? 0;
    if (count < LIMITS.pairsPerJob) errors.push(`jobs[${job.title}]: chỉ ${count} cặp, cần ≥ ${LIMITS.pairsPerJob} (NDCG@3 theo tin cần ≥ 3 ứng viên có nhãn)`);
  }
  const paired = new Set(fixture.pairsToLabel.map((pair) => pair.candidateRef));
  for (const ref of candidateRefs) if (!paired.has(ref)) warnings.push(`candidates[${ref}]: không nằm trong cặp nào — hồ sơ thừa`);

  return { fixture: errors.length === 0 ? fixture : null, errors, warnings };
}

function dedupe(values: string[], onDuplicate: (value: string) => void) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) onDuplicate(value);
    seen.add(value);
  }
}

/** "2024-06" → 1/6/2024 UTC. Đầu vào đã qua validate nên không kiểm lại. */
export function parseYearMonth(value: string): Date {
  const [y, m] = value.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1));
}

/** Chia dev/test của cặp theo tin — nguồn duy nhất là `job.split` trong fixture. */
export function splitOfPair(fixture: MatchDemoFixture, jobTitle: string): "dev" | "test" {
  const job = fixture.jobs.find((item) => item.title === jobTitle);
  if (!job) throw new Error(`Không thấy tin "${jobTitle}"`);
  return job.split;
}
