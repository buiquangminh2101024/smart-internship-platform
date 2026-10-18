// Chạy: node --import tsx --test tests/unit/audit-log-stats.test.ts (từ apps/server)
// Bảng thống kê theo giờ và GET /admin/activity/stats (docs/06-backend/admin-audit-log/PLAN.md
// L11, L16–L18, L31, L32): tính lại cùng giờ ra cùng kết quả, bù đúng sau khi server tắt lâu,
// cộng đúng phần đã gộp với phần đếm thẳng, biểu đồ không tự thu theo bộ lọc của chính nó.
// Repository là bản giả trong bộ nhớ.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@prisma/client";
import { activityStatsQuerySchema } from "../../src/modules/audit-log/audit-log.dto";
import {
  ROLLUP_MAX_HOURS,
  planRollupRanges,
  runAuditLogStatsRollup,
  toStatBuckets,
} from "../../src/modules/audit-log/audit-log-stats.job";
import type { StatBucket } from "../../src/modules/audit-log/audit-log.repository";
import { AuditLogService } from "../../src/modules/audit-log/audit-log.service";
import { HOUR_MS, floorHour } from "../../src/modules/audit-log/audit-log.where";

interface RawRow {
  createdAt: Date;
  action: string;
  entityType: string;
  actorRole: Role | null;
  actorId: string | null;
}

const at = (iso: string) => new Date(iso);
const row = (iso: string, action: string, actorId: string | null = "admin-1", actorRole: Role | null = "ADMIN"): RawRow => ({
  createdAt: at(iso),
  action,
  entityType: action.startsWith("AUTH_") || action.startsWith("USER_") ? "User" : "JobPost",
  actorRole: actorId ? actorRole : null,
  actorId,
});

/** Bảng audit_logs và audit_log_hourly_stats trong bộ nhớ, đủ cho cron gộp số. */
function memoryRollupRepository(rows: RawRow[]) {
  let stats: StatBucket[] = [];
  const repository = {
    findLatestStatBucket: async () =>
      stats.length === 0 ? null : new Date(Math.max(...stats.map((bucket) => bucket.bucketStart.getTime()))),
    findFirstCreatedAt: async (gte?: Date) => {
      const times = rows.filter((item) => !gte || item.createdAt >= gte).map((item) => item.createdAt.getTime());
      return times.length === 0 ? null : new Date(Math.min(...times));
    },
    aggregateHours: async (gte: Date, lt: Date) =>
      rows
        .filter((item) => item.createdAt >= gte && item.createdAt < lt)
        .map((item) => ({ ...item, bucketStart: floorHour(item.createdAt), count: 1 })),
    replaceStats: async (ranges: Array<{ gte: Date; lt: Date }>, buckets: StatBucket[]) => {
      stats = stats.filter((bucket) => !ranges.some((range) => bucket.bucketStart >= range.gte && bucket.bucketStart < range.lt));
      stats.push(...buckets.map((bucket) => ({ ...bucket })));
    },
  };
  const snapshot = () =>
    [...stats]
      .map((bucket) => `${bucket.bucketStart.toISOString()} ${bucket.actionGroup} ${bucket.actorKind} ${bucket.actorId} ${bucket.count}`)
      .sort();
  return { repository, snapshot, rows };
}

const logger = { info: () => {}, error: () => {} };

test("planRollupRanges: lần đầu từ giờ của dòng cũ nhất, tối đa 24 × 31 giờ, không tính giờ đang chạy", () => {
  const now = at("2026-10-18T10:20:00Z");
  assert.deepEqual(planRollupRanges(null, at("2026-10-18T07:45:00Z"), now), [
    { gte: at("2026-10-18T07:00:00Z"), lt: at("2026-10-18T10:00:00Z") },
  ]);
  const [longAgo] = planRollupRanges(null, at("2026-01-01T00:10:00Z"), now);
  assert.equal(longAgo!.lt.getTime() - longAgo!.gte.getTime(), ROLLUP_MAX_HOURS * HOUR_MS);
  assert.deepEqual(planRollupRanges(null, null, now), []);
});

