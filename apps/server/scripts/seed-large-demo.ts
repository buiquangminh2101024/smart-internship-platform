// Dữ liệu demo lớn (~40 công ty, ~400 tin, ~1.500 ứng viên kèm lịch sử) — đặc tả:
// docs/06-backend/large-demo-data/PLAN.md
//
//   npm run seed-large-demo --workspace server -- --dry-run      chỉ ĐỌC DB: in sẽ xoá / tạo gì, ước dung lượng
//   npm run seed-large-demo --workspace server                   xoá phần demo cũ rồi tạo lại
//   npm run seed-large-demo --workspace server -- --reset        chỉ xoá phần demo (kèm mục danh mục không còn ai dùng)
//   npm run seed-large-demo --workspace server -- --embed-only   chỉ tính embedding còn thiếu cho phần demo đang có
//   thêm `--scale 0.1` để chạy thử nhỏ, `--seed <số>` để đổi bộ (mặc định 20261109),
//   `--no-embed` để ghi mà không tính embedding ngay; `--dry-run` dùng kèm được với --reset / --embed-only
//
// Phạm vi: mọi dòng script tạo có id bắt đầu bằng "clargedemo", email @large-demo.local.
// Xoá / --reset chỉ xoá các dòng đó và những gì gắn vào chúng (ví dụ đơn ai đó nộp thử
// vào tin demo); bộ @match-demo.local và dữ liệu thật không bị đụng.
//
// Không gửi email (PLAN D7): ghi thẳng bằng Prisma, không gọi service nghiệp vụ, đếm
// outbox_events trước / sau mỗi nhóm và huỷ nhóm đó nếu số này đổi. Lịch phỏng vấn sắp
// tới có sẵn thông báo nhắc (đã đọc, đúng dedupeKey) để cron interview-reminder bỏ qua.
//
// Embedding (bước 4): sau khi ghi, tính sẵn vector cho kỹ năng seed thêm, mọi tin và hồ sơ demo
// (lib/large-demo/embed.ts). Vector khớp hash thì bỏ qua, nên bị ngắt thì chạy --embed-only để tính tiếp.
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { generateLargeDemo, LARGE_DEMO_EMAIL_DOMAIN, LARGE_DEMO_ID_PREFIX, type GenerateCatalog } from "./lib/large-demo/generate";
import { embedLargeDemo, type EmbedSummary } from "./lib/large-demo/embed";
import { generateLargeDemoHistory } from "./lib/large-demo/history";
import { validateLargeDemoLibrary, type LargeDemoLibraryRaw } from "./lib/large-demo/library";
import {
  catalogAdditionIds, chunk, estimateBytes, formatMb, MAX_DATABASE_BYTES, preflightIssues, writeGroups,
  type WriteGroup,
} from "./lib/large-demo/write-plan";
import { mergeDuplicateSkills, printSkillMergeReports } from "./lib/merge-duplicate-skills";

const DATA_DIR = path.join(__dirname, "data", "large-demo");
const DEFAULT_SEED = 20261109;
const DEMO_PASSWORD = "123456789"; // PLAN D5, giống bộ cũ
const PASSWORD_SALT_ROUNDS = 12; // cùng auth.service.ts
const CV_FILE_NAME = "cv-mau-demo.pdf"; // H4: file mẫu đã tải lên Cloudinary
const SUBSCRIPTION_PLAN_NAME = "Doanh nghiệp";

const prisma = new PrismaClient();
type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

const PREFIX = { startsWith: LARGE_DEMO_ID_PREFIX };
const NOT_DEMO = { NOT: { id: PREFIX } };

function fail(message: string): never {
  throw new Error(message);
}

// ─── Tham số ────────────────────────────────────────────────────────────────

