import { PrismaClient, type Prisma } from "@prisma/client";
import { requirePerfDatabaseUrl } from "./lib/perf-database";

// Bổ sung `metadata.resubmit` cho dòng nhật ký gửi tin ghi trước khi có khoá này
// (docs/06-backend/admin-audit-log/PLAN.md L28, Q9).
//
//   npm run audit:backfill-resubmit --workspace server -- [--dry-run] [--perf]
//
// `--perf` chạy trên branch Neon đo (PERF_DATABASE_URL); không có thì chạy trên
// DATABASE_URL — trên Neon chính chủ dự án tự chạy. Chạy lại nhiều lần vẫn an toàn:
// dòng đã có khoá thì bỏ qua. Chỉ in số đếm, không in id, tên hay email.

const SUBMIT_ACTIONS = ["JOB_POST_SUBMITTED", "JOB_POST_AUTO_PUBLISHED"];

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const usePerf = args.has("--perf");

const prisma = usePerf
  ? new PrismaClient({ datasources: { db: { url: requirePerfDatabaseUrl() } } })
  : new PrismaClient();

function asObject(metadata: Prisma.JsonValue): Prisma.JsonObject | null {
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) ? metadata : null;
}

async function main() {
  const rows = await prisma.auditLog.findMany({
    where: { action: { in: SUBMIT_ACTIONS }, entityType: "JobPost" },
    select: { id: true, entityId: true, createdAt: true, metadata: true },
    orderBy: { createdAt: "asc" },
  });
  const missing = rows.filter((row) => typeof asObject(row.metadata)?.["resubmit"] !== "boolean");

  let resubmits = 0;
  for (const row of missing) {
    // Dòng moderation và dòng nhật ký ghi cùng transaction, dòng moderation trước,
    // nên `≤` luôn gồm chính lần gửi này: từ 2 dòng trở lên là gửi lại.
    const submittedSoFar = await prisma.jobPostModerationAction.count({
      where: { jobPostId: row.entityId, action: "SUBMITTED", createdAt: { lte: row.createdAt } },
    });
    const resubmit = submittedSoFar >= 2;
    if (resubmit) resubmits += 1;
    if (!dryRun) {
      await prisma.auditLog.update({
        where: { id: row.id },
        data: { metadata: { ...(asObject(row.metadata) ?? {}), resubmit } },
      });
    }
  }

  console.log(`Nơi chạy: ${usePerf ? "branch đo (PERF_DATABASE_URL)" : "DATABASE_URL"}${dryRun ? " — chỉ xem, không ghi" : ""}`);
  console.log(`Dòng gửi tin: ${rows.length}, thiếu resubmit: ${missing.length}`);
  console.log(`${dryRun ? "Sẽ ghi" : "Đã ghi"}: ${resubmits} gửi lại, ${missing.length - resubmits} gửi lần đầu`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