test("planRollupRanges: lùi 2 giờ trước giờ mới nhất; liền nhau thì gộp, cách xa thì hai khoảng", () => {
  const now = at("2026-10-18T10:20:00Z");
  // Có dòng mới ngay sau giờ đã gộp ⇒ một khoảng liền.
  assert.deepEqual(planRollupRanges(at("2026-10-18T06:00:00Z"), at("2026-10-18T07:10:00Z"), now), [
    { gte: at("2026-10-18T04:00:00Z"), lt: at("2026-10-18T10:00:00Z") },
  ]);
  // Không có dòng mới ⇒ chỉ tính lại phần lùi.
  assert.deepEqual(planRollupRanges(at("2026-10-18T06:00:00Z"), null, now), [
    { gte: at("2026-10-18T04:00:00Z"), lt: at("2026-10-18T07:00:00Z") },
  ]);
  // Server tắt lâu, dòng tiếp theo cách xa ⇒ nhảy qua quãng trống.
  assert.deepEqual(planRollupRanges(at("2026-09-01T06:00:00Z"), at("2026-10-18T08:30:00Z"), now), [
    { gte: at("2026-09-01T04:00:00Z"), lt: at("2026-09-01T07:00:00Z") },
    { gte: at("2026-10-18T08:00:00Z"), lt: at("2026-10-18T10:00:00Z") },
  ]);
});

test("toStatBuckets: gộp theo giờ × nhóm × người làm; không người làm là SYSTEM", () => {
  const buckets = toStatBuckets([
    { ...row("2026-10-18T08:10:00Z", "JOB_POST_APPROVED"), bucketStart: at("2026-10-18T08:00:00Z"), count: 2 },
    { ...row("2026-10-18T08:50:00Z", "JOB_POST_REJECTED"), bucketStart: at("2026-10-18T08:00:00Z"), count: 1 },
    { ...row("2026-10-18T08:20:00Z", "AUTH_LOGIN_FAILED_REPEATED", null), bucketStart: at("2026-10-18T08:00:00Z"), count: 1 },
  ]);
  assert.deepEqual(
    buckets.map((bucket) => [bucket.actionGroup, bucket.actorKind, bucket.actorId, bucket.count]),
    [
      ["JOB_POST", "ADMIN", "admin-1", 3],
      ["SECURITY", "SYSTEM", null, 1],
    ],
  );
});

test("chạy lại cùng giờ ra cùng kết quả", async () => {
  const memory = memoryRollupRepository([
    row("2026-10-18T06:10:00Z", "JOB_POST_APPROVED"),
    row("2026-10-18T07:30:00Z", "JOB_POST_REJECTED"),
    row("2026-10-18T08:59:59Z", "USER_SUSPENDED"),
  ]);
  const deps = { auditLogRepository: memory.repository, logger } as never;
  const now = at("2026-10-18T10:05:00Z");
  await runAuditLogStatsRollup(deps, now);
  const first = memory.snapshot();
  await runAuditLogStatsRollup(deps, now);
  await runAuditLogStatsRollup(deps, now);
  assert.deepEqual(memory.snapshot(), first);
  assert.equal(first.length, 3);
});

test("server tắt hơn một tháng: các lần chạy sau bù đủ, bằng tính lại từ đầu; dòng ghi muộn trong 2 giờ được bắt", async () => {
  const rows: RawRow[] = [];
  for (let day = 0; day < 45; day += 3) {
    rows.push(row(new Date(Date.UTC(2026, 8, 1 + day, 2, 15)).toISOString(), "JOB_POST_APPROVED"));
  }
  const memory = memoryRollupRepository(rows);
  const deps = { auditLogRepository: memory.repository, logger } as never;

  await runAuditLogStatsRollup(deps, at("2026-09-02T00:00:00Z"));
  // Server tắt tới giữa tháng 10: lần đầu chỉ được 24 × 31 giờ, lần sau làm tiếp.
  const now = at("2026-10-18T10:05:00Z");
  await runAuditLogStatsRollup(deps, now);
  assert.ok(memory.snapshot().length < rows.length);
  await runAuditLogStatsRollup(deps, now);
  await runAuditLogStatsRollup(deps, now);
  assert.equal(memory.snapshot().length, rows.length);

  // Dòng ghi muộn vào giờ mới nhất đã gộp ⇒ lần chạy sau tính lại giờ đó.
  rows.push(row(rows[rows.length - 1]!.createdAt.toISOString(), "JOB_POST_REJECTED"));
  await runAuditLogStatsRollup(deps, now);

  const fresh = memoryRollupRepository(rows);
  for (let run = 0; run < 4; run += 1) {
    await runAuditLogStatsRollup({ auditLogRepository: fresh.repository, logger } as never, now);
  }
  assert.deepEqual(memory.snapshot(), fresh.snapshot());
});

