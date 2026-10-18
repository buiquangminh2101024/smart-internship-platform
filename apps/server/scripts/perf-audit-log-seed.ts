import { PrismaClient, type Prisma, type Role } from "@prisma/client";
import { AUDIT_ACTION_GROUPS, type AuditAction, type AuditEntityType } from "../src/modules/audit-log/audit-log.actions";
import { requirePerfDatabaseUrl } from "./lib/perf-database";

// Sinh dòng nhật ký giả để đo hiệu năng (docs/06-backend/admin-audit-log/PLAN.md L25, L26 bước 1).
// CHỈ chạy trên branch Neon đo (PERF_DATABASE_URL); chốt chặn dừng ngay nếu thiếu hoặc
// trùng DATABASE_URL.
//
//   npm run perf:audit-seed --workspace server -- [--rows=200000] [--months=18] [--reset]
//
// Mọi dòng giả có `entityId` bắt đầu bằng "perf-" (người làm giả cũng vậy), nên
// `--reset` xoá đúng phần đã sinh. Đã có dòng giả mà không có `--reset` thì dừng.
// Dùng bộ sinh số ngẫu nhiên có hạt giống cố định: chạy lại ra cùng dữ liệu.
// Chỉ in số đếm, không in id, tên hay email.

const PREFIX = "perf-";
const BATCH_SIZE = 2_000;

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key ?? "", value ?? "true"] as const;
  }),
);
const totalRows = Number(args.get("rows") ?? 200_000);
const months = Number(args.get("months") ?? 18);
const reset = args.has("reset");
if (!Number.isInteger(totalRows) || totalRows < 1 || !Number.isInteger(months) || months < 1) {
  throw new Error("--rows và --months phải là số nguyên dương");
}

const prisma = new PrismaClient({ datasources: { db: { url: requirePerfDatabaseUrl() } } });

