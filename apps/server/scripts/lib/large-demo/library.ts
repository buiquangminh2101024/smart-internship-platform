// Kiểu + bộ kiểm cho thư viện dữ liệu demo lớn (docs/06-backend/large-demo-data/PLAN.md,
// bước 1). Thư viện do LLM viết nên KHÔNG tin đầu vào: mọi tham chiếu (kỹ năng, ngành
// học, ngành nghề, khoá vị trí) được đối chiếu với danh mục thật trước khi seed chạm DB.
// Hàm thuần — không đọc DB, không đọc file — để test được.
//
// Đã có: `positions.json`, `catalog-additions.json` (đợt 1), `names.json`,
// `companies.json` (đợt 2), `job-templates.json` (đợt 3), `personas.json` (đợt 4, viết
// dần theo lĩnh vực), `showcase.json` (tài khoản demo, tin chính, hồ sơ trưng bày).
import { z } from "zod";
import { normalizeSkillName } from "../../../src/modules/skills/skill-normalize.util";
import { skillSimilarity } from "../../../src/modules/skills/skill-token-match.util";

/** Ngưỡng của skill-dedupe.service.ts: ≥ 0,85 là người dùng gõ tên này sẽ tự khớp sang mục kia. */
const AUTO_MATCH_THRESHOLD = 0.85;
const GRAY_ZONE_THRESHOLD = 0.6;

export const DOMAINS = {
  "cntt": "Công nghệ thông tin",
  "thiet-ke": "Thiết kế",
  "marketing": "Marketing - Truyền thông",
  "tai-chinh": "Tài chính - Kế toán",
  "nhan-su": "Nhân sự",
  "logistics": "Logistics - Chuỗi cung ứng",
  "kinh-doanh": "Kinh doanh - Chăm sóc khách hàng",
  "du-lich": "Du lịch - Khách sạn",
  "giao-duc": "Giáo dục",
  "ky-thuat": "Kỹ thuật - Sản xuất",
} as const;
export type Domain = keyof typeof DOMAINS;

export const JOB_TYPES = ["INTERNSHIP", "PART_TIME", "FULL_TIME", "CONTRACT"] as const;

const key = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "khoá chỉ gồm chữ thường không dấu, số, gạch nối");
const text = (max: number) => z.string().trim().min(1).max(max);
const range = (min: number, max: number) =>
  z.tuple([z.number().min(min).max(max), z.number().min(min).max(max)]).refine(([low, high]) => low <= high, "cần [nhỏ, lớn]");
const salaryRange = range(1_000_000, 100_000_000);

const levelSchema = z.strictObject({
  key,
  label: text(120),
  /** Năm học hiện tại; null = đã tốt nghiệp. */
  studyYear: z.number().int().min(1).max(5).nullable(),
  /** Số năm kinh nghiệm thực tế (đi làm, thực tập) của người ở cấp độ này. */
  experienceYears: range(0, 5),
  birthYears: range(1995, 2008),
  /** Loại hình tin mà người ở cấp độ này hay nộp, theo thứ tự ưu tiên. */
  jobTypes: z.array(z.enum(JOB_TYPES)).min(1),
});

const positionSchema = z.strictObject({
  key,
  name: text(120),
  domain: z.enum(Object.keys(DOMAINS) as [Domain, ...Domain[]]),
  /** Ngành nghề (Industry) của công ty hay tuyển vị trí này; mục đầu là chính. */
  industries: z.array(text(80)).min(1),
  majors: z.strictObject({
    /** Ngành học đúng chuyên môn → JobPostMajor PRIMARY, ứng viên "rất hợp". */
    primary: z.array(text(200)).min(2),
    /** Ngành học gần → JobPostMajor RELATED, ứng viên "ngành gần". */
    related: z.array(text(200)).min(1),
  }),
  skills: z.strictObject({
    /** Kỹ năng lõi: tin lấy phần lớn kỹ năng bắt buộc từ đây. */
    core: z.array(text(60)).min(3).max(5),
    /** Kỹ năng phụ: kỹ năng nên có của tin, kỹ năng thêm của ứng viên. */
    extra: z.array(text(60)).min(4).max(10),
  }),
  salaryBand: key,
  /** Vị trí gần (dùng cho ứng viên "đổi ngành" / "hợp một phần"). */
  adjacent: z.array(key),
});

export const positionsFileSchema = z.strictObject({
  levels: z.array(levelSchema).length(3),
  salaryBands: z.record(key, z.strictObject({
    INTERNSHIP: salaryRange,
    PART_TIME: salaryRange,
    FULL_TIME: salaryRange,
    CONTRACT: salaryRange,
  })),
  /** Kỹ năng mềm rải thêm cho mọi lĩnh vực. */
  softSkills: z.array(text(60)).min(3),
  positions: z.array(positionSchema).min(25).max(40),
});

export const catalogAdditionsSchema = z.strictObject({
  /** Kỹ năng thêm vào danh mục (APPROVED, có embedding) — Q1. */
  skills: z.array(text(60)),
  /** Ngành nghề (Industry) thêm — Q2. */
  industries: z.array(text(80)),
  /** Thành phố thêm — Q2. */
  cities: z.array(text(80)),
});

const nameList = z.array(text(20)).min(10);

export const namesFileSchema = z.strictObject({
  /** Họ kèm trọng số (tỉ lệ xuất hiện tương đối, gần phân bố thật). */
  familyNames: z.array(z.strictObject({ name: text(20), weight: z.number().positive() })).min(10),
  middleNames: z.strictObject({ MALE: nameList, FEMALE: nameList }),
  givenNames: z.strictObject({ MALE: nameList, FEMALE: nameList }),
});

const companySchema = z.strictObject({
  key,
  name: text(150),
  /** Ngành nghề (Industry) chính của công ty. */
  industry: text(80),
  companyType: text(80),
  city: text(80),
  /** Chỉ số nhà + tên đường; thành phố lấy từ `city`. */
  address: text(200),
  description: text(500),
  foundedYear: z.number().int().min(1990).max(2025),
  /** Số tài khoản nhà tuyển dụng (1 người là `isCompanyAdmin`). */
  employerCount: z.number().int().min(1).max(3),
  /** Khoá vị trí công ty này tuyển — tin của công ty chỉ sinh từ các vị trí này. */
  positions: z.array(key).min(1),
  /** Thành phố có chi nhánh (~10% tin của công ty đặt ở đây). */
  branchCities: z.array(text(80)),
  /** Công ty dùng cho kịch bản demo (PLAN "Tài khoản dùng khi demo"). */
  demoRole: z.enum(["main", "secondary"]).optional(),
});

export const companiesFileSchema = z.strictObject({
  /** Chức danh của tài khoản nhà tuyển dụng (Employer.title). */
  employerTitles: z.array(text(80)).min(4),
  companies: z.array(companySchema).min(30).max(50),
});

const jobVariantSchema = z.strictObject({
  description: text(300),
  /** Phần chuyên môn; bộ sinh ghép SAU một câu `audiences` (≤ 130) → tổng ≤ 391 < ngưỡng 400 của match-text.builder. */
  requirements: text(260),
  /** Kỹ năng của tin sinh từ biến thể này — văn bản chỉ nhắc kỹ năng có ở đây. */
  skills: z.strictObject({
    required: z.array(text(60)).min(2).max(4),
    preferred: z.array(text(60)).min(1).max(4),
  }).refine((s) => s.required.length + s.preferred.length <= 7, "tổng kỹ năng tối đa 7 (PLAN \"Tin tuyển dụng\")"),
});

const jobTemplateSchema = z.strictObject({
  position: key,
  /** Tiêu đề theo loại hình; bộ sinh ghép ngẫu nhiên với biến thể nên tiêu đề chỉ nhắc kỹ năng mọi biến thể đều có. */
  titles: z.strictObject({
    INTERNSHIP: z.array(text(120)).min(2),
    PART_TIME: z.array(text(120)).min(1),
    FULL_TIME: z.array(text(120)).min(2),
    CONTRACT: z.array(text(120)).min(1),
  }),
  /** Quyền lợi riêng của vị trí, ghép thêm vào quyền lợi chung. */
  benefits: z.array(text(150)).max(3),
  variants: z.array(jobVariantSchema).min(3).max(4),
});

