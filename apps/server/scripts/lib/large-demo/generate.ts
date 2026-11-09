// Bộ sinh dữ liệu demo lớn — phần 2a: công ty, nhà tuyển dụng, gói, tin (kèm kỹ năng,
// ngành, kiểm duyệt, lượt xem), ứng viên (kèm học vấn, kinh nghiệm, dự án, chứng chỉ,
// kỹ năng, CV). Đặc tả: docs/06-backend/large-demo-data/PLAN.md ("Phân bố dữ liệu").
//
// Hàm thuần: nhận thư viện đã kiểm (library.ts) + bảng tên → id của danh mục thật + seed,
// trả về các mảng bản ghi đúng khuôn `createMany` của Prisma. Không đọc DB, không đọc file,
// không gọi Date.now() (giờ chạy truyền vào `now`) → cùng đầu vào ra đúng cùng kết quả.
// Lịch sử (đơn ứng tuyển, lời mời, phỏng vấn, hội thoại, tin đã lưu) thuộc phần 2b.
import type { Prisma } from "@prisma/client";
import { mentionedNames, type Company, type LargeDemoLibrary, type Persona, type Position, type ShowcaseCandidate, type ShowcaseJob } from "./library";

export const LARGE_DEMO_ID_PREFIX = "clargedemo";
export const LARGE_DEMO_EMAIL_DOMAIN = "large-demo.local";

/** Quy mô đủ (`--scale 1`), PLAN D1: ~40 công ty, ~400 tin, ~1.500 ứng viên (gồm 10 tin + 80 hồ sơ trưng bày). */
export const FULL_SCALE = { generatedJobs: 390, generatedCandidates: 1420 } as const;
/** Gói "Doanh nghiệp" của mọi công ty demo: từ hôm chạy tới +90 ngày (PLAN "Công ty"). */
export const SUBSCRIPTION_DAYS = 90;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const VN_OFFSET = 7 * HOUR;

// ─── Đầu vào / đầu ra ───────────────────────────────────────────────────────

/** Tên → id của danh mục thật (đã gồm các mục seed thêm từ catalog-additions.json). */
export interface GenerateCatalog {
  skillIds: ReadonlyMap<string, string>;
  majorIds: ReadonlyMap<string, string>;
  universityIds: ReadonlyMap<string, string>;
  cityIds: ReadonlyMap<string, string>;
  industryIds: ReadonlyMap<string, string>;
  companyTypeIds: ReadonlyMap<string, string>;
}

export interface GenerateOptions {
  seed: number;
  /** 1 = quy mô đủ; 0.1 để chạy thử. Phần trưng bày luôn sinh đủ. */
  scale: number;
  /** Giờ chạy; mọi mốc thời gian tính từ đây. */
  now: Date;
  passwordHash: string;
  /** fileUrl của CV mẫu đã tải lên Cloudinary (H4). */
  cvFileUrl: string;
  /** id gói "Doanh nghiệp". */
  planId: string;
  /** User Admin ghi vào dòng kiểm duyệt khi công ty cần duyệt tin. */
  adminUserId: string;
}

export const CANDIDATE_TIERS = ["rat-hop", "hop-mot-phan", "nganh-gan", "doi-nganh", "so-sai", "ca-kho"] as const;
export type CandidateTier = (typeof CANDIDATE_TIERS)[number];
type HardCase = "nhoi-tu-khoa" | "kinh-nghiem-khong-lien-quan";

/** Tỉ lệ nhóm ứng viên sinh thêm (PLAN "Ứng viên"; ngành gần / đổi ngành chia 12 / 8). */
export const TIER_WEIGHTS: Record<CandidateTier, number> = {
  "rat-hop": 15, "hop-mot-phan": 40, "nganh-gan": 12, "doi-nganh": 8, "so-sai": 15, "ca-kho": 10,
};
const LEVEL_WEIGHTS: Record<string, number> = { "nam-3": 35, "nam-cuoi": 40, "moi-tot-nghiep": 25 };
const JOB_TYPE_WEIGHTS = { INTERNSHIP: 70, PART_TIME: 15, FULL_TIME: 10, CONTRACT: 5 } as const;
type JobType = keyof typeof JOB_TYPE_WEIGHTS;
type JobPlanStatus = "PUBLISHED" | "CLOSED" | "EXPIRED" | "DRAFT" | "PENDING" | "REJECTED";
/** PLAN "Tin tuyển dụng": đang hiển thị 75, đóng / hết hạn 12, nháp 6, chờ duyệt 4, nháp bị từ chối 3. */
const JOB_STATUS_WEIGHTS: Record<JobPlanStatus, number> = { PUBLISHED: 75, CLOSED: 6, EXPIRED: 6, DRAFT: 6, PENDING: 4, REJECTED: 3 };

const REJECT_REASONS = [
  "Mô tả công việc còn chung chung, vui lòng ghi rõ nhiệm vụ hằng ngày của vị trí.",
  "Mức lương ghi trong tiêu đề không khớp với khoảng lương của tin.",
  "Phần yêu cầu có nội dung phân biệt giới tính, vui lòng chỉnh sửa trước khi gửi lại.",
  "Tin trùng với một tin đang hiển thị của công ty.",
];
/** Địa chỉ văn phòng chi nhánh (chỉ số nhà + đường, như companies.json). */
const BRANCH_ADDRESSES = ["Tầng 6, 18 Trần Phú", "Tầng 3, 45 Lê Lợi", "Tầng 8, 102 Nguyễn Văn Linh", "Tầng 4, 27 Hùng Vương", "Tầng 2, 66 Lý Thường Kiệt"];
/**
 * Trường cho ứng viên sinh thêm theo lĩnh vực vị trí. Lĩnh vực có hồ sơ trưng bày lấy thêm
 * trường của các hồ sơ đó (đã kiểm có trong danh mục); bảng này phủ các lĩnh vực còn lại.
 * Tên phải trùng danh mục University — thiếu thì bộ sinh dừng và báo tên.
 */
