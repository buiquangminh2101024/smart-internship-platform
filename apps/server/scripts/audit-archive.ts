import { PrismaClient } from "@prisma/client";
import { requirePerfDatabaseUrl } from "./lib/perf-database";
import { AuditLogRepository } from "../src/modules/audit-log/audit-log.repository";
import {
  MIN_RETENTION_DAYS,
  archiveCutoff,
  archiveOldAuditLogs,
} from "../src/modules/audit-log/audit-log-retention.job";
import { logger } from "../src/shared/logger";

// Chuyển tay nhật ký cũ hơn N ngày sang bảng lưu trữ, dùng chung hàm với cron 03:00
// (docs/06-backend/admin-audit-log/PLAN.md L22, AD-20).
//
//   npm run audit:archive --workspace server -- --days=N [--dry-run] [--perf]
//
// Không giới hạn số lô như cron: chạy tới khi hết dòng cũ hơn mốc. `--dry-run` chỉ in
// số dòng sẽ chuyển. `--perf` chạy trên branch Neon đo (PERF_DATABASE_URL); chỉ khi đó
// mới được `--days` nhỏ hơn 30. Chỉ in số đếm và mốc thời gian, không in id, tên hay email.

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const usePerf = args.includes("--perf");
const daysArg = args.find((arg) => arg.startsWith("--days="))?.slice("--days=".length);
const days = daysArg === undefined ? Number.NaN : Number(daysArg);

if (!Number.isInteger(days) || days < 1) {
  console.error("Cần --days=N (số nguyên >= 1).");
  process.exit(1);
}
if (days < MIN_RETENTION_DAYS && !usePerf) {
  console.error(`--days nhỏ hơn ${MIN_RETENTION_DAYS} chỉ được dùng trên branch đo (thêm --perf).`);
  process.exit(1);
}

const prisma = usePerf
  ? new PrismaClient({ datasources: { db: { url: requirePerfDatabaseUrl() } } })
  : new PrismaClient();
const auditLogRepository = new AuditLogRepository({ prisma });

async function main() {
  const now = new Date();
  console.log(`Nơi chạy: ${usePerf ? "branch đo (PERF_DATABASE_URL)" : "DATABASE_URL"}${dryRun ? " — chỉ xem, không ghi" : ""}`);

  const cutoff = archiveCutoff(now, days, await auditLogRepository.findLatestStatBucket());
  if (!cutoff) {
    console.log("Bảng thống kê theo giờ còn rỗng — chạy server một lần để gộp số trước, rồi chạy lại.");
    return;
  }
  console.log(`Mốc: dòng có createdAt < ${cutoff.toISOString()} (giữ ${days} ngày, cắt tròn theo giờ)`);

  if (dryRun) {
    console.log(`Sẽ chuyển: ${await auditLogRepository.countOlderThan(cutoff)} dòng`);
    return;
  }

  const startedAt = Date.now();
  const result = await archiveOldAuditLogs(
    { auditLogRepository, logger },
    { retentionDays: days, now, maxBatches: Number.POSITIVE_INFINITY },
  );
  console.log(`Đã chuyển: ${result.moved} dòng, ${result.batches} lô, ${((Date.now() - startedAt) / 1000).toFixed(1)} giây`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
