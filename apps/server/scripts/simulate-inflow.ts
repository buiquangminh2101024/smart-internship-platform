// Mô phỏng ứng viên mới / tin mới đổ vào theo đợt (0.6 bước 9, D10, Q4) — đặc tả:
// docs/06-backend/live-rescore/PLAN.md
//
//   npm run simulate-inflow --workspace server -- --candidates 50 --jobs 5
//   npm run simulate-inflow --workspace server -- --waves 5 --every 60 --candidates 20 --jobs 2
//   npm run simulate-inflow --workspace server -- --dry-run      in sẽ tạo gì, không gọi API, không ghi
//   npm run simulate-inflow --workspace server -- --reset        xoá mọi thứ script đã tạo (thêm --dry-run để chỉ đếm)
//   thêm `--wait` để chờ tới khi hết người chờ chấm và in thời gian, `--seed <số>` để đổi bộ,
//   `--concurrency <số>` (mặc định 8) số ứng viên gửi song song.
//
// Gọi HTTP API qua gateway (`SIMULATE_BASE_URL`, mặc định http://localhost:8080) như người dùng
// thật (Q4): hẹn giờ chờ, lượt chấm, việc kéo theo và realtime chạy trong process server.
// - Ứng viên: email `ung-vien-inflow-NNNN@inflow-demo.local`, đăng ký bằng OTP cố định của dev,
//   điền hồ sơ từng mục (học vấn, kinh nghiệm, dự án, chứng chỉ, kỹ năng), bật / tắt cho liên hệ.
// - Tin: tiêu đề bắt đầu bằng `[Mô phỏng] `, đăng bởi tài khoản nhà tuyển dụng của bốn công ty demo
//   (mật khẩu demo lớn), gửi duyệt; Admin duyệt nếu tin chờ duyệt.
// - Hồ sơ và tin lấy từ bộ sinh demo lớn (scripts/lib/large-demo), nên giống dữ liệu demo đang có.
// Script chỉ ĐỌC DB (danh mục, tài khoản), trừ `--reset` xoá thẳng bằng Prisma theo miền email và
// tiền tố tiêu đề.
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createRng, generateLargeDemo, FULL_SCALE, type GenerateCatalog, type GeneratedLargeDemo } from "./lib/large-demo/generate";
import {
  companiesFileSchema, jobTemplatesFileSchema, namesFileSchema, personasFileSchema, positionsFileSchema, showcaseFileSchema,
  catalogAdditionsSchema, type LargeDemoLibrary,
} from "./lib/large-demo/library";

const DATA_DIR = path.join(__dirname, "data", "large-demo");
const EMAIL_DOMAIN = "inflow-demo.local";
const EMAIL_PREFIX = "ung-vien-inflow-";
const JOB_TITLE_PREFIX = "[Mô phỏng] ";
const CANDIDATE_PASSWORD = "Inflow@2026";
const DEMO_EMPLOYER_PASSWORD = "123456789"; // mật khẩu bộ demo lớn
/** Giới hạn OTP theo IP của server (bước 0 mục 6). */
const OTP_PER_HOUR_PER_IP = 1_000;
const WAIT_LIMIT_MS = 15 * 60 * 1000;

const prisma = new PrismaClient();

function fail(message: string): never {
  throw new Error(message);
}

// ─── Tham số ────────────────────────────────────────────────────────────────

interface Args {
  mode: "run" | "reset";
  dryRun: boolean;
  candidates: number;
  jobs: number;
  waves: number;
  everySeconds: number;
  concurrency: number;
  seed: number;
  wait: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    mode: "run", dryRun: false, candidates: 20, jobs: 2, waves: 1, everySeconds: 60, concurrency: 8,
    seed: Date.now() % 1_000_000_000, wait: false,
  };
  const numbers: Record<string, keyof Args> = {
    "--candidates": "candidates", "--jobs": "jobs", "--waves": "waves", "--every": "everySeconds",
    "--concurrency": "concurrency", "--seed": "seed",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--reset") args.mode = "reset";
    else if (arg === "--wait") args.wait = true;
    else if (arg in numbers) {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 0) fail(`${arg} cần số nguyên ≥ 0`);
      (args as unknown as Record<string, number>)[numbers[arg]!] = value;
    } else fail(`Tham số lạ: ${arg}`);
  }
  if (args.waves < 1) fail("--waves cần ≥ 1");
  if (args.concurrency < 1) fail("--concurrency cần ≥ 1");
  return args;
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