const DOMAIN_UNIVERSITIES: Record<string, string[]> = {
  "nhan-su": ["Trường Đại Học Lao Động – Xã Hội", "Đại Học Kinh Tế Quốc Dân", "Trường Đại Học Thương Mại", "Đại Học Kinh Tế TPHCM (KSA)", "Trường Đại Học Mở TPHCM"],
  "kinh-doanh": ["Trường Đại Học Thương Mại", "Trường Đại Học Tài Chính Marketing", "Đại Học Kinh Tế TPHCM (KSA)", "Trường Đại học Kinh Tế Luật TPHCM", "Trường Đại Học Kinh Tế – Đại Học Đà Nẵng"],
  "du-lich": ["Trường Đại Học Văn Hóa Hà Nội", "Trường Đại Học Văn Hóa TPHCM", "Trường Đại Học Khoa Học Xã Hội và Nhân Văn TPHCM", "Trường Đại Học Khoa Học Xã Hội và Nhân Văn Hà Nội", "Đại Học Duy Tân"],
  "giao-duc": ["Trường Đại Học Sư Phạm Hà Nội", "Trường Đại Học Sư Phạm TPHCM", "Trường Đại Học Ngoại Ngữ Hà Nội", "Trường Đại Học Ngoại Ngữ Đà Nẵng", "Trường Đại Học Ngoại Ngữ Huế"],
  "ky-thuat": ["Trường Đại Học Bách Khoa HCM", "Đại Học Bách Khoa Hà Nội", "Trường Đại Học Bách Khoa Đà Nẵng", "Trường Đại Học Sư Phạm Kỹ Thuật TPHCM", "Trường Đại Học Công Nghiệp Hà Nội", "Trường Đại Học Công Nghiệp TPHCM"],
};

/** Thông tin mỗi ứng viên cần cho phần 2b (chọn tin nộp, lời mời) và để in tài khoản demo. */
export interface CandidateFacts {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  position: string;
  level: string;
  tier: CandidateTier;
  hardCase: HardCase | null;
  /** id tin chính nếu là hồ sơ trưng bày — 2b không tạo đơn / lời mời vào tin này. */
  showcaseJobId: string | null;
  demoLogin: boolean;
  cvId: string | null;
  isOpenToOutreach: boolean;
  createdAt: Date;
  skills: { name: string; years: number }[];
  majors: string[];
}

export interface JobFacts {
  id: string;
  companyId: string;
  employerId: string;
  employerUserId: string;
  position: string;
  jobType: JobType;
  status: Prisma.JobPostCreateManyInput["status"];
  showcaseKey: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  closedAt: Date | null;
  minExperienceYears: number | null;
  skills: { name: string; importance: "REQUIRED" | "PREFERRED"; minYears: number | null }[];
  majors: { name: string; relevance: "PRIMARY" | "RELATED" }[];
}

export interface DemoAccount {
  email: string;
  role: "EMPLOYER" | "CANDIDATE";
  label: string;
}

export interface GeneratedLargeDemo {
  users: Prisma.UserCreateManyInput[];
  companies: Prisma.CompanyCreateManyInput[];
  employers: Prisma.EmployerCreateManyInput[];
  subscriptions: Prisma.CompanySubscriptionCreateManyInput[];
  jobPosts: Prisma.JobPostCreateManyInput[];
  jobPostSkills: Prisma.JobPostSkillCreateManyInput[];
  jobPostMajors: Prisma.JobPostMajorCreateManyInput[];
  moderationActions: Prisma.JobPostModerationActionCreateManyInput[];
  dailyStats: Prisma.JobPostDailyStatCreateManyInput[];
  candidates: Prisma.CandidateCreateManyInput[];
  educations: Prisma.EducationCreateManyInput[];
  workExperiences: Prisma.WorkExperienceCreateManyInput[];
  projects: Prisma.ProjectCreateManyInput[];
  certificates: Prisma.CertificateCreateManyInput[];
  candidateSkills: Prisma.CandidateSkillCreateManyInput[];
  cvs: Prisma.CvCreateManyInput[];
  facts: { candidates: CandidateFacts[]; jobs: JobFacts[] };
  demoAccounts: DemoAccount[];
  subscriptionEnd: Date;
}

// ─── Số ngẫu nhiên có seed ──────────────────────────────────────────────────

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<K extends string>(weights: Readonly<Record<K, number>>): K;
  sample<T>(items: readonly T[], count: number): T[];
}

/** mulberry32 (PLAN "Phần 1": không thêm dependency). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error("pick() trên danh sách rỗng");
      return items[Math.floor(next() * items.length)]!;
    },
    weighted: (weights) => {
      const entries = Object.entries(weights) as [keyof typeof weights, number][];
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [k, w] of entries) {
        roll -= w;
        if (roll < 0) return k;
      }
      return entries[entries.length - 1]![0];
    },
    sample: (items, count) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy.slice(0, Math.max(0, Math.min(count, copy.length)));
    },
  };
  return rng;
}

// ─── Thời gian (giờ Việt Nam) ───────────────────────────────────────────────

interface Clock {
  now: Date;
  /** Năm / tháng (1–12) Việt Nam của `now`. */
  year: number;
  month: number;
  /** Năm học bắt đầu tháng 9: tháng 11/2026 thuộc năm học 2026. */
  academicYear: number;
}

function makeClock(now: Date): Clock {
  const vn = new Date(now.getTime() + VN_OFFSET);
  const year = vn.getUTCFullYear();
  const month = vn.getUTCMonth() + 1;
  return { now, year, month, academicYear: month >= 9 ? year : year - 1 };
}

const monthIndexOf = (year: number, month: number) => year * 12 + (month - 1);
/** Đầu tháng (giờ Việt Nam) của chỉ số tháng. */
function monthStart(index: number): Date {
  return new Date(Date.UTC(Math.floor(index / 12), index % 12, 1) - VN_OFFSET);
}
/** Cuối tháng (23:59 giờ Việt Nam). */
function monthEnd(index: number): Date {
  return new Date(monthStart(index + 1).getTime() - 60 * 1000);
}
function parseYearMonth(value: string): number {
  const [y, m] = value.split("-").map(Number);
  return monthIndexOf(y!, m!);
}
const daysAgo = (clock: Clock, days: number, hours = 0) => new Date(clock.now.getTime() - days * DAY - hours * HOUR);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
/** Cột @db.Date lưu ngày Việt Nam dưới dạng nửa đêm UTC (như seed-dashboard-demo.ts). */
function vnDbDate(date: Date): Date {
  return new Date(Math.floor((date.getTime() + VN_OFFSET) / DAY) * DAY);
}