interface Args {
  mode: "write" | "reset" | "embed-only";
  dryRun: boolean;
  /** Tính embedding ngay sau khi ghi (tắt bằng --no-embed). */
  embed: boolean;
  scale: number;
  seed: number;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { mode: "write", dryRun: false, embed: true, scale: 1, seed: DEFAULT_SEED };
  const setMode = (mode: Args["mode"]) => {
    if (args.mode !== "write" && args.mode !== mode) fail("Chỉ chọn một trong --reset / --embed-only");
    args.mode = mode;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--reset") setMode("reset");
    else if (arg === "--embed-only") setMode("embed-only");
    else if (arg === "--no-embed") args.embed = false;
    else if (arg === "--scale" || arg === "--seed") {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value)) fail(`${arg} cần một số`);
      if (arg === "--scale") args.scale = value;
      else args.seed = Math.trunc(value);
    } else fail(`Không hiểu tham số "${arg}". Dùng: --dry-run | --reset | --embed-only | --no-embed | --scale <0..1> | --seed <số>`);
  }
  if (!(args.scale > 0 && args.scale <= 1)) fail(`--scale phải trong (0, 1], đang là ${args.scale}`);
  return args;
}

function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host || "(không rõ)";
  } catch {
    return "(không đọc được DATABASE_URL)";
  }
}

async function databaseSize(db: Db): Promise<number> {
  const rows = await db.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
  return Number(rows[0]?.size ?? 0);
}

