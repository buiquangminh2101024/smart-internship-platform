import { writeFileSync } from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";
import { AUDIT_ACTION_GROUPS } from "../src/modules/audit-log/audit-log.actions";
import { requirePerfDatabaseUrl } from "./lib/perf-database";

// Đo truy vấn và tốc độ ghi của nhật ký (docs/06-backend/admin-audit-log/PLAN.md L26 bước 2, 3, 6).
// CHỈ chạy trên branch Neon đo (PERF_DATABASE_URL), sau `perf:audit-seed`.
//
//   npm run perf:audit-measure --workspace server -- [--label=truoc-migration] [--out=<file.json>] [--runs=5]
//
// Mỗi truy vấn chạy EXPLAIN (ANALYZE, BUFFERS) 1 lần làm nóng + `--runs` lần đo, lấy trung vị
// thời gian thực thi phía Postgres (không tính mạng). Phần ghi: chèn 10.000 dòng trong
// transaction rồi ROLLBACK (không để lại dữ liệu), và 200 lần `create` tuần tự như
// `AuditLogService.record` (có tính mạng), xoá lại sau khi đo.
// Người làm / đối tượng dùng id giả của script sinh dữ liệu. Chỉ in số đo và tên index.

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key ?? "", value ?? "true"] as const;
  }),
);
const label = args.get("label") ?? "do";
const outFile = args.get("out");
const runs = Number(args.get("runs") ?? 5);

const prisma = new PrismaClient({ datasources: { db: { url: requirePerfDatabaseUrl() } } });

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();
const SECURITY = Prisma.join([...AUDIT_ACTION_GROUPS.SECURITY]);
const JOB_POST = Prisma.join([...AUDIT_ACTION_GROUPS.JOB_POST]);

interface PlanNode {
  "Node Type": string;
  "Index Name"?: string;
  "Relation Name"?: string;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  Plans?: PlanNode[];
}
interface ExplainResult {
  Plan: PlanNode;
  "Planning Time": number;
  "Execution Time": number;
}

