// Dữ liệu demo cho trang Nhật ký hoạt động bản 2 (A7) — đặc tả:
// docs/05-frontend/phases/admin-activity-v2/PLAN.md, mục "Dữ liệu demo (N12)".
//
//   npm run seed-activity-demo --workspace server -- --dry-run   chỉ ĐỌC DB, in ra sẽ xoá / tạo gì và số Điểm chính dự kiến
//   npm run seed-activity-demo --workspace server                xoá dòng demo cũ rồi tạo lại (chạy lại bao nhiêu lần cũng được)
//   npm run seed-activity-demo --workspace server -- --reset     chỉ xoá dòng demo
//
// Nên chạy SAU `npm run seed-dashboard-demo`: các thao tác kiểm duyệt mà script đó
// tạo (id `cdemodash…`) được chép sang nhật ký để hai trang khớp nhau. Chạy lại
// script dashboard thì chạy lại script này.
//
// Chỉ ghi bảng `audit_logs` (mọi dòng có id bắt đầu bằng ID_PREFIX) và tính lại
// bảng `audit_log_hourly_stats` cho khoảng giờ có dòng demo, trong một transaction.
// Không tạo user, tin, công ty hay thông báo. Người làm và đối tượng là dữ liệu có
// thật trong DB; riêng tin "rác" của quy tắc (c) và vài mục danh mục bị từ chối /
// được gộp là đối tượng không có trong DB (id cũng bắt đầu bằng ID_PREFIX).
//
// Không gửi email: không đi qua service nào, đếm outbox_events trước/sau và huỷ
// toàn bộ nếu số này đổi. Thời điểm tính theo ngày chạy (30 ngày tới hôm qua, giờ
// Việt Nam); bộ sinh số có hạt giống cố định nên chạy lại cùng ngày ra cùng dữ liệu.
import { PrismaClient, Prisma, type JobPostStatus, type Role } from "@prisma/client";
import type { AuditAction, AuditEntityType } from "../src/modules/audit-log/audit-log.actions";
import { groupOfAction } from "../src/modules/audit-log/audit-log.actions";
import { toStatBuckets } from "../src/modules/audit-log/audit-log-stats.job";
import {
  NEW_IP_LOOKBACK_DAYS,
  SUBMIT_BURST_ACTIONS,
  SUBMIT_BURST_PER_HOUR,
  findNewIpLogins,
  groupBurstHours,
  summarizeRule,
  type AdminLoginRow,
  type SubmitBurstHourRow,
} from "../src/modules/audit-log/audit-log.highlights";
import { floorHour, utcSql } from "../src/modules/audit-log/audit-log.where";
import { LOGIN_FAIL_THRESHOLD, LOGIN_FAIL_WINDOW_MINUTES } from "../src/modules/auth/auth.service";
import { DEMO_EMAIL_DOMAIN, DEMO_EMPLOYER_EMAIL } from "./lib/match-demo-fixture";

const ID_PREFIX = "cdemolog";
/** Thao tác kiểm duyệt do seed-dashboard-demo tạo (được chép sang nhật ký). */
const DASHBOARD_DEMO_PREFIX = "cdemodash";
/** Dòng demo: ngày -29 … -1 so với hôm nay (cùng khoảng 30 ngày mặc định của danh sách và Điểm chính). */
const FIRST_DAY = -29;
const LAST_DAY = -1;
/** Vài lần Admin đăng nhập trước khoảng đó, để quy tắc (b) có IP quen mà so (lùi 30 ngày). */
const BASELINE_FIRST_DAY = -39;

// IP thuộc dải dành cho tài liệu (RFC 5737), trừ IP cổng Docker của máy dev.
const OFFICE_IP = "198.51.100.24";
const DEV_IP = "172.19.0.1"; // mọi lần đăng nhập thật trên máy dev đều ghi IP này
const NEW_IP = "203.0.113.77";
const ATTACKER_IPS = ["203.0.113.45", "203.0.113.190"] as const;
const homeIp = (n: number) => `192.0.2.${n}`;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const VN_OFFSET = 7 * HOUR;
const NOW = new Date();
const OUTBOX_GUARD = "outbox_events";

const prisma = new PrismaClient();
type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;

function fail(message: string): never {
  throw new Error(message);
}

function itemAt<T>(items: readonly T[], i: number): T {
  const item = items[i];
  if (item === undefined) fail(`Thiếu phần tử ${i}`);
  return item;
}

/** id tự đặt: chỉ chữ thường + số, bắt đầu bằng "c" để vẫn qua `z.string().cuid()`. */
function demoId(kind: string, key: string | number): string {
  const id = `${ID_PREFIX}${kind}${key}`.toLowerCase();
  if (!/^[0-9a-z]+$/.test(id)) fail(`id demo không hợp lệ: ${id}`);
  return id;
}
const isDemoId = { startsWith: ID_PREFIX };

// ─── Thời gian (giờ Việt Nam) ───────────────────────────────────────────────

function vnDayStart(dayOffset: number): Date {
  const vnMidnight = Math.floor((NOW.getTime() + VN_OFFSET) / DAY) * DAY;
  return new Date(vnMidnight - VN_OFFSET + dayOffset * DAY);
}
/** Ngày `dayOffset` so với hôm nay, lúc hh:mm:ss giờ Việt Nam. */
function vnAt(dayOffset: number, hour: number, minute = 0, second = 0): Date {
  return new Date(vnDayStart(dayOffset).getTime() + hour * HOUR + minute * 60_000 + second * 1000);
}
/** 0 = Chủ nhật … 6 = Thứ bảy, theo ngày Việt Nam. */
function vnWeekday(dayOffset: number): number {
  return new Date(vnDayStart(dayOffset).getTime() + VN_OFFSET).getUTCDay();
}
const isWeekend = (dayOffset: number) => [0, 6].includes(vnWeekday(dayOffset));
const WEEKDAY_LABEL = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function fmt(date: Date): string {
  return date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short", hour12: false });
}
function fmtDay(dayOffset: number): string {
  const date = vnDayStart(dayOffset);
  return `${WEEKDAY_LABEL[vnWeekday(dayOffset)]} ${date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" })}`;
}
function dayOffsetOf(date: Date): number {
  return Math.round((floorVnDay(date).getTime() - vnDayStart(0).getTime()) / DAY);
}
function floorVnDay(date: Date): Date {
  return new Date(Math.floor((date.getTime() + VN_OFFSET) / DAY) * DAY - VN_OFFSET);
}

/** PRNG cố định (mulberry32). */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Kịch bản cố định ───────────────────────────────────────────────────────