// ─── GET /admin/activity/stats ─────────────────────────────────────────────

const NOW = at("2026-10-18T05:00:00Z"); // 12:00 giờ Việt Nam

function statsService(options: {
  latest: Date | null;
  rawRows: RawRow[];
  sums?: (keys: string[], sql: string) => Array<Record<string, unknown>>;
}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const auditLogRepository = {
    findLatestStatBucket: async () => options.latest,
    findStatRows: async (where: unknown) => {
      calls.push({ method: "findStatRows", args: [where] });
      return options.rawRows;
    },
    sumStats: async (where: { sql: string }, keys: string[], limit?: number) => {
      calls.push({ method: "sumStats", args: [where.sql, keys, limit] });
      return options.sums?.(keys, where.sql) ?? [];
    },
    count: async (where: unknown) => {
      const text = JSON.stringify(where);
      if (text.includes("AUTH_LOGIN_FAILED_REPEATED")) return 4;
      return text.includes("resubmit") ? 3 : 0;
    },
    countByAction: async () =>
      new Map([
        ["JOB_POST_SUBMITTED", 10],
        ["JOB_POST_AUTO_PUBLISHED", 2],
        ["JOB_POST_APPROVED", 6],
      ]),
  };
  const service = new AuditLogService({
    auditLogRepository,
    userRepository: {
      findEmailsByIds: async (ids: string[]) => new Map(ids.map((id) => [id, `${id}@example.com`])),
      findIdsByEmailContains: async () => [],
    },
    companySubscriptionRepository: {},
    rateLimiter: {},
    logger,
  } as unknown as ConstructorParameters<typeof AuditLogService>[0]);
  return { service, calls };
}

const RAW_TODAY = [
  row("2026-10-18T01:10:00Z", "AUTH_LOGIN_SUCCEEDED"),
  row("2026-10-18T01:40:00Z", "AUTH_LOGIN_FAILED_REPEATED", null),
  row("2026-10-18T02:05:00Z", "JOB_POST_APPROVED"),
  row("2026-10-18T02:06:00Z", "JOB_POST_SUBMITTED", "emp-1", "EMPLOYER"),
  row("2026-10-18T03:00:00Z", "USER_SUSPENDED"),
];

test("chọn nhóm Bảo mật: byGroup vẫn đủ 6 nhóm, byDay chỉ còn Bảo mật; mặc định 30 ngày", async () => {
  const { service, calls } = statsService({ latest: null, rawRows: RAW_TODAY });
  const stats = await service.getStats(activityStatsQuerySchema.parse({ group: "SECURITY" }), NOW);

  assert.equal(stats.from, "2026-09-19");
  assert.equal(stats.to, "2026-10-18");
  assert.equal(stats.byDay.length, 30);
  assert.deepEqual(stats.byDay[29], { date: "2026-10-18", counts: { SECURITY: 2 }, total: 2 });
  assert.deepEqual(
    stats.byGroup.map((item) => [item.group, item.count]),
    [
      ["JOB_POST", 2],
      ["COMPANY", 0],
      ["CATALOG", 0],
      ["PAYMENT", 0],
      ["ACCOUNT", 1],
      ["SECURITY", 2],
    ],
  );
  assert.deepEqual(
    stats.byRole.map((item) => [item.role, item.count]),
    [
      ["ADMIN", 1],
      ["EMPLOYER", 0],
      ["CANDIDATE", 0],
      ["SYSTEM", 1],
    ],
  );
  assert.equal(stats.securityAlerts, 4);
  // Bảng thống kê rỗng ⇒ không đọc bảng, đếm thẳng cả khoảng; lấy dư rồi lọc ở service.
  assert.equal(calls.filter((call) => call.method === "sumStats").length, 0);
  assert.doesNotMatch(JSON.stringify(calls[0]?.args[0]), /AUTH_LOGIN/);
});

