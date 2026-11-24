// Chạy: node --import tsx --test tests/unit/matching/live-rescore-follow-ups.test.ts (từ apps/server)
// Bước 4 của chấm lại theo ứng viên (docs/06-backend/live-rescore/PLAN.md, AD-27 mục 6, Q3, Q5):
// - diffCandidateScores: cặp vào / ra khỏi ngưỡng, người lần đầu có điểm;
// - LiveRescoreFollowUps: tự mời, tự chuyển, job alert lần đầu, gom realtime;
// - MatchUpdatePublisher: tối đa một sự kiện mỗi công ty mỗi 15 giây, gộp phần dồn lại;
// - JobAlertService.onCandidatesFirstScored: một thông báo mỗi ứng viên;
// - ApplicationAutomationRepository: scope theo ứng viên.
// Repository, trigger và realtime là bản giả; không cần DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { Prisma } from "@prisma/client";
import type { Logger } from "../../../src/shared/logger";
import {
  diffCandidateScores,
  type CandidateScoreRow,
  type MatchTransition,
  type PreviousScoreRow,
  type TransitionJobRow,
} from "../../../src/modules/match-scores/match-score.repository";
import { LiveRescoreFollowUps, newFollowUpRun } from "../../../src/modules/live-rescore/live-rescore-follow-ups";
import { MatchUpdatePublisher } from "../../../src/modules/live-rescore/match-update-publisher";
import { JobAlertService } from "../../../src/modules/job-alerts/job-alert.service";
import type { FirstScoredJobAlert } from "../../../src/modules/job-alerts/job-alert.repository";
import { ApplicationAutomationRepository } from "../../../src/modules/application-automation/application-automation.repository";

function quietLogger() {
  const errors: string[] = [];
  const warns: string[] = [];
  const infos: string[] = [];
  const logger = {
    info: (message: string) => infos.push(message),
    warn: (message: string) => warns.push(message),
    error: (message: string) => errors.push(message),
  } as unknown as Logger;
  return { logger, errors, warns, infos };
}

// ─── diffCandidateScores ───────────────────────────────────────────────────

const JOBS = new Map<string, TransitionJobRow>([
  ["j1", { id: "j1", companyId: "co-1", minScore: 70, autoOutreachEnabled: true }],
  ["j2", { id: "j2", companyId: "co-1", minScore: 60, autoOutreachEnabled: false }],
  ["j3", { id: "j3", companyId: "co-2", minScore: 80, autoOutreachEnabled: true }],
]);

function row(jobPostId: string, score: number, semanticPending = false): CandidateScoreRow {
  return { jobPostId, score, semanticPending, weightsVersion: "v" };
}

function prev(candidateId: string, jobPostId: string, score: number, semanticPending = false): PreviousScoreRow {
  return { candidateId, jobPostId, score, semanticPending };
}

test("diff: vào ngưỡng (từ dưới hoặc chưa có dòng), rớt ngưỡng, giữ nguyên thì không có cặp", () => {
  const { transitions } = diffCandidateScores(
    [prev("a", "j1", 65), prev("a", "j2", 90), prev("a", "j3", 85)],
    new Map([["a", [row("j1", 75), row("j2", 50), row("j3", 81)]], ["b", [row("j1", 70), row("j3", 79)]]]),
    JOBS,
  );
  assert.deepEqual(
    transitions.map((t) => `${t.candidateId}|${t.jobPostId}|${t.matched}|${t.companyId}|${t.autoOutreachEnabled}`).sort(),
    ["a|j1|true|co-1|true", "a|j2|false|co-1|false", "b|j1|true|co-1|true"],
    "ngưỡng đúng bằng điểm là đạt; a|j3 vẫn đạt, b|j3 chưa đạt ⇒ không có cặp",
  );
});

test("diff: dòng cũ đạt ngưỡng mà không còn (hết chung kỹ năng) ⇒ rớt; tin thôi hiển thị bỏ qua", () => {
  const { transitions } = diffCandidateScores(
    [prev("a", "j1", 90), prev("a", "j2", 10), prev("a", "gone", 99)],
    new Map([["a", [row("gone", 99)]]]),
    JOBS,
  );
  assert.deepEqual(transitions, [
    { candidateId: "a", jobPostId: "j1", companyId: "co-1", autoOutreachEnabled: true, matched: false },
  ]);
});