// ─── Tiện ích ───────────────────────────────────────────────────────────────

export function idOf(kind: string, key: string | number): string {
  const id = `${LARGE_DEMO_ID_PREFIX}${kind}${key}`.toLowerCase().replace(/-/g, "");
  if (!/^[0-9a-z]+$/.test(id)) throw new Error(`id demo không hợp lệ: ${id}`);
  return id;
}
const pad = (n: number, width: number) => String(n).padStart(width, "0");
const emailOf = (local: string) => `${local}@${LARGE_DEMO_EMAIL_DOMAIN}`;
const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/** Tra id theo tên; tên thiếu được gom lại để báo một lần. */
class Resolver {
  readonly missing = new Map<string, Set<string>>();
  constructor(private readonly catalog: GenerateCatalog) {}
  private get(kind: keyof GenerateCatalog, label: string, name: string): string {
    const id = this.catalog[kind].get(name);
    if (id) return id;
    if (!this.missing.has(label)) this.missing.set(label, new Set());
    this.missing.get(label)!.add(name);
    return "";
  }
  skill = (name: string) => this.get("skillIds", "kỹ năng", name);
  major = (name: string) => this.get("majorIds", "ngành học", name);
  university = (name: string) => this.get("universityIds", "trường", name);
  city = (name: string) => this.get("cityIds", "thành phố", name);
  industry = (name: string) => this.get("industryIds", "ngành nghề", name);
  companyType = (name: string) => this.get("companyTypeIds", "loại hình công ty", name);
}

// ─── Bộ sinh ────────────────────────────────────────────────────────────────