const BASE_URL = (process.env.SIMULATE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

class ApiError extends Error {}

async function api<T>(method: string, url: string, token: string | null, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}/api${url}`, init);
  const text = await res.text();
  if (!res.ok) throw new ApiError(`${method} ${url} → ${res.status} ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as { data?: T };
  return (json.data ?? json) as T;
}

const login = async (email: string, password: string) =>
  (await api<{ accessToken: string }>("POST", "/auth/login", null, { email, password })).accessToken;

/** Chạy `worker` cho từng phần tử, tối đa `limit` việc cùng lúc. */
async function pool<T>(items: readonly T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const run = async () => {
    while (next < items.length) await worker(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

// ─── Thư viện + danh mục ────────────────────────────────────────────────────

async function loadLibrary(): Promise<LargeDemoLibrary> {
  const read = async (file: string) => JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf8")) as unknown;
  return {
    positions: positionsFileSchema.parse(await read("positions.json")),
    catalogAdditions: catalogAdditionsSchema.parse(await read("catalog-additions.json")),
    names: namesFileSchema.parse(await read("names.json")),
    companies: companiesFileSchema.parse(await read("companies.json")),
    jobTemplates: jobTemplatesFileSchema.parse(await read("job-templates.json")),
    personas: personasFileSchema.parse(await read("personas.json")),
    showcase: showcaseFileSchema.parse(await read("showcase.json")),
  };
}

/** Tên → id của danh mục đang có (gồm mục demo lớn đã thêm). Chỉ kỹ năng / ngành / trường APPROVED. */
async function loadCatalog(): Promise<GenerateCatalog> {
  const [skills, majors, universities, cities, industries, companyTypes] = await Promise.all([
    prisma.skill.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true } }),
    prisma.major.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true } }),
    prisma.university.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true } }),
    prisma.city.findMany({ select: { id: true, name: true } }),
    prisma.industry.findMany({ select: { id: true, name: true } }),
    prisma.companyType.findMany({ select: { id: true, name: true } }),
  ]);
  const byName = (rows: { id: string; name: string }[]) => new Map(rows.map((row) => [row.name, row.id]));
  return {
    skillIds: byName(skills), majorIds: byName(majors), universityIds: byName(universities),
    cityIds: byName(cities), industryIds: byName(industries), companyTypeIds: byName(companyTypes),
  };
}

// ─── Kế hoạch: hồ sơ và tin lấy từ bộ sinh ──────────────────────────────────

/** Trường tuỳ chọn nhận cả `undefined` (exactOptionalPropertyTypes): bộ sinh để null / thiếu thì không gửi. */
type Maybe<T> = T | undefined;

interface CandidatePlan {
  email: string;
  profile: { fullName: string; headline: Maybe<string>; bio: Maybe<string>; dateOfBirth: Maybe<string>; gender: Maybe<"MALE" | "FEMALE">; cityId: Maybe<string> };
  educations: { universityId: Maybe<string>; majorId: Maybe<string>; degree: Maybe<string>; startYear: Maybe<number>; endYear: Maybe<number>; isCurrent: Maybe<boolean> }[];
  experiences: { company: string; position: string; startDate: Maybe<string>; endDate: Maybe<string>; isCurrent: Maybe<boolean>; description: Maybe<string> }[];
  projects: { name: string; description: Maybe<string> }[];
  certificates: { name: string; issuer: Maybe<string>; issueDate: Maybe<string> }[];
  skills: { skillId: string; yearsOfExperience: Maybe<number> }[];
  isOpenToOutreach: boolean;
}

interface JobPlan {
  employerEmail: string;
  companyName: string;
  body: Record<string, unknown>;
}

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : undefined);
const opt = <T>(value: T | null | undefined): T | undefined => (value === null ? undefined : value);