function scans(node: PlanNode, out: string[] = []): string[] {
  if (/Scan/.test(node["Node Type"])) {
    const target = node["Index Name"] ?? node["Relation Name"];
    const text = target ? `${node["Node Type"]} (${target})` : node["Node Type"];
    if (!out.includes(text)) out.push(text);
  }
  for (const child of node.Plans ?? []) scans(child, out);
  return out;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

async function explain(query: Prisma.Sql): Promise<ExplainResult> {
  const rows = await prisma.$queryRaw<Array<{ "QUERY PLAN": ExplainResult[] }>>(
    Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
  );
  return rows[0]!["QUERY PLAN"][0]!;
}

interface ReadResult {
  name: string;
  executionMs: number;
  planningMs: number;
  buffers: number;
  plan: string;
}

async function measureRead(name: string, query: Prisma.Sql): Promise<ReadResult> {
  await explain(query);
  const results: ExplainResult[] = [];
  for (let run = 0; run < runs; run += 1) results.push(await explain(query));
  const last = results[results.length - 1]!;
  return {
    name,
    executionMs: median(results.map((result) => result["Execution Time"])),
    planningMs: median(results.map((result) => result["Planning Time"])),
    buffers: (last.Plan["Shared Hit Blocks"] ?? 0) + (last.Plan["Shared Read Blocks"] ?? 0),
    plan: scans(last.Plan).join(" + "),
  };
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`SELECT to_regclass(${name}) IS NOT NULL AS "exists"`;
  return rows[0]?.exists ?? false;
}

async function countRows(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT count(*)::int AS count FROM ${table}`);
  return rows[0]?.count ?? 0;
}

class Rollback extends Error {
  constructor(readonly result: ExplainResult) {
    super("rollback");
  }
}

// Bước 3: ghi 10.000 dòng một lần, đo phía Postgres (gồm cập nhật mọi index), rồi huỷ.
async function measureBulkInsert(): Promise<number> {
  const insert = Prisma.sql`
    INSERT INTO audit_logs (id, "actorId", "actorRole", action, "entityType", "entityId", summary, metadata, "createdAt")
    SELECT 'perf-write-' || g || '-' || md5(random()::text),
           'perf-employer-' || (g % 400 + 1),
           'EMPLOYER'::"Role",
           (ARRAY['JOB_POST_SUBMITTED', 'JOB_POST_APPROVED', 'AUTH_PASSWORD_RESET', 'COMPANY_SUBMITTED'])[g % 4 + 1],
           'JobPost',
           'perf-jobpost-' || (g % 8000 + 1),
           '[perf] write',
           '{}'::jsonb,
           (now() AT TIME ZONE 'UTC') - make_interval(secs => g)
    FROM generate_series(1, 10000) AS g`;
  const timings: number[] = [];
  for (let run = 0; run < 3; run += 1) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<Array<{ "QUERY PLAN": ExplainResult[] }>>(
            Prisma.sql`EXPLAIN (ANALYZE, FORMAT JSON) ${insert}`,
          );
          throw new Rollback(rows[0]!["QUERY PLAN"][0]!);
        },
        { timeout: 60_000 },
      );
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
      timings.push(error.result["Execution Time"]);
    }
  }
  return median(timings);
}

// Ghi từng dòng như ứng dụng (một round trip mỗi dòng), rồi xoá phần vừa ghi.
async function measureSingleInserts(count: number): Promise<{ medianMs: number; p95Ms: number }> {
  const timings: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const startedAt = performance.now();
    await prisma.auditLog.create({
      data: {
        actorId: "perf-employer-1",
        actorRole: "EMPLOYER",
        action: "JOB_POST_SUBMITTED",
        entityType: "JobPost",
        entityId: `perf-write-single-${index}`,
        summary: "[perf] write",
        metadata: { resubmit: false },
      },
    });
    timings.push(performance.now() - startedAt);
  }
  await prisma.auditLog.deleteMany({ where: { entityId: { startsWith: "perf-write-single-" } } });
  return { medianMs: median(timings), p95Ms: percentile(timings, 95) };
}

async function main() {
  const seeded = await prisma.auditLog.count({ where: { entityId: { startsWith: "perf-" } } });
  if (seeded === 0) throw new Error("Branch đo chưa có dòng giả — chạy perf:audit-seed trước.");

  const hasStats = await tableExists("audit_log_hourly_stats");
  const hasArchive = await tableExists("audit_logs_archive");

  const reads: Array<[string, Prisma.Sql]> = [
    ["1. 50 dòng mới nhất", Prisma.sql`SELECT * FROM audit_logs ORDER BY "createdAt" DESC, id DESC LIMIT 51`],
    [
      "2. Nhóm Bảo mật, 30 ngày",
      Prisma.sql`SELECT * FROM audit_logs
        WHERE action IN (${SECURITY}) AND "createdAt" >= ${isoDaysAgo(30)}::timestamp
        ORDER BY "createdAt" DESC, id DESC LIMIT 51`,
    ],
    [
      "3a. Một người làm (Admin làm nhiều)",
      Prisma.sql`SELECT * FROM audit_logs WHERE "actorId" = 'perf-admin-1' ORDER BY "createdAt" DESC, id DESC LIMIT 51`,
    ],
    [
      "3b. Một người làm (nhà tuyển dụng làm ít)",
      Prisma.sql`SELECT * FROM audit_logs WHERE "actorId" = 'perf-employer-1' ORDER BY "createdAt" DESC, id DESC LIMIT 51`,
    ],
    [
      "4. Hành trình một tin (cũ trước)",
      Prisma.sql`SELECT * FROM audit_logs WHERE "entityType" = 'JobPost' AND "entityId" = 'perf-jobpost-1'
        ORDER BY "createdAt" ASC, id ASC LIMIT 200`,
    ],
    [
      "5. /stats 30 ngày, đếm trực tiếp",
      Prisma.sql`SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, action, count(*)::int
        FROM audit_logs WHERE "createdAt" >= ${isoDaysAgo(30)}::timestamp
        GROUP BY 1, 2`,
    ],
    ["6a. total, không lọc", Prisma.sql`SELECT count(*)::int FROM audit_logs`],
    [
      "6b. total, nhóm Tin tuyển dụng 90 ngày",
      Prisma.sql`SELECT count(*)::int FROM audit_logs WHERE action IN (${JOB_POST}) AND "createdAt" >= ${isoDaysAgo(90)}::timestamp`,
    ],
  ];
  if (hasStats) {
    reads.push([
      "5'. /stats 30 ngày, đọc bảng thống kê",
      Prisma.sql`SELECT (("bucketStart" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, "actionGroup", sum(count)::int
        FROM audit_log_hourly_stats WHERE "bucketStart" >= ${isoDaysAgo(30)}::timestamp
        GROUP BY 1, 2`,
    ]);
  }

  const readResults: ReadResult[] = [];
  for (const [name, query] of reads) readResults.push(await measureRead(name, query));

  const bulkInsertMs = await measureBulkInsert();
  const single = await measureSingleInserts(200);

  const counts = {
    auditLogs: await countRows("audit_logs"),
    ...(hasArchive ? { archive: await countRows("audit_logs_archive") } : {}),
    ...(hasStats ? { hourlyStats: await countRows("audit_log_hourly_stats") } : {}),
  };

  console.log(`\nLần đo: ${label} — ${new Date().toISOString()}`);
  console.log(
    `Số dòng: audit_logs ${counts.auditLogs}` +
      (counts.archive !== undefined ? `, audit_logs_archive ${counts.archive}` : "") +
      (counts.hourlyStats !== undefined ? `, audit_log_hourly_stats ${counts.hourlyStats}` : ""),
  );
  console.log("\n| Truy vấn | Thực thi (ms, trung vị) | Lập kế hoạch (ms) | Buffers | Kế hoạch |");
  console.log("| --- | ---: | ---: | ---: | --- |");
  for (const result of readResults) {
    console.log(
      `| ${result.name} | ${result.executionMs.toFixed(2)} | ${result.planningMs.toFixed(2)} | ${result.buffers} | ${result.plan} |`,
    );
  }
  console.log(`\nGhi 10.000 dòng một lần (phía Postgres, ROLLBACK): ${bulkInsertMs.toFixed(1)} ms`);
  console.log(`Ghi từng dòng như ứng dụng (200 lần, có mạng): trung vị ${single.medianMs.toFixed(1)} ms, p95 ${single.p95Ms.toFixed(1)} ms`);

  if (outFile) {
    writeFileSync(
      outFile,
      JSON.stringify({ label, at: new Date().toISOString(), counts, reads: readResults, bulkInsertMs, single }, null, 2),
    );
    console.log(`\nĐã lưu ${outFile}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