export const jobTemplatesFileSchema = z.strictObject({
  /** Câu mở đầu phần yêu cầu theo đối tượng: `student` cho INTERNSHIP / PART_TIME, `graduate` cho FULL_TIME / CONTRACT. */
  audiences: z.strictObject({ student: z.array(text(130)).min(3), graduate: z.array(text(130)).min(3) }),
  /** Quyền lợi chung, bộ sinh chọn 3–4 dòng theo cùng cách chia đối tượng. */
  benefits: z.strictObject({ student: z.array(text(150)).min(6), graduate: z.array(text(150)).min(6) }),
  templates: z.array(jobTemplateSchema),
});

const personaSchema = z.strictObject({
  /** Khoá duy nhất toàn file, showcase.json có thể tham chiếu. */
  key,
  /** Khoá cấp độ trong positions.json `levels`. */
  level: key,
  /** `career-switch`: người đổi ngành, học ngành `fromMajors` (ngoài nhóm ngành của vị trí). */
  kind: z.enum(["standard", "career-switch"]),
  fromMajors: z.array(text(200)).min(1).optional(),
  headline: text(100),
  /** Bộ sinh ghép thêm một câu `bioTails` (≤ 80) phía sau → tổng ≤ 291 < ngưỡng 300 của match-text.builder. */
  bio: text(210),
  /** Kỹ năng của người theo bộ này; bộ sinh đặt số năm theo cấp độ, bớt / thêm theo nhóm ứng viên. */
  skills: z.array(text(60)).min(4).max(10),
  experiences: z.array(z.strictObject({
    position: text(80),
    /** Độ dài (tháng); bộ sinh chọn trong khoảng rồi đặt ngày bắt đầu / kết thúc. */
    months: z.tuple([z.number().int().min(1).max(36), z.number().int().min(1).max(36)]).refine(([low, high]) => low <= high, "cần [nhỏ, lớn]"),
    description: text(300),
  })).max(2),
  projects: z.array(z.strictObject({ name: text(80), description: text(300) })).min(1).max(3),
});

const personaGroupSchema = z.strictObject({
  position: key,
  /** Chứng chỉ ~30% ứng viên của vị trí có (bộ sinh chọn 1). */
  certificates: z.array(z.strictObject({ name: text(120), issuer: text(120) })).min(1).max(4),
  personas: z.array(personaSchema).min(12),
});

export const personasFileSchema = z.strictObject({
  /** Câu riêng ghép cuối giới thiệu để vector embedding của người cùng bộ không trùng nhau. Không nhắc kỹ năng. */
  bioTails: z.array(text(80)).min(30),
  /** Việc làm thêm không liên quan nghề, cho ca khó "kinh nghiệm không liên quan nhưng đủ năm". */
  unrelatedJobs: z.array(z.strictObject({ position: text(80), description: text(200) })).min(8),
  /** Tên công ty cũ (hư cấu) theo lĩnh vực, cho WorkExperience.company — không vào embedding. */
  pastCompanies: z.record(key, z.array(text(100)).min(5)),
  groups: z.array(personaGroupSchema),
});

/**
 * Nhóm hồ sơ trưng bày theo mức hợp với tin chính (PLAN "Ứng viên"), để "Tìm ứng viên
 * phù hợp" của mỗi tin có điểm trải từ cao tới thấp.
 */
export const SHOWCASE_TIERS = ["rat-hop", "hop-mot-phan", "nganh-gan", "doi-nganh", "so-sai", "ca-kho"] as const;
export const SHOWCASE_HARD_CASES = ["nhoi-tu-khoa", "kinh-nghiem-khong-lien-quan"] as const;

/** "YYYY-MM". */
const yearMonth = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/, "cần dạng YYYY-MM");

const showcaseEmployerSchema = z.strictObject({
  /** Phần trước @ của email; bộ sinh ghép domain demo. */
  key,
  /** Công ty có `demoRole` trong companies.json; tài khoản này thay tài khoản isCompanyAdmin của công ty. */
  company: key,
  title: text(80),
});

const showcaseJobSchema = z.strictObject({
  key,
  /** Khoá trong `employers` — tin đăng bởi nhà tuyển dụng này, của công ty người đó. */
  employer: key,
  position: key,
  jobType: z.enum(JOB_TYPES),
  /** Một trong `titles[jobType]` của mẫu tin. */
  title: text(120),
  /** Chỉ số biến thể trong job-templates.json: lấy mô tả, yêu cầu, kỹ năng của biến thể đó. */
  variant: z.number().int().min(0),
  /** Tập con ngành học của vị trí. */
  majors: z.strictObject({ primary: z.array(text(200)).min(1).max(2), related: z.array(text(200)).max(3) }),
  minExperienceYears: z.number().min(0.5).max(3).nullable(),
  /** `minYears` của kỹ năng tin (kỹ năng phải có trong biến thể). */
  skillMinYears: z.record(text(60), z.number().min(0.5).max(3)).optional(),
  /** VND/tháng; null = thoả thuận. */
  salary: salaryRange.nullable(),
  /** "Việc làm phù hợp" chỉ xét tin đăng trong 30 ngày (H3). */
  publishedDaysAgo: z.number().int().min(0).max(29),
  expiresInDays: z.number().int().min(14).max(85),
});

const showcaseCandidateSchema = z.strictObject({
  /** Phần trước @ của email; duy nhất trong cả file (kể cả `employers`). */
  key,
  /** Tin chính mà hồ sơ này được viết để xếp vào "Tìm ứng viên phù hợp". */
  job: key,
  tier: z.enum(SHOWCASE_TIERS),
  /** Chỉ cho tier `ca-kho`. */
  hardCase: z.enum(SHOWCASE_HARD_CASES).optional(),
  level: key,
  /** Tài khoản ứng viên dùng để đăng nhập khi demo ("Việc làm phù hợp" đủ 10 tin). */
  demoLogin: z.boolean().optional(),
  fullName: text(60),
  gender: z.enum(["MALE", "FEMALE"]),
  birthYear: z.number().int().min(1995).max(2008),
  city: text(80),
  educations: z.array(z.strictObject({
    university: text(200),
    major: text(200),
    startYear: z.number().int().min(2015).max(2030),
    endYear: z.number().int().min(2015).max(2032),
    isCurrent: z.boolean(),
  })).min(1).max(2),
  headline: text(100),
  /** Viết trọn (không ghép câu riêng) nên ngưỡng là 300 của match-text.builder. Hồ sơ `so-sai` bỏ trống. */
  bio: text(300).optional(),
  /** `years` = CandidateSkill.yearsOfExperience (0 = chưa khai). */
  skills: z.array(z.strictObject({ name: text(60), years: z.number().min(0).max(3) })).min(2).max(14),
  experiences: z.array(z.strictObject({
    /** Tên công ty cũ hư cấu, không trùng công ty trong companies.json. */
    company: text(100),
    position: text(80),
    /** Đầu tháng `start` tới cuối tháng `end`; null = đang làm (tới `asOf`). */
    start: yearMonth,
    end: yearMonth.nullable(),
    description: text(300),
  })).max(2),
  projects: z.array(z.strictObject({ name: text(80), description: text(300) })).max(3),
  certificates: z.array(z.strictObject({ name: text(120), issuer: text(120), year: z.number().int().min(2015).max(2030) })).max(2),
});

export const showcaseFileSchema = z.strictObject({
  /**
   * Tháng viết dữ liệu. Mọi mốc thời gian (năm sinh, học vấn, kinh nghiệm, chứng chỉ) tính
   * theo tháng này; bộ sinh dời cả bộ theo khoảng cách từ `asOf` tới hôm chạy để cấp độ
   * (năm 3 / năm cuối / mới tốt nghiệp) vẫn đúng.
   */
  asOf: yearMonth,
  employers: z.array(showcaseEmployerSchema).min(1).max(4),
  jobs: z.array(showcaseJobSchema).min(1).max(10),
  candidates: z.array(showcaseCandidateSchema),
});