test("diff: lần đầu có điểm đầy đủ — chưa có dòng / chỉ có dòng rule-only; nay chỉ rule-only hoặc không có dòng thì chưa tính", () => {
  const { newlyScored } = diffCandidateScores(
    [prev("pendingBefore", "j1", 50, true), prev("old", "j2", 40)],
    new Map([
      ["fresh", [row("j1", 50)]],
      ["pendingBefore", [row("j1", 55)]],
      ["old", [row("j2", 80)]],
      ["pendingNow", [row("j1", 90, true)]],
      ["noJobs", []],
      ["onlyGone", [row("gone", 90)]],
    ]),
    JOBS,
  );
  assert.deepEqual(newlyScored, ["fresh", "pendingBefore"]);
});

// ─── LiveRescoreFollowUps ──────────────────────────────────────────────────

function t(candidateId: string, jobPostId: string, matched: boolean, companyId = "co-1", autoOutreachEnabled = true): MatchTransition {
  return { candidateId, jobPostId, companyId, autoOutreachEnabled, matched };
}

function buildFollowUps(options: { failClear?: boolean; throwReview?: boolean; reopened?: string[] } = {}) {
  const calls = {
    clear: [] as Array<Array<{ candidateId: string; jobPostId: string }>>,
    outreach: [] as string[],
    review: [] as unknown[],
    firstScored: [] as string[][],
    published: [] as Array<Map<string, Set<string>>>,
  };
  const { logger, errors } = quietLogger();
  const followUps = new LiveRescoreFollowUps({
    autoOutreachRepository: {
      clearExhaustedForMatches: async (pairs: Array<{ candidateId: string; jobPostId: string }>) => {
        calls.clear.push(pairs);
        if (options.failClear) throw new Error("db down");
        return options.reopened ?? ["co-1"];
      },
    },
    autoOutreachTrigger: (companyId: string) => calls.outreach.push(companyId),
    autoReviewTrigger: (target: unknown) => {
      if (options.throwReview) throw new Error("not registered");
      calls.review.push(target);
    },
    candidateFirstScoredListener: (ids: string[]) => calls.firstScored.push(ids),
    matchUpdatePublisher: { publish: (updates: Map<string, Set<string>>) => calls.published.push(updates) },
    logger,
  } as unknown as ConstructorParameters<typeof LiveRescoreFollowUps>[0]);
  return { followUps, calls, errors };
}

test("việc kéo theo: tự mời chỉ cặp vừa đạt ở tin bật tự mời; tự chuyển theo người vừa đạt; job alert người lần đầu", async () => {
  const { followUps, calls } = buildFollowUps();
  const run = newFollowUpRun();
  await followUps.afterBatch(
    {
      transitions: [
        t("a", "j1", true),
        t("a", "j2", true, "co-1", false),
        t("b", "j1", false),
        t("c", "j3", true, "co-2"),
      ],
      newlyScored: ["c"],
    },
    run,
  );
  assert.deepEqual(calls.clear, [
    [
      { candidateId: "a", jobPostId: "j1" },
      { candidateId: "c", jobPostId: "j3" },
    ],
  ]);
  assert.deepEqual(calls.review, [{ candidateIds: ["a", "c"] }], "b vừa rớt ⇒ không tự chuyển");
  assert.deepEqual(calls.firstScored, [["c"]]);
  assert.deepEqual(calls.outreach, [], "tự mời gửi cuối lượt");
  assert.equal(run.reached, 3);
});

test("việc kéo theo: cuối lượt mỗi công ty tự mời một lần (gom qua các lô); realtime gồm cả tin vừa rớt", async () => {
  const { followUps, calls } = buildFollowUps({ reopened: ["co-1"] });
  const run = newFollowUpRun();
  await followUps.afterBatch({ transitions: [t("a", "j1", true)], newlyScored: [] }, run);
  await followUps.afterBatch({ transitions: [t("b", "j1", true), t("c", "j9", false, "co-3")], newlyScored: [] }, run);
  followUps.finishRun(run);
  assert.deepEqual(calls.outreach, ["co-1"]);
  assert.equal(calls.published.length, 1);
  assert.deepEqual(
    [...calls.published[0]!].map(([companyId, jobs]) => [companyId, [...jobs]]),
    [
      ["co-1", ["j1"]],
      ["co-3", ["j9"]],
    ],
  );
});