/** (c) Các giờ một Employer gửi tin dồn dập: [vị trí Employer, ngày, giờ, số tin]. */
const BURSTS: ReadonlyArray<readonly [employer: number, day: number, hour: number, count: number]> = [
  [0, -20, 2, 11],
  [0, -12, 21, 15],
  [0, -2, 3, 24],
  [1, -9, 14, 12],
  [2, -16, 9, 10],
];
/** Dưới ngưỡng: 9 tin trong một giờ, không bị báo. */
const BELOW_THRESHOLD: readonly [employer: number, day: number, hour: number, count: number] = [1, -5, 10, 9];

const SPAM_TITLES = [
  "Tuyển cộng tác viên nhập liệu tại nhà, 500k/ngày",
  "Việc nhẹ lương cao, không cần kinh nghiệm",
  "Tuyển gấp 50 thực tập sinh làm online",
  "Kiếm tiền qua điện thoại, rút tiền mỗi ngày",
  "Cộng tác viên bán hàng, hoa hồng 40%",
  "Tuyển người xem video nhận thưởng",
  "Tuyển nhân viên chốt đơn online tại nhà",
  "Gõ văn bản tại nhà, trả lương theo ngày",
] as const;
const BRANCHES = ["Hà Nội", "Hải Phòng", "Đà Nẵng", "Huế", "Nha Trang", "Cần Thơ", "Biên Hoà", "Vũng Tàu", "Quy Nhơn"] as const;

const SPAM_REJECT_REASON = "Tin rác: nội dung trùng lặp, không phải tin tuyển thực tập";
const STORY_JOB_REJECT_REASON = "Mô tả chưa ghi rõ thời gian thực tập và mức phụ cấp";
const COMPANY_REJECT_REASON = "Ảnh giấy phép kinh doanh bị mờ, không đọc được mã số thuế";
const SUSPEND_REASON = "Hồ sơ đăng số điện thoại và link quảng cáo dịch vụ viết CV thuê";

/** Đề xuất danh mục bị từ chối (đối tượng không có trong DB). */
const REJECTED_PROPOSALS: ReadonlyArray<readonly [type: CatalogType, name: string]> = [
  ["Skill", "Chịu được áp lực cao"],
  ["Skill", "tin hoc vp"],
  ["Skill", "Lập trình giỏi"],
  ["University", "Trường THPT Nguyễn Du"],
  ["Skill", "Excell"],
  ["Major", "Ngành bất kỳ"],
  ["Skill", "abc"],
  ["University", "Đại học ABC"],
];

type CatalogType = "Skill" | "University" | "Major";
const CATALOG_LABEL: Record<CatalogType, string> = { Skill: "kỹ năng", University: "trường", Major: "ngành" };

// ─── Đọc DB ─────────────────────────────────────────────────────────────────

interface Person {
  id: string;
  email: string;
}
interface EmployerCtx extends Person {
  companyId: string;
  companyName: string;
}
interface JobCtx {
  id: string;
  title: string;
  status: JobPostStatus;
  companyId: string;
  companyName: string;
}
interface CatalogEntry {
  id: string;
  name: string;
  type: CatalogType;
}
interface SubCtx {
  id: string;
  companyId: string;
  companyName: string;
  planName: string;
  amount: number;
  paymentId: string | null;
}
interface MirroredAction {
  jobPostId: string;
  title: string;
  companyName: string;
  employerId: string | null;
  action: "SUBMITTED" | "APPROVED" | "REJECTED";
  actorId: string | null;
  reason: string | null;
  createdAt: Date;
}
interface Context {
  admin: Person;
  /** Theo thứ tự trong kịch bản: [0] gửi dồn dập nặng nhất, [1], [2]. */
  employers: EmployerCtx[];
  employerOfCompany: Map<string, EmployerCtx>;
  candidates: Person[];
  storyJob: JobCtx;
  approvalJobs: JobCtx[];
  skippedJobs: number;
  mirrored: MirroredAction[];
  catalog: CatalogEntry[];
  skills: CatalogEntry[];
  subscriptions: Map<string, SubCtx>;
}