const signedMb = (bytes: number) => `${bytes >= 0 ? "+" : ""}${formatMb(bytes)}`;
const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)} giây`;

// ─── Phạm vi xoá ────────────────────────────────────────────────────────────

const demoUser: Prisma.UserWhereInput = { OR: [{ id: PREFIX }, { email: { endsWith: `@${LARGE_DEMO_EMAIL_DOMAIN}` } }] };
const demoJob: Prisma.JobPostWhereInput = { OR: [{ id: PREFIX }, { companyId: PREFIX }] };
const demoCandidate: Prisma.CandidateWhereInput = { OR: [{ id: PREFIX }, { user: demoUser }] };
const demoEmployer: Prisma.EmployerWhereInput = { OR: [{ id: PREFIX }, { user: demoUser }] };

/** Các bước xoá theo thứ tự khoá ngoại. `foreign` = dòng không do seed tạo nhưng gắn vào dữ liệu demo. */
interface DeleteStep {
  label: string;
  count: (db: Db) => Promise<{ total: number; foreign: number }>;
  run: (tx: Tx) => Promise<unknown>;
}

function countPair<W extends object>(count: (where: W) => Promise<number>, where: W): Promise<{ total: number; foreign: number }> {
  return Promise.all([count(where), count({ AND: [where, NOT_DEMO] } as unknown as W)]).then(([total, foreign]) => ({ total, foreign }));
}

function deleteSteps(includeCatalog: boolean): DeleteStep[] {
  const conversation: Prisma.ConversationWhereInput = { OR: [{ jobPost: demoJob }, { candidate: demoCandidate }, { employer: demoEmployer }] };
  const invitation: Prisma.CandidateOutreachInvitationWhereInput = {
    OR: [{ companyId: PREFIX }, { jobPost: demoJob }, { candidate: demoCandidate }, { employer: demoEmployer }],
  };
  const application: Prisma.ApplicationWhereInput = { OR: [{ jobPost: demoJob }, { candidate: demoCandidate }] };
  const savedJob: Prisma.SavedJobWhereInput = { OR: [{ jobPost: demoJob }, { candidate: demoCandidate }] };
  const createdByDemo = { createdBy: demoUser };
  const steps: DeleteStep[] = [
    {
      label: "hội thoại (tin nhắn xoá theo)",
      count: (db) => countPair((where) => db.conversation.count({ where }), conversation),
      run: (tx) => tx.conversation.deleteMany({ where: conversation }),
    },
    {
      label: "lời mời",
      count: (db) => countPair((where) => db.candidateOutreachInvitation.count({ where }), invitation),
      run: (tx) => tx.candidateOutreachInvitation.deleteMany({ where: invitation }),
    },
    {
      label: "đơn ứng tuyển (lịch sử, lịch phỏng vấn xoá theo)",
      count: (db) => countPair((where) => db.application.count({ where }), application),
      run: (tx) => tx.application.deleteMany({ where: application }),
    },
    {
      label: "tin đã lưu",
      count: (db) => countPair((where) => db.savedJob.count({ where }), savedJob),
      run: (tx) => tx.savedJob.deleteMany({ where: savedJob }),
    },
    {
      label: "tin tuyển dụng (kỹ năng, ngành, kiểm duyệt, lượt xem, embedding xoá theo)",
      count: (db) => countPair((where) => db.jobPost.count({ where }), demoJob),
      run: (tx) => tx.jobPost.deleteMany({ where: demoJob }),
    },
    {
      label: "gói của công ty demo",
      count: (db) => countPair((where) => db.companySubscription.count({ where }), { companyId: PREFIX } as Prisma.CompanySubscriptionWhereInput),
      run: (tx) => tx.companySubscription.deleteMany({ where: { companyId: PREFIX } }),
    },
    {
      // Kỹ năng / ngành / trường do tài khoản demo gõ thêm trên giao diện: giữ mục, bỏ người tạo.
      label: "mục danh mục do tài khoản demo tạo (giữ mục, bỏ người tạo)",
      count: async (db) => {
        const [skills, majors, universities] = await Promise.all([
          db.skill.count({ where: createdByDemo }), db.major.count({ where: createdByDemo }), db.university.count({ where: createdByDemo }),
        ]);
        return { total: skills + majors + universities, foreign: skills + majors + universities };
      },
      run: async (tx) => {
        await tx.skill.updateMany({ where: createdByDemo, data: { createdByUserId: null } });
        await tx.major.updateMany({ where: createdByDemo, data: { createdByUserId: null } });
        await tx.university.updateMany({ where: createdByDemo, data: { createdByUserId: null } });
      },
    },
    {
      label: "tài khoản (ứng viên + hồ sơ, CV, nhà tuyển dụng, thông báo xoá theo)",
      count: (db) => countPair((where) => db.user.count({ where }), demoUser),
      run: (tx) => tx.user.deleteMany({ where: demoUser }),
    },
    {
      label: "công ty",
      count: (db) => countPair((where) => db.company.count({ where }), { id: PREFIX } as Prisma.CompanyWhereInput),
      run: (tx) => tx.company.deleteMany({ where: { id: PREFIX } }),
    },
  ];
  if (includeCatalog) {
    const unusedSkill: Prisma.SkillWhereInput = { id: PREFIX, candidateSkills: { none: {} }, jobPostSkills: { none: {} } };
    const unusedIndustry: Prisma.IndustryWhereInput = { id: PREFIX, companies: { none: {} }, jobPosts: { none: {} } };
    const unusedCity: Prisma.CityWhereInput = { id: PREFIX, companies: { none: {} }, jobPosts: { none: {} }, candidates: { none: {} } };
    steps.push({
      label: "kỹ năng / ngành nghề / thành phố seed thêm (chỉ mục không còn ai dùng)",
      count: async (db) => {
        // Đếm sau khi xoá dữ liệu demo: mục chỉ demo dùng sẽ thành "không còn ai dùng".
        const [skills, industries, cities] = await Promise.all([
          db.skill.count({ where: { id: PREFIX } }), db.industry.count({ where: { id: PREFIX } }), db.city.count({ where: { id: PREFIX } }),
        ]);
        return { total: skills + industries + cities, foreign: 0 };
      },
      run: async (tx) => {
        await tx.skill.deleteMany({ where: unusedSkill });
        await tx.industry.deleteMany({ where: unusedIndustry });
        await tx.city.deleteMany({ where: unusedCity });
      },
    });
  }
  return steps;
}

/** Thứ chặn việc xoá: không tự xoá dữ liệu thanh toán hay hồ sơ nhà tuyển dụng thật. */
async function deleteBlockers(db: Db): Promise<string[]> {
  const [payments, foreignEmployers] = await Promise.all([
    db.payment.count({ where: { companySubscription: { companyId: PREFIX } } }),
    db.employer.count({ where: { companyId: PREFIX, NOT: demoEmployer } }),
  ]);
  const blockers: string[] = [];
  if (payments > 0) blockers.push(`${payments} giao dịch thanh toán gắn với gói của công ty demo — xử lý tay trước (script không xoá dữ liệu thanh toán)`);
  if (foreignEmployers > 0) blockers.push(`${foreignEmployers} nhà tuyển dụng ngoài bộ demo đang thuộc công ty demo — chuyển họ sang công ty khác trước`);
  return blockers;
}

async function printDeletePlan(steps: readonly DeleteStep[]): Promise<boolean> {
  let any = false;
  for (const step of steps) {
    const { total, foreign } = await step.count(prisma);
    if (total === 0) continue;
    any = true;
    console.log(`  ${step.label}: ${total}${foreign > 0 ? ` (trong đó ${foreign} không do seed tạo)` : ""}`);
  }
  if (!any) console.log("  (chưa có dữ liệu demo lớn)");
  return any;
}

async function deleteDemo(steps: readonly DeleteStep[]): Promise<void> {
  const blockers = await deleteBlockers(prisma);
  if (blockers.length > 0) fail(`Không xoá được:\n  - ${blockers.join("\n  - ")}`);
  await prisma.$transaction(
    async (tx) => {
      for (const step of steps) await step.run(tx);
    },
    { timeout: 300_000, maxWait: 30_000 },
  );
}

// ─── Đọc thư viện + danh mục ────────────────────────────────────────────────

async function loadLibraryRaw(): Promise<LargeDemoLibraryRaw> {
  const read = async (file: string) => JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf8")) as unknown;
  return {
    positions: await read("positions.json"),
    catalogAdditions: await read("catalog-additions.json"),
    names: await read("names.json"),
    companies: await read("companies.json"),
    jobTemplates: await read("job-templates.json"),
    personas: await read("personas.json"),
    showcase: await read("showcase.json"),
  };
}

interface Context {
  library: NonNullable<ReturnType<typeof validateLargeDemoLibrary>["library"]>;
  catalog: GenerateCatalog;
  /** Mục danh mục seed sẽ tạo (chưa có trong DB). */
  newCatalog: { skills: { id: string; name: string }[]; industries: { id: string; name: string }[]; cities: { id: string; name: string }[] };
  cvFileUrl: string | null;
  cvOwner: string | null;
  planId: string;
  adminUserId: string;
}

async function loadContext(): Promise<Context> {
  // Danh mục thật, KHÔNG gồm mục do chính seed này tạo (bộ kiểm cấm mục thêm trùng danh mục).
  const [skills, aliases, majors, universities, industries, cities, companyTypes] = await Promise.all([
    prisma.skill.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true } }),
    prisma.skillAlias.findMany({ where: { skill: NOT_DEMO }, select: { alias: true, skill: { select: { name: true } } } }),
    prisma.major.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true } }),
    prisma.university.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true } }),
    prisma.industry.findMany({ select: { id: true, name: true } }),
    prisma.city.findMany({ select: { id: true, name: true } }),
    prisma.companyType.findMany({ select: { id: true, name: true } }),
  ]);
  const isDemo = (row: { id: string }) => row.id.startsWith(LARGE_DEMO_ID_PREFIX);
  const real = <T extends { id: string }>(rows: T[]) => rows.filter((row) => !isDemo(row));

  const validation = validateLargeDemoLibrary(await loadLibraryRaw(), {
    skills: real(skills).map((s) => s.name),
    skillAliases: new Map(aliases.map((a) => [a.alias, a.skill.name])),
    majors: majors.map((m) => m.name),
    universities: universities.map((u) => u.name),
    industries: real(industries).map((i) => i.name),
    cities: real(cities).map((c) => c.name),
    companyTypes: companyTypes.map((t) => t.name),
  });
  if (!validation.library) {
    fail(`Thư viện có ${validation.errors.length} lỗi (chạy check-large-demo-library để xem):\n  - ${validation.errors.slice(0, 20).join("\n  - ")}`);
  }
  const library = validation.library;
  const additions = library.catalogAdditions;

  // Tên mục thêm đã có ở mục KHÔNG do seed tạo (kể cả kỹ năng chờ duyệt) → không tạo được (tên unique).
  const [skillClash, industryClash, cityClash] = await Promise.all([
    prisma.skill.findMany({ where: { name: { in: additions.skills }, ...NOT_DEMO }, select: { name: true, status: true } }),
    prisma.industry.findMany({ where: { name: { in: additions.industries }, ...NOT_DEMO }, select: { name: true } }),
    prisma.city.findMany({ where: { name: { in: additions.cities }, ...NOT_DEMO }, select: { name: true } }),
  ]);
  const clashes = [
    ...skillClash.map((s) => `kỹ năng "${s.name}" (${s.status})`),
    ...industryClash.map((i) => `ngành nghề "${i.name}"`),
    ...cityClash.map((c) => `thành phố "${c.name}"`),
  ];
  if (clashes.length > 0) fail(`Mục danh mục seed định thêm đã có sẵn (không do seed tạo): ${clashes.join(", ")}. Gộp / đổi tên trong catalog-additions.json rồi chạy lại.`);

  // Mục seed thêm: dùng lại mục đã tạo lần trước (theo tên), còn lại tạo mới với id cố định theo tên.
  const plan = <T extends { id: string; name: string }>(kind: "skill" | "industry" | "city", names: string[], existing: T[]) => {
    const byName = new Map(existing.filter(isDemo).map((row) => [row.name, row.id]));
    const ids = catalogAdditionIds(kind, names);
    const taken = new Set(existing.map((row) => row.id));
    const created: { id: string; name: string }[] = [];
    for (const name of names) {
      if (byName.has(name)) continue;
      const id = ids.get(name)!;
      if (taken.has(id)) fail(`id ${id} cho "${name}" đã thuộc mục khác — đổi tên mục`);
      created.push({ id, name });
    }
    return created;
  };
  const newCatalog = {
    skills: plan("skill", additions.skills, skills),
    industries: plan("industry", additions.industries, industries),
    cities: plan("city", additions.cities, cities),
  };
  const mapOf = (rows: { id: string; name: string }[], extra: { id: string; name: string }[] = []) =>
    new Map([...rows, ...extra].map((row) => [row.name, row.id]));
  const catalog: GenerateCatalog = {
    skillIds: mapOf(skills, newCatalog.skills),
    majorIds: mapOf(majors),
    universityIds: mapOf(universities),
    cityIds: mapOf(cities, newCatalog.cities),
    industryIds: mapOf(industries, newCatalog.industries),
    companyTypeIds: mapOf(companyTypes),
  };

  const [sampleCv, subscriptionPlan, admin] = await Promise.all([
    prisma.cv.findFirst({
      where: { fileName: CV_FILE_NAME, isBuilder: false, ...NOT_DEMO },
      orderBy: { uploadedAt: "asc" },
      select: { fileUrl: true, candidate: { select: { user: { select: { email: true } } } } },
    }),
    prisma.subscriptionPlan.findUnique({ where: { name: SUBSCRIPTION_PLAN_NAME }, select: { id: true, durationDays: true } }),
    prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } }),
  ]);
  if (!subscriptionPlan) fail(`Không thấy gói "${SUBSCRIPTION_PLAN_NAME}" — chạy \`npm run db:seed\` trước.`);
  if (!admin) fail("Chưa có tài khoản Admin (dùng cho dòng kiểm duyệt) — chạy `npm run create-admin` trước.");

  return {
    library, catalog, newCatalog,
    cvFileUrl: sampleCv?.fileUrl ?? null, cvOwner: sampleCv?.candidate.user.email ?? null,
    planId: subscriptionPlan.id, adminUserId: admin.id,
  };
}

