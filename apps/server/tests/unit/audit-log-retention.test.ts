// Chạy: node --import tsx --test tests/unit/audit-log-retention.test.ts (từ apps/server)
// Chuyển nhật ký cũ sang bảng lưu trữ (docs/06-backend/admin-audit-log/PLAN.md L20–L22, L24):
// mốc cắt tròn theo giờ và không vượt phần đã gộp số, không chuyển dòng mới hơn mốc, lô dừng
// đúng giới hạn rồi lần sau làm tiếp, lý do khoá tìm thêm trong bảng lưu trữ.
// Repository là bản giả trong bộ nhớ.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import {
  ARCHIVE_MAX_BATCHES_PER_RUN,
  archiveCutoff,
  archiveOldAuditLogs,
} from "../../src/modules/audit-log/audit-log-retention.job";
import { AuditLogRepository } from "../../src/modules/audit-log/audit-log.repository";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-10-18T20:35:12Z");
const logger = { info: () => {}, warn: () => {}, error: () => {} };

test("archiveCutoff: cắt tròn theo giờ, không vượt phần đã gộp số, bảng thống kê rỗng thì null", () => {
  assert.deepEqual(archiveCutoff(NOW, 30, at("2026-10-18T19:00:00Z")), at("2026-09-18T20:00:00Z"));
  // Bảng thống kê mới gộp tới 10:00 ngày 17; cron gộp số tính lại 2 giờ trước giờ đó ⇒ mốc là 08:00.
  assert.deepEqual(archiveCutoff(NOW, 1, at("2026-10-17T10:00:00Z")), at("2026-10-17T08:00:00Z"));
  assert.equal(archiveCutoff(NOW, 365, null), null);
});

/** Bảng audit_logs và audit_logs_archive trong bộ nhớ, `archiveBatch` theo đúng câu SQL. */
function memoryArchiveRepository(createdAt: Date[], latestStatBucket: Date | null = at("2026-10-18T19:00:00Z")) {
  let main = createdAt.map((date, index) => ({ id: `r${index}`, createdAt: date }));
  const archive: Array<{ id: string; createdAt: Date; archivedAt: Date }> = [];
  const cutoffs: Date[] = [];
  const repository = {
    findLatestStatBucket: async () => latestStatBucket,
    archiveBatch: async (cutoff: Date, batchSize: number, archivedAt: Date) => {
      cutoffs.push(cutoff);
      const moved = main
        .filter((row) => row.createdAt < cutoff)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
        .slice(0, batchSize);
      main = main.filter((row) => !moved.includes(row));
      archive.push(...moved.map((row) => ({ ...row, archivedAt })));
      return moved.length;
    },
  };
  const deps = { auditLogRepository: repository as unknown as AuditLogRepository, logger };
  return { deps, archive, cutoffs, main: () => main };
}

test("không chuyển dòng mới hơn mốc, kể cả dòng cùng giờ với mốc", async () => {
  const memory = memoryArchiveRepository([
    at("2025-10-18T19:59:59Z"),
    at("2025-10-18T20:00:00Z"),
    at("2025-10-18T20:30:00Z"),
    at("2026-10-18T19:00:00Z"),
  ]);
  const result = await archiveOldAuditLogs(memory.deps, { retentionDays: 365, now: NOW });
  assert.deepEqual(result, { cutoff: at("2025-10-18T20:00:00Z"), moved: 1, batches: 1, done: true });
  assert.deepEqual(memory.archive.map((row) => row.id), ["r0"]);
  assert.deepEqual(memory.archive[0]?.archivedAt, NOW);
  assert.deepEqual(memory.main().map((row) => row.id), ["r1", "r2", "r3"]);
});

test("lô dừng đúng giới hạn, cũ nhất trước; lần sau làm tiếp tới hết", async () => {
  const old = Array.from({ length: 25 }, (_, i) => new Date(at("2025-01-01T00:00:00Z").getTime() + i * 60_000));
  const memory = memoryArchiveRepository([...old, at("2026-10-18T19:10:00Z")]);

  const first = await archiveOldAuditLogs(memory.deps, { retentionDays: 365, now: NOW, batchSize: 5, maxBatches: 3 });
  assert.deepEqual({ moved: first.moved, batches: first.batches, done: first.done }, { moved: 15, batches: 3, done: false });
  assert.deepEqual(memory.archive.map((row) => row.id), old.slice(0, 15).map((_, i) => `r${i}`));

  const second = await archiveOldAuditLogs(memory.deps, { retentionDays: 365, now: NOW, batchSize: 5, maxBatches: 3 });
  // 10 dòng còn lại: 2 lô đầy, lô thứ 3 trả 0 ⇒ xong.
  assert.deepEqual({ moved: second.moved, batches: second.batches, done: second.done }, { moved: 10, batches: 3, done: true });
  assert.equal(memory.main().length, 1);
  assert.equal(ARCHIVE_MAX_BATCHES_PER_RUN, 50);
});

test("bảng thống kê rỗng thì không chuyển gì", async () => {
  const memory = memoryArchiveRepository([at("2024-01-01T00:00:00Z")], null);
  const result = await archiveOldAuditLogs(memory.deps, { retentionDays: 365, now: NOW });
  assert.deepEqual(result, { cutoff: null, moved: 0, batches: 0, done: true });
  assert.equal(memory.cutoffs.length, 0);
});

test("findLatestByEntities: chỉ tìm trong bảng lưu trữ các entity bảng chính không có", async () => {
  const queries: Array<{ table: string; values: unknown[] }> = [];
  const suspension = (id: string, entityId: string) => ({ id, entityId, action: "USER_SUSPENDED", entityType: "User" });
  const prisma = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      const table = sql.includes("audit_logs_archive") ? "archive" : "main";
      queries.push({ table, values });
      return table === "main" ? [suspension("a1", "u-1")] : [suspension("a9", "u-2")];
    },
  };
  const repository = new AuditLogRepository({ prisma: prisma as unknown as PrismaClient });

  const latest = await repository.findLatestByEntities("User", ["u-1", "u-2", "u-3"], "USER_SUSPENDED");
  assert.deepEqual([...latest.entries()].map(([entityId, row]) => [entityId, row.id]), [["u-1", "a1"], ["u-2", "a9"]]);
  assert.deepEqual(queries.map((query) => query.table), ["main", "archive"]);
  // Câu thứ hai chỉ hỏi u-2 và u-3.
  assert.match(JSON.stringify(queries[1]?.values), /"u-2","u-3"/);
  assert.doesNotMatch(JSON.stringify(queries[1]?.values), /u-1/);
});

test("findLatestByEntities: bảng chính đủ thì không đọc bảng lưu trữ", async () => {
  let calls = 0;
  const prisma = {
    $queryRaw: async () => {
      calls += 1;
      return [{ id: "a1", entityId: "u-1" }];
    },
  };
  const repository = new AuditLogRepository({ prisma: prisma as unknown as PrismaClient });
  assert.equal((await repository.findLatestByEntities("User", ["u-1"], "USER_SUSPENDED")).size, 1);
  assert.equal(calls, 1);
});