test("việc kéo theo: không có cặp nào ⇒ không gọi gì; lỗi DB / trigger chỉ ghi log, phần khác vẫn chạy", async () => {
  const empty = buildFollowUps();
  const run = newFollowUpRun();
  await empty.followUps.afterBatch({ transitions: [], newlyScored: [] }, run);
  empty.followUps.finishRun(run);
  assert.deepEqual(empty.calls, { clear: [], outreach: [], review: [], firstScored: [], published: [] });

  const broken = buildFollowUps({ failClear: true, throwReview: true });
  const run2 = newFollowUpRun();
  await broken.followUps.afterBatch({ transitions: [t("a", "j1", true)], newlyScored: ["a"] }, run2);
  broken.followUps.finishRun(run2);
  assert.equal(broken.errors.length, 2);
  assert.deepEqual(broken.calls.firstScored, [["a"]]);
  assert.deepEqual(broken.calls.outreach, [], "không mở lại được tin ⇒ không kích hoạt");
  assert.equal(broken.calls.published.length, 1);
});

// ─── MatchUpdatePublisher ──────────────────────────────────────────────────

function buildPublisher(options: { employers?: Record<string, string[]>; failLookup?: boolean; throttleMs?: number } = {}) {
  const clock = { now: 1_000_000 };
  const pushes: Array<{ userId: string; jobPostIds: string[] }> = [];
  const { logger, warns } = quietLogger();
  const employers = options.employers ?? { "co-1": ["u1", "u2"], "co-2": ["u3"] };
  const publisher = new MatchUpdatePublisher({
    realtimeNotifier: {
      pushMatchUpdate: (userId: string, payload: { jobPostIds: string[] }) => pushes.push({ userId, ...payload }),
    },
    employerRepository: {
      findManyByCompanyId: async (companyId: string) => {
        if (options.failLookup) throw new Error("db down");
        return (employers[companyId] ?? []).map((userId) => ({ id: `e-${userId}`, userId }));
      },
    },
    logger,
    matchUpdatePublisherOptions: { throttleMs: options.throttleMs ?? 30, now: () => clock.now },
  } as unknown as ConstructorParameters<typeof MatchUpdatePublisher>[0]);
  return { publisher, pushes, clock, warns };
}

const updates = (entries: Record<string, string[]>) =>
  new Map(Object.entries(entries).map(([companyId, jobs]) => [companyId, new Set(jobs)]));

test("realtime: lần đầu gửi ngay cho mọi employer của công ty", async (t) => {
  const { publisher, pushes } = buildPublisher();
  t.after(() => publisher.stop());
  publisher.publish(updates({ "co-1": ["j2", "j1"], "co-2": ["j3"] }));
  await sleep(0);
  // Hai công ty gửi xen nhau (bất đồng bộ) ⇒ so không theo thứ tự.
  assert.deepEqual([...pushes].sort((x, y) => x.userId.localeCompare(y.userId)), [
    { userId: "u1", jobPostIds: ["j1", "j2"] },
    { userId: "u2", jobPostIds: ["j1", "j2"] },
    { userId: "u3", jobPostIds: ["j3"] },
  ]);
});

test("realtime: trong khoảng chặn thì gộp và gửi một lần khi hết khoảng; công ty khác không bị chặn", async (t) => {
  const { publisher, pushes, clock } = buildPublisher({ employers: { "co-1": ["u1"], "co-2": ["u3"] }, throttleMs: 30 });
  t.after(() => publisher.stop());
  publisher.publish(updates({ "co-1": ["j1"] }));
  await sleep(0);
  clock.now += 10;
  publisher.publish(updates({ "co-1": ["j2"] }));
  publisher.publish(updates({ "co-1": ["j1", "j3"], "co-2": ["j9"] }));
  await sleep(0);
  assert.deepEqual(pushes, [
    { userId: "u1", jobPostIds: ["j1"] },
    { userId: "u3", jobPostIds: ["j9"] },
  ]);
  clock.now += 20;
  await sleep(60);
  assert.deepEqual(pushes.slice(2), [{ userId: "u1", jobPostIds: ["j1", "j2", "j3"] }]);
});

test("realtime: không tìm được employer ⇒ chỉ ghi warn", async (t) => {
  const { publisher, pushes, warns } = buildPublisher({ failLookup: true });
  t.after(() => publisher.stop());
  publisher.publish(updates({ "co-1": ["j1"] }));
  await sleep(0);
  assert.equal(pushes.length, 0);
  assert.equal(warns.length, 1);
});

// ─── JobAlertService.onCandidatesFirstScored (Q3) ─────────────────────────

const NOW = new Date("2026-11-14T03:00:00Z"); // 10:00 giờ VN ngày 14/11