// ─── Ghi ────────────────────────────────────────────────────────────────────

/** createMany cho từng bảng; dữ liệu đã đúng khuôn từ bộ sinh nên chỉ ép kiểu. */
const CREATE: Record<string, (tx: Tx, data: readonly object[]) => Promise<unknown>> = {
  user: (tx, data) => tx.user.createMany({ data: data as Prisma.UserCreateManyInput[] }),
  company: (tx, data) => tx.company.createMany({ data: data as Prisma.CompanyCreateManyInput[] }),
  employer: (tx, data) => tx.employer.createMany({ data: data as Prisma.EmployerCreateManyInput[] }),
  companySubscription: (tx, data) => tx.companySubscription.createMany({ data: data as Prisma.CompanySubscriptionCreateManyInput[] }),
  jobPost: (tx, data) => tx.jobPost.createMany({ data: data as Prisma.JobPostCreateManyInput[] }),
  jobPostSkill: (tx, data) => tx.jobPostSkill.createMany({ data: data as Prisma.JobPostSkillCreateManyInput[] }),
  jobPostMajor: (tx, data) => tx.jobPostMajor.createMany({ data: data as Prisma.JobPostMajorCreateManyInput[] }),
  jobPostModerationAction: (tx, data) => tx.jobPostModerationAction.createMany({ data: data as Prisma.JobPostModerationActionCreateManyInput[] }),
  jobPostDailyStat: (tx, data) => tx.jobPostDailyStat.createMany({ data: data as Prisma.JobPostDailyStatCreateManyInput[] }),
  candidate: (tx, data) => tx.candidate.createMany({ data: data as Prisma.CandidateCreateManyInput[] }),
  education: (tx, data) => tx.education.createMany({ data: data as Prisma.EducationCreateManyInput[] }),
  workExperience: (tx, data) => tx.workExperience.createMany({ data: data as Prisma.WorkExperienceCreateManyInput[] }),
  project: (tx, data) => tx.project.createMany({ data: data as Prisma.ProjectCreateManyInput[] }),
  certificate: (tx, data) => tx.certificate.createMany({ data: data as Prisma.CertificateCreateManyInput[] }),
  candidateSkill: (tx, data) => tx.candidateSkill.createMany({ data: data as Prisma.CandidateSkillCreateManyInput[] }),
  cv: (tx, data) => tx.cv.createMany({ data: data as Prisma.CvCreateManyInput[] }),
  application: (tx, data) => tx.application.createMany({ data: data as Prisma.ApplicationCreateManyInput[] }),
  applicationStatusHistory: (tx, data) => tx.applicationStatusHistory.createMany({ data: data as Prisma.ApplicationStatusHistoryCreateManyInput[] }),
  interview: (tx, data) => tx.interview.createMany({ data: data as Prisma.InterviewCreateManyInput[] }),
  candidateOutreachInvitation: (tx, data) => tx.candidateOutreachInvitation.createMany({ data: data as Prisma.CandidateOutreachInvitationCreateManyInput[] }),
  conversation: (tx, data) => tx.conversation.createMany({ data: data as Prisma.ConversationCreateManyInput[] }),
  message: (tx, data) => tx.message.createMany({ data: data as Prisma.MessageCreateManyInput[] }),
  savedJob: (tx, data) => tx.savedJob.createMany({ data: data as Prisma.SavedJobCreateManyInput[] }),
  notification: (tx, data) => tx.notification.createMany({ data: data as Prisma.NotificationCreateManyInput[] }),
};