// mulberry32: đủ đều cho dữ liệu giả, cố định theo hạt giống.
let seed = 20261018;
function random(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}
function weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
  const sum = entries.reduce((acc, [, weight]) => acc + weight, 0);
  let roll = random() * sum;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1]![0];
}
function ids(kind: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${PREFIX}${kind}-${index + 1}`);
}

// Người làm giả. 3 Admin làm không đều nhau (60/30/10), như một nhóm kiểm duyệt nhỏ.
const ADMINS = ids("admin", 3);
const EMPLOYERS = ids("employer", 400);
const CANDIDATES = ids("candidate", 3_000);
const JOB_POSTS = ids("jobpost", 8_000);
const COMPANIES = ids("company", 400);
const CATALOG = ids("catalog", 600);
const SUBSCRIPTIONS = ids("subscription", 2_000);

function admin(): string {
  return weighted([
    [ADMINS[0]!, 60],
    [ADMINS[1]!, 30],
    [ADMINS[2]!, 10],
  ]);
}

// Tỉ lệ nhóm ước theo dữ liệu thật (tin tuyển dụng chiếm phần lớn) — tổng 100.
const GROUP_WEIGHTS = [
  ["JOB_POST", 50],
  ["SECURITY", 20],
  ["COMPANY", 8],
  ["CATALOG", 8],
  ["PAYMENT", 7],
  ["ACCOUNT", 7],
] as const;

interface Draft {
  actorId: string | null;
  actorRole: Role | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  metadata: Prisma.InputJsonObject;
}

function ip(): string {
  return `203.0.113.${Math.floor(random() * 254) + 1}`;
}

function draft(): Draft {
  const group = weighted(GROUP_WEIGHTS);
  switch (group) {
    case "JOB_POST": {
      const action = weighted<AuditAction>([
        ["JOB_POST_SUBMITTED", 35],
        ["JOB_POST_AUTO_PUBLISHED", 15],
        ["JOB_POST_APPROVED", 28],
        ["JOB_POST_REJECTED", 12],
        ["JOB_POST_RETRACTED", 10],
      ]);
      const byEmployer = action === "JOB_POST_SUBMITTED" || action === "JOB_POST_AUTO_PUBLISHED" || action === "JOB_POST_RETRACTED";
      const submit = action === "JOB_POST_SUBMITTED" || action === "JOB_POST_AUTO_PUBLISHED";
      return {
        actorId: byEmployer ? pick(EMPLOYERS) : admin(),
        actorRole: byEmployer ? "EMPLOYER" : "ADMIN",
        action,
        entityType: "JobPost",
        entityId: pick(JOB_POSTS),
        metadata: submit ? { resubmit: random() < 0.25 } : {},
      };
    }
    case "COMPANY": {
      const action = pick(AUDIT_ACTION_GROUPS.COMPANY);
      const byEmployer = action === "COMPANY_SUBMITTED" || action === "COMPANY_AUTO_VERIFIED";
      return {
        actorId: byEmployer ? pick(EMPLOYERS) : admin(),
        actorRole: byEmployer ? "EMPLOYER" : "ADMIN",
        action,
        entityType: "Company",
        entityId: pick(COMPANIES),
        metadata: {},
      };
    }
    case "CATALOG":
      return {
        actorId: admin(),
        actorRole: "ADMIN",
        action: pick(AUDIT_ACTION_GROUPS.CATALOG),
        entityType: pick<AuditEntityType>(["Skill", "Skill", "University", "Major"]),
        entityId: pick(CATALOG),
        metadata: {},
      };
    case "PAYMENT":
      return {
        actorId: null,
        actorRole: null,
        action: "PAYMENT_COMPLETED",
        entityType: "Subscription",
        entityId: pick(SUBSCRIPTIONS),
        metadata: { amount: pick([199_000, 499_000, 999_000]) },
      };
    case "ACCOUNT":
      return {
        actorId: admin(),
        actorRole: "ADMIN",
        action: pick(AUDIT_ACTION_GROUPS.ACCOUNT),
        entityType: "User",
        entityId: pick(random() < 0.7 ? CANDIDATES : EMPLOYERS),
        metadata: {},
      };
    case "SECURITY": {
      const action = weighted<AuditAction>([
        ["AUTH_LOGIN_SUCCEEDED", 45],
        ["AUTH_LOGIN_FAILED_REPEATED", 15],
        ["AUTH_PASSWORD_RESET", 25],
        ["AUTH_GOOGLE_LINKED", 15],
      ]);
      if (action === "AUTH_LOGIN_SUCCEEDED") {
        const id = admin();
        return { actorId: id, actorRole: "ADMIN", action, entityType: "User", entityId: id, metadata: { ip: ip() } };
      }
      const employer = random() < 0.3;
      const id = pick(employer ? EMPLOYERS : CANDIDATES);
      return {
        actorId: id,
        actorRole: employer ? "EMPLOYER" : "CANDIDATE",
        action,
        entityType: "User",
        entityId: id,
        metadata: { ip: ip() },
      };
    }
  }
}

// Thời điểm: nhiều dần về gần hiện tại (hệ thống lớn dần), dồn vào giờ hành chính
// giờ Việt Nam (UTC+7) như dữ liệu thật.
const HOUR_WEIGHTS: ReadonlyArray<readonly [number, number]> = Array.from({ length: 24 }, (_, hour) => [
  hour,
  hour >= 8 && hour <= 17 ? 10 : hour >= 19 && hour <= 22 ? 4 : hour >= 6 ? 2 : 0.5,
]);
const end = Date.now();
const start = end - months * 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function createdAt(): Date {
  const dayOffset = Math.floor(Math.sqrt(random()) * ((end - start) / DAY_MS));
  const vnHour = weighted(HOUR_WEIGHTS);
  const vnMidnightUtc = Math.floor((start + dayOffset * DAY_MS + 7 * 3_600_000) / DAY_MS) * DAY_MS - 7 * 3_600_000;
  const at = vnMidnightUtc + vnHour * 3_600_000 + Math.floor(random() * 3_600_000);
  return new Date(Math.min(at, end - 60_000));
}

async function main() {
  const existing = await prisma.auditLog.count({ where: { entityId: { startsWith: PREFIX } } });
  if (existing > 0 && !reset) {
    throw new Error(`Branch đo đã có ${existing} dòng giả — thêm --reset để xoá rồi sinh lại.`);
  }
  if (existing > 0) {
    const removed = await prisma.auditLog.deleteMany({ where: { entityId: { startsWith: PREFIX } } });
    console.log(`Đã xoá ${removed.count} dòng giả cũ`);
  }

  const startedAt = Date.now();
  const byGroup = new Map<string, number>();
  for (let done = 0; done < totalRows; done += BATCH_SIZE) {
    const size = Math.min(BATCH_SIZE, totalRows - done);
    const data: Prisma.AuditLogCreateManyInput[] = Array.from({ length: size }, () => {
      const row = draft();
      const group = Object.entries(AUDIT_ACTION_GROUPS).find(([, actions]) => actions.includes(row.action))?.[0] ?? "OTHER";
      byGroup.set(group, (byGroup.get(group) ?? 0) + 1);
      return { ...row, summary: `[perf] ${row.action}`, createdAt: createdAt() };
    });
    await prisma.auditLog.createMany({ data });
    process.stdout.write(`\rĐã ghi ${done + size}/${totalRows}`);
  }
  process.stdout.write("\n");

  // Thống kê mới cho planner, để EXPLAIN của script đo phản ánh đúng dữ liệu.
  await prisma.$executeRawUnsafe("ANALYZE audit_logs");

  const total = await prisma.auditLog.count();
  console.log(`Xong sau ${((Date.now() - startedAt) / 1000).toFixed(1)} giây. audit_logs hiện có ${total} dòng.`);
  console.log(
    "Theo nhóm (dòng giả):",
    [...byGroup.entries()].map(([group, count]) => `${group} ${count}`).join(", "),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