test("heatmap bỏ qua ô đang chọn; byDay áp ô đó", async () => {
  const { service } = statsService({ latest: null, rawRows: RAW_TODAY });
  // 2026-10-18 là Chủ Nhật; 09:05 giờ Việt Nam.
  const stats = await service.getStats(activityStatsQuerySchema.parse({ dow: "7", hour: "9" }), NOW);
  assert.equal(stats.byDay[29]!.total, 2);
  assert.equal(stats.heatmap[6]![8], 2);
  assert.equal(stats.heatmap[6]![9], 2);
  assert.equal(stats.heatmap[6]![10], 1);
});

test("jobPostFlow tách gửi lần đầu và gửi lại", async () => {
  const { service } = statsService({ latest: null, rawRows: [] });
  const stats = await service.getStats(activityStatsQuerySchema.parse({}), NOW);
  assert.deepEqual(stats.jobPostFlow, {
    submittedFirst: 7,
    submittedResubmit: 3,
    autoPublished: 2,
    approved: 6,
    rejected: 0,
    retracted: 0,
  });
});

test("cộng phần đã gộp với phần đếm thẳng; top người làm gộp hai nguồn", async () => {
  const sums = (keys: string[]) => {
    const key = keys.join(",");
    if (key === "day,group") return [{ day: "2026-10-17", group: "JOB_POST", count: 40 }, { day: "2026-10-18", group: "JOB_POST", count: 5 }];
    if (key === "group") return [{ group: "JOB_POST", count: 45 }];
    if (key === "role") return [{ role: "ADMIN", count: 30 }, { role: "EMPLOYER", count: 15 }];
    if (key === "dow,hour") return [{ dow: 6, hour: 9, count: 45 }];
    if (key === "actorId,role") return [{ actorId: "emp-1", role: "EMPLOYER", count: 15 }, { actorId: "admin-2", role: "ADMIN", count: 14 }];
    return [];
  };
  const { service, calls } = statsService({ latest: at("2026-10-18T00:00:00Z"), rawRows: RAW_TODAY, sums });
  const stats = await service.getStats(activityStatsQuerySchema.parse({}), NOW);

  assert.equal(stats.byDay[28]!.total, 40);
  assert.deepEqual(stats.byDay[29], { date: "2026-10-18", counts: { JOB_POST: 7, ACCOUNT: 1, SECURITY: 2 }, total: 10 });
  assert.equal(stats.byGroup.find((item) => item.group === "JOB_POST")?.count, 47);
  assert.equal(stats.byRole.find((item) => item.role === "ADMIN")?.count, 33);
  assert.equal(stats.heatmap[5]![9], 45);
  assert.deepEqual(
    stats.topActors.map((actor) => [actor.actorId, actor.count, actor.email]),
    [
      ["emp-1", 16, "emp-1@example.com"],
      ["admin-2", 14, "admin-2@example.com"],
      ["admin-1", 3, "admin-1@example.com"],
    ],
  );
  // Phần đếm thẳng bắt đầu ngay sau giờ đã gộp (00:00 UTC + 1 giờ).
  assert.match(JSON.stringify(calls.find((call) => call.method === "findStatRows")?.args[0]), /2026-10-18T01:00:00.000Z/);
  // Top lấy TOP_ACTORS + số người có trong phần đếm thẳng (admin-1, emp-1).
  assert.equal(calls.find((call) => call.method === "sumStats" && (call.args[1] as string[]).join() === "actorId,role")?.args[2], 7);
});

test("có lọc action thì không đọc bảng thống kê, đếm thẳng cả khoảng", async () => {
  const { service, calls } = statsService({ latest: at("2026-10-18T00:00:00Z"), rawRows: [] });
  await service.getStats(activityStatsQuerySchema.parse({ action: "JOB_POST_SUBMITTED", resubmit: "true" }), NOW);
  assert.equal(calls.filter((call) => call.method === "sumStats").length, 0);
  assert.match(JSON.stringify(calls[0]?.args[0]), /2026-09-18T17:00:00.000Z/);
});