function alert(candidateId: string, jobPostId: string, score: number): FirstScoredJobAlert {
  return { candidateId, userId: `user-${candidateId}`, jobPostId, score, jobPostTitle: `Tin ${jobPostId}`, companyName: "Mây Xanh" };
}

function buildJobAlerts(inserted: FirstScoredJobAlert[], options: { failFor?: string } = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const upserts: Array<{ userId: string; data: Record<string, unknown>; key: string }> = [];
  const { logger, errors } = quietLogger();
  const service = new JobAlertService({
    jobAlertRepository: {
      insertFirstForCandidates: async (...args: unknown[]) => {
        calls.push({ method: "insertFirstForCandidates", args });
        return inserted;
      },
      countSince: async (...args: unknown[]) => {
        calls.push({ method: "countSince", args });
        return new Map([
          ["a", 3],
          ["b", 1],
        ]);
      },
    },
    notificationsService: {
      upsertDaily: async (_type: string, userId: string, data: Record<string, unknown>, key: string) => {
        if (userId === options.failFor) throw new Error("push failed");
        upserts.push({ userId, data, key });
        return "CREATED";
      },
    },
    logger,
    config: { CORS_ORIGIN: "https://web.test" },
  } as unknown as ConstructorParameters<typeof JobAlertService>[0]);
  return { service, calls, upserts, errors };
}

test("job alert lần đầu: sàn 70, một thông báo mỗi ứng viên với tin điểm cao nhất, số tin trong ngày", async () => {
  const { service, calls, upserts } = buildJobAlerts([alert("a", "j7", 92), alert("a", "j2", 80), alert("a", "j5", 75), alert("b", "j1", 71)]);
  const result = await service.onCandidatesFirstScored(["a", "b", "c"], NOW);
  assert.deepEqual(calls[0]?.args, [["a", "b", "c"], 70, NOW]);
  assert.deepEqual(calls[1]?.args[0], ["a", "b"]);
  assert.deepEqual(
    upserts.map((u) => [u.userId, u.data.jobPostId, u.data.score, u.data.todayCount, u.key]),
    [
      ["user-a", "j7", 92, 3, "job-alert:a:2026-11-14"],
      ["user-b", "j1", 71, 1, "job-alert:b:2026-11-14"],
    ],
  );
  assert.deepEqual(result, { candidates: 2, jobs: 4, created: 2, updated: 0, failed: 0 });
});

test("job alert lần đầu: không ai được ghi ⇒ không đếm, không thông báo; lỗi một người thì đi tiếp", async () => {
  const empty = buildJobAlerts([]);
  assert.equal((await empty.service.onCandidatesFirstScored(["a"], NOW)).candidates, 0);
  assert.deepEqual(empty.calls.map((c) => c.method), ["insertFirstForCandidates"]);

  const partial = buildJobAlerts([alert("a", "j1", 90), alert("b", "j2", 80)], { failFor: "user-a" });
  const result = await partial.service.onCandidatesFirstScored(["a", "b"], NOW);
  assert.equal(result.failed, 1);
  assert.equal(result.created, 1);
  assert.equal(partial.errors.length, 1);
});

test("job alert lần đầu: triggerFirstScored chạy trong hàng đợi, danh sách rỗng thì không làm gì", async () => {
  const { service, calls } = buildJobAlerts([alert("a", "j1", 90)]);
  service.triggerFirstScored([]);
  service.triggerFirstScored(["a"]);
  await sleep(10);
  assert.equal(calls.filter((c) => c.method === "insertFirstForCandidates").length, 1);
});

// ─── Tự chuyển "Đang xem xét" theo ứng viên ───────────────────────────────

test("tự chuyển: scope candidateIds lọc theo ứng viên; danh sách rỗng ⇒ không chọn gì", async () => {
  const queries: Prisma.Sql[] = [];
  const repository = new ApplicationAutomationRepository({
    prisma: { $queryRaw: async (sql: Prisma.Sql) => (queries.push(sql), []) },
  } as unknown as ConstructorParameters<typeof ApplicationAutomationRepository>[0]);
  await repository.findAutoReviewTargets({ candidateIds: ["c1", "c2"] }, 100);
  await repository.findAutoReviewTargets({ candidateIds: [] }, 100);
  assert.match(queries[0]!.sql, /a\."candidateId" IN \(\?,\?\)/);
  assert.ok(queries[0]!.values.includes("c1") && queries[0]!.values.includes("c2"));
  assert.match(queries[1]!.sql, /AND false/);
});