async function writeGroup(group: WriteGroup): Promise<void> {
  const started = Date.now();
  const outboxBefore = await prisma.outboxEvent.count();
  await prisma.$transaction(
    async (tx) => {
      for (const table of group.tables) {
        const create = CREATE[table.key] ?? fail(`Chưa có hàm ghi cho bảng ${table.key}`);
        for (const batch of chunk(table.rows)) await create(tx, batch);
      }
      const outboxAfter = await tx.outboxEvent.count();
      if (outboxAfter !== outboxBefore) {
        fail(`outbox_events đổi từ ${outboxBefore} thành ${outboxAfter} trong nhóm "${group.label}" — huỷ nhóm này để không gửi email. ` +
          "Có thể do server đang chạy cron cùng lúc: tắt server rồi chạy lại.");
      }
    },
    { timeout: 300_000, maxWait: 30_000 },
  );
  const rows = group.tables.reduce((sum, t) => sum + t.rows.length, 0);
  console.log(`  ✓ ${group.label}: ${rows} dòng (${seconds(started)})`);
}

async function createCatalogAdditions(ctx: Context): Promise<void> {
  const { skills, industries, cities } = ctx.newCatalog;
  await prisma.$transaction(async (tx) => {
    if (skills.length > 0) await tx.skill.createMany({ data: skills.map((s) => ({ ...s, status: "APPROVED" as const })) });
    if (industries.length > 0) await tx.industry.createMany({ data: industries });
    if (cities.length > 0) await tx.city.createMany({ data: cities });
  });
}

