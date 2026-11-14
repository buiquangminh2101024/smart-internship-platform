// Chạy: node --import tsx --test tests/unit/automation-status.test.ts (từ apps/server)
// 0.6 bước 8 (D12): GET /admin/automation-status — ghép số từ DB và tóm tắt lượt ở Redis.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AutomationStatusService } from "../../src/modules/live-rescore/automation-status.service";

const OLDEST = new Date("2026-11-14T08:00:00.000Z");
const TODAY = { autoInvitations: 5, jobAlerts: 12, autoReviewed: 3 };

function build(redis: { live?: unknown; nightly?: unknown; fail?: boolean }, pending = 7) {
  const warnings: string[] = [];
  const read = (value: unknown) => async () => {
    if (redis.fail) throw new Error("redis down");
    return value ?? null;
  };
  const service = new AutomationStatusService({
    liveRescoreRepository: {
      markedSummary: async () => ({ pending, oldestRequestedAt: pending > 0 ? OLDEST : null }),
      countAutomationToday: async () => TODAY,
    },
    liveRescoreRunStore: { getLastRun: read(redis.live) },
    matchScoreRunStore: { getNightly: read(redis.nightly) },
    logger: { warn: (message: string) => warnings.push(message) },
  } as unknown as ConstructorParameters<typeof AutomationStatusService>[0]);
  return { service, warnings };
}

test("ghép dấu, lượt gần nhất, lượt đêm và số hôm nay", async () => {
  const { service } = build({
    live: {
      finishedAt: "2026-11-14T08:15:03.000Z",
      durationMs: 4200,
      trigger: "cron",
      batches: 1,
      candidates: 37,
      rows: 900,
      marksCleared: 37,
      kept: 0,
      embedded: 2,
      timedOut: false,
      remaining: 7,
    },
    nightly: {
      finishedAt: "2026-11-13T20:41:00.000Z",
      durationMs: 600000,
      jobsTotal: 314,
      jobsScored: 310,
      jobsFailed: 0,
      jobsDeferred: 4,
    },
  });
  assert.deepEqual(await service.getStatus(), {
    rescore: {
      pending: 7,
      oldestRequestedAt: "2026-11-14T08:00:00.000Z",
      lastRun: { at: "2026-11-14T08:15:03.000Z", candidates: 37, durationMs: 4200, remaining: 7, timedOut: false },
    },
    today: TODAY,
    nightly: { lastRunAt: "2026-11-13T20:41:00.000Z", jobsScored: 310, jobsDeferred: 4 },
  });
});

test("chưa có lượt nào và không ai chờ ⇒ null, số DB vẫn trả", async () => {
  const status = await build({}, 0).service.getStatus();
  assert.deepEqual(status.rescore, { pending: 0, oldestRequestedAt: null, lastRun: null });
  assert.equal(status.nightly, null);
  assert.deepEqual(status.today, TODAY);
});

test("Redis lỗi ⇒ lượt gần nhất null kèm cảnh báo, phần đọc DB vẫn trả (không 500)", async () => {
  const { service, warnings } = build({ fail: true });
  const status = await service.getStatus();
  assert.equal(status.rescore.lastRun, null);
  assert.equal(status.nightly, null);
  assert.equal(status.rescore.pending, 7);
  assert.equal(warnings.length, 2);
});