function candidatePlans(generated: GeneratedLargeDemo, emails: string[]): CandidatePlan[] {
  // Chỉ ứng viên sinh thêm (bỏ hồ sơ trưng bày), theo thứ tự bộ sinh.
  const facts = generated.facts.candidates.filter((c) => c.showcaseJobId === null).slice(0, emails.length);
  const rowsOf = <R extends { candidateId: string }>(rows: R[], id: string) => rows.filter((row) => row.candidateId === id);
  return facts.map((fact, index) => {
    const row = generated.candidates.find((c) => c.id === fact.id)!;
    return {
      email: emails[index]!,
      profile: {
        fullName: row.fullName ?? fact.fullName, headline: opt(row.headline), bio: opt(row.bio),
        dateOfBirth: iso(row.dateOfBirth), gender: (opt(row.gender) as "MALE" | "FEMALE" | undefined), cityId: opt(row.cityId),
      },
      educations: rowsOf(generated.educations, fact.id).map((e) => ({
        universityId: opt(e.universityId), majorId: opt(e.majorId), degree: opt(e.degree),
        startYear: opt(e.startYear), endYear: opt(e.endYear), isCurrent: opt(e.isCurrent),
      })),
      experiences: rowsOf(generated.workExperiences, fact.id).map((e) => ({
        company: e.company, position: e.position, startDate: iso(e.startDate), endDate: iso(e.endDate),
        isCurrent: opt(e.isCurrent), description: opt(e.description),
      })),
      projects: rowsOf(generated.projects, fact.id).map((p) => ({ name: p.name, description: opt(p.description) })),
      certificates: rowsOf(generated.certificates, fact.id).map((c) => ({ name: c.name, issuer: opt(c.issuer), issueDate: iso(c.issueDate) })),
      skills: rowsOf(generated.candidateSkills, fact.id).map((s) => ({ skillId: s.skillId, yearsOfExperience: opt(s.yearsOfExperience) })),
      isOpenToOutreach: fact.isOpenToOutreach,
    };
  });
}

/** Tin đang hiển thị của bộ sinh thuộc bốn công ty demo, bỏ tin chính (showcase). */
function jobPlans(
  generated: GeneratedLargeDemo,
  count: number,
  employers: Map<string, { email: string; companyName: string }>,
  rng: ReturnType<typeof createRng>,
): JobPlan[] {
  const candidates = generated.facts.jobs.filter((j) => j.status === "PUBLISHED" && j.showcaseKey === null && employers.has(j.employerId));
  if (candidates.length < count) fail(`Bộ sinh chỉ có ${candidates.length} tin của công ty demo, cần ${count}: giảm --jobs hoặc đổi --seed`);
  const maxExpiry = Date.now() + 80 * 24 * 60 * 60 * 1000; // dưới trần 90 ngày của API
  return rng.sample(candidates, count).map((fact) => {
    const row = generated.jobPosts.find((j) => j.id === fact.id)!;
    const skills = generated.jobPostSkills.filter((s) => s.jobPostId === fact.id);
    const skillMinYears = Object.fromEntries(skills.filter((s) => s.minYears != null).map((s) => [s.skillId, s.minYears as number]));
    const employer = employers.get(fact.employerId)!;
    return {
      employerEmail: employer.email,
      companyName: employer.companyName,
      body: {
        title: `${JOB_TITLE_PREFIX}${row.title}`,
        description: row.description,
        jobType: row.jobType,
        industryId: opt(row.industryId),
        cityId: opt(row.cityId),
        address: opt(row.address),
        salaryMin: opt(row.salaryMin),
        salaryMax: opt(row.salaryMax),
        isNegotiable: opt(row.isNegotiable),
        requirements: opt(row.requirements),
        benefits: opt(row.benefits),
        expiresAt: new Date(Math.min(new Date(row.expiresAt ?? maxExpiry).getTime(), maxExpiry)).toISOString(),
        skillIds: skills.filter((s) => s.importance !== "PREFERRED").map((s) => s.skillId),
        preferredSkillIds: skills.filter((s) => s.importance === "PREFERRED").map((s) => s.skillId),
        skillMinYears,
        minExperienceYears: row.minExperienceYears ?? null,
        majors: generated.jobPostMajors.filter((m) => m.jobPostId === fact.id).map((m) => ({ majorId: m.majorId, relevance: m.relevance })),
      },
    };
  });
}

// ─── Gửi qua API ────────────────────────────────────────────────────────────

interface WaveResult {
  candidatesCreated: number;
  jobsPublished: number;
  failures: string[];
  /** Thời gian từng request (ms) để in p50 / p95. */
  latencies: number[];
}