export type PositionsFile = z.infer<typeof positionsFileSchema>;
export type Position = PositionsFile["positions"][number];
export type CatalogAdditions = z.infer<typeof catalogAdditionsSchema>;
export type NamesFile = z.infer<typeof namesFileSchema>;
export type CompaniesFile = z.infer<typeof companiesFileSchema>;
export type Company = CompaniesFile["companies"][number];
export type JobTemplatesFile = z.infer<typeof jobTemplatesFileSchema>;
export type JobTemplate = JobTemplatesFile["templates"][number];
export type PersonasFile = z.infer<typeof personasFileSchema>;
export type Persona = PersonasFile["groups"][number]["personas"][number];
export type ShowcaseFile = z.infer<typeof showcaseFileSchema>;
export type ShowcaseJob = ShowcaseFile["jobs"][number];
export type ShowcaseCandidate = ShowcaseFile["candidates"][number];

export interface LargeDemoLibrary {
  positions: PositionsFile;
  catalogAdditions: CatalogAdditions;
  names: NamesFile;
  companies: CompaniesFile;
  jobTemplates: JobTemplatesFile;
  personas: PersonasFile;
  showcase: ShowcaseFile;
}

export type LargeDemoLibraryRaw = Record<keyof LargeDemoLibrary, unknown>;

/** Danh mục thật trong DB, KHÔNG gồm các mục do chính seed demo lớn tạo. */
export interface LargeDemoCatalog {
  skills: string[];
  /** Tên alias (đã chuẩn hoá) → tên kỹ năng đích. */
  skillAliases: Map<string, string>;
  majors: string[];
  /** Trường (University APPROVED) — hồ sơ trưng bày ghi đúng tên. */
  universities: string[];
  industries: string[];
  cities: string[];
  companyTypes: string[];
}

const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_LIKE = /(?<!\d)(?:\+84|0)\d{9,10}(?!\d)|(?<!\d)0\d{2,3}[ .-]\d{3}[ .-]\d{3,4}(?!\d)/;
const URL_LIKE = /https?:\/\/|www\./i;

/** Văn bản tự do của thư viện không được chứa thông tin liên lạc / đường link. */
function checkFreeText(where: string, value: string, errors: string[]): void {
  if (EMAIL_LIKE.test(value)) errors.push(`${where}: có vẻ chứa email`);
  if (PHONE_LIKE.test(value)) errors.push(`${where}: có vẻ chứa số điện thoại`);
  if (URL_LIKE.test(value)) errors.push(`${where}: có vẻ chứa đường link`);
}

/** "1 năm", "1,5 năm", "hai năm"… — không khớp "sinh viên năm 3". */
const YEARS_LIKE = /(?<![\p{L}\p{N}])(?:\d+(?:[.,]\d+)?|một|hai|ba|bốn|nửa)\s*\+?\s*năm(?![\p{L}])/iu;
/** "6 tháng", "ba tháng"… — thời lượng do bộ sinh đặt qua `months`. */
const MONTHS_LIKE = /(?<![\p{L}\p{N}])(?:\d+|một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)\s*tháng(?![\p{L}])/iu;

