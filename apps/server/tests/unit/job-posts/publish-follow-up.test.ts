/**
 * AD-29 bước 8 — việc sau khi duyệt hàng loạt: chấm bảng điểm lần lượt (không chồng nhau),
 * tự mời một lần mỗi công ty và chỉ sau khi chấm xong tin của công ty đó, lỗi một tin không dừng lượt.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { RescoreJobResult } from "../../../src/modules/match-scores/match-score.service";
import {
  PublishFollowUpService,
  type PublishFollowUpItem,
  type PublishFollowUpRunSummary,
} from "../../../src/modules/job-posts/publish-follow-up.service";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DONE: RescoreJobResult = { status: "DONE", pool: 3, rows: 3, pendingRows: 0, pendingBefore: [], durationMs: 1 };

function item(jobPostId: string, companyId: string, autoOutreachEnabled = false): PublishFollowUpItem {
  return { jobPostId, companyId, autoOutreachEnabled };
}

function build(options: { fail?: string[]; result?: Record<string, RescoreJobResult>; delayMs?: number } = {}) {
  const events: string[] = [];
  const errors: string[] = [];
  const runs: PublishFollowUpRunSummary[] = [];
  let running = 0;
  let peak = 0;
  /** jobPostId → số thứ tự cache được truyền vào. */
  const cacheOf = new Map<string, number>();
  let caches = 0;
  const service = new PublishFollowUpService({
    createProfileCache: () => ({ n: ++caches }) as never,
    rescoreJob: async (jobPostId, cache) => {
      cacheOf.set(jobPostId, (cache as unknown as { n: number }).n);
      running++;
      peak = Math.max(peak, running);
      events.push(`score:${jobPostId}`);
      try {
        await sleep(options.delayMs ?? 1);
        if (options.fail?.includes(jobPostId)) throw new Error("db down");
        return options.result?.[jobPostId] ?? DONE;
      } finally {
        running--;
      }
    },
    jobScoredListener: (jobPostId) => events.push(`alert:${jobPostId}`),
    autoOutreachTrigger: (companyId) => events.push(`outreach:${companyId}`),
    logger: { info: () => {}, warn: () => {}, error: (message: string) => errors.push(message) } as never,
    onRunDone: (summary) => runs.push(summary),
  });
  return { service, events, errors, runs, cacheOf, peak: () => peak };
}

test("nhóm theo công ty: chấm lần lượt từng tin, rồi tự mời một lần cho công ty có tin bật tự mời", async () => {
  const { service, events, runs, peak } = build();
  service.enqueue([
    item("j1", "co-a", true),
    item("j2", "co-b"),
    item("j3", "co-a"),
    item("j4", "co-b"),
    item("j1", "co-a"), // trùng ⇒ chấm một lần
  ]);
  await service.whenIdle();

  assert.equal(peak(), 1);
  assert.deepEqual(events, [
    "score:j1",
    "alert:j1",
    "score:j3",
    "alert:j3",
    "outreach:co-a", // sau khi chấm xong mọi tin của co-a
    "score:j2",
    "alert:j2",
    "score:j4",
    "alert:j4",
    // co-b không có tin bật tự mời ⇒ không gọi (như duyệt một tin)
  ]);
  assert.equal(runs.length, 1);
  assert.deepEqual({ ...runs[0], durationMs: 0 }, {
    jobs: 4,
    companies: 2,
    scored: 4,
    skipped: 0,
    failed: 0,
    outreachCompanies: 1,
    durationMs: 0,
  });
});

test("một tin lỗi chỉ ghi log, các tin sau và tự mời vẫn chạy; SKIPPED / GONE không báo job alert", async () => {
  const { service, events, errors, runs } = build({
    fail: ["j1"],
    result: { j2: { status: "SKIPPED", reason: "NOT_VISIBLE" } },
  });
  service.enqueue([item("j1", "co-a", true), item("j2", "co-a"), item("j3", "co-a")]);
  await service.whenIdle();

  assert.deepEqual(events, ["score:j1", "score:j2", "score:j3", "alert:j3", "outreach:co-a"]);
  assert.equal(errors.length, 1);
  assert.equal(runs[0]!.failed, 1);
  assert.equal(runs[0]!.skipped, 1);
  assert.equal(runs[0]!.scored, 1);
});

test("lô tới khi đang chạy ⇒ vào lượt kế tiếp, không chạy chồng; mỗi lượt một cache hồ sơ dùng chung", async () => {
  const { service, events, runs, cacheOf, peak } = build({ delayMs: 5 });
  service.enqueue([item("j1", "co-a"), item("j2", "co-a")]);
  await sleep(2); // lượt đầu đang chấm j1
  service.enqueue([item("j3", "co-b", true)]);
  service.enqueue([item("j4", "co-b")]);
  await service.whenIdle();

  assert.equal(peak(), 1);
  assert.deepEqual(
    events.filter((event) => !event.startsWith("alert")),
    ["score:j1", "score:j2", "score:j3", "score:j4", "outreach:co-b"],
  );
  // j3, j4 gộp vào một lượt (tự mời co-b một lần).
  assert.deepEqual(
    runs.map((run) => run.jobs),
    [2, 2],
  );
  // Cùng lượt ⇒ cùng cache (kể cả khác công ty); lượt sau ⇒ cache mới.
  assert.deepEqual(Object.fromEntries(cacheOf), { j1: 1, j2: 1, j3: 2, j4: 2 });
});

test("trigger ném lỗi ngay lúc gọi không làm hỏng lượt", async () => {
  const events: string[] = [];
  const service = new PublishFollowUpService({
    createProfileCache: () => ({}) as never,
    rescoreJob: async (jobPostId) => {
      events.push(`score:${jobPostId}`);
      return DONE;
    },
    jobScoredListener: () => {
      throw new Error("listener boom");
    },
    autoOutreachTrigger: () => {
      throw new Error("outreach boom");
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} } as never,
  });
  service.enqueue([item("j1", "co-a", true), item("j2", "co-b", true)]);
  await service.whenIdle();
  assert.deepEqual(events, ["score:j1", "score:j2"]);

  // Hàng đợi rỗng ⇒ enqueue([]) không làm gì; lần sau vẫn chạy được.
  service.enqueue([]);
  service.enqueue([item("j3", "co-a")]);
  await service.whenIdle();
  assert.deepEqual(events, ["score:j1", "score:j2", "score:j3"]);
});