async function timed<T>(result: WaveResult, call: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await call();
  } finally {
    result.latencies.push(performance.now() - started);
  }
}

async function createCandidate(plan: CandidatePlan, otp: string, result: WaveResult): Promise<void> {
  const call = <T>(method: string, url: string, token: string | null, body?: unknown) => timed(result, () => api<T>(method, url, token, body));
  await call("POST", "/auth/register", null, { email: plan.email, password: CANDIDATE_PASSWORD, role: "CANDIDATE" });
  const { accessToken: token } = await call<{ accessToken: string }>("POST", "/auth/verify-otp", null, { email: plan.email, otp });
  await call("PATCH", "/candidates/me", token, plan.profile);
  for (const e of plan.educations) await call("POST", "/candidates/me/education", token, e);
  for (const e of plan.experiences) await call("POST", "/candidates/me/work-experiences", token, e);
  for (const p of plan.projects) await call("POST", "/candidates/me/projects", token, p);
  for (const c of plan.certificates) await call("POST", "/candidates/me/certificates", token, c);
  for (const s of plan.skills) await call("POST", "/candidates/me/skills", token, s);
  if (plan.isOpenToOutreach) await call("PATCH", "/candidate/outreach-settings", token, { isOpenToOutreach: true });
  result.candidatesCreated++;
}

async function publishJob(plan: JobPlan, tokens: Map<string, string>, adminToken: () => Promise<string>, result: WaveResult): Promise<void> {
  let token = tokens.get(plan.employerEmail);
  if (!token) {
    token = await timed(result, () => login(plan.employerEmail, DEMO_EMPLOYER_PASSWORD));
    tokens.set(plan.employerEmail, token);
  }
  const draft = await timed(result, () => api<{ id: string }>("POST", "/employer/job-posts", token!, plan.body));
  const { jobPost: submitted } = await timed(result, () =>
    api<{ jobPost: { status: string } }>("POST", `/employer/job-posts/${draft.id}/submit`, token!));
  if (submitted.status === "PENDING") {
    const admin = await adminToken();
    await timed(result, () => api("POST", `/admin/job-posts/${draft.id}/approve`, admin));
  } else if (submitted.status !== "PUBLISHED") {
    fail(`Tin ${draft.id} ở trạng thái ${submitted.status} sau khi gửi`);
  }
  result.jobsPublished++;
}

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
};

interface AutomationStatus {
  rescore: { pending: number; oldestRequestedAt: string | null; lastRun: { at: string; candidates: number; durationMs: number; remaining: number; timedOut: boolean } | null };
  today: { autoInvitations: number; jobAlerts: number; autoReviewed: number };
}

// ─── Chạy ───────────────────────────────────────────────────────────────────

async function nextEmails(count: number): Promise<string[]> {
  const existing = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIX, endsWith: `@${EMAIL_DOMAIN}` } },
    select: { email: true },
  });
  const used = existing.map((u) => Number(u.email.slice(EMAIL_PREFIX.length).split("@")[0])).filter(Number.isFinite);
  const start = (used.length > 0 ? Math.max(...used) : 0) + 1;
  return Array.from({ length: count }, (_, i) => `${EMAIL_PREFIX}${String(start + i).padStart(4, "0")}@${EMAIL_DOMAIN}`);
}

/** Nhà tuyển dụng của bốn công ty demo (companies.json `demoRole`), theo id employer. */
async function demoEmployers(library: LargeDemoLibrary): Promise<Map<string, { email: string; companyName: string }>> {
  const names = library.companies.companies.filter((c) => c.demoRole).map((c) => c.name);
  const rows = await prisma.employer.findMany({
    where: { company: { name: { in: names } }, user: { status: "ACTIVE" } },
    select: { id: true, user: { select: { email: true } }, company: { select: { name: true } } },
  });
  return new Map(rows.map((r) => [r.id, { email: r.user.email, companyName: r.company.name }]));
}