/** Văn bản chân dung nói sai cấp độ (sinh viên năm 3 / năm cuối / đã tốt nghiệp)? Trả lý do hoặc null. */
export function levelConflict(studyYear: number | null, value: string): string | null {
  const v = value.normalize("NFC").toLowerCase();
  const saysStudent = /sinh viên năm|năm cuối/u.test(v);
  const saysGraduate = /(?:đã|mới) tốt nghiệp|mới ra trường/u.test(v);
  const year = /sinh viên năm\s*(\d)/u.exec(v)?.[1];
  if (studyYear === null) return saysStudent ? "nói như sinh viên nhưng cấp độ là đã tốt nghiệp" : null;
  if (saysGraduate) return "nói đã tốt nghiệp nhưng cấp độ là sinh viên";
  if (year && Number(year) !== studyYear) return `ghi sinh viên năm ${year} nhưng cấp độ là năm ${studyYear}`;
  if (studyYear === 3 && /năm cuối/u.test(v)) return "ghi năm cuối nhưng cấp độ là năm 3";
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Các tên trong `names` xuất hiện nguyên cụm trong `value` (không dính chữ / số hai bên).
 * Tên dài xét trước và bị xoá khỏi văn bản, nên "MS SQL Server" không bị đếm thêm "SQL",
 * "ASP.NET Core" không bị đếm thêm ".NET". Tên ≤ 3 ký tự ("Go", "C#") phân biệt hoa thường.
 */
export function mentionedNames(value: string, names: readonly string[]): string[] {
  let rest = value.normalize("NFC");
  const found: string[] = [];
  for (const name of [...new Set(names)].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name.normalize("NFC"))}(?![\\p{L}\\p{N}])`, name.length <= 3 ? "gu" : "giu");
    if (!pattern.test(rest)) continue;
    found.push(name);
    rest = rest.replace(pattern, " ");
  }
  return found;
}

export interface LibraryValidation {
  library: LargeDemoLibrary | null;
  errors: string[];
  warnings: string[];
}

function issues(file: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => `${file} ${issue.path.join(".") || "(gốc)"}: ${issue.message}`);
}

function findDuplicates(values: readonly string[], keyOf: (value: string) => string = (value) => value): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const k = keyOf(value);
    if (seen.has(k)) duplicates.add(value);
    seen.add(k);
  }
  return [...duplicates];
}

export function validateLargeDemoLibrary(raw: LargeDemoLibraryRaw, catalog: LargeDemoCatalog): LibraryValidation {
  const positionsParsed = positionsFileSchema.safeParse(raw.positions);
  const additionsParsed = catalogAdditionsSchema.safeParse(raw.catalogAdditions);
  const namesParsed = namesFileSchema.safeParse(raw.names);
  const companiesParsed = companiesFileSchema.safeParse(raw.companies);
  const templatesParsed = jobTemplatesFileSchema.safeParse(raw.jobTemplates);
  const personasParsed = personasFileSchema.safeParse(raw.personas);
  const showcaseParsed = showcaseFileSchema.safeParse(raw.showcase);
  const parseErrors = [
    ...(positionsParsed.success ? [] : issues("positions.json", positionsParsed.error)),
    ...(additionsParsed.success ? [] : issues("catalog-additions.json", additionsParsed.error)),
    ...(namesParsed.success ? [] : issues("names.json", namesParsed.error)),
    ...(companiesParsed.success ? [] : issues("companies.json", companiesParsed.error)),
    ...(templatesParsed.success ? [] : issues("job-templates.json", templatesParsed.error)),
    ...(personasParsed.success ? [] : issues("personas.json", personasParsed.error)),
    ...(showcaseParsed.success ? [] : issues("showcase.json", showcaseParsed.error)),
  ];
  if (
    !positionsParsed.success || !additionsParsed.success || !namesParsed.success ||
    !companiesParsed.success || !templatesParsed.success || !personasParsed.success ||
    !showcaseParsed.success
  ) {
    return { library: null, errors: parseErrors, warnings: [] };
  }
  const personas = personasParsed.data;
  const showcase = showcaseParsed.data;

  const positions = positionsParsed.data;
  const additions = additionsParsed.data;
  const names = namesParsed.data;
  const companies = companiesParsed.data;
  const jobTemplates = templatesParsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- catalog-additions: không trùng danh mục, không trùng alias, không quá giống ---
  const catalogSkillByKey = new Map(catalog.skills.map((name) => [normalizeSkillName(name), name]));
  for (const name of findDuplicates(additions.skills, normalizeSkillName)) errors.push(`catalog-additions.json skills: "${name}" bị lặp`);
  additions.skills.forEach((name, index) => {
    const where = `catalog-additions.json skills: "${name}"`;
    const normalized = normalizeSkillName(name);
    if (!normalized) return void errors.push(`${where} không có chữ nào`);
    const existing = catalogSkillByKey.get(normalized);
    if (existing) return void errors.push(`${where} đã có trong danh mục ("${existing}") — bỏ khỏi file, dùng tên danh mục`);
    const aliasTarget = catalog.skillAliases.get(normalized);
    if (aliasTarget) return void errors.push(`${where} đã là alias của "${aliasTarget}" — dùng "${aliasTarget}"`);
    const others = [...catalog.skills, ...additions.skills.slice(0, index)];
    for (const other of others) {
      const score = skillSimilarity(name, other);
      if (score >= AUTO_MATCH_THRESHOLD) errors.push(`${where} giống "${other}" ${score.toFixed(2)} (≥ ${AUTO_MATCH_THRESHOLD}: người gõ sẽ tự khớp nhầm) — đổi tên hoặc dùng "${other}"`);
      else if (score >= GRAY_ZONE_THRESHOLD) warnings.push(`${where} hơi giống "${other}" ${score.toFixed(2)} — kiểm lại có phải cùng một kỹ năng không`);
    }
  });
  const existingIndustries = new Set(catalog.industries);
  for (const name of findDuplicates(additions.industries)) errors.push(`catalog-additions.json industries: "${name}" bị lặp`);
  for (const name of additions.industries) {
    if (existingIndustries.has(name)) errors.push(`catalog-additions.json industries: "${name}" đã có trong danh mục`);
  }
  const existingCities = new Set(catalog.cities);
  for (const name of findDuplicates(additions.cities)) errors.push(`catalog-additions.json cities: "${name}" bị lặp`);
  for (const name of additions.cities) {
    if (existingCities.has(name)) errors.push(`catalog-additions.json cities: "${name}" đã có trong danh mục`);
  }

  // --- tham chiếu dùng chung ---
  const knownSkills = new Set([...catalog.skills, ...additions.skills]);
  const usedSkills = new Set<string>();
  const checkSkill = (where: string, name: string) => {
    usedSkills.add(name);
    if (knownSkills.has(name)) return;
    const normalized = normalizeSkillName(name);
    const aliasTarget = catalog.skillAliases.get(normalized);
    if (aliasTarget) return void errors.push(`${where}: "${name}" đã thành alias — dùng "${aliasTarget}"`);
    const near = catalogSkillByKey.get(normalized) ?? additions.skills.find((s) => normalizeSkillName(s) === normalized);
    errors.push(near ? `${where}: "${name}" phải viết đúng từng ký tự là "${near}"` : `${where}: kỹ năng "${name}" không có trong danh mục hay catalog-additions.json`);
  };
  const knownMajors = new Set(catalog.majors);
  const knownIndustries = new Set([...catalog.industries, ...additions.industries]);
  const usedIndustries = new Set<string>();

  // --- positions.json ---
  for (const k of findDuplicates(positions.levels.map((level) => level.key))) errors.push(`positions.json levels: khoá "${k}" bị lặp`);
  positions.softSkills.forEach((name) => checkSkill("positions.json softSkills", name));
  for (const name of findDuplicates(positions.softSkills)) errors.push(`positions.json softSkills: "${name}" bị lặp`);

  const positionKeys = new Set<string>();
  for (const k of findDuplicates(positions.positions.map((p) => p.key))) errors.push(`positions.json: khoá vị trí "${k}" bị lặp`);
  for (const k of findDuplicates(positions.positions.map((p) => p.name))) errors.push(`positions.json: tên vị trí "${k}" bị lặp`);
  for (const position of positions.positions) positionKeys.add(position.key);

  for (const position of positions.positions) {
    const where = `positions.json [${position.key}]`;
    const skills = [...position.skills.core, ...position.skills.extra];
    for (const name of findDuplicates(skills)) errors.push(`${where}: kỹ năng "${name}" lặp (giữa core và extra hoặc trong cùng nhóm)`);
    for (const name of skills) checkSkill(where, name);

    const majors = [...position.majors.primary, ...position.majors.related];
    for (const name of findDuplicates(majors)) errors.push(`${where}: ngành học "${name}" lặp giữa primary và related`);
    for (const name of majors) {
      if (!knownMajors.has(name)) errors.push(`${where}: ngành học "${name}" không có trong danh mục Major (APPROVED) — dùng đúng tên`);
    }

    for (const name of position.industries) {
      usedIndustries.add(name);
      if (!knownIndustries.has(name)) errors.push(`${where}: ngành nghề "${name}" không có trong danh mục hay catalog-additions.json`);
    }
    for (const name of findDuplicates(position.industries)) errors.push(`${where}: ngành nghề "${name}" bị lặp`);

    if (!(position.salaryBand in positions.salaryBands)) errors.push(`${where}: salaryBand "${position.salaryBand}" không có trong salaryBands`);
    for (const adjacent of position.adjacent) {
      if (adjacent === position.key) errors.push(`${where}: adjacent trỏ vào chính nó`);
      else if (!positionKeys.has(adjacent)) errors.push(`${where}: adjacent "${adjacent}" không phải khoá vị trí nào`);
    }
  }

  // --- names.json ---
  for (const name of findDuplicates(names.familyNames.map((f) => f.name))) errors.push(`names.json familyNames: "${name}" bị lặp`);
  for (const gender of ["MALE", "FEMALE"] as const) {
    for (const name of findDuplicates(names.middleNames[gender])) errors.push(`names.json middleNames.${gender}: "${name}" bị lặp`);
    for (const name of findDuplicates(names.givenNames[gender])) errors.push(`names.json givenNames.${gender}: "${name}" bị lặp`);
  }

  // --- companies.json ---
  const knownCities = new Set([...catalog.cities, ...additions.cities]);
  const knownCompanyTypes = new Set(catalog.companyTypes);
  const usedCities = new Set<string>();
  for (const k of findDuplicates(companies.companies.map((c) => c.key))) errors.push(`companies.json: khoá "${k}" bị lặp`);
  for (const k of findDuplicates(companies.companies.map((c) => c.name))) errors.push(`companies.json: tên "${k}" bị lặp`);
  for (const company of companies.companies) {
    const where = `companies.json [${company.key}]`;
    usedIndustries.add(company.industry);
    if (!knownIndustries.has(company.industry)) errors.push(`${where}: ngành nghề "${company.industry}" không có trong danh mục hay catalog-additions.json`);
    if (!knownCompanyTypes.has(company.companyType)) errors.push(`${where}: loại hình "${company.companyType}" không có trong danh mục`);
    for (const city of [company.city, ...company.branchCities]) {
      usedCities.add(city);
      if (!knownCities.has(city)) errors.push(`${where}: thành phố "${city}" không có trong danh mục hay catalog-additions.json`);
    }
    if (company.branchCities.includes(company.city)) errors.push(`${where}: branchCities trùng thành phố trụ sở`);
    for (const k of company.positions) {
      if (!positionKeys.has(k)) errors.push(`${where}: vị trí "${k}" không có trong positions.json`);
    }
    for (const k of findDuplicates(company.positions)) errors.push(`${where}: vị trí "${k}" bị lặp`);
    for (const [field, value] of [["name", company.name], ["address", company.address], ["description", company.description]] as const) {
      checkFreeText(`${where}.${field}`, value, errors);
    }
  }
  const mains = companies.companies.filter((c) => c.demoRole === "main");
  if (mains.length !== 1) errors.push(`companies.json: cần đúng 1 công ty demoRole "main", đang có ${mains.length}`);
  const secondaries = companies.companies.filter((c) => c.demoRole === "secondary");
  if (secondaries.length < 2 || secondaries.length > 3) errors.push(`companies.json: cần 2–3 công ty demoRole "secondary", đang có ${secondaries.length}`);
  if (mains[0] && mains[0].industry !== "Công nghệ thông tin") {
    warnings.push(`companies.json: công ty "main" nên là công ty CNTT (PLAN "Tài khoản dùng khi demo")`);
  }
  // Mỗi vị trí cần ≥ 2 công ty tuyển, nếu không ứng viên vị trí đó gần như không có tin hợp.
  for (const position of positions.positions) {
    const hiring = companies.companies.filter((c) => c.positions.includes(position.key)).length;
    if (hiring < 2) warnings.push(`positions.json [${position.key}]: chỉ ${hiring} công ty tuyển — nên ≥ 2`);
  }

  // --- job-templates.json ---
  // Địa điểm do bộ sinh lấy theo công ty, số năm kinh nghiệm theo `minExperienceYears` của tin:
  // văn bản mẫu không được tự ghi hai thứ này, nếu không sẽ lệch với dữ liệu của tin.
  const cityNames = [...knownCities];
  const checkTemplateText = (where: string, value: string, options: { years?: boolean } = {}) => {
    checkFreeText(where, value, errors);
    for (const city of mentionedNames(value, cityNames)) errors.push(`${where}: nhắc thành phố "${city}" — địa điểm lấy theo công ty`);
    if (options.years && YEARS_LIKE.test(value)) errors.push(`${where}: ghi số năm kinh nghiệm — để bộ sinh đặt qua minExperienceYears`);
  };
  for (const audience of ["student", "graduate"] as const) {
    jobTemplates.audiences[audience].forEach((value, index) => checkTemplateText(`job-templates.json audiences.${audience}.${index}`, value, { years: true }));
    jobTemplates.benefits[audience].forEach((value, index) => checkTemplateText(`job-templates.json benefits.${audience}.${index}`, value));
  }
  const positionByKey = new Map(positions.positions.map((p) => [p.key, p]));
  for (const k of findDuplicates(jobTemplates.templates.map((t) => t.position))) errors.push(`job-templates.json: vị trí "${k}" có hơn một mẫu`);
  for (const title of findDuplicates(jobTemplates.templates.flatMap((t) => Object.values(t.titles).flat()))) {
    errors.push(`job-templates.json: tiêu đề "${title}" bị lặp`);
  }
  for (const template of jobTemplates.templates) {
    const where = `job-templates.json [${template.position}]`;
    const position = positionByKey.get(template.position);
    if (!position) {
      errors.push(`${where}: không có vị trí này trong positions.json`);
      continue;
    }
    const allowed = [...position.skills.core, ...position.skills.extra, ...positions.softSkills];
    const core = new Set(position.skills.core);
    const variantSkills = template.variants.map((v) => [...v.skills.required, ...v.skills.preferred]);
    template.variants.forEach((variant, index) => {
      const at = `${where} variants.${index}`;
      const listed = variantSkills[index] ?? [];
      for (const name of findDuplicates(listed)) errors.push(`${at}: kỹ năng "${name}" lặp giữa required và preferred`);
      for (const name of listed) {
        checkSkill(at, name);
        if (knownSkills.has(name) && !allowed.includes(name)) errors.push(`${at}: kỹ năng "${name}" không thuộc core / extra của vị trí hay softSkills`);
      }
      const coreRequired = variant.skills.required.filter((name) => core.has(name)).length;
      if (coreRequired < 2) errors.push(`${at}: kỹ năng bắt buộc cần ≥ 2 kỹ năng lõi (core), đang có ${coreRequired}`);
      for (const field of ["description", "requirements"] as const) {
        checkTemplateText(`${at}.${field}`, variant[field], { years: field === "requirements" });
        for (const name of mentionedNames(variant[field], allowed)) {
          if (!listed.includes(name)) warnings.push(`${at}.${field}: nhắc "${name}" nhưng mẫu không có kỹ năng này`);
        }
      }
    });
    for (const description of findDuplicates(template.variants.map((v) => v.description))) errors.push(`${where}: mô tả "${description.slice(0, 40)}…" lặp giữa các biến thể`);
    for (const title of Object.values(template.titles).flat()) {
      checkTemplateText(`${where} tiêu đề "${title}"`, title);
      for (const name of mentionedNames(title, allowed)) {
        const missing = variantSkills.findIndex((skills) => !skills.includes(name));
        if (missing >= 0) errors.push(`${where}: tiêu đề "${title}" nhắc "${name}" nhưng variants.${missing} không có kỹ năng này (tiêu đề ghép ngẫu nhiên với biến thể)`);
      }
    }
    template.benefits.forEach((value, index) => checkTemplateText(`${where} benefits.${index}`, value));
  }
  const withoutTemplate = positions.positions.filter((p) => !jobTemplates.templates.some((t) => t.position === p.key)).map((p) => p.key);
  if (withoutTemplate.length > 0) {
    warnings.push(`job-templates.json: còn ${withoutTemplate.length} vị trí chưa có mẫu tin: ${withoutTemplate.join(", ")}`);
  }

  // --- personas.json ---
  // Họ tên, trường, thành phố, ngày tháng, số năm kinh nghiệm đều do bộ sinh đặt: văn bản chân
  // dung không tự ghi những thứ này, nếu không sẽ lệch với dữ liệu của chính hồ sơ.
  const allSkillNames = [...knownSkills];
  const checkPersonaText = (where: string, value: string) => {
    checkFreeText(where, value, errors);
    for (const city of mentionedNames(value, cityNames)) errors.push(`${where}: nhắc thành phố "${city}" — thành phố do bộ sinh đặt`);
    if (YEARS_LIKE.test(value)) errors.push(`${where}: ghi số năm — để bộ sinh đặt qua ngày tháng / số năm kỹ năng`);
    if (MONTHS_LIKE.test(value)) errors.push(`${where}: ghi số tháng — để bộ sinh đặt qua \`months\``);
  };
  personas.bioTails.forEach((value, index) => {
    const where = `personas.json bioTails.${index}`;
    checkPersonaText(where, value);
    for (const name of mentionedNames(value, allSkillNames)) errors.push(`${where}: nhắc kỹ năng "${name}" — câu này ghép vào hồ sơ mọi nghề`);
  });
  for (const value of findDuplicates(personas.bioTails)) errors.push(`personas.json bioTails: "${value}" bị lặp`);
  personas.unrelatedJobs.forEach((job, index) => {
    const where = `personas.json unrelatedJobs.${index}`;
    checkPersonaText(`${where}.position`, job.position);
    checkPersonaText(`${where}.description`, job.description);
    for (const name of mentionedNames(`${job.position} | ${job.description}`, allSkillNames)) {
      warnings.push(`${where}: nhắc kỹ năng "${name}" — việc này ghép vào hồ sơ mà không kèm kỹ năng`);
    }
  });
  // Công ty cũ trùng công ty đang tuyển trong bộ demo sẽ gây hiểu nhầm "đã từng làm ở đây".
  const hiringCompanyNames = new Set(companies.companies.map((c) => c.name));
  for (const [domain, names] of Object.entries(personas.pastCompanies)) {
    if (!(domain in DOMAINS)) errors.push(`personas.json pastCompanies: "${domain}" không phải lĩnh vực trong DOMAINS`);
    for (const name of names) {
      checkFreeText(`personas.json pastCompanies.${domain}`, name, errors);
      if (hiringCompanyNames.has(name)) errors.push(`personas.json pastCompanies.${domain}: "${name}" trùng tên công ty trong companies.json`);
    }
    for (const name of findDuplicates(names)) errors.push(`personas.json pastCompanies.${domain}: "${name}" bị lặp`);
  }
  for (const domain of Object.keys(DOMAINS)) {
    if (!personas.pastCompanies[domain]) warnings.push(`personas.json pastCompanies: lĩnh vực "${domain}" chưa có tên công ty cũ`);
  }

  const levelByKey = new Map(positions.levels.map((level) => [level.key, level]));
  const personaKeys = personas.groups.flatMap((g) => g.personas.map((p) => p.key));
  for (const k of findDuplicates(personaKeys)) errors.push(`personas.json: khoá chân dung "${k}" bị lặp`);
  for (const k of findDuplicates(personas.groups.map((g) => g.position))) errors.push(`personas.json: vị trí "${k}" có hơn một nhóm`);
  for (const group of personas.groups) {
    const where = `personas.json [${group.position}]`;
    const position = positionByKey.get(group.position);
    if (!position) {
      errors.push(`${where}: không có vị trí này trong positions.json`);
      continue;
    }
    const positionMajors = new Set([...position.majors.primary, ...position.majors.related]);
    const core = new Set(position.skills.core);
    // Kỹ năng "đúng nghề": của vị trí, của vị trí gần, kỹ năng mềm.
    const near = new Set([
      ...position.skills.core, ...position.skills.extra, ...positions.softSkills,
      ...position.adjacent.flatMap((k) => {
        const other = positionByKey.get(k);
        return other ? [...other.skills.core, ...other.skills.extra] : [];
      }),
    ]);
    const nearNames = [...near];
    group.certificates.forEach((c, index) => checkFreeText(`${where} certificates.${index}`, `${c.name} | ${c.issuer}`, errors));
    for (const level of positions.levels) {
      const count = group.personas.filter((p) => p.level === level.key).length;
      if (count < 4) errors.push(`${where}: cấp độ "${level.key}" có ${count} chân dung — cần ≥ 4`);
    }
    if (!group.personas.some((p) => p.kind === "career-switch")) warnings.push(`${where}: chưa có chân dung đổi ngành (career-switch)`);
    for (const bio of findDuplicates(group.personas.map((p) => p.bio))) errors.push(`${where}: giới thiệu "${bio.slice(0, 40)}…" bị lặp`);
    for (const headline of findDuplicates(group.personas.map((p) => p.headline))) warnings.push(`${where}: tiêu đề "${headline}" bị lặp`);

    for (const persona of group.personas) {
      const at = `${where} ${persona.key}`;
      const level = levelByKey.get(persona.level);
      if (!level) {
        errors.push(`${at}: cấp độ "${persona.level}" không có trong positions.json levels`);
        continue;
      }
      // Số dòng kinh nghiệm theo cấp độ (positions.json levels): năm 3 chưa đi làm (≤ 1 việc ngắn),
      // các cấp sau đã thực tập / đi làm (≥ 1). Độ dài không vượt số năm kinh nghiệm tối đa của cấp.
      if (level.studyYear === 3 && persona.experiences.length > 1) errors.push(`${at}: sinh viên năm 3 chỉ có tối đa 1 dòng kinh nghiệm`);
      if (level.studyYear !== 3 && persona.experiences.length === 0) errors.push(`${at}: cấp độ "${level.key}" cần ≥ 1 dòng kinh nghiệm`);
      const maxMonths = Math.round(level.experienceYears[1] * 12);
      persona.experiences.forEach((e, index) => {
        if (e.months[1] > maxMonths) errors.push(`${at} experiences.${index}: tối đa ${e.months[1]} tháng vượt mức của cấp độ (${maxMonths})`);
      });

      if (persona.kind === "career-switch") {
        if (!persona.fromMajors) errors.push(`${at}: chân dung đổi ngành cần fromMajors`);
        for (const major of persona.fromMajors ?? []) {
          if (!knownMajors.has(major)) errors.push(`${at}: ngành học "${major}" không có trong danh mục Major (APPROVED)`);
          else if (positionMajors.has(major)) errors.push(`${at}: "${major}" đã thuộc nhóm ngành của vị trí — đổi ngành phải từ ngành khác`);
        }
      } else if (persona.fromMajors) {
        errors.push(`${at}: chỉ chân dung career-switch mới có fromMajors (ngành của người thường lấy theo vị trí)`);
      }

      for (const name of findDuplicates(persona.skills)) errors.push(`${at}: kỹ năng "${name}" bị lặp`);
      for (const name of persona.skills) checkSkill(at, name);
      const coreCount = persona.skills.filter((name) => core.has(name)).length;
      const minCore = persona.kind === "career-switch" ? 2 : Math.min(3, core.size);
      if (coreCount < minCore) errors.push(`${at}: cần ≥ ${minCore} kỹ năng lõi (core) của vị trí, đang có ${coreCount}`);
      if (persona.kind === "standard") {
        for (const name of persona.skills) {
          if (knownSkills.has(name) && !near.has(name)) warnings.push(`${at}: kỹ năng "${name}" không thuộc vị trí, vị trí gần hay kỹ năng mềm`);
        }
      }

      const texts: [string, string][] = [
        ["headline", persona.headline],
        ["bio", persona.bio],
        ...persona.experiences.flatMap((e, i): [string, string][] => [[`experiences.${i}.position`, e.position], [`experiences.${i}.description`, e.description]]),
        ...persona.projects.flatMap((p, i): [string, string][] => [[`projects.${i}.name`, p.name], [`projects.${i}.description`, p.description]]),
      ];
      for (const [field, value] of texts) {
        checkPersonaText(`${at}.${field}`, value);
        const conflict = levelConflict(level.studyYear, value);
        if (conflict) errors.push(`${at}.${field}: ${conflict}`);
        for (const name of mentionedNames(value, nearNames)) {
          if (!persona.skills.includes(name)) warnings.push(`${at}.${field}: nhắc "${name}" nhưng chân dung không có kỹ năng này`);
        }
      }
    }
  }
  const withoutPersonas = positions.positions.filter((p) => !personas.groups.some((g) => g.position === p.key)).map((p) => p.key);
  if (withoutPersonas.length > 0) {
    warnings.push(`personas.json: còn ${withoutPersonas.length} vị trí chưa có chân dung: ${withoutPersonas.join(", ")}`);
  }

  // --- showcase.json ---
  // Hồ sơ trưng bày viết trọn từng người cho một tin chính. Kiểm `tier` khớp với dữ liệu
  // thật của hồ sơ so với tin (kỹ năng bắt buộc, ngành, số năm): ghi "rất hợp" mà thiếu kỹ
  // năng bắt buộc thì điểm trên trang "Tìm ứng viên" sẽ không trải như kịch bản demo.
  const companyByKey = new Map(companies.companies.map((c) => [c.key, c]));
  const templateByPosition = new Map(jobTemplates.templates.map((t) => [t.position, t]));
  const knownUniversities = new Set(catalog.universities);
  const monthIndex = (value: string) => {
    const [year, month] = value.split("-").map(Number);
    return year! * 12 + (month! - 1);
  };
  const [asOfYear, asOfMonth] = showcase.asOf.split("-").map(Number) as [number, number];
  const asOfIndex = monthIndex(showcase.asOf);

  for (const k of findDuplicates([...showcase.employers.map((e) => e.key), ...showcase.candidates.map((c) => c.key)])) {
    errors.push(`showcase.json: khoá tài khoản "${k}" bị lặp (khoá là phần trước @ của email)`);
  }
  const employerByKey = new Map(showcase.employers.map((e) => [e.key, e]));
  for (const employer of showcase.employers) {
    const where = `showcase.json employers [${employer.key}]`;
    const company = companyByKey.get(employer.company);
    if (!company) errors.push(`${where}: công ty "${employer.company}" không có trong companies.json`);
    else if (!company.demoRole) errors.push(`${where}: công ty "${employer.company}" không có demoRole — tài khoản demo chỉ đặt ở công ty main / secondary`);
    checkFreeText(`${where}.title`, employer.title, errors);
  }
  for (const k of findDuplicates(showcase.employers.map((e) => e.company))) errors.push(`showcase.json employers: công ty "${k}" có hơn một tài khoản demo`);
  for (const company of companies.companies.filter((c) => c.demoRole)) {
    if (!showcase.employers.some((e) => e.company === company.key)) warnings.push(`showcase.json employers: công ty ${company.demoRole} "${company.key}" chưa có tài khoản demo`);
  }

  interface ShowcaseJobFacts {
    required: string[];
    all: string[];
    primary: Set<string>;
    related: Set<string>;
    minYears: number | null;
    skillMinYears: Record<string, number>;
  }
  const jobFacts = new Map<string, ShowcaseJobFacts>();
  for (const k of findDuplicates(showcase.jobs.map((j) => j.key))) errors.push(`showcase.json jobs: khoá "${k}" bị lặp`);
  for (const job of showcase.jobs) {
    const where = `showcase.json jobs [${job.key}]`;
    const employer = employerByKey.get(job.employer);
    const position = positionByKey.get(job.position);
    if (!employer) errors.push(`${where}: nhà tuyển dụng "${job.employer}" không có trong employers`);
    if (!position) errors.push(`${where}: vị trí "${job.position}" không có trong positions.json`);
    if (!employer || !position) continue;
    const company = companyByKey.get(employer.company);
    if (company && !company.positions.includes(job.position)) errors.push(`${where}: công ty "${company.key}" không tuyển vị trí "${job.position}"`);
    const template = templateByPosition.get(job.position);
    const variant = template?.variants[job.variant];
    if (!template || !variant) {
      errors.push(`${where}: mẫu tin của "${job.position}" không có biến thể ${job.variant}`);
      continue;
    }
    if (!template.titles[job.jobType].includes(job.title)) errors.push(`${where}: tiêu đề "${job.title}" không thuộc titles.${job.jobType} của mẫu tin`);
    const positionMajors = [...position.majors.primary, ...position.majors.related];
    for (const major of job.majors.primary) {
      if (!position.majors.primary.includes(major)) errors.push(`${where}: ngành chính "${major}" không thuộc majors.primary của vị trí`);
    }
    for (const major of job.majors.related) {
      if (!positionMajors.includes(major)) errors.push(`${where}: ngành liên quan "${major}" không thuộc nhóm ngành của vị trí`);
    }
    for (const major of findDuplicates([...job.majors.primary, ...job.majors.related])) errors.push(`${where}: ngành "${major}" bị lặp`);
    const all = [...variant.skills.required, ...variant.skills.preferred];
    const skillMinYears = job.skillMinYears ?? {};
    for (const name of Object.keys(skillMinYears)) {
      if (!all.includes(name)) errors.push(`${where}: skillMinYears "${name}" không có trong kỹ năng của biến thể ${job.variant}`);
    }
    const band = positions.salaryBands[position.salaryBand]?.[job.jobType];
    if (job.salary && band && (job.salary[0] < band[0] || job.salary[1] > band[1])) {
      warnings.push(`${where}: lương ${job.salary.join("–")} ngoài khung ${position.salaryBand}.${job.jobType} (${band.join("–")})`);
    }
    jobFacts.set(job.key, {
      required: variant.skills.required,
      all,
      primary: new Set(job.majors.primary),
      related: new Set(job.majors.related),
      minYears: job.minExperienceYears,
      skillMinYears,
    });
  }
  if (showcase.jobs.length < 8) warnings.push(`showcase.json: có ${showcase.jobs.length} tin chính — PLAN cần 8–10`);
  const mainKey = mains[0]?.key;
  const mainJobs = showcase.jobs.filter((j) => employerByKey.get(j.employer)?.company === mainKey).length;
  if (mainKey && mainJobs < 4) warnings.push(`showcase.json: công ty main chỉ có ${mainJobs} tin chính — nên ≥ 4 (nhà tuyển dụng "chính" nhiều tin)`);

  const familyNames = names.familyNames.map((f) => f.name);
  for (const fullName of findDuplicates(showcase.candidates.map((c) => c.fullName))) warnings.push(`showcase.json: họ tên "${fullName}" bị lặp`);
  for (const candidate of showcase.candidates) {
    const at = `showcase.json candidates [${candidate.key}]`;
    const facts = jobFacts.get(candidate.job);
    const level = levelByKey.get(candidate.level);
    if (!facts) errors.push(`${at}: tin chính "${candidate.job}" không có trong jobs (hoặc tin đó đang lỗi)`);
    if (!level) errors.push(`${at}: cấp độ "${candidate.level}" không có trong positions.json levels`);
    if (!facts || !level) continue;

    // Người: họ tên khớp giới tính, năm sinh và học vấn đúng cấp độ tại thời điểm `asOf`.
    if (!familyNames.some((name) => candidate.fullName.startsWith(`${name} `))) errors.push(`${at}: họ trong "${candidate.fullName}" không có trong names.json`);
    if (!names.givenNames[candidate.gender].some((name) => candidate.fullName.endsWith(` ${name}`))) {
      errors.push(`${at}: tên trong "${candidate.fullName}" không thuộc givenNames.${candidate.gender} — tên phải khớp giới tính`);
    }
    if (!knownCities.has(candidate.city)) errors.push(`${at}: thành phố "${candidate.city}" không có trong danh mục hay catalog-additions.json`);
    if (candidate.birthYear < level.birthYears[0] || candidate.birthYear > level.birthYears[1]) {
      errors.push(`${at}: năm sinh ${candidate.birthYear} ngoài khoảng của cấp độ ${level.key} (${level.birthYears.join("–")})`);
    }
    for (const education of candidate.educations) {
      if (!knownUniversities.has(education.university)) errors.push(`${at}: trường "${education.university}" không có trong danh mục University (APPROVED)`);
      if (!knownMajors.has(education.major)) errors.push(`${at}: ngành học "${education.major}" không có trong danh mục Major (APPROVED)`);
      if (education.endYear <= education.startYear) errors.push(`${at}: học vấn ${education.startYear}–${education.endYear} sai thứ tự`);
      if (education.startYear > asOfYear) errors.push(`${at}: học vấn bắt đầu ${education.startYear}, sau asOf`);
      if (!education.isCurrent && education.endYear > asOfYear) errors.push(`${at}: học vấn đã xong nhưng endYear ${education.endYear} sau asOf`);
    }
    const studying = candidate.educations.filter((e) => e.isCurrent);
    if (level.studyYear === null) {
      if (studying.length > 0) errors.push(`${at}: cấp độ đã tốt nghiệp nhưng có học vấn đang học`);
    } else if (studying.length !== 1) {
      errors.push(`${at}: sinh viên cần đúng 1 dòng học vấn đang học, đang có ${studying.length}`);
    } else {
      // Năm học bắt đầu tháng 9: từ tháng 9 trở đi, năm nhất là khoá nhập học đúng năm asOf.
      const expectedStart = asOfYear - level.studyYear + (asOfMonth >= 9 ? 1 : 0);
      if (studying[0]!.startYear !== expectedStart) {
        errors.push(`${at}: sinh viên năm ${level.studyYear} tại ${showcase.asOf} phải nhập học năm ${expectedStart}, đang ghi ${studying[0]!.startYear}`);
      }
    }

    // Kinh nghiệm: số dòng và tổng thời gian theo cấp độ (cùng quy tắc với chân dung).
    let totalMonths = 0;
    candidate.experiences.forEach((experience, index) => {
      const start = monthIndex(experience.start);
      const end = experience.end === null ? asOfIndex : monthIndex(experience.end);
      if (end < start) errors.push(`${at} experiences.${index}: kết thúc trước khi bắt đầu`);
      if (end > asOfIndex) errors.push(`${at} experiences.${index}: kết thúc sau asOf`);
      totalMonths += Math.max(0, end - start + 1);
      checkFreeText(`${at} experiences.${index}.company`, experience.company, errors);
      if (hiringCompanyNames.has(experience.company)) errors.push(`${at} experiences.${index}: "${experience.company}" trùng tên công ty trong companies.json`);
    });
    const maxMonths = Math.round(level.experienceYears[1] * 12);
    if (totalMonths > maxMonths) errors.push(`${at}: tổng kinh nghiệm ${totalMonths} tháng vượt mức của cấp độ (${maxMonths})`);
    if (level.studyYear === 3 && candidate.experiences.length > 1) errors.push(`${at}: sinh viên năm 3 chỉ có tối đa 1 dòng kinh nghiệm`);
    if (level.studyYear !== 3 && candidate.experiences.length === 0 && candidate.tier !== "so-sai") errors.push(`${at}: cấp độ "${level.key}" cần ≥ 1 dòng kinh nghiệm`);
    const totalYears = totalMonths / 12;

    // Kỹ năng và mức hợp so với tin chính.
    const skillNames = candidate.skills.map((s) => s.name);
    for (const name of findDuplicates(skillNames)) errors.push(`${at}: kỹ năng "${name}" bị lặp`);
    for (const name of skillNames) checkSkill(at, name);
    if (!facts.all.some((name) => skillNames.includes(name))) {
      errors.push(`${at}: không có kỹ năng nào của tin "${candidate.job}" — "Tìm ứng viên" chỉ lấy hồ sơ có chung ≥ 1 kỹ năng`);
    }
    const missingRequired = facts.required.filter((name) => !skillNames.includes(name));
    const yearsOf = new Map(candidate.skills.map((s) => [s.name, s.years]));
    const shortSkillYears = Object.entries(facts.skillMinYears).filter(([name, min]) => (yearsOf.get(name) ?? 0) < min).map(([name]) => name);
    const shortYears = facts.minYears !== null && totalYears < facts.minYears;
    const majors = candidate.educations.map((e) => e.major);
    const hasPrimary = majors.some((m) => facts.primary.has(m));
    const hasRelated = majors.some((m) => facts.related.has(m));
    switch (candidate.tier) {
      case "rat-hop":
        if (missingRequired.length > 0) errors.push(`${at}: "rat-hop" nhưng thiếu kỹ năng bắt buộc ${missingRequired.join(", ")}`);
        if (!hasPrimary) errors.push(`${at}: "rat-hop" nhưng không học ngành chính của tin`);
        if (shortYears) errors.push(`${at}: "rat-hop" nhưng tổng kinh nghiệm ${totalYears.toFixed(1)} năm dưới mức tin yêu cầu (${facts.minYears})`);
        if (shortSkillYears.length > 0) errors.push(`${at}: "rat-hop" nhưng số năm kỹ năng dưới mức tin yêu cầu: ${shortSkillYears.join(", ")}`);
        break;
      case "hop-mot-phan":
        if (missingRequired.length > 2) errors.push(`${at}: "hop-mot-phan" thiếu ${missingRequired.length} kỹ năng bắt buộc — tối đa 2`);
        if (missingRequired.length === 0 && !shortYears && shortSkillYears.length === 0) {
          errors.push(`${at}: "hop-mot-phan" nhưng đủ kỹ năng bắt buộc và đủ số năm — bớt kỹ năng bắt buộc hoặc ghi "rat-hop"`);
        }
        break;
      case "nganh-gan":
        if (hasPrimary || !hasRelated) errors.push(`${at}: "nganh-gan" cần học ngành liên quan của tin và không học ngành chính`);
        break;
      case "doi-nganh":
        if (hasPrimary || hasRelated) errors.push(`${at}: "doi-nganh" không được học ngành chính hay ngành liên quan của tin`);
        break;
      case "so-sai":
        if (candidate.bio || candidate.experiences.length > 0 || candidate.projects.length > 0 || candidate.certificates.length > 0 || candidate.skills.length > 3) {
          errors.push(`${at}: "so-sai" chỉ có tiêu đề và 2–3 kỹ năng (không giới thiệu, kinh nghiệm, dự án, chứng chỉ)`);
        }
        break;
      case "ca-kho":
        if (!candidate.hardCase) errors.push(`${at}: "ca-kho" cần hardCase`);
        if (candidate.hardCase === "nhoi-tu-khoa" && candidate.skills.length < 10) errors.push(`${at}: nhồi từ khoá cần ≥ 10 kỹ năng`);
        if (candidate.hardCase === "kinh-nghiem-khong-lien-quan" && candidate.experiences.length === 0) errors.push(`${at}: "kinh-nghiem-khong-lien-quan" cần ≥ 1 dòng kinh nghiệm`);
        break;
    }
    if (candidate.hardCase && candidate.tier !== "ca-kho") errors.push(`${at}: chỉ tier "ca-kho" mới có hardCase`);
    if (candidate.tier !== "so-sai" && !candidate.bio) errors.push(`${at}: thiếu giới thiệu (chỉ hồ sơ "so-sai" được bỏ trống)`);
    if (candidate.demoLogin && (candidate.tier === "so-sai" || candidate.tier === "ca-kho")) {
      errors.push(`${at}: tài khoản đăng nhập demo không đặt ở hồ sơ "${candidate.tier}" ("Việc làm phù hợp" sẽ ít tin)`);
    }

    // Văn bản: không thành phố / số năm / số tháng / liên lạc, đúng cấp độ, nhắc kỹ năng nào thì có kỹ năng đó.
    const texts: [string, string][] = [
      ["headline", candidate.headline],
      ...(candidate.bio ? [["bio", candidate.bio] as [string, string]] : []),
      ...candidate.experiences.flatMap((e, i): [string, string][] => [[`experiences.${i}.position`, e.position], [`experiences.${i}.description`, e.description]]),
      ...candidate.projects.flatMap((p, i): [string, string][] => [[`projects.${i}.name`, p.name], [`projects.${i}.description`, p.description]]),
    ];
    for (const [field, value] of texts) {
      checkPersonaText(`${at}.${field}`, value);
      const conflict = levelConflict(level.studyYear, value);
      if (conflict) errors.push(`${at}.${field}: ${conflict}`);
      for (const name of mentionedNames(value, allSkillNames)) {
        if (!skillNames.includes(name)) warnings.push(`${at}.${field}: nhắc "${name}" nhưng hồ sơ không có kỹ năng này`);
      }
    }
    candidate.certificates.forEach((c, index) => {
      checkFreeText(`${at} certificates.${index}`, `${c.name} | ${c.issuer}`, errors);
      if (c.year > asOfYear) errors.push(`${at} certificates.${index}: năm ${c.year} sau asOf`);
    });
  }
  for (const job of showcase.jobs) {
    const list = showcase.candidates.filter((c) => c.job === job.key);
    if (list.length === 0) {
      warnings.push(`showcase.json: tin chính "${job.key}" chưa có hồ sơ trưng bày`);
      continue;
    }
    const missingTiers = SHOWCASE_TIERS.filter((tier) => !list.some((c) => c.tier === tier));
    if (missingTiers.length > 0) warnings.push(`showcase.json: tin chính "${job.key}" chưa có hồ sơ nhóm ${missingTiers.join(", ")}`);
    if (list.length < 8) warnings.push(`showcase.json: tin chính "${job.key}" có ${list.length} hồ sơ — nên 8`);
  }
  const demoLogins = showcase.candidates.filter((c) => c.demoLogin).length;
  if (demoLogins < 5 || demoLogins > 8) warnings.push(`showcase.json: ${demoLogins} ứng viên demoLogin — PLAN cần 5–8`);

  // --- độ phủ: thứ thêm vào danh mục mà không ai dùng là thừa ---
  for (const name of additions.skills) {
    if (!usedSkills.has(name)) warnings.push(`catalog-additions.json skills: "${name}" chưa vị trí nào dùng`);
  }
  for (const name of additions.industries) {
    if (!usedIndustries.has(name)) warnings.push(`catalog-additions.json industries: "${name}" chưa vị trí / công ty nào dùng`);
  }
  for (const name of additions.cities) {
    if (!usedCities.has(name)) warnings.push(`catalog-additions.json cities: "${name}" chưa công ty nào dùng`);
  }
  for (const domain of Object.keys(DOMAINS) as Domain[]) {
    if (!positions.positions.some((p) => p.domain === domain)) warnings.push(`positions.json: lĩnh vực "${DOMAINS[domain]}" chưa có vị trí nào`);
  }

  return {
    library: errors.length === 0 ? { positions, catalogAdditions: additions, names, companies, jobTemplates, personas, showcase } : null,
    errors,
    warnings,
  };
}