function printGroups(groups: readonly WriteGroup[]): void {
  for (const group of groups) {
    console.log(`  ${group.label}: ` + group.tables.map((t) => `${t.rows.length} ${t.label}`).join(", "));
  }
}

// ─── Embedding ──────────────────────────────────────────────────────────────

async function runEmbedding(dryRun: boolean): Promise<EmbedSummary> {
  const summary = await embedLargeDemo(prisma, { dryRun, log: (line) => console.log(line) });
  const part = (label: string, { total, stale }: { total: number; stale: number }) => `${label} ${stale}/${total}`;
  const parts = [part("kỹ năng seed thêm", summary.skills), part("tin", summary.jobs), part("hồ sơ ứng viên", summary.candidates)].join(", ");
  if (dryRun) console.log(`  Cần tính (thiếu hoặc lệch hash / tổng): ${parts}.`);
  else console.log(`  ✓ Embedding xong trong ${summary.seconds.toFixed(1)} giây — đã tính ${parts}.`);
  return summary;
}

// ─── Luồng chạy ─────────────────────────────────────────────────────────────

async function run(args: Args): Promise<void> {
  const { dryRun } = args;
  const action = { write: "xoá phần demo lớn cũ rồi ghi lại", reset: "chỉ xoá phần demo lớn", "embed-only": "chỉ tính embedding" }[args.mode];
  console.log(`DB: ${databaseHost()} — ${action}${dryRun ? " (DRY RUN, chỉ đọc)" : ""}`);
  const sizeBefore = await databaseSize(prisma);
  console.log(`Dung lượng DB hiện tại: ${formatMb(sizeBefore)}`);

  if (args.mode === "embed-only") {
    console.log("\nEmbedding:");
    await runEmbedding(dryRun);
    if (!dryRun) console.log(`Dung lượng DB: ${formatMb(sizeBefore)} → ${formatMb(await databaseSize(prisma))}.`);
    return;
  }

  if (args.mode === "reset") {
    console.log("\nSẽ xoá:");
    await printDeletePlan(deleteSteps(true));
    if (dryRun) {
      console.log("\nDRY RUN xong — không xoá gì.");
      return;
    }
    const started = Date.now();
    await deleteDemo(deleteSteps(true));
    const left = await prisma.skill.count({ where: { id: PREFIX } }) + await prisma.industry.count({ where: { id: PREFIX } }) + await prisma.city.count({ where: { id: PREFIX } });
    console.log(`\n✓ Đã xoá (${seconds(started)}). Dung lượng DB: ${formatMb(await databaseSize(prisma))} (Postgres có thể chưa trả lại ngay dung lượng đã xoá).`);
    if (left > 0) console.log(`  Còn ${left} mục danh mục seed thêm vì đang có tin / hồ sơ / công ty ngoài bộ demo dùng — giữ lại.`);
    return;
  }

  // PLAN Q3: gộp 5 cặp kỹ năng trùng trước khi seed (chạy lại an toàn).
  console.log("\nGộp kỹ năng trùng:");
  printSkillMergeReports(await mergeDuplicateSkills(prisma, { dryRun }));

  const ctx = await loadContext();
  console.log(`\nThư viện hợp lệ. Danh mục seed thêm (mới): ${ctx.newCatalog.skills.length} kỹ năng, ${ctx.newCatalog.industries.length} ngành nghề, ${ctx.newCatalog.cities.length} thành phố.`);
  if (ctx.cvFileUrl) console.log(`CV mẫu: "${CV_FILE_NAME}" của ${ctx.cvOwner}.`);
  else {
    const message = `Chưa có CV mẫu: đăng nhập một ứng viên bất kỳ, tải lên file PDF tên "${CV_FILE_NAME}" rồi chạy lại.`;
    if (!dryRun) fail(message);
    console.log(`✗ ${message} (bản ghi thật sẽ dừng ở đây)`);
  }

  const now = new Date();
  const started = Date.now();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, PASSWORD_SALT_ROUNDS);
  const demo = generateLargeDemo(ctx.library, ctx.catalog, {
    seed: args.seed, scale: args.scale, now, passwordHash, cvFileUrl: ctx.cvFileUrl ?? "https://example.invalid/cv-mau-demo.pdf",
    planId: ctx.planId, adminUserId: ctx.adminUserId,
  });
  const history = generateLargeDemoHistory(demo, { seed: args.seed, now });
  const groups = writeGroups(demo, history);
  console.log(`Sinh dữ liệu (seed ${args.seed}, scale ${args.scale}): ${seconds(started)}.`);

  const issues = preflightIssues(demo, history);
  if (issues.length > 0) fail(`Dữ liệu sinh ra có lỗi, không ghi:\n  - ${issues.join("\n  - ")}`);

  console.log("\nSẽ xoá (phần demo lớn của lần chạy trước):");
  const steps = deleteSteps(false);
  await printDeletePlan(steps);
  const blockers = await deleteBlockers(prisma);
  for (const blocker of blockers) console.log(`  ✗ ${blocker}`);

  const totalRows = groups.reduce((sum, g) => sum + g.tables.reduce((s, t) => s + t.rows.length, 0), 0);
  console.log(`\nSẽ tạo ${totalRows} dòng:`);
  printGroups(groups);
  console.log(`  (thông báo gồm ${history.notifications.length} thông báo chưa đọc cho tài khoản demo + ${history.reminderGuards.length} nhắc lịch đặt sẵn, đã đọc, để cron không gửi email)`);
  console.log(`  gói ${SUBSCRIPTION_PLAN_NAME} tới ${demo.subscriptionEnd.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`);

  const estimate = estimateBytes(groups);
  console.log(`\nƯớc dung lượng thêm: ~${formatMb(estimate)} (ước thô, chưa trừ phần xoá) → DB ~${formatMb(sizeBefore + estimate)}, ngưỡng dừng ${formatMb(MAX_DATABASE_BYTES)}.`);
  const tooBig = sizeBefore + estimate > MAX_DATABASE_BYTES;
  if (tooBig) console.log("✗ Vượt ngưỡng dung lượng — bản ghi thật sẽ dừng.");
  console.log(`outbox_events hiện có: ${await prisma.outboxEvent.count()} (nhóm nào làm số này đổi sẽ bị huỷ).`);

  console.log(`Embedding ${args.embed ? "tính ngay sau khi ghi" : "KHÔNG tính (--no-embed) — chạy --embed-only sau"}: ` +
    `${demo.jobPosts.length} tin, ${demo.candidates.length} hồ sơ, ${ctx.newCatalog.skills.length} kỹ năng mới (model chạy CPU ~25 ms / văn bản, cỡ 1–2 phút ở quy mô đủ).`);

  if (dryRun) {
    console.log("\nDRY RUN xong — không ghi gì.");
    return;
  }
  if (tooBig) fail("Dung lượng DB sau khi ghi dự kiến vượt ngưỡng — không ghi.");
  if (blockers.length > 0) fail("Có thứ chặn việc xoá phần demo cũ (xem trên) — không ghi.");

  console.log("\nGhi:");
  const writeStarted = Date.now();
  await deleteDemo(steps);
  console.log(`  ✓ Xoá phần demo cũ (${seconds(writeStarted)})`);
  await createCatalogAdditions(ctx);
  for (const group of groups) await writeGroup(group);
  const sizeWritten = await databaseSize(prisma);
  console.log(`\n✓ Ghi xong trong ${seconds(writeStarted)}. Dung lượng DB: ${formatMb(sizeBefore)} → ${formatMb(sizeWritten)} (${signedMb(sizeWritten - sizeBefore)}).`);

  if (args.embed) {
    console.log("\nEmbedding:");
    await runEmbedding(false);
    const sizeAfter = await databaseSize(prisma);
    console.log(`Dung lượng DB sau embedding: ${formatMb(sizeAfter)} (${signedMb(sizeAfter - sizeWritten)} cho vector).`);
  } else {
    console.log("Chưa tính embedding (--no-embed): chạy --embed-only, nếu không lần đầu xem điểm phù hợp sẽ chậm hơn.");
  }

  console.log(`\nTài khoản demo (mật khẩu ${DEMO_PASSWORD}):`);
  for (const account of demo.demoAccounts) console.log(`  ${account.role === "EMPLOYER" ? "NTD" : "UV "} ${account.email.padEnd(40)} ${account.label}`);
  console.log("\nLưu ý: ~7 ngày trước khi gói demo hết hạn, cron sẽ gửi email nhắc gói tới địa chỉ @" + LARGE_DEMO_EMAIL_DOMAIN +
    ". Chạy lại script trước ngày đó (gói tính lại từ ngày chạy) hoặc đặt DEV_SKIP_EMAIL_SENDING=true.");
}

Promise.resolve()
  .then(() => run(parseArgs(process.argv.slice(2))))
  .catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