async function loadContext(db: Db): Promise<Context> {
  const admin = await db.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
  if (!admin) fail("Không có tài khoản Admin đang hoạt động.");

  const employerRows = await db.employer.findMany({
    where: { user: { status: "ACTIVE" } },
    select: { userId: true, companyId: true, user: { select: { email: true, createdAt: true } }, company: { select: { name: true } } },
  });
  const byCompany = new Map<string, EmployerCtx>();
  const sorted = [...employerRows].sort(
    (a, b) =>
      Number(b.user.email === DEMO_EMPLOYER_EMAIL) - Number(a.user.email === DEMO_EMPLOYER_EMAIL) ||
      a.user.createdAt.getTime() - b.user.createdAt.getTime(),
  );
  for (const row of sorted) {
    if (!row.companyId || !row.company || byCompany.has(row.companyId)) continue;
    byCompany.set(row.companyId, { id: row.userId, email: row.user.email, companyId: row.companyId, companyName: row.company.name });
  }
  const employers = [...byCompany.values()];
  if (employers.length < 3) fail(`Cần ít nhất 3 Employer (mỗi người một công ty), DB có ${employers.length}.`);

  const candidates = await db.user.findMany({
    where: { role: "CANDIDATE", status: "ACTIVE", email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
    orderBy: { email: "asc" },
    select: { id: true, email: true },
  });
  if (candidates.length < 9) fail(`Cần ít nhất 9 ứng viên @${DEMO_EMAIL_DOMAIN} (chạy seed-match-demo trước), DB có ${candidates.length}.`);

  const windowStart = vnDayStart(FIRST_DAY);
  const moderation = await db.jobPostModerationAction.findMany({
    where: { id: { startsWith: DASHBOARD_DEMO_PREFIX }, createdAt: { gte: windowStart, lt: NOW } },
    orderBy: { createdAt: "asc" },
    select: { jobPostId: true, action: true, actorId: true, reason: true, createdAt: true, jobPost: { select: { title: true, companyId: true, company: { select: { name: true } } } } },
  });
  const mirrored: MirroredAction[] = moderation.flatMap((m) =>
    m.action === "SUBMITTED" || m.action === "APPROVED" || m.action === "REJECTED"
      ? [
          {
            jobPostId: m.jobPostId,
            title: m.jobPost.title,
            companyName: m.jobPost.company.name,
            employerId: byCompany.get(m.jobPost.companyId)?.id ?? null,
            action: m.action,
            actorId: m.actorId,
            reason: m.reason,
            createdAt: m.createdAt,
          },
        ]
      : [],
  );

  // Tin đã có dòng nhật ký thật thì để nguyên câu chuyện của nó.
  const realEntityIds = new Set(
    (await db.auditLog.findMany({ where: { NOT: { id: isDemoId }, entityType: "JobPost" }, select: { entityId: true }, distinct: ["entityId"] })).map((r) => r.entityId),
  );
  const mirroredIds = new Set(mirrored.map((m) => m.jobPostId));
  const jobs = (
    await db.jobPost.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, title: true, status: true, companyId: true, company: { select: { name: true } } },
    })
  ).map((j) => ({ id: j.id, title: j.title, status: j.status, companyId: j.companyId, companyName: j.company.name }));
  const usable = jobs.filter(
    (j) =>
      ["PUBLISHED", "EXPIRED", "CLOSED"].includes(j.status) &&
      !j.id.startsWith(DASHBOARD_DEMO_PREFIX) &&
      !realEntityIds.has(j.id) &&
      !mirroredIds.has(j.id) &&
      byCompany.has(j.companyId),
  );
  const storyJob = usable.find((j) => j.status === "PUBLISHED") ?? fail("Không có tin PUBLISHED nào dùng được cho câu chuyện từ chối → gửi lại → duyệt.");
  const approvalJobs = usable.filter((j) => j.id !== storyJob.id);

  const [skills, universities, majors] = await Promise.all([
    db.skill.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.university.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.major.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const skillEntries = skills.map((s) => ({ ...s, type: "Skill" as const }));
  const catalog: CatalogEntry[] = [
    ...skillEntries,
    ...universities.map((u) => ({ ...u, type: "University" as const })),
    ...majors.map((m) => ({ ...m, type: "Major" as const })),
  ];
  if (skillEntries.length < 10) fail(`Cần ít nhất 10 kỹ năng đã duyệt, DB có ${skillEntries.length}.`);

  const subscriptions = new Map<string, SubCtx>();
  const subs = await db.companySubscription.findMany({
    where: { companyId: { in: employers.map((e) => e.companyId) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, companyId: true, plan: { select: { name: true, price: true } }, payments: { where: { status: "COMPLETED" }, take: 1, select: { id: true, amount: true } } },
  });
  for (const sub of subs) {
    if (subscriptions.has(sub.companyId)) continue;
    const payment = sub.payments[0];
    subscriptions.set(sub.companyId, {
      id: sub.id,
      companyId: sub.companyId,
      companyName: byCompany.get(sub.companyId)!.companyName,
      planName: sub.plan.name,
      amount: payment?.amount ?? sub.plan.price,
      paymentId: payment?.id ?? null,
    });
  }

  return {
    admin,
    employers,
    employerOfCompany: byCompany,
    candidates,
    storyJob,
    approvalJobs,
    skippedJobs: jobs.length - usable.length,
    mirrored,
    catalog,
    skills: skillEntries,
    subscriptions,
  };
}

// ─── Dựng dòng nhật ký ──────────────────────────────────────────────────────

interface Draft {
  actorId: string | null;
  actorRole: Role | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  summary: string;
  metadata?: Prisma.InputJsonObject;
  createdAt: Date;
  /** Nhãn tình huống cài sẵn, chỉ để in ở --dry-run. */
  scenario?: string;
  /** Dòng gửi tin dồn dập (không tính vào số dòng "thường" của ngày). */
  burst?: boolean;
}

interface Built {
  drafts: Draft[];
  scenarios: string[];
}

function buildDrafts(ctx: Context): Built {
  const rand = seededRandom(20261104);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const drafts: Draft[] = [];
  const scenarios: string[] = [];
  const admin = ctx.admin;
  const [e0, e1, e2] = [itemAt(ctx.employers, 0), itemAt(ctx.employers, 1), itemAt(ctx.employers, 2)];
  const cand = (i: number) => itemAt(ctx.candidates, i);

  const asAdmin = (d: Omit<Draft, "actorId" | "actorRole">): Draft => ({ ...d, actorId: admin.id, actorRole: "ADMIN" });
  const asEmployer = (employer: Person, d: Omit<Draft, "actorId" | "actorRole">): Draft => ({ ...d, actorId: employer.id, actorRole: "EMPLOYER" });
  const push = (...rows: Draft[]) => drafts.push(...rows);

  const login = (at: Date, ip: string, scenario?: string): Draft =>
    asAdmin({ action: "AUTH_LOGIN_SUCCEEDED", entityType: "User", entityId: admin.id, summary: `${admin.email} đăng nhập`, metadata: { ip }, createdAt: at, ...(scenario ? { scenario } : {}) });
  const submit = (employer: EmployerCtx, jobId: string, title: string, at: Date, resubmit: boolean, extra: Partial<Draft> = {}): Draft =>
    asEmployer(employer, {
      action: "JOB_POST_SUBMITTED",
      entityType: "JobPost",
      entityId: jobId,
      summary: `${employer.companyName} gửi duyệt tin "${title}"`,
      metadata: { resubmit },
      createdAt: at,
      ...extra,
    });
  const approveJob = (jobId: string, title: string, companyName: string, at: Date, actorId: string = admin.id): Draft => ({
    actorId,
    actorRole: "ADMIN",
    action: "JOB_POST_APPROVED",
    entityType: "JobPost",
    entityId: jobId,
    summary: `Duyệt tin "${title}" của ${companyName}`,
    createdAt: at,
  });
  const rejectJob = (jobId: string, title: string, companyName: string, at: Date, reason: string, actorId: string = admin.id): Draft => ({
    actorId,
    actorRole: "ADMIN",
    action: "JOB_POST_REJECTED",
    entityType: "JobPost",
    entityId: jobId,
    summary: `Từ chối tin "${title}" của ${companyName}`,
    metadata: { reason },
    createdAt: at,
  });

  // 1. Admin đăng nhập: IP văn phòng và IP máy dev là hai IP quen.
  for (let day = BASELINE_FIRST_DAY; day < FIRST_DAY; day += 2) {
    push(login(vnAt(day, 8, int(5, 40), int(0, 59)), (day - BASELINE_FIRST_DAY) % 4 === 0 ? DEV_IP : OFFICE_IP));
  }
  for (let day = FIRST_DAY; day <= LAST_DAY; day += 1) {
    if (isWeekend(day)) {
      if (rand() < 0.4) push(login(vnAt(day, 9, int(10, 50), int(0, 59)), DEV_IP));
      continue;
    }
    push(login(vnAt(day, 8, int(0, 25), int(0, 59)), rand() < 0.7 ? OFFICE_IP : DEV_IP));
    if (rand() < 0.5) push(login(vnAt(day, 13, int(5, 40), int(0, 59)), rand() < 0.7 ? OFFICE_IP : DEV_IP));
  }
  push(login(vnAt(-3, 23, 41, 12), NEW_IP, "(b) Admin đăng nhập từ IP mới"));
  scenarios.push(`(b) ${fmt(vnAt(-3, 23, 41))} ${admin.email} đăng nhập từ ${NEW_IP} (IP quen: ${OFFICE_IP}, ${DEV_IP})`);

  // 2. (a) Đăng nhập sai liên tục: tài khoản A hai lần (một trong 7 ngày), B một lần cũ hơn 7 ngày.
  const failed = (target: Person, at: Date, ip: string): Draft => ({
    actorId: null,
    actorRole: null,
    action: "AUTH_LOGIN_FAILED_REPEATED",
    entityType: "User",
    entityId: target.id,
    summary: `Đăng nhập sai ${LOGIN_FAIL_THRESHOLD} lần trong ${LOGIN_FAIL_WINDOW_MINUTES} phút vào tài khoản ${target.email}`,
    metadata: { attempts: LOGIN_FAIL_THRESHOLD, windowMinutes: LOGIN_FAIL_WINDOW_MINUTES, ip },
    createdAt: at,
    scenario: "(a) Đăng nhập sai liên tục",
  });
  const accountA = cand(0);
  const accountB = cand(1);
  push(failed(accountA, vnAt(-11, 21, 3, 40), ATTACKER_IPS[0]), failed(accountB, vnAt(-19, 23, 37, 5), ATTACKER_IPS[1]), failed(accountA, vnAt(-2, 22, 14, 21), ATTACKER_IPS[0]));
  scenarios.push(`(a) ${accountA.email}: ${fmt(vnAt(-11, 21, 3))} và ${fmt(vnAt(-2, 22, 14))}; ${accountB.email}: ${fmt(vnAt(-19, 23, 37))}`);

  // 3. (c) Employer gửi duyệt tin dồn dập (tin rác, không có trong DB), và một giờ 9 tin dưới ngưỡng.
  const burstRows = (employerIndex: number, day: number, hour: number, count: number, below: boolean): Draft[] => {
    const employer = itemAt(ctx.employers, employerIndex);
    return Array.from({ length: count }, (_, i) => {
      const at = vnAt(day, hour, Math.floor((i * 58) / count) + int(0, 1), int(0, 59));
      const title = below ? `Thực tập sinh Kinh doanh – Chi nhánh ${itemAt(BRANCHES, i % BRANCHES.length)}` : itemAt(SPAM_TITLES, (i + day * -1) % SPAM_TITLES.length);
      const id = demoId(below ? "branch" : "spam", `${employerIndex}d${-day}n${i}`);
      return submit(employer, id, title, at, false, { burst: true });
    });
  };
  for (const [index, day, hour, count] of BURSTS) {
    push(...burstRows(index, day, hour, count, false));
    scenarios.push(`(c) ${fmt(vnAt(day, hour))} ${itemAt(ctx.employers, index).email} gửi ${count} tin trong giờ ${hour}:00–${hour}:59`);
  }
  {
    const [index, day, hour, count] = BELOW_THRESHOLD;
    push(...burstRows(index, day, hour, count, true));
    scenarios.push(`(c) dưới ngưỡng: ${fmt(vnAt(day, hour))} ${itemAt(ctx.employers, index).email} gửi ${count} tin trong một giờ — không bị báo`);
  }
  // Sáng hôm sau đợt đầu: Admin từ chối 11 tin rác rồi buộc đăng xuất tài khoản đó.
  const firstBurst = drafts.filter((d) => d.burst && d.actorId === e0.id && dayOffsetOf(d.createdAt) === -20);
  firstBurst.forEach((row, i) => {
    const title = row.summary.slice(row.summary.indexOf('"') + 1, row.summary.lastIndexOf('"'));
    push({ ...rejectJob(row.entityId, title, e0.companyName, vnAt(-19, 8, 30 + i, int(0, 59)), SPAM_REJECT_REASON), scenario: "Admin từ chối tin rác" });
  });
  push(
    asAdmin({
      action: "USER_SESSIONS_REVOKED",
      entityType: "User",
      entityId: e0.id,
      summary: `Buộc đăng xuất ${e0.email}`,
      metadata: { reason: `Nghi tài khoản bị chiếm: gửi ${firstBurst.length} tin trong một giờ lúc 02:00` },
      createdAt: vnAt(-19, 8, 52, 10),
    }),
  );
  scenarios.push(`${fmt(vnAt(-19, 8, 30))} Admin từ chối ${firstBurst.length} tin rác của đợt đầu và buộc đăng xuất ${e0.email}`);

  // 4. Admin duyệt 15 mục danh mục trong một giờ: Admin làm nhiều không bị báo.
  const used = new Set<string>();
  const pickCatalog = (pool: readonly CatalogEntry[]): CatalogEntry => {
    for (let tries = 0; tries < 50; tries += 1) {
      const entry = itemAt(pool, Math.floor(rand() * pool.length));
      if (!used.has(entry.id)) {
        used.add(entry.id);
        return entry;
      }
    }
    return fail("Hết mục danh mục để chọn");
  };
  const approveCatalog = (entry: CatalogEntry, at: Date): Draft =>
    asAdmin({ action: "CATALOG_ENTRY_APPROVED", entityType: entry.type, entityId: entry.id, summary: `Duyệt ${CATALOG_LABEL[entry.type]} "${entry.name}"`, createdAt: at });
  for (let i = 0; i < 15; i += 1) push({ ...approveCatalog(pickCatalog(ctx.catalog), vnAt(-8, 10, i * 4 + int(0, 2), int(0, 59))), scenario: "Admin duyệt 15 mục trong một giờ" });
  scenarios.push(`${fmt(vnAt(-8, 10))} Admin duyệt 15 mục danh mục trong một giờ — không bị báo`);

  // 5. Một tin: gửi duyệt → bị từ chối có lý do → gửi lại → được duyệt.
  {
    const job = ctx.storyJob;
    const employer = ctx.employerOfCompany.get(job.companyId)!;
    push(
      { ...submit(employer, job.id, job.title, vnAt(-15, 9, 20, 14), false), scenario: "Tin bị từ chối rồi được duyệt" },
      { ...rejectJob(job.id, job.title, job.companyName, vnAt(-14, 10, 5, 2), STORY_JOB_REJECT_REASON), scenario: "Tin bị từ chối rồi được duyệt" },
      { ...submit(employer, job.id, job.title, vnAt(-13, 15, 40, 33), true), scenario: "Tin bị từ chối rồi được duyệt" },
      { ...approveJob(job.id, job.title, job.companyName, vnAt(-12, 9, 10, 48)), scenario: "Tin bị từ chối rồi được duyệt" },
    );
    scenarios.push(`Tin "${job.title}" (${job.companyName}): gửi ${fmt(vnAt(-15, 9, 20))} → từ chối ${fmt(vnAt(-14, 10, 5))} → gửi lại → duyệt ${fmt(vnAt(-12, 9, 10))}`);
  }

  // 6. Các tin khác: gửi duyệt rồi được duyệt, rải đều trong khoảng.
  const weekdays = Array.from({ length: LAST_DAY - FIRST_DAY + 1 }, (_, i) => FIRST_DAY + i).filter((d) => !isWeekend(d) && d <= -2);
  ctx.approvalJobs.forEach((job, i) => {
    const employer = ctx.employerOfCompany.get(job.companyId)!;
    const day = itemAt(weekdays, Math.floor((i * weekdays.length) / ctx.approvalJobs.length));
    const hour = int(9, 16);
    const submittedAt = vnAt(day, hour, int(0, 59), int(0, 59));
    const nextWeekday = weekdays.find((d) => d > day) ?? day;
    const approvedAt = hour <= 14 ? new Date(submittedAt.getTime() + int(60, 180) * 60_000) : vnAt(nextWeekday, 8, int(45, 59), int(0, 59));
    push(submit(employer, job.id, job.title, submittedAt, false), approveJob(job.id, job.title, job.companyName, approvedAt));
  });

  // 7. Chép thao tác kiểm duyệt của seed-dashboard-demo (cùng thời điểm).
  const rejectedBefore = new Set<string>();
  for (const m of ctx.mirrored) {
    if (m.action === "SUBMITTED") {
      const employer = ctx.employers.find((e) => e.id === m.employerId);
      if (!employer) continue;
      push({ ...submit(employer, m.jobPostId, m.title, m.createdAt, rejectedBefore.has(m.jobPostId)), scenario: "Chép từ seed-dashboard-demo" });
    } else if (m.action === "REJECTED") {
      rejectedBefore.add(m.jobPostId);
      push({ ...rejectJob(m.jobPostId, m.title, m.companyName, m.createdAt, m.reason ?? STORY_JOB_REJECT_REASON, m.actorId ?? admin.id), scenario: "Chép từ seed-dashboard-demo" });
    } else if (m.actorId) {
      push({ ...approveJob(m.jobPostId, m.title, m.companyName, m.createdAt, m.actorId), scenario: "Chép từ seed-dashboard-demo" });
    }
  }

  // 8. Công ty: một công ty bị từ chối rồi được xác minh; một công ty được xác minh.
  const companySubmit = (employer: EmployerCtx, at: Date): Draft =>
    asEmployer(employer, {
      action: "COMPANY_SUBMITTED",
      entityType: "Company",
      entityId: employer.companyId,
      summary: `${employer.companyName} gửi lại hồ sơ xác minh công ty`,
      metadata: { mode: "update" },
      createdAt: at,
      scenario: "Công ty",
    });
  const companyVerify = (employer: EmployerCtx, at: Date): Draft =>
    asAdmin({ action: "COMPANY_VERIFIED", entityType: "Company", entityId: employer.companyId, summary: `Xác minh công ty ${employer.companyName}`, createdAt: at, scenario: "Công ty" });
  push(
    companySubmit(e1, vnAt(-22, 14, 10, 7)),
    asAdmin({
      action: "COMPANY_REJECTED",
      entityType: "Company",
      entityId: e1.companyId,
      summary: `Từ chối xác minh công ty ${e1.companyName}`,
      metadata: { reason: COMPANY_REJECT_REASON },
      createdAt: vnAt(-21, 9, 40, 51),
      scenario: "Công ty",
    }),
    companySubmit(e1, vnAt(-20, 16, 5, 19)),
    companyVerify(e1, vnAt(-19, 10, 15, 3)),
    companySubmit(e2, vnAt(-7, 15, 30, 44)),
    companyVerify(e2, vnAt(-6, 9, 25, 37)),
  );
  scenarios.push(`Công ty ${e1.companyName}: bị từ chối ${fmt(vnAt(-21, 9, 40))} → gửi lại → xác minh ${fmt(vnAt(-19, 10, 15))}; ${e2.companyName} xác minh ${fmt(vnAt(-6, 9, 25))}`);

  // 9. Năm lần thanh toán gói (người làm là hệ thống, như webhook thanh toán).
  const paymentPlan: ReadonlyArray<readonly [employer: EmployerCtx, day: number, hour: number]> = [
    [e0, -27, 10],
    [e1, -18, 15],
    [e2, -13, 11],
    [e0, -6, 16],
    [e1, -1, 9],
  ];
  let payments = 0;
  for (const [employer, day, hour] of paymentPlan) {
    const sub = ctx.subscriptions.get(employer.companyId);
    if (!sub) continue;
    payments += 1;
    push({
      actorId: null,
      actorRole: null,
      action: "PAYMENT_COMPLETED",
      entityType: "Subscription",
      entityId: sub.id,
      summary: `${sub.companyName} thanh toán gói "${sub.planName}" (${sub.amount.toLocaleString("vi-VN")}đ)`,
      metadata: sub.paymentId ? { paymentId: sub.paymentId, amount: sub.amount } : { amount: sub.amount },
      createdAt: vnAt(day, hour, int(0, 59), int(0, 59)),
      scenario: "Thanh toán",
    });
  }
  scenarios.push(`${payments} lần thanh toán gói`);

  // 10. Tài khoản và bảo mật khác.
  const suspended = cand(2);
  push(
    asAdmin({ action: "USER_SUSPENDED", entityType: "User", entityId: suspended.id, summary: `Khoá tài khoản ${suspended.email}`, metadata: { reason: SUSPEND_REASON, previousStatus: "ACTIVE" }, createdAt: vnAt(-24, 11, 2, 9) }),
    asAdmin({ action: "USER_REACTIVATED", entityType: "User", entityId: suspended.id, summary: `Mở khoá tài khoản ${suspended.email}`, metadata: { newStatus: "ACTIVE" }, createdAt: vnAt(-23, 14, 48, 30) }),
    asAdmin({ action: "USER_PASSWORD_RESET_GUIDE_SENT", entityType: "User", entityId: accountA.id, summary: `Gửi hướng dẫn đặt lại mật khẩu cho ${accountA.email}`, createdAt: vnAt(-10, 10, 20, 4) }),
  );
  const passwordReset = (user: Person, role: Role, at: Date, ip: string, via: "reset" | "change"): Draft => ({
    actorId: user.id,
    actorRole: role,
    action: "AUTH_PASSWORD_RESET",
    entityType: "User",
    entityId: user.id,
    summary: `${user.email} ${via === "change" ? "đổi mật khẩu" : "đặt lại mật khẩu"}`,
    metadata: { ip, via },
    createdAt: at,
  });
  const googleLinked = (user: Person, at: Date, ip: string): Draft => ({
    actorId: user.id,
    actorRole: "CANDIDATE",
    action: "AUTH_GOOGLE_LINKED",
    entityType: "User",
    entityId: user.id,
    summary: `${user.email} liên kết tài khoản Google`,
    metadata: { ip },
    createdAt: at,
  });
  push(
    passwordReset(cand(3), "CANDIDATE", vnAt(-26, 20, 15, 41), homeIp(14), "reset"),
    passwordReset(cand(4), "CANDIDATE", vnAt(-17, 19, 40, 2), homeIp(38), "reset"),
    passwordReset(accountA, "CANDIDATE", vnAt(-10, 21, 30, 55), homeIp(61), "reset"),
    passwordReset(cand(5), "CANDIDATE", vnAt(-6, 12, 10, 18), homeIp(85), "reset"),
    passwordReset(e2, "EMPLOYER", vnAt(-4, 8, 50, 26), homeIp(102), "change"),
    googleLinked(cand(6), vnAt(-23, 21, 5, 13), homeIp(120)),
    googleLinked(cand(7), vnAt(-8, 20, 30, 47), homeIp(143)),
    googleLinked(cand(8), vnAt(-1, 19, 45, 8), homeIp(166)),
  );
  scenarios.push(`${suspended.email} bị khoá rồi mở khoá; ${accountA.email} được gửi hướng dẫn đặt lại mật khẩu sau lần bị dò`);

  // 11. Lấp mỗi ngày tới số dòng mục tiêu bằng việc duyệt danh mục của Admin.
  const educationEntries = ctx.catalog.filter((c) => c.type !== "Skill");
  const rejectedLeft = [...REJECTED_PROPOSALS];
  const fillerFor = (day: number): Draft => {
    const at = isWeekend(day) ? vnAt(day, 9, int(0, 150), int(0, 59)) : vnAt(day, 9, int(0, 510), int(0, 59));
    const roll = rand();
    if (roll < 0.04 && rejectedLeft.length > 0) {
      const [type, name] = rejectedLeft.shift()!;
      return asAdmin({ action: "CATALOG_ENTRY_REJECTED", entityType: type, entityId: demoId("cat", `r${rejectedLeft.length}`), summary: `Từ chối ${CATALOG_LABEL[type]} "${name}"`, createdAt: at });
    }
    if (roll >= 0.04 && roll < 0.07) {
      const target = pickCatalog(ctx.skills);
      const alias = target.name.toLowerCase().replace(/[^a-z0-9#+]/g, "") || target.name.toLowerCase();
      if (alias !== target.name) {
        return asAdmin({
          action: "CATALOG_ENTRY_MERGED",
          entityType: "Skill",
          entityId: demoId("cat", `m${target.id.slice(-6)}`),
          summary: `Gộp kỹ năng "${alias}" vào "${target.name}"`,
          metadata: { targetId: target.id },
          createdAt: at,
        });
      }
    }
    if (roll >= 0.07 && roll < 0.12) {
      const entry = pickCatalog(educationEntries);
      const previousName = entry.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
      if (previousName !== entry.name) {
        return asAdmin({
          action: "CATALOG_ENTRY_RENAME_APPROVED",
          entityType: entry.type,
          entityId: entry.id,
          summary: `Sửa tên và duyệt ${CATALOG_LABEL[entry.type]} "${previousName}" thành "${entry.name}"`,
          metadata: { previousName },
          createdAt: at,
        });
      }
    }
    return approveCatalog(pickCatalog(ctx.catalog), at);
  };
  for (let day = FIRST_DAY; day <= LAST_DAY; day += 1) {
    const target = isWeekend(day) ? int(5, 8) : int(8, 16);
    const existing = drafts.filter((d) => !d.burst && dayOffsetOf(d.createdAt) === day).length;
    for (let i = existing; i < target; i += 1) push(fillerFor(day));
  }

  drafts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { drafts, scenarios };
}

function toRows(drafts: readonly Draft[]): Prisma.AuditLogCreateManyInput[] {
  return drafts.map((d, i) => ({
    id: demoId("", String(i + 1).padStart(4, "0")),
    actorId: d.actorId,
    actorRole: d.actorRole,
    action: d.action,
    entityType: d.entityType,
    entityId: d.entityId,
    summary: d.summary,
    ...(d.metadata ? { metadata: d.metadata } : {}),
    createdAt: d.createdAt,
  }));
}

// ─── Bảng thống kê theo giờ ─────────────────────────────────────────────────

/** Khoảng giờ liền nhau phủ mọi dòng demo cũ và mới (tính lại cả giờ ở giữa cho chắc). */
async function statRange(db: Db, rows: readonly { createdAt: Date }[]): Promise<{ gte: Date; lt: Date } | null> {
  const old = await db.auditLog.aggregate({ where: { id: isDemoId }, _min: { createdAt: true }, _max: { createdAt: true } });
  const times = [...rows.map((r) => r.createdAt.getTime()), old._min.createdAt?.getTime(), old._max.createdAt?.getTime()].filter((t): t is number => t !== undefined);
  if (times.length === 0) return null;
  const gte = floorHour(new Date(Math.min(...times)));
  const lt = new Date(Math.min(floorHour(new Date(Math.max(...times))).getTime() + HOUR, floorHour(NOW).getTime()));
  return gte < lt ? { gte, lt } : null;
}

/** Như cron gộp số (L16): xoá rồi ghi lại số của các giờ trong `range`, từ mọi dòng của bảng chính. */
async function recomputeStats(tx: Tx, range: { gte: Date; lt: Date }): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ bucketStart: Date; action: string; entityType: string; actorRole: Role | null; actorId: string | null; count: number }>>`
    SELECT date_trunc('hour', "createdAt") AS "bucketStart",
           "action", "entityType", "actorRole"::text AS "actorRole", "actorId",
           COUNT(*)::int AS "count"
    FROM audit_logs
    WHERE "createdAt" >= ${utcSql(range.gte)} AND "createdAt" < ${utcSql(range.lt)}
    GROUP BY 1, 2, 3, 4, 5
  `;
  const buckets = toStatBuckets(rows);
  await tx.auditLogHourlyStat.deleteMany({ where: { bucketStart: { gte: range.gte, lt: range.lt } } });
  if (buckets.length > 0) await tx.auditLogHourlyStat.createMany({ data: buckets });
  return buckets.length;
}

// ─── Số Điểm chính dự kiến (cùng cách tính với AuditLogService.getHighlights) ─

interface PlainRow {
  id: string;
  actorId: string | null;
  actorRole: Role | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: Date;
}

function metadataOf(row: PlainRow): Record<string, unknown> {
  return row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
}

function expectedHighlights(rows: readonly PlainRow[], days: 7 | 30) {
  const range = { gte: vnDayStart(-(days - 1)), lt: vnDayStart(1) };
  const lookbackGte = new Date(range.gte.getTime() - NEW_IP_LOOKBACK_DAYS * DAY);
  const inRange = rows.filter((r) => r.createdAt >= range.gte && r.createdAt < range.lt);
  const count = (...actions: string[]) => inRange.filter((r) => actions.includes(r.action)).length;
  const isSubmit = (r: PlainRow) => (SUBMIT_BURST_ACTIONS as readonly string[]).includes(r.action);

  const failedByUser = new Map<string, { userId: string; count: number; latestAt: Date; latestLogId: string }>();
  for (const r of inRange.filter((x) => x.action === "AUTH_LOGIN_FAILED_REPEATED" && x.entityType === "User")) {
    const t = failedByUser.get(r.entityId);
    const latest = !t || r.createdAt > t.latestAt;
    failedByUser.set(r.entityId, { userId: r.entityId, count: (t?.count ?? 0) + 1, latestAt: latest ? r.createdAt : t.latestAt, latestLogId: latest ? r.id : t.latestLogId });
  }

  const logins: AdminLoginRow[] = rows
    .filter((r) => r.action === "AUTH_LOGIN_SUCCEEDED" && r.actorRole === "ADMIN" && r.actorId && r.createdAt >= lookbackGte && r.createdAt < range.lt)
    .map((r) => ({ id: r.id, actorId: r.actorId!, createdAt: r.createdAt, ip: typeof metadataOf(r).ip === "string" ? (metadataOf(r).ip as string) : null }));

  const hours = new Map<string, SubmitBurstHourRow>();
  for (const r of inRange.filter((x) => isSubmit(x) && x.actorRole === "EMPLOYER" && x.actorId)) {
    const hourStart = floorHour(r.createdAt);
    const key = `${r.actorId}|${hourStart.getTime()}`;
    const h = hours.get(key);
    const latest = !h || r.createdAt > h.latestAt;
    hours.set(key, { userId: r.actorId!, hourStart, count: (h?.count ?? 0) + 1, latestAt: latest ? r.createdAt : h.latestAt, latestLogId: latest ? r.id : h.latestLogId });
  }

  return {
    failedLogins: summarizeRule([...failedByUser.values()]),
    adminNewIp: summarizeRule(findNewIpLogins(logins, range)),
    employerSubmitBurst: summarizeRule(groupBurstHours([...hours.values()].filter((h) => h.count >= SUBMIT_BURST_PER_HOUR))),
    activity: {
      jobs: [count("JOB_POST_APPROVED", "JOB_POST_AUTO_PUBLISHED"), count("JOB_POST_REJECTED"), inRange.filter((r) => isSubmit(r) && metadataOf(r).resubmit === true).length],
      companies: [count("COMPANY_VERIFIED", "COMPANY_AUTO_VERIFIED"), count("COMPANY_REJECTED")],
      payments: count("PAYMENT_COMPLETED"),
      catalog: [count("CATALOG_ENTRY_APPROVED", "CATALOG_ENTRY_RENAME_APPROVED"), count("CATALOG_ENTRY_REJECTED"), count("CATALOG_ENTRY_MERGED")],
    },
  };
}

/** Dòng nhật ký đủ để tính Điểm chính 30 ngày (kèm phần lùi của quy tắc b); `withDemo` = cả dòng demo. */
async function loadRows(db: Db, withDemo: boolean): Promise<PlainRow[]> {
  return db.auditLog.findMany({
    where: { ...(withDemo ? {} : { NOT: { id: isDemoId } }), createdAt: { gte: new Date(vnDayStart(-29).getTime() - (NEW_IP_LOOKBACK_DAYS + 1) * DAY) } },
    select: { id: true, actorId: true, actorRole: true, action: true, entityType: true, entityId: true, metadata: true, createdAt: true },
  });
}

async function printHighlights(title: string, rows: readonly PlainRow[], emails: ReadonlyMap<string, string>) {
  const missing = [...new Set(rows.flatMap((r) => [r.actorId, r.entityId]).filter((id): id is string => !!id && !emails.has(id)))];
  const users = missing.length > 0 ? await prisma.user.findMany({ where: { id: { in: missing } }, select: { id: true, email: true } }) : [];
  const allEmails = new Map([...emails, ...users.map((u) => [u.id, u.email] as const)]);
  const email = (id: string) => allEmails.get(id) ?? "(tài khoản đã xoá)";

  console.log(`\n${title}`);
  for (const days of [7, 30] as const) {
    const h = expectedHighlights(rows, days);
    console.log(`  ${days} ngày:`);
    console.log(`    (a) ${h.failedLogins.count} lần đăng nhập sai liên tục · ${h.failedLogins.accountCount} tài khoản`);
    for (const t of h.failedLogins.top) console.log(`        ${email(t.userId).padEnd(42)} ${t.count} lần · gần nhất ${fmt(t.latestAt)}`);
    console.log(`    (b) ${h.adminNewIp.count} lần Admin đăng nhập từ IP mới · ${h.adminNewIp.accountCount} tài khoản`);
    for (const t of h.adminNewIp.top) console.log(`        ${email(t.userId).padEnd(42)} IP mới ${t.ip} · IP quen: ${t.knownIps.join(", ") || "(chưa đăng nhập trong 30 ngày trước)"} · ${fmt(t.latestAt)}`);
    console.log(`    (c) ${h.employerSubmitBurst.count} lần Employer gửi duyệt dồn dập · ${h.employerSubmitBurst.accountCount} tài khoản`);
    for (const t of h.employerSubmitBurst.top) console.log(`        ${email(t.userId).padEnd(42)} ${t.count} lần · nhiều nhất ${t.maxPerHour} tin/giờ · gần nhất ${fmt(t.latestHour.since)}`);
    const a = h.activity;
    console.log(`    Tin: ${a.jobs[0]} được duyệt · ${a.jobs[1]} bị từ chối · ${a.jobs[2]} gửi lại sau từ chối`);
    console.log(`    Công ty: ${a.companies[0]} được xác minh · ${a.companies[1]} bị từ chối. Thanh toán: ${a.payments}`);
    console.log(`    Danh mục: ${a.catalog[0]} được duyệt · ${a.catalog[1]} bị từ chối · ${a.catalog[2]} được gộp`);
  }
}

function knownEmails(ctx: Context): Map<string, string> {
  return new Map<string, string>([[ctx.admin.id, ctx.admin.email], ...ctx.employers.map((e) => [e.id, e.email] as const), ...ctx.candidates.map((c) => [c.id, c.email] as const)]);
}

function asPlain(rows: readonly Prisma.AuditLogCreateManyInput[]): PlainRow[] {
  return rows.map((r) => ({
    id: r.id!,
    actorId: r.actorId ?? null,
    actorRole: r.actorRole ?? null,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    metadata: r.metadata ?? null,
    createdAt: r.createdAt as Date,
  }));
}

// ─── Lệnh ───────────────────────────────────────────────────────────────────

async function dryRun(ctx: Context) {
  const { drafts, scenarios } = buildDrafts(ctx);
  const rows = toRows(drafts);
  const demoCount = await prisma.auditLog.count({ where: { id: isDemoId } });
  const range = await statRange(prisma, drafts);
  const outbox = await prisma.outboxEvent.count();

  console.log("DRY RUN — không ghi gì vào DB.\n");
  console.log(`Admin: ${ctx.admin.email}`);
  console.log(`Employer theo thứ tự kịch bản: ${ctx.employers.map((e, i) => `[${i}] ${e.email} (${e.companyName})`).join(", ")}`);
  console.log(`Tin dùng được: 1 tin cho câu chuyện + ${ctx.approvalJobs.length} tin gửi/duyệt; bỏ qua ${ctx.skippedJobs} tin (nháp, chờ duyệt, của seed-dashboard-demo hoặc đã có nhật ký thật).`);
  console.log(`Thao tác kiểm duyệt chép từ seed-dashboard-demo: ${ctx.mirrored.length}.`);
  console.log(`Gói để ghi thanh toán: ${[...ctx.subscriptions.values()].map((s) => `${s.companyName} "${s.planName}" ${s.amount.toLocaleString("vi-VN")}đ`).join("; ") || "(không có)"}`);

  console.log(`\nSẽ xoá: ${demoCount} dòng demo của lần chạy trước.`);
  const baseline = drafts.filter((d) => dayOffsetOf(d.createdAt) < FIRST_DAY).length;
  console.log(`Sẽ tạo: ${rows.length} dòng (${rows.length - baseline} dòng từ ${fmtDay(FIRST_DAY)} tới ${fmtDay(LAST_DAY)}, ${baseline} lần Admin đăng nhập trước đó để có IP quen).`);
  const byGroup = new Map<string, number>();
  for (const d of drafts) byGroup.set(groupOfAction(d.action, d.entityType), (byGroup.get(groupOfAction(d.action, d.entityType)) ?? 0) + 1);
  console.log(`  Theo nhóm: ${[...byGroup].map(([g, n]) => `${g} ${n}`).join(", ")}`);

  console.log("\nTheo ngày (số dòng demo; trong ngoặc là dòng gửi tin dồn dập):");
  const line: string[] = [];
  for (let day = FIRST_DAY; day <= LAST_DAY; day += 1) {
    const all = drafts.filter((d) => dayOffsetOf(d.createdAt) === day);
    const burst = all.filter((d) => d.burst).length;
    line.push(`${fmtDay(day)} ${String(all.length).padStart(2)}${burst ? ` (${burst})` : ""}`);
  }
  for (let i = 0; i < line.length; i += 5) console.log(`  ${line.slice(i, i + 5).map((s) => s.padEnd(18)).join("")}`);

  console.log("\nTình huống cài sẵn:");
  for (const s of scenarios) console.log(`  • ${s}`);

  console.log(
    range
      ? `\nBảng audit_log_hourly_stats: tính lại ${Math.round((range.lt.getTime() - range.gte.getTime()) / HOUR)} giờ từ ${fmt(range.gte)} tới ${fmt(range.lt)} (từ mọi dòng của bảng chính, như cron).`
      : "\nBảng audit_log_hourly_stats: không có giờ nào cần tính lại.",
  );
  console.log(`${OUTBOX_GUARD} hiện có: ${outbox} (bản ghi sẽ huỷ nếu số này đổi).`);

  const real = await loadRows(prisma, false);
  await printHighlights("Điểm chính dự kiến sau khi chạy (tính cả dòng nhật ký thật):", [...real, ...asPlain(rows)], knownEmails(ctx));
}

async function write(ctx: Context) {
  const { drafts } = buildDrafts(ctx);
  const rows = toRows(drafts);
  const outboxBefore = await prisma.outboxEvent.count();

  await prisma.$transaction(
    async (tx) => {
      const range = await statRange(tx, drafts);
      const removed = await tx.auditLog.deleteMany({ where: { id: isDemoId } });
      await tx.auditLogArchive.deleteMany({ where: { id: isDemoId } });
      await tx.auditLog.createMany({ data: rows });
      const buckets = range ? await recomputeStats(tx, range) : 0;

      const outboxAfter = await tx.outboxEvent.count();
      if (outboxAfter !== outboxBefore) fail(`${OUTBOX_GUARD} đổi từ ${outboxBefore} thành ${outboxAfter} — huỷ toàn bộ.`);
      console.log(`✓ Đã xoá ${removed.count} dòng demo cũ, tạo ${rows.length} dòng; ghi lại ${buckets} dòng thống kê theo giờ.`);
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  await printHighlights("Điểm chính hiện tại:", await loadRows(prisma, true), knownEmails(ctx));
  console.log(`\nĐăng nhập ${ctx.admin.email} rồi mở /admin/activity.`);
}

async function reset() {
  await prisma.$transaction(
    async (tx) => {
      const range = await statRange(tx, []);
      const removed = await tx.auditLog.deleteMany({ where: { id: isDemoId } });
      await tx.auditLogArchive.deleteMany({ where: { id: isDemoId } });
      const buckets = range ? await recomputeStats(tx, range) : 0;
      console.log(`✓ Đã xoá ${removed.count} dòng demo; ghi lại ${buckets} dòng thống kê theo giờ cho khoảng đó.`);
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--reset")) return reset();
  const ctx = await loadContext(prisma);
  if (args.has("--dry-run")) return dryRun(ctx);
  return write(ctx);
}

main()
  .catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