async function run(args: Args): Promise<void> {
  if (process.env.NODE_ENV === "production") fail("NODE_ENV=production — script mô phỏng không chạy trên production");
  const otp = process.env.OTP_HARDCODE === "true" ? process.env.OTP_HARDCODE_VALUE : undefined;
  if (!otp) fail("Cần OTP_HARDCODE=true và OTP_HARDCODE_VALUE (OTP cố định của dev) để đăng ký ứng viên");
  if (process.env.DEV_SKIP_EMAIL_SENDING !== "true") fail("Cần DEV_SKIP_EMAIL_SENDING=true để không gửi email thật");
  const totalCandidates = args.candidates * args.waves;
  const totalJobs = args.jobs * args.waves;
  if (totalCandidates > OTP_PER_HOUR_PER_IP * 0.9) {
    fail(`${totalCandidates} lần đăng ký vượt gần giới hạn OTP ${OTP_PER_HOUR_PER_IP} / giờ / IP của server`);
  }

  const library = await loadLibrary();
  const catalog = await loadCatalog();
  const employers = await demoEmployers(library);
  if (employers.size === 0) fail("Không thấy tài khoản nhà tuyển dụng của công ty demo — chạy seed-large-demo trước");
  // Quy mô bộ sinh đủ cho số ứng viên và tin cần (tin của công ty demo chiếm khoảng một nửa khi quy mô nhỏ).
  const scale = Math.min(1, Math.max(0.02, totalCandidates / FULL_SCALE.generatedCandidates * 1.1, (totalJobs * 4) / FULL_SCALE.generatedJobs));
  const generated = generateLargeDemo(library, catalog, {
    seed: args.seed, scale, now: new Date(), passwordHash: "-", cvFileUrl: "-", planId: "-", adminUserId: "-",
  });
  const emails = await nextEmails(totalCandidates);
  const candidates = candidatePlans(generated, emails);
  if (candidates.length < totalCandidates) fail(`Bộ sinh chỉ có ${candidates.length} ứng viên, cần ${totalCandidates}`);
  const jobs = jobPlans(generated, totalJobs, employers, createRng(args.seed + 1));

  console.log(`Gateway ${BASE_URL}, seed ${args.seed}: ${args.waves} đợt × (${args.candidates} ứng viên, ${args.jobs} tin), mỗi đợt cách ${args.everySeconds} s`);
  console.log(`Ứng viên ${emails[0] ?? "-"} … ${emails[emails.length - 1] ?? "-"}`);
  if (args.dryRun) {
    const requests = candidates.reduce((sum, c) => sum + 3 + c.educations.length + c.experiences.length + c.projects.length
      + c.certificates.length + c.skills.length + (c.isOpenToOutreach ? 1 : 0), 0);
    console.log(`--dry-run: sẽ tạo ${candidates.length} ứng viên (~${requests} request, ${candidates.filter((c) => c.isOpenToOutreach).length} cho liên hệ) và ${jobs.length} tin:`);
    for (const job of jobs) console.log(`  - ${job.companyName}: ${String(job.body.title)} (${job.employerEmail})`);
    return;
  }

  const health = await fetch(`${BASE_URL}/api/health`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { data?: { status?: string } } | null;
  if (health?.data?.status !== "ok") fail(`Gateway ${BASE_URL} không trả /api/health ok — bật server và nginx trước`);

  let adminTokenValue: string | null = null;
  const adminToken = async () => {
    if (adminTokenValue) return adminTokenValue;
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) fail("Cần ADMIN_EMAIL / ADMIN_PASSWORD để duyệt tin và đọc số liệu");
    adminTokenValue = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    return adminTokenValue;
  };
  const status = async (): Promise<AutomationStatus | null> => {
    try {
      return await api<AutomationStatus>("GET", "/admin/automation-status", await adminToken());
    } catch (error) {
      console.warn(`  (không đọc được /admin/automation-status: ${error instanceof Error ? error.message : String(error)})`);
      return null;
    }
  };
  const employerTokens = new Map<string, string>();
  const startedAt = Date.now();

  for (let wave = 0; wave < args.waves; wave++) {
    if (wave > 0) {
      const due = startedAt + wave * args.everySeconds * 1000;
      if (due > Date.now()) await new Promise((resolve) => setTimeout(resolve, due - Date.now()));
    }
    const result: WaveResult = { candidatesCreated: 0, jobsPublished: 0, failures: [], latencies: [] };
    const waveStarted = Date.now();
    const waveJobs = jobs.slice(wave * args.jobs, (wave + 1) * args.jobs);
    const waveCandidates = candidates.slice(wave * args.candidates, (wave + 1) * args.candidates);
    const guard = (what: string, work: () => Promise<void>) => work().catch((error: unknown) => {
      result.failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
    });
    // Tin đăng trước để ứng viên của đợt được chấm cả với tin mới.
    for (const job of waveJobs) await guard(String(job.body.title), () => publishJob(job, employerTokens, adminToken, result));
    await pool(waveCandidates, args.concurrency, (plan) => guard(plan.email, () => createCandidate(plan, otp, result)));

    const s = await status();
    console.log(
      `Đợt ${wave + 1}/${args.waves}: ${result.candidatesCreated}/${waveCandidates.length} ứng viên, ${result.jobsPublished}/${waveJobs.length} tin`
      + ` trong ${((Date.now() - waveStarted) / 1000).toFixed(1)} s; request p50 ${percentile(result.latencies, 50).toFixed(0)} ms,`
      + ` p95 ${percentile(result.latencies, 95).toFixed(0)} ms`
      + (s ? `; đang chờ chấm ${s.rescore.pending}` : ""),
    );
    for (const failure of result.failures.slice(0, 5)) console.log(`  lỗi: ${failure}`);
    if (result.failures.length > 5) console.log(`  … và ${result.failures.length - 5} lỗi khác`);
  }

  if (args.wait) {
    const waitStarted = Date.now();
    let s = await status();
    while (s && s.rescore.pending > 0 && Date.now() - waitStarted < WAIT_LIMIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      s = await status();
    }
    if (s && s.rescore.pending === 0) {
      console.log(`Hết người chờ chấm sau ${((Date.now() - startedAt) / 1000).toFixed(0)} s kể từ lúc bắt đầu (${((Date.now() - waitStarted) / 1000).toFixed(0)} s sau đợt cuối)`);
    } else if (s) {
      console.log(`Sau ${WAIT_LIMIT_MS / 60_000} phút vẫn còn ${s.rescore.pending} người chờ chấm`);
    }
  }
  const s = await status();
  if (s) {
    const last = s.rescore.lastRun;
    console.log(`Hôm nay: ${s.today.autoInvitations} lời mời tự động, ${s.today.jobAlerts} job alert, ${s.today.autoReviewed} hồ sơ tự chuyển`
      + (last ? `; lượt chấm gần nhất ${last.candidates} người trong ${(last.durationMs / 1000).toFixed(1)} s` : ""));
  }
  console.log("Xoá dữ liệu mô phỏng: npm run simulate-inflow --workspace server -- --reset");
}