export function generateLargeDemo(library: LargeDemoLibrary, catalog: GenerateCatalog, options: GenerateOptions): GeneratedLargeDemo {
  if (!(options.scale > 0 && options.scale <= 1)) throw new Error(`scale phải trong (0, 1], đang là ${options.scale}`);
  const rng = createRng(options.seed);
  const clock = makeClock(options.now);
  const resolve = new Resolver(catalog);
  const { positions: positionsFile, companies: companiesFile, jobTemplates, personas: personasFile, names, showcase } = library;

  const positionByKey = new Map(positionsFile.positions.map((p) => [p.key, p]));
  const templateByPosition = new Map(jobTemplates.templates.map((t) => [t.position, t]));
  const groupByPosition = new Map(personasFile.groups.map((g) => [g.position, g]));
  const levelByKey = new Map(positionsFile.levels.map((l) => [l.key, l]));
  const need = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new Error(`Thư viện thiếu ${what}`);
    return value;
  };

  // Mốc viết thư viện → hôm chạy: dời năm học / tháng để cấp độ vẫn đúng (showcase.json `asOf`).
  const asOfIndex = parseYearMonth(showcase.asOf);
  const asOfMonth = (asOfIndex % 12) + 1;
  const asOfAcademic = asOfMonth >= 9 ? Math.floor(asOfIndex / 12) : Math.floor(asOfIndex / 12) - 1;
  const shiftYears = clock.academicYear - asOfAcademic;
  const nowMonthIndex = monthIndexOf(clock.year, clock.month);
  const shiftMonths = nowMonthIndex - asOfIndex;

  const out: GeneratedLargeDemo = {
    users: [], companies: [], employers: [], subscriptions: [], jobPosts: [], jobPostSkills: [], jobPostMajors: [],
    moderationActions: [], dailyStats: [], candidates: [], educations: [], workExperiences: [], projects: [],
    certificates: [], candidateSkills: [], cvs: [], facts: { candidates: [], jobs: [] }, demoAccounts: [],
    subscriptionEnd: addDays(clock.now, SUBSCRIPTION_DAYS),
  };
  const counters = { mod: 0, stat: 0, edu: 0, exp: 0, proj: 0, cert: 0 };
  const nextId = (kind: keyof typeof counters) => idOf(kind, ++counters[kind]);

  // ── Công ty + nhà tuyển dụng + gói ──
  const demoCompanyKeys = new Set(showcase.employers.map((e) => e.company));
  const otherCompanies = companiesFile.companies.filter((c) => !demoCompanyKeys.has(c.key));
  const companyCount = Math.max(demoCompanyKeys.size, Math.round(companiesFile.companies.length * options.scale));
  const chosenCompanies = [
    ...companiesFile.companies.filter((c) => demoCompanyKeys.has(c.key)),
    ...otherCompanies.slice(0, companyCount - demoCompanyKeys.size),
  ];

  interface EmployerRef { id: string; userId: string }
  interface CompanyRef { company: Company; id: string; requiresApproval: boolean; employers: EmployerRef[]; createdAt: Date }
  const companyRefs: CompanyRef[] = [];
  let employerSerial = 0;
  for (const company of chosenCompanies) {
    const id = idOf("comp", company.key);
    const createdAt = daysAgo(clock, rng.int(150, 700), rng.int(0, 10));
    const verifiedAt = addDays(createdAt, rng.int(1, 5));
    const requiresApproval = company.demoRole ? false : rng.chance(0.3);
    out.companies.push({
      id, name: company.name, description: company.description, industryId: resolve.industry(company.industry),
      companyTypeId: resolve.companyType(company.companyType), cityId: resolve.city(company.city), address: company.address,
      foundedYear: company.foundedYear, isVerified: true, requiresApproval, verifiedAt,
      verificationStatus: "VERIFIED", verificationMethod: "MANUAL_REVIEW", verificationSubmittedAt: addDays(verifiedAt, -1),
      createdAt, updatedAt: verifiedAt,
    });
    out.subscriptions.push({
      id: idOf("sub", company.key), companyId: id, planId: options.planId, startDate: clock.now,
      endDate: out.subscriptionEnd, status: "ACTIVE", createdAt: clock.now,
    });
    const ref: CompanyRef = { company, id, requiresApproval, employers: [], createdAt };
    const showcaseEmployer = showcase.employers.find((e) => e.company === company.key);
    for (let n = 0; n < company.employerCount; n++) {
      const demo = n === 0 ? showcaseEmployer : undefined;
      const local = demo ? demo.key : `ntd-${company.key}-${n + 1}`;
      const userId = idOf("user", demo ? `e${demo.key}` : `e${company.key}${n + 1}`);
      const employerId = idOf("emp", demo ? demo.key : `${company.key}${n + 1}`);
      const userCreatedAt = addDays(createdAt, n * rng.int(5, 40));
      out.users.push({
        id: userId, email: emailOf(local), passwordHash: options.passwordHash, role: "EMPLOYER", status: "ACTIVE",
        emailVerifiedAt: userCreatedAt, createdAt: userCreatedAt,
      });
      out.employers.push({
        id: employerId, userId, companyId: id, isCompanyAdmin: n === 0,
        title: demo ? demo.title : rng.pick(companiesFile.employerTitles),
        phone: `0911${pad(++employerSerial, 6)}`, createdAt: userCreatedAt,
      });
      ref.employers.push({ id: employerId, userId });
      if (demo) out.demoAccounts.push({ email: emailOf(local), role: "EMPLOYER", label: `${company.name}${company.demoRole === "main" ? " (công ty chính)" : ""}` });
    }
    companyRefs.push(ref);
  }
  const companyRefByKey = new Map(companyRefs.map((r) => [r.company.key, r]));

  // ── Tin ──
  const addJob = (input: {
    id: string; ref: CompanyRef; employer: EmployerRef; position: Position; jobType: JobType; title: string; variantIndex: number;
    status: JobPlanStatus; publishedAt: Date | null; createdAt: Date; expiresAt: Date; closedAt: Date | null;
    salary: [number, number] | null; majors: { primary: string[]; related: string[] }; minExperienceYears: number | null;
    skillMinYears: Record<string, number>; branchCity: string | null; showcaseKey: string | null;
  }) => {
    const template = need(templateByPosition.get(input.position.key), `mẫu tin của vị trí ${input.position.key}`);
    const variant = need(template.variants[input.variantIndex], `biến thể ${input.variantIndex} của ${input.position.key}`);
    const audienceKind = input.jobType === "INTERNSHIP" || input.jobType === "PART_TIME" ? "student" : "graduate";
    const benefits = [...rng.sample(jobTemplates.benefits[audienceKind], rng.int(3, 4)), ...template.benefits];
    const status: Prisma.JobPostCreateManyInput["status"] = input.status === "REJECTED" ? "DRAFT" : input.status;
    const lastTouch = input.closedAt ?? input.publishedAt ?? input.createdAt;
    out.jobPosts.push({
      id: input.id, companyId: input.ref.id, employerId: input.employer.id, title: input.title,
      description: variant.description,
      requirements: `${rng.pick(jobTemplates.audiences[audienceKind])} ${variant.requirements}`,
      benefits: benefits.map((line) => `- ${line}`).join("\n"),
      jobType: input.jobType, status,
      salaryMin: input.salary?.[0] ?? null, salaryMax: input.salary?.[1] ?? null, isNegotiable: input.salary === null,
      cityId: resolve.city(input.branchCity ?? input.ref.company.city),
      address: input.branchCity ? rng.pick(BRANCH_ADDRESSES) : input.ref.company.address,
      industryId: resolve.industry(input.ref.company.industry),
      publishedAt: input.publishedAt, expiresAt: input.expiresAt, closedAt: input.closedAt,
      minExperienceYears: input.minExperienceYears, createdAt: input.createdAt, updatedAt: lastTouch,
    });
    const skills: JobFacts["skills"] = [
      ...variant.skills.required.map((name) => ({ name, importance: "REQUIRED" as const })),
      ...variant.skills.preferred.map((name) => ({ name, importance: "PREFERRED" as const })),
    ].map((s) => ({ ...s, minYears: input.skillMinYears[s.name] ?? null }));
    for (const s of skills) {
      out.jobPostSkills.push({ jobPostId: input.id, skillId: resolve.skill(s.name), importance: s.importance, minYears: s.minYears });
    }
    const majors: JobFacts["majors"] = [
      ...input.majors.primary.map((name) => ({ name, relevance: "PRIMARY" as const })),
      ...input.majors.related.map((name) => ({ name, relevance: "RELATED" as const })),
    ];
    for (const m of majors) out.jobPostMajors.push({ jobPostId: input.id, majorId: resolve.major(m.name), relevance: m.relevance });

    // Kiểm duyệt: giống job-posts.service.ts — SUBMITTED do Employer; APPROVED actor null khi công ty không cần duyệt.
    const approver = input.ref.requiresApproval ? options.adminUserId : null;
    const moderation = (action: Prisma.JobPostModerationActionCreateManyInput["action"], actorId: string | null, at: Date, reason?: string) =>
      out.moderationActions.push({ id: nextId("mod"), jobPostId: input.id, action, actorId, reason: reason ?? null, createdAt: at });
    if (input.publishedAt) {
      const submittedAt = input.ref.requiresApproval ? new Date(input.publishedAt.getTime() - rng.int(2, 30) * HOUR) : input.publishedAt;
      moderation("SUBMITTED", input.employer.userId, submittedAt);
      moderation("APPROVED", approver, input.publishedAt);
    } else if (input.status === "PENDING") {
      moderation("SUBMITTED", input.employer.userId, addDays(input.createdAt, rng.int(0, 1)));
    } else if (input.status === "REJECTED") {
      const submittedAt = addDays(input.createdAt, rng.int(0, 1));
      moderation("SUBMITTED", input.employer.userId, submittedAt);
      moderation("REJECTED", options.adminUserId, new Date(submittedAt.getTime() + rng.int(3, 40) * HOUR), rng.pick(REJECT_REASONS));
    }

    // Lượt xem theo ngày, tối đa 60 ngày gần nhất (PLAN "Tin tuyển dụng"); viewCount = tổng.
    let views = 0;
    if (input.publishedAt) {
      const popularity = input.showcaseKey ? rng.int(15, 30) : rng.int(2, 18);
      const until = input.closedAt ?? (input.expiresAt < clock.now ? input.expiresAt : clock.now);
      const firstDay = Math.max(vnDbDate(input.publishedAt).getTime(), vnDbDate(daysAgo(clock, 59)).getTime());
      for (let day = firstDay; day <= vnDbDate(until).getTime(); day += DAY) {
        const age = (day - firstDay) / DAY;
        const count = Math.max(0, Math.round(popularity * (age < 3 ? 1.6 : 1) * (0.4 + rng.next()) - age * 0.08));
        if (count === 0) continue;
        out.dailyStats.push({ id: nextId("stat"), jobPostId: input.id, date: new Date(day), views: count });
        views += count;
      }
    }
    out.jobPosts[out.jobPosts.length - 1]!.viewCount = views;

    out.facts.jobs.push({
      id: input.id, companyId: input.ref.id, employerId: input.employer.id, employerUserId: input.employer.userId,
      position: input.position.key, jobType: input.jobType, status, showcaseKey: input.showcaseKey,
      publishedAt: input.publishedAt, expiresAt: input.expiresAt, closedAt: input.closedAt,
      minExperienceYears: input.minExperienceYears, skills, majors,
    });
  };

  // Tin chính (showcase.json): đang hiển thị, đăng bởi tài khoản nhà tuyển dụng demo.
  for (const job of showcase.jobs as ShowcaseJob[]) {
    const employerDef = need(showcase.employers.find((e) => e.key === job.employer), `nhà tuyển dụng ${job.employer}`);
    const ref = need(companyRefByKey.get(employerDef.company), `công ty ${employerDef.company}`);
    const publishedAt = daysAgo(clock, job.publishedDaysAgo, rng.int(1, 8));
    addJob({
      id: idOf("job", `sc${job.key}`), ref, employer: ref.employers[0]!, position: need(positionByKey.get(job.position), `vị trí ${job.position}`),
      jobType: job.jobType, title: job.title, variantIndex: job.variant, status: "PUBLISHED", publishedAt,
      createdAt: addDays(publishedAt, -rng.int(0, 2)), expiresAt: addDays(clock.now, job.expiresInDays), closedAt: null,
      salary: job.salary, majors: job.majors, minExperienceYears: job.minExperienceYears, skillMinYears: job.skillMinYears ?? {},
      branchCity: null, showcaseKey: job.key,
    });
  }

  // Tin sinh thêm: công ty chọn theo trọng số (công ty chính gấp đôi), vị trí trong `positions` của công ty.
  const companyWeights = Object.fromEntries(companyRefs.map((r) => [
    r.company.key, (r.company.employerCount + r.company.positions.length / 2) * (r.company.demoRole === "main" ? 2 : 1),
  ])) as Record<string, number>;
  const generatedJobs = Math.round(FULL_SCALE.generatedJobs * options.scale);
  for (let i = 1; i <= generatedJobs; i++) {
    const ref = companyRefByKey.get(rng.weighted(companyWeights))!;
    const position = need(positionByKey.get(rng.pick(ref.company.positions)), "vị trí của công ty");
    const template = need(templateByPosition.get(position.key), `mẫu tin của vị trí ${position.key}`);
    const jobType = rng.weighted(JOB_TYPE_WEIGHTS);
    const status = rng.weighted(JOB_STATUS_WEIGHTS);
    let publishedAt: Date | null = null;
    let closedAt: Date | null = null;
    let expiresAt = addDays(clock.now, rng.int(7, 85));
    let createdAt: Date;
    if (status === "PUBLISHED") {
      publishedAt = daysAgo(clock, rng.chance(0.6) ? rng.int(0, 29) : rng.int(30, 74), rng.int(0, 12));
      createdAt = addDays(publishedAt, -rng.int(0, 3));
    } else if (status === "CLOSED") {
      publishedAt = daysAgo(clock, rng.int(30, 74), rng.int(0, 12));
      closedAt = addDays(publishedAt, rng.int(10, 25));
      createdAt = addDays(publishedAt, -rng.int(0, 3));
    } else if (status === "EXPIRED") {
      publishedAt = daysAgo(clock, rng.int(45, 74), rng.int(0, 12));
      expiresAt = daysAgo(clock, rng.int(1, 14));
      createdAt = addDays(publishedAt, -rng.int(0, 3));
    } else {
      createdAt = daysAgo(clock, rng.int(0, 20), rng.int(0, 12));
    }
    const band = need(positionsFile.salaryBands[position.salaryBand], `khung lương ${position.salaryBand}`)[jobType];
    let salary: [number, number] | null = null;
    if (!rng.chance(0.3)) {
      const [low, high] = band;
      const min = roundTo(low + rng.next() * (high - low) * 0.5, 500_000);
      salary = [min, Math.min(high, Math.max(min + 500_000, roundTo(min + (high - low) * (0.25 + rng.next() * 0.3), 500_000)))];
    }
    const majors = rng.chance(0.7)
      ? { primary: rng.sample(position.majors.primary, rng.int(1, 2)), related: rng.sample(position.majors.related, rng.int(0, 3)) }
      : { primary: [], related: [] };
    const senior = jobType === "FULL_TIME" || jobType === "CONTRACT";
    const minExperienceYears = senior ? (rng.chance(0.6) ? rng.pick([1, 1.5, 2]) : null) : (rng.chance(0.12) ? 0.5 : null);
    const variantIndex = rng.int(0, template.variants.length - 1);
    const variant = template.variants[variantIndex]!;
    const skillMinYears: Record<string, number> = {};
    for (const name of [...variant.skills.required, ...variant.skills.preferred]) {
      if (rng.chance(0.3)) skillMinYears[name] = senior ? rng.pick([1, 1.5, 2]) : 0.5;
    }
    addJob({
      id: idOf("job", pad(i, 4)), ref, employer: rng.pick(ref.employers), position, jobType,
      title: rng.pick(template.titles[jobType]), variantIndex, status, publishedAt, createdAt, expiresAt, closedAt, salary, majors,
      minExperienceYears, skillMinYears,
      branchCity: ref.company.branchCities.length > 0 && rng.chance(0.1) ? rng.pick(ref.company.branchCities) : null,
      showcaseKey: null,
    });
  }

  // ── Ứng viên ──
  const familyWeights = Object.fromEntries(names.familyNames.map((f) => [f.name, f.weight])) as Record<string, number>;
  const cityWeights: Record<string, number> = {};
  for (const company of companiesFile.companies) cityWeights[company.city] = (cityWeights[company.city] ?? 0) + 1;
  const domainOf = (positionKey: string) => need(positionByKey.get(positionKey), `vị trí ${positionKey}`).domain;
  const universitiesByDomain = new Map<string, Set<string>>();
  for (const [domain, list] of Object.entries(DOMAIN_UNIVERSITIES)) universitiesByDomain.set(domain, new Set(list));
  const allUniversities = new Set<string>(Object.values(DOMAIN_UNIVERSITIES).flat());
  for (const candidate of showcase.candidates) {
    const job = need(showcase.jobs.find((j) => j.key === candidate.job), `tin chính ${candidate.job}`);
    const domain = domainOf(job.position);
    if (!universitiesByDomain.has(domain)) universitiesByDomain.set(domain, new Set());
    for (const e of candidate.educations) {
      universitiesByDomain.get(domain)!.add(e.university);
      allUniversities.add(e.university);
    }
  }
  const universityPool = (domain: string | null) => [...(domain ? universitiesByDomain.get(domain) ?? allUniversities : allUniversities)];

  let candidateSerial = 0;
  const pushCandidate = (input: {
    key: string; local: string; tier: CandidateTier; hardCase: HardCase | null; position: string; level: string;
    showcaseJobId: string | null; demoLogin: boolean; fullName: string; gender: "MALE" | "FEMALE"; dateOfBirth: Date; city: string;
    headline: string; bio: string | null; isOpenToOutreach: boolean; hasCv: boolean; createdAt: Date;
    educations: { university: string; major: string; startYear: number; endYear: number; isCurrent: boolean }[];
    experiences: { company: string; position: string; startDate: Date; endDate: Date | null; description: string }[];
    projects: { name: string; description: string }[];
    certificates: { name: string; issuer: string; issueDate: Date }[];
    skills: { name: string; years: number }[];
  }) => {
    candidateSerial++;
    const userId = idOf("user", `c${input.key}`);
    const id = idOf("cand", input.key);
    out.users.push({
      id: userId, email: emailOf(input.local), passwordHash: options.passwordHash, role: "CANDIDATE", status: "ACTIVE",
      emailVerifiedAt: input.createdAt, createdAt: input.createdAt,
    });
    out.candidates.push({
      id, userId, fullName: input.fullName, headline: input.headline, bio: input.bio, phone: `0900${pad(candidateSerial, 6)}`,
      dateOfBirth: input.dateOfBirth, gender: input.gender, cityId: resolve.city(input.city),
      isOpenToOutreach: input.isOpenToOutreach, createdAt: input.createdAt, updatedAt: input.createdAt,
    });
    for (const e of input.educations) {
      out.educations.push({
        id: nextId("edu"), candidateId: id, universityId: resolve.university(e.university), majorId: resolve.major(e.major),
        degree: "Đại học", startYear: e.startYear, endYear: e.endYear, isCurrent: e.isCurrent, createdAt: input.createdAt,
      });
    }
    for (const e of input.experiences) {
      out.workExperiences.push({
        id: nextId("exp"), candidateId: id, company: e.company, position: e.position, startDate: e.startDate,
        endDate: e.endDate, isCurrent: e.endDate === null, description: e.description, createdAt: input.createdAt,
      });
    }
    for (const p of input.projects) {
      out.projects.push({ id: nextId("proj"), candidateId: id, name: p.name, description: p.description, createdAt: input.createdAt });
    }
    for (const c of input.certificates) {
      out.certificates.push({ id: nextId("cert"), candidateId: id, name: c.name, issuer: c.issuer, issueDate: c.issueDate, createdAt: input.createdAt });
    }
    for (const s of input.skills) out.candidateSkills.push({ candidateId: id, skillId: resolve.skill(s.name), yearsOfExperience: s.years });
    const cvId = input.hasCv ? idOf("cv", input.key) : null;
    if (cvId) {
      out.cvs.push({
        id: cvId, candidateId: id, fileUrl: options.cvFileUrl, fileName: `CV ${input.fullName}.pdf`, isDefault: true,
        uploadedAt: new Date(input.createdAt.getTime() + rng.int(1, 48) * HOUR),
      });
    }
    out.facts.candidates.push({
      id, userId, email: emailOf(input.local), fullName: input.fullName, position: input.position, level: input.level,
      tier: input.tier, hardCase: input.hardCase, showcaseJobId: input.showcaseJobId, demoLogin: input.demoLogin, cvId,
      isOpenToOutreach: input.isOpenToOutreach, createdAt: input.createdAt, skills: input.skills,
      majors: input.educations.map((e) => e.major),
    });
    if (input.demoLogin) out.demoAccounts.push({ email: emailOf(input.local), role: "CANDIDATE", label: `${input.fullName} — ${input.tier}` });
  };

  // Hồ sơ trưng bày: viết trọn, chỉ dời mốc thời gian theo `asOf`.
  // Việc đã kết thúc phải xong trước tháng chạy (cuối tháng hiện tại còn ở tương lai).
  const clampMonth = (index: number) => Math.min(index, nowMonthIndex - 1);
  for (const c of showcase.candidates as ShowcaseCandidate[]) {
    const job = need(showcase.jobs.find((j) => j.key === c.job), `tin chính ${c.job}`);
    pushCandidate({
      key: `sc${c.key}`, local: c.key, tier: c.tier, hardCase: c.hardCase ?? null, position: job.position, level: c.level,
      showcaseJobId: idOf("job", `sc${job.key}`), demoLogin: c.demoLogin ?? false, fullName: c.fullName, gender: c.gender,
      dateOfBirth: new Date(Date.UTC(c.birthYear + shiftYears, rng.int(0, 11), rng.int(1, 28))), city: c.city,
      headline: c.headline, bio: c.bio ?? null, isOpenToOutreach: true, hasCv: true,
      createdAt: daysAgo(clock, rng.int(10, 120), rng.int(0, 20)),
      educations: c.educations.map((e) => ({ ...e, startYear: e.startYear + shiftYears, endYear: e.endYear + shiftYears })),
      experiences: c.experiences.map((e) => ({
        company: e.company, position: e.position, description: e.description,
        startDate: monthStart(clampMonth(parseYearMonth(e.start) + shiftMonths)),
        endDate: e.end === null ? null : monthEnd(clampMonth(parseYearMonth(e.end) + shiftMonths)),
      })),
      projects: c.projects,
      certificates: c.certificates.map((cert) => ({
        name: cert.name, issuer: cert.issuer,
        issueDate: new Date(Math.min(Date.UTC(cert.year + shiftYears, rng.int(0, 11), 15), clock.now.getTime())),
      })),
      skills: c.skills,
    });
  }

  // Ứng viên sinh thêm từ bộ chân dung. Vị trí chọn theo số tin của vị trí (+1) để cung gần cầu.
  const positionWeights: Record<string, number> = {};
  for (const p of positionsFile.positions) positionWeights[p.key] = 1;
  for (const j of out.facts.jobs) positionWeights[j.position] = (positionWeights[j.position] ?? 1) + 1;
  const otherPositions = (domain: string) => positionsFile.positions.filter((p) => p.domain !== domain);
  const majorMentionCache = new Map<string, string[]>();
  /** Tên ngành (trong nhóm ngành của chính vị trí) mà văn bản bộ chân dung nhắc tới. */
  const mentionedMajors = (persona: Persona, position: Position): string[] => {
    const cached = majorMentionCache.get(persona.key);
    if (cached) return cached;
    const names = [...position.majors.primary, ...position.majors.related];
    const text = [persona.headline, persona.bio, ...persona.experiences.map((e) => `${e.position} ${e.description}`),
      ...persona.projects.map((p) => `${p.name} ${p.description}`)].join(" | ");
    const found = mentionedNames(text, names);
    majorMentionCache.set(persona.key, found);
    return found;
  };
  const allPastCompanies = Object.values(personasFile.pastCompanies).flat();
  const unrelatedCompanies = [...(personasFile.pastCompanies["du-lich"] ?? []), ...(personasFile.pastCompanies["kinh-doanh"] ?? [])];

  const generatedCandidates = Math.round(FULL_SCALE.generatedCandidates * options.scale);
  for (let i = 1; i <= generatedCandidates; i++) {
    const positionKey = rng.weighted(positionWeights);
    const position = positionByKey.get(positionKey)!;
    const group = need(groupByPosition.get(positionKey), `chân dung của vị trí ${positionKey}`);
    const tier = rng.weighted(TIER_WEIGHTS);
    const hardCase: HardCase | null = tier === "ca-kho" ? (rng.chance(0.5) ? "nhoi-tu-khoa" : "kinh-nghiem-khong-lien-quan") : null;
    // Ngành học được phép theo nhóm (library-prompt.md "Bộ sinh dùng chân dung thế nào").
    const majorPool = tier === "nganh-gan" ? position.majors.related : position.majors.primary;
    let persona: Persona;
    let majorChoices: readonly string[];
    if (tier === "doi-nganh") {
      persona = rng.pick(group.personas.filter((p) => p.kind === "career-switch"));
      majorChoices = persona.fromMajors ?? position.majors.related;
    } else {
      let levelKey = rng.weighted(LEVEL_WEIGHTS);
      if (hardCase === "kinh-nghiem-khong-lien-quan" && levelKey === "nam-3") levelKey = "nam-cuoi";
      const atLevel = group.personas.filter((p) => p.kind === "standard" && p.level === levelKey);
      // Văn bản vài bộ chân dung nhắc tên ngành của vị trí ("Mình học Ngôn ngữ Anh…"): chỉ dùng bộ
      // không nhắc ngành nằm ngoài nhóm được phép, và nếu bộ có nhắc thì chọn đúng ngành đó.
      const fitting = atLevel.filter((p) => mentionedMajors(p, position).every((m) => majorPool.includes(m)));
      persona = rng.pick(fitting.length > 0 ? fitting : atLevel);
      const mentioned = mentionedMajors(persona, position).filter((m) => majorPool.includes(m));
      majorChoices = mentioned.length > 0 ? mentioned : majorPool;
    }
    const level = need(levelByKey.get(persona.level), `cấp độ ${persona.level}`);
    const gender = rng.chance(0.5) ? "MALE" : "FEMALE";
    const given = rng.pick(names.givenNames[gender]);
    const middle = rng.pick(names.middleNames[gender].filter((m) => m !== given));
    const fullName = `${rng.weighted(familyWeights)} ${middle} ${given}`;
    const birthYear = rng.int(level.birthYears[0], level.birthYears[1]) + shiftYears;

    const major = rng.pick(majorChoices);
    const university = rng.pick(universityPool(tier === "doi-nganh" ? null : position.domain));
    let startYear: number;
    let endYear: number;
    const studying = level.studyYear !== null;
    if (level.studyYear !== null) {
      startYear = clock.academicYear - level.studyYear + 1;
      endYear = startYear + 4;
    } else {
      endYear = clock.academicYear - rng.int(1, 2);
      startYear = endYear - 4;
    }
    const educations = [{ university, major, startYear, endYear, isCurrent: studying }];
    if (rng.chance(0.15)) {
      // Chuyển trường sau năm nhất: dòng cũ đã kết thúc, cùng nhóm ngành.
      const others = universityPool(tier === "doi-nganh" ? null : position.domain).filter((u) => u !== university);
      if (others.length > 0) {
        educations.unshift({ university: rng.pick(others), major, startYear: startYear - 1, endYear: startYear, isCurrent: false });
      }
    }

    // Kinh nghiệm: xếp lùi từ hôm nay, tổng không vượt mức của cấp độ; người đã tốt nghiệp đi làm sau khi ra trường.
    const maxMonths = Math.round(level.experienceYears[1] * 12);
    const earliestMonth = studying ? monthIndexOf(startYear, 9) : monthIndexOf(endYear, 7);
    const rawExperiences = hardCase === "kinh-nghiem-khong-lien-quan"
      ? rng.sample(personasFile.unrelatedJobs, level.studyYear === null ? 2 : 1).map((job) => ({
        ...job, months: [Math.max(3, Math.floor(maxMonths / 2)), maxMonths] as [number, number], company: rng.pick(unrelatedCompanies),
      }))
      : tier === "so-sai" ? []
      : persona.experiences.map((e) => ({
        ...e, company: rng.pick(persona.kind === "career-switch" ? allPastCompanies : personasFile.pastCompanies[position.domain] ?? allPastCompanies),
      }));
    const experiences: { company: string; position: string; startDate: Date; endDate: Date | null; description: string }[] = [];
    let cursor = nowMonthIndex - rng.int(1, 3);
    let budget = maxMonths;
    rawExperiences.forEach((e, index) => {
      const ongoing = index === 0 && level.studyYear === null && rng.chance(0.5);
      const endMonth = ongoing ? nowMonthIndex : cursor;
      const length = Math.min(rng.int(e.months[0], e.months[1]), budget, endMonth - earliestMonth + 1);
      if (length < 1) return;
      const startMonth = endMonth - length + 1;
      experiences.push({ company: e.company, position: e.position, description: e.description,
        startDate: monthStart(startMonth), endDate: ongoing ? null : monthEnd(endMonth) });
      budget -= length;
      cursor = startMonth - 1 - rng.int(0, 2);
    });
    // Danh sách hiển thị việc gần nhất trước, nên giữ thứ tự xếp lùi.

    // Kỹ năng và số năm theo cấp độ; nhóm hợp một phần bớt kỹ năng lõi, ca khó nhồi kỹ năng vị trí khác.
    const core = new Set(position.skills.core);
    const baseYears = level.key === "nam-3" ? [0.5] : level.key === "nam-cuoi" ? [0.5, 1] : [1, 1.5, 2];
    const yearsFor = (name: string) => {
      if (rng.chance(0.15)) return 0; // 0 = chưa khai (quy ước D1 Job Matcher GĐ1)
      const base = rng.pick(baseYears);
      return core.has(name) ? base : Math.max(0.5, base - 0.5);
    };
    let skillNames = [...persona.skills];
    // Hợp một phần: 60% bớt 1–2 kỹ năng lõi (khi còn ≥ 1 lõi), còn lại hạ số năm.
    let lowerYears = false;
    if (tier === "hop-mot-phan") {
      const coreHeld = skillNames.filter((n) => core.has(n));
      if (coreHeld.length >= 3 && rng.chance(0.6)) {
        const drop = new Set(rng.sample(coreHeld, rng.int(1, 2)));
        skillNames = skillNames.filter((n) => !drop.has(n));
      } else {
        lowerYears = true;
      }
    }
    if (tier === "so-sai") {
      skillNames = [...skillNames.filter((n) => core.has(n)), ...skillNames.filter((n) => !core.has(n))].slice(0, rng.int(2, 3));
    }
    if (hardCase === "nhoi-tu-khoa") {
      const extra = rng.sample(otherPositions(position.domain), 3).flatMap((p) => [...p.skills.core, ...p.skills.extra]);
      for (const name of rng.sample(extra, extra.length)) {
        if (skillNames.length >= 13) break;
        if (!skillNames.includes(name)) skillNames.push(name);
      }
    }
    const skills = skillNames.map((name) => ({
      name,
      years: hardCase === "nhoi-tu-khoa" ? rng.pick([1, 1.5, 2])
        : tier === "so-sai" ? rng.pick([0, 0.5])
        : lowerYears ? Math.min(0.5, yearsFor(name))
        : yearsFor(name),
    }));

    // Nhồi từ khoá: tiêu đề là chuỗi tên kỹ năng (như hồ sơ trưng bày ca khó), ≤ 100 ký tự.
    let headline = persona.headline;
    if (hardCase === "nhoi-tu-khoa") {
      headline = skillNames[0]!;
      for (const name of skillNames.slice(1)) {
        if (`${headline} | ${name}`.length > 100) break;
        headline = `${headline} | ${name}`;
      }
    }
    const sparse = tier === "so-sai";
    pushCandidate({
      key: pad(i, 4), local: `ung-vien-${pad(i, 4)}`, tier, hardCase, position: positionKey, level: level.key,
      showcaseJobId: null, demoLogin: false, fullName, gender,
      dateOfBirth: new Date(Date.UTC(birthYear, rng.int(0, 11), rng.int(1, 28))),
      city: rng.weighted(cityWeights), headline,
      bio: sparse ? null : `${persona.bio} ${rng.pick(personasFile.bioTails)}`,
      isOpenToOutreach: rng.chance(0.7), hasCv: !rng.chance(0.1),
      createdAt: daysAgo(clock, rng.int(5, 200), rng.int(0, 20)),
      educations, experiences, projects: sparse ? [] : persona.projects,
      certificates: !sparse && rng.chance(0.3)
        ? [{ ...rng.pick(group.certificates), issueDate: daysAgo(clock, rng.int(30, 600)) }]
        : [],
      skills,
    });
  }

  if (resolve.missing.size > 0) {
    const detail = [...resolve.missing].map(([label, set]) => `${label}: ${[...set].join(", ")}`).join("; ");
    throw new Error(`Danh mục thiếu (chạy seed thêm catalog-additions trước?) — ${detail}`);
  }
  for (const job of out.facts.jobs) {
    if (job.expiresAt && job.expiresAt > out.subscriptionEnd) {
      throw new Error(`Tin ${job.id} hết hạn sau ngày kết thúc gói — cron job-post-expiry sẽ đóng tin (D6)`);
    }
  }
  return out;
}