// ─── Xoá ────────────────────────────────────────────────────────────────────

async function reset(args: Args): Promise<void> {
  if (process.env.NODE_ENV === "production") fail("NODE_ENV=production — không xoá trên production");
  const users = await prisma.user.findMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const jobs = await prisma.jobPost.findMany({ where: { title: { startsWith: JOB_TITLE_PREFIX } }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);
  console.log(`Dữ liệu mô phỏng: ${userIds.length} tài khoản @${EMAIL_DOMAIN}, ${jobIds.length} tin "${JOB_TITLE_PREFIX.trim()}"`);
  if (args.dryRun || (userIds.length === 0 && jobIds.length === 0)) return;
  await prisma.$transaction(async (tx) => {
    // Khoá ngoại không cascade: lời mời và hội thoại gắn với tin, tin nhắn gắn với người gửi.
    await tx.candidateOutreachInvitation.deleteMany({ where: { jobPostId: { in: jobIds } } });
    await tx.message.deleteMany({ where: { senderId: { in: userIds } } });
    await tx.conversation.deleteMany({ where: { jobPostId: { in: jobIds } } });
    await tx.auditLog.deleteMany({ where: { entityType: "JobPost", entityId: { in: jobIds } } });
    // Tin xoá kéo theo kỹ năng, ngành, điểm, job alert, đơn của tin; user xoá kéo theo candidate và mọi bảng của họ.
    await tx.jobPost.deleteMany({ where: { id: { in: jobIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  }, { timeout: 120_000 });
  console.log("Đã xoá. Lượt đêm sẽ dọn dòng điểm / cache còn sót (nếu có).");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "reset") await reset(args);
  else await run(args);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
