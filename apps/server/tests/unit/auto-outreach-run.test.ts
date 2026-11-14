// Chạy: node --import tsx --test tests/unit/auto-outreach-run.test.ts (từ apps/server)
// Bước 5 của tự động mời theo tin (docs/06-backend/auto-outreach/PLAN.md, AD-23 mục 3):
// hàm thuần (chia lượt xoay vòng, số lượt còn lại R, chờ kiểm lại, thứ tự công ty),
// AutoOutreachService.runForCompany và lượt cron với repository giả, các lối kích hoạt.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MatchResult } from "@sip/shared-types";
import { runAutoOutreachCycle } from "../../src/modules/candidate-outreach/auto-outreach.job";
import {
  allocateRoundRobin,
  autoRunRemaining,
  isAwaitingRecheck,
  orderCompaniesByLastRun,
  type AllocationJob,
} from "../../src/modules/candidate-outreach/auto-outreach.policy";
import type { RunnableJobRow } from "../../src/modules/candidate-outreach/auto-outreach.repository";
import { AutoOutreachService, type AutoOutreachRunResult } from "../../src/modules/candidate-outreach/auto-outreach.service";
import {
  CandidateOutreachService,
  type CreateInvitationInput,
  type InvitationSkipReason,
  type OutreachQuotaPolicy,
} from "../../src/modules/candidate-outreach/candidate-outreach.service";
import { JobPostsService } from "../../src/modules/job-posts/job-posts.service";

const HOUR_MS = 60 * 60 * 1000;

// ─── allocateRoundRobin ────────────────────────────────────────────────────

function job(jobPostId: string, deficit: number, patch: Partial<AllocationJob> = {}): AllocationJob {
  return { jobPostId, deficit, target: 12, expiresAt: null, available: 50, ...patch };
}

function countBy(slots: string[]): Record<string, number> {
  return slots.reduce<Record<string, number>>((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {});
}

test("allocateRoundRobin: ví dụ AD-23 — R = 12, thiếu 10/3/1 ⇒ 8/3/1", () => {
  const slots = allocateRoundRobin([job("A", 10), job("B", 3), job("C", 1)], 12);
  assert.deepEqual(countBy(slots), { A: 8, B: 3, C: 1 });
  // Vòng đầu mỗi tin một lượt, theo tỉ lệ thiếu giảm dần.
  assert.deepEqual(slots.slice(0, 3), ["A", "B", "C"]);
});

test("allocateRoundRobin: đủ lượt ⇒ mỗi tin nhận đúng phần thiếu; R = 0 ⇒ rỗng", () => {
  assert.deepEqual(countBy(allocateRoundRobin([job("A", 4), job("B", 2)], 100)), { A: 4, B: 2 });
  assert.deepEqual(allocateRoundRobin([job("A", 4)], 0), []);
  assert.deepEqual(allocateRoundRobin([], 5), []);
});

test("allocateRoundRobin: tin hết ứng viên giữa chừng ⇒ lượt dư sang tin khác", () => {
  const slots = allocateRoundRobin([job("A", 10, { available: 2 }), job("B", 10)], 8);
  assert.deepEqual(countBy(slots), { A: 2, B: 6 });
});

test("allocateRoundRobin: cùng tỉ lệ thiếu ⇒ tin hết hạn sớm trước, không có hạn xếp cuối, rồi theo id", () => {
  const soon = new Date("2026-11-20T00:00:00.000Z");
  const later = new Date("2026-12-20T00:00:00.000Z");
  const slots = allocateRoundRobin(
    [job("D", 1), job("C", 1, { expiresAt: later }), job("B", 1, { expiresAt: soon }), job("A", 1)],
    4,
  );
  assert.deepEqual(slots, ["B", "C", "A", "D"]);
  // Tỉ lệ thiếu lớn hơn đứng trước dù hết hạn muộn hơn.
  assert.deepEqual(allocateRoundRobin([job("X", 1, { expiresAt: soon }), job("Y", 6, { expiresAt: later })], 1), ["Y"]);
});

// ─── Quy tắc khác ──────────────────────────────────────────────────────────

test("autoRunRemaining: tỉ lệ 0% / 80% / 100%, mời tay dùng chung tổng hạn mức", () => {
  const fresh = { total: 0, auto: 0 };
  assert.equal(autoRunRemaining(14, 0, fresh), 0);
  assert.equal(autoRunRemaining(14, 11, fresh), 11);
  assert.equal(autoRunRemaining(14, 14, fresh), 14);
  assert.equal(autoRunRemaining(14, 11, { total: 6, auto: 4 }), 7);
  // Mời tay đã dùng gần hết tổng ⇒ R bị chặn bởi tổng, không phải phần tự động.
  assert.equal(autoRunRemaining(14, 11, { total: 12, auto: 2 }), 2);
  assert.equal(autoRunRemaining(14, 11, { total: 14, auto: 11 }), 0);
  assert.equal(autoRunRemaining(14, 11, { total: 15, auto: 12 }), 0, "vượt 1 lượt khi gửi đồng thời ⇒ không âm");
});

test("isAwaitingRecheck: NO_MATCH chờ 3 giờ, CANDIDATE_CAP chờ tới 0h UTC kế tiếp", () => {
  const now = new Date("2026-11-10T05:00:00.000Z");
  const at = (iso: string, reason: "NO_MATCH" | "CANDIDATE_CAP") => isAwaitingRecheck({ exhaustedAt: new Date(iso), exhaustedReason: reason }, now);
  assert.equal(isAwaitingRecheck({ exhaustedAt: null, exhaustedReason: null }, now), false);
  assert.equal(at("2026-11-10T03:00:00.000Z", "NO_MATCH"), true);
  assert.equal(at("2026-11-10T01:59:00.000Z", "NO_MATCH"), false);
  assert.equal(at("2026-11-10T01:00:00.000Z", "CANDIDATE_CAP"), true);
  assert.equal(at("2026-11-09T23:00:00.000Z", "CANDIDATE_CAP"), false);
});

test("orderCompaniesByLastRun: chưa chạy bao giờ đứng đầu, rồi lần chạy cũ nhất", () => {
  const lastRuns = new Map([
    ["co-b", 3_000],
    ["co-c", 1_000],
    ["co-d", 2_000],
  ]);
  assert.deepEqual(orderCompaniesByLastRun(["co-b", "co-c", "co-a", "co-d", "co-e"], lastRuns), [
    "co-a",
    "co-e",
    "co-c",
    "co-d",
    "co-b",
  ]);
});

// ─── runForCompany ─────────────────────────────────────────────────────────

const SUBSCRIBED: OutreachQuotaPolicy = { mode: "SUBSCRIBED", dailyQuota: 14, autoAllowed: true, poolMultiplier: 5 };
const TRIAL: OutreachQuotaPolicy = { mode: "TRIAL", dailyQuota: 6, autoAllowed: false };

function row(id: string, patch: Partial<RunnableJobRow> = {}): RunnableJobRow {
  return {
    id,
    title: `Tin ${id}`,
    employerId: `emp-${id}`,
    employerUserId: `user-${id}`,
    posterSuspended: false,
    expiresAt: null,
    hiringTarget: 1,
    minScore: 80,
    exhaustedAt: null,
    exhaustedReason: null,
    active: 0,
    hired: 0,
    matchScoresAt: null,
    ...patch,
  };
}

interface RunOptions {
  lock?: boolean;
  policy?: OutreachQuotaPolicy | null;
  usage?: { total: number; auto: number };
  share?: number;
  jobs?: RunnableJobRow[];
  /** Pool theo tin, theo thứ tự của câu lọc thô. */
  pools?: Record<string, string[]>;
  /** Điểm theo ứng viên; null = chưa chấm được. */
  scores?: Record<string, number | null>;
  scoreErrors?: string[];
  /** Ứng viên bị createInvitation bỏ qua với lý do này. */
  refuse?: Record<string, InvitationSkipReason>;
  /** Sau N lời mời đã tạo thì mọi lần sau trả QUOTA. */
  quotaAfter?: number;
  cappedMatch?: boolean;
  /** 0.6 bước 6: hàng chờ từ bảng điểm theo tin (đã lọc người không mời được), điểm giảm dần. */
  scoredQueues?: Record<string, Array<{ candidateId: string; score: number }>>;
}

function buildRunService(options: RunOptions = {}) {
  const calls = {
    pool: [] as Array<{ jobPostId: string; limit: number; excludeCappedToday: boolean | undefined }>,
    scored: [] as Array<{ jobPostId: string; maxNewEmbeddings: number }>,
    invites: [] as CreateInvitationInput[],
    marked: [] as Array<[string, string]>,
    cleared: [] as string[],
    notified: [] as Array<{ userId: string; data: unknown; key: string }>,
    lastRun: [] as string[],
    unlocked: [] as string[],
    scoredQueue: [] as Array<{ jobPostId: string; minScore: number; limit: number }>,
  };
  let created = 0;
  const service = new AutoOutreachService({
    autoOutreachRunStore: {
      tryLock: async () => options.lock ?? true,
      unlock: async (companyId: string) => {
        calls.unlocked.push(companyId);
      },
      setLastRun: async (companyId: string) => {
        calls.lastRun.push(companyId);
      },
    },
    candidateOutreachRepository: {
      findOutreachCompany: async (id: string) => ({ id, name: "Công ty A", verifiedAt: new Date() }),
      findAutoSharePercent: async () => options.share ?? 80,
      searchCandidatePool: async (jobPostId: string, limit: number, opts: { excludeCappedToday?: boolean }) => {
        calls.pool.push({ jobPostId, limit, excludeCappedToday: opts.excludeCappedToday });
        return options.pools?.[jobPostId] ?? [];
      },
    },
    candidateOutreachService: {
      lookupDailyQuota: async () => (options.policy === undefined ? SUBSCRIBED : options.policy),
      scorePool: async (jobPostId: string, ids: string[], maxNewEmbeddings: number) => {
        calls.scored.push({ jobPostId, maxNewEmbeddings });
        if (options.scoreErrors?.includes(jobPostId)) throw new Error("embedding down");
        return new Map(
          ids.map((id) => [id, { score: options.scores?.[id] ?? null, weightsVersion: "hybrid-v1" } as unknown as MatchResult]),
        );
      },
      createInvitation: async (input: CreateInvitationInput) => {
        calls.invites.push(input);
        if (options.quotaAfter !== undefined && created >= options.quotaAfter) return { created: false, reason: "QUOTA" };
        const reason = options.refuse?.[input.candidateId];
        if (reason) return { created: false, reason };
        created += 1;
        return { created: true, invitation: { id: `inv-${input.candidateId}` } };
      },
    },
    candidateOutreachRateLimitService: { getUsage: async () => options.usage ?? { total: 0, auto: 0 } },
    autoOutreachRepository: {
      findRunnableJobs: async () => options.jobs ?? [],
      markExhausted: async (jobPostId: string, reason: string) => {
        calls.marked.push([jobPostId, reason]);
      },
      clearExhausted: async (jobPostId: string) => {
        calls.cleared.push(jobPostId);
      },
      hasCappedSkillMatch: async () => options.cappedMatch ?? false,
      // Như câu thật: lọc theo ngưỡng của tin, cắt theo giới hạn.
      findScoredQueue: async (jobPostId: string, minScore: number, limit: number) => {
        calls.scoredQueue.push({ jobPostId, minScore, limit });
        return (options.scoredQueues?.[jobPostId] ?? [])
          .filter((entry) => entry.score >= minScore)
          .slice(0, limit)
          .map((entry) => ({ ...entry, weightsVersion: "hybrid-v2" }));
      },
    },
    notificationsService: {
      notifyOnce: async (_type: string, userId: string, data: unknown, key: string) => {
        calls.notified.push({ userId, data, key });
        return true;
      },
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as ConstructorParameters<typeof AutoOutreachService>[0]);
  return { service, calls };
}

const FUTURE = () => Date.now() + 60_000;

function done(result: AutoOutreachRunResult) {
  assert.equal(result.status, "DONE");
  return result as Extract<AutoOutreachRunResult, { status: "DONE" }>;
}

test("runForCompany: đang có lượt khác ⇒ LOCKED, không đọc gì", async () => {
  const { service, calls } = buildRunService({ lock: false, jobs: [row("A")] });
  assert.deepEqual(await service.runForCompany("co-1", FUTURE()), { status: "LOCKED" });
  assert.deepEqual(calls.lastRun, []);
  assert.deepEqual(calls.unlocked, []);
});

test("runForCompany: Dùng thử / không có gói / hết lượt tự động ⇒ dừng sớm, vẫn ghi last-run và nhả khoá", async () => {
  for (const [options, reason] of [
    [{ policy: TRIAL }, "PLAN_NOT_ALLOWED"],
    [{ policy: null }, "PLAN_NOT_ALLOWED"],
    [{ usage: { total: 11, auto: 11 } }, "NO_ROOM"],
    [{ share: 0 }, "NO_ROOM"],
    [{ jobs: [] }, "NO_JOB"],
  ] as const) {
    const { service, calls } = buildRunService({ jobs: [row("A")], pools: { A: ["a1"] }, scores: { a1: 90 }, ...options });
    assert.deepEqual(await service.runForCompany("co-1", FUTURE()), { status: "SKIPPED", reason });
    assert.deepEqual(calls.invites, []);
    assert.deepEqual(calls.lastRun, ["co-1"]);
    assert.deepEqual(calls.unlocked, ["co-1"]);
  }
});

test("runForCompany: lọc rẻ, chấm, chia lượt, bỏ qua người không mời được, báo mỗi tin một lần", async () => {
  const now = Date.now();
  const { service, calls } = buildRunService({
    jobs: [
      row("A", { active: 2 }), // target 5 ⇒ thiếu 3
      row("B", { active: 4 }), // thiếu 1
      row("C", { hired: 1 }), // đã tuyển đủ
      row("D", { posterSuspended: true }),
      row("E", { exhaustedAt: new Date(now - HOUR_MS), exhaustedReason: "NO_MATCH" }), // chưa tới lúc kiểm lại
      row("F", { active: 5 }), // đủ lời mời
    ],
    pools: { A: ["a1", "a2", "a3", "a4", "a5"], B: ["b1", "b2"] },
    scores: { a1: 90, a2: 70, a3: 85, a4: 95, a5: null, b1: 82, b2: 88 },
    refuse: { b2: "CANDIDATE_CAP" },
  });
  const result = done(await service.runForCompany("co-1", FUTURE()));

  assert.deepEqual(
    calls.pool.map((call) => call.jobPostId),
    ["A", "B"],
  );
  assert.ok(calls.pool.every((call) => call.limit === 50 && call.excludeCappedToday === true));
  assert.ok(calls.scored.every((call) => call.maxNewEmbeddings === 50));
  // A thiếu nhiều hơn ⇒ đi trước; b2 bị bỏ qua ⇒ b1 thế chỗ, không tốn lượt.
  assert.deepEqual(
    calls.invites.map((input) => input.candidateId),
    ["a4", "b2", "b1", "a1", "a3"],
  );
  const first = calls.invites[0]!;
  assert.equal(first.source, "AUTO");
  assert.deepEqual(first.sender, { employerId: "emp-A", companyId: "co-1", companyName: "Công ty A" });
  assert.deepEqual(first.limit, { daily: 14, auto: 11 });
  assert.equal((first.match as MatchResult).score, 95, "dùng điểm đã chấm, không chấm lại");

  assert.equal(result.sent, 4);
  assert.deepEqual(result.skipped, { CANDIDATE_CAP: 1 });
  assert.equal(result.jobsScanned, 2);
  assert.equal(result.jobsAwaitingRecheck, 1);
  assert.equal(result.stoppedByQuota, false);
  const day = new Date().toISOString().slice(0, 10);
  assert.deepEqual(calls.notified, [
    { userId: "user-A", data: { jobPostId: "A", jobPostTitle: "Tin A", sentCount: 3 }, key: `auto-outreach:A:${day}` },
    { userId: "user-B", data: { jobPostId: "B", jobPostTitle: "Tin B", sentCount: 1 }, key: `auto-outreach:B:${day}` },
  ]);
  assert.deepEqual(calls.unlocked, ["co-1"]);
});

test("runForCompany: hết ứng viên ⇒ đặt dấu theo lý do; tìm lại được người ⇒ xoá dấu; chấm lỗi ⇒ bỏ qua tin", async () => {
  const old = new Date(Date.now() - 4 * HOUR_MS);
  const capped = buildRunService({
    jobs: [
      row("X"), // pool rỗng
      row("Y"), // có pool nhưng không ai đạt ngưỡng
      row("Z", { exhaustedAt: old, exhaustedReason: "NO_MATCH" }), // đã qua 3 giờ, nay có người
      row("W"), // chấm lỗi
    ],
    pools: { Y: ["y1"], Z: ["z1"], W: ["w1"] },
    scores: { y1: 60, z1: 85, w1: 99 },
    scoreErrors: ["W"],
    cappedMatch: true,
  });
  const result = done(await capped.service.runForCompany("co-1", FUTURE()));
  assert.deepEqual(capped.calls.marked, [
    ["X", "CANDIDATE_CAP"],
    ["Y", "CANDIDATE_CAP"],
  ]);
  assert.deepEqual(capped.calls.cleared, ["Z"]);
  assert.deepEqual(
    capped.calls.invites.map((input) => input.candidateId),
    ["z1"],
  );
  assert.equal(result.jobsExhausted, 2);

  const noMatch = buildRunService({ jobs: [row("X")], cappedMatch: false });
  await noMatch.service.runForCompany("co-1", FUTURE());
  assert.deepEqual(noMatch.calls.marked, [["X", "NO_MATCH"]]);
});

test("runForCompany: R chặn số lời mời; gặp QUOTA thì dừng cả lượt", async () => {
  const limited = buildRunService({
    usage: { total: 3, auto: 9 }, // R = min(11 − 9, 14 − 3) = 2
    jobs: [row("A")],
    pools: { A: ["a1", "a2", "a3"] },
    scores: { a1: 90, a2: 90, a3: 90 },
  });
  assert.equal(done(await limited.service.runForCompany("co-1", FUTURE())).sent, 2);
  assert.equal(limited.calls.invites.length, 2);

  const quota = buildRunService({
    jobs: [row("A"), row("B")],
    pools: { A: ["a1", "a2"], B: ["b1"] },
    scores: { a1: 90, a2: 90, b1: 90 },
    quotaAfter: 1,
  });
  const result = done(await quota.service.runForCompany("co-1", FUTURE()));
  assert.equal(result.sent, 1);
  assert.equal(result.stoppedByQuota, true);
  assert.deepEqual(result.skipped, { QUOTA: 1 });
  assert.equal(quota.calls.invites.length, 2, "không thử thêm sau QUOTA");
});

test("runForCompany: hàng chờ một tin cạn vì bị bỏ qua ⇒ lượt dư chia lại cho tin khác", async () => {
  const { service, calls } = buildRunService({
    usage: { total: 0, auto: 7 }, // R = 4
    jobs: [row("A", { active: 2 }), row("B", { active: 2 })], // mỗi tin thiếu 3
    pools: { A: ["a1", "a2"], B: ["b1", "b2", "b3", "b4"] },
    scores: { a1: 90, a2: 90, b1: 90, b2: 90, b3: 90, b4: 90 },
    refuse: { a1: "BLOCKED", a2: "APPLIED" },
  });
  const result = done(await service.runForCompany("co-1", FUTURE()));
  assert.equal(result.sent, 3, "B nhận đủ phần thiếu 3 dù vòng chia đầu chỉ cấp 2 lượt");
  assert.deepEqual(
    calls.invites.map((input) => input.candidateId),
    ["a1", "a2", "b1", "b2", "b3"],
  );
});

test("runForCompany: quá mốc dừng ⇒ không tìm/chấm, các tin để lượt sau", async () => {
  const { service, calls } = buildRunService({ jobs: [row("A"), row("B")], pools: { A: ["a1"] }, scores: { a1: 90 } });
  const result = done(await service.runForCompany("co-1", Date.now() - 1));
  assert.equal(result.jobsDeferred, 2);
  assert.equal(result.jobsScanned, 0);
  assert.deepEqual(calls.pool, []);
  assert.deepEqual(calls.notified, []);
});

// ─── Lượt cron ─────────────────────────────────────────────────────────────

test("runAutoOutreachCycle: công ty chạy lâu nhất trước; lỗi một công ty không chặn công ty sau", async () => {
  const order: string[] = [];
  const result = await runAutoOutreachCycle({
    autoOutreachRepository: { findCompaniesWithAutoJobs: async () => ["co-new", "co-recent", "co-old"] },
    autoOutreachRunStore: {
      getLastRuns: async () =>
        new Map([
          ["co-recent", 2_000],
          ["co-old", 1_000],
        ]),
    },
    autoOutreachService: {
      runForCompany: async (companyId: string) => {
        order.push(companyId);
        if (companyId === "co-old") throw new Error("boom");
        return { status: "DONE", sent: 2 };
      },
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  } as never);
  assert.deepEqual(order, ["co-new", "co-old", "co-recent"]);
  assert.deepEqual(result, { companies: 3, processed: 3, deferred: 0, sent: 4 });
});

test("runAutoOutreachCycle: hết thời gian ⇒ công ty còn lại để lượt sau", async () => {
  const order: string[] = [];
  const result = await runAutoOutreachCycle(
    {
      autoOutreachRepository: { findCompaniesWithAutoJobs: async () => ["co-1", "co-2"] },
      autoOutreachRunStore: { getLastRuns: async () => new Map() },
      autoOutreachService: {
        runForCompany: async (companyId: string) => {
          order.push(companyId);
          return { status: "LOCKED" };
        },
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    } as never,
    -1,
  );
  assert.deepEqual(order, []);
  assert.deepEqual(result, { companies: 2, processed: 0, deferred: 2, sent: 0 });
});

// ─── Lối kích hoạt ─────────────────────────────────────────────────────────

test("ứng viên từ chối lời mời ⇒ kích hoạt lượt tự mời của công ty; nhận lời thì không", async () => {
  for (const [action, expected] of [
    ["DECLINE", ["co-1"]],
    ["ACCEPT", []],
  ] as const) {
    const triggered: string[] = [];
    const service = new CandidateOutreachService({
      prisma: { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
      candidateOutreachRepository: {
        findCandidateIdByUserId: async () => "cand-1",
        findById: async () => ({
          id: "inv-1",
          candidateId: "cand-1",
          companyId: "co-1",
          jobPostId: "job-1",
          jobPost: { id: "job-1", title: "Tin", status: "PUBLISHED" },
          employer: { id: "emp-1", userId: "user-emp-1" },
          candidate: { id: "cand-1", userId: "user-cand-1", fullName: "Ứng viên" },
        }),
        respondIfPending: async () => true,
      },
      notificationsService: { notify: async () => {} },
      messagingService: { createConversation: async () => ({ id: "conv-1" }) },
      autoOutreachTrigger: (companyId: string) => triggered.push(companyId),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      config: { JOB_MATCHER_MODE: "rule" },
    } as unknown as ConstructorParameters<typeof CandidateOutreachService>[0]);
    await service.respond("user-cand-1", "inv-1", action);
    assert.deepEqual(triggered, expected, action);
  }
});

test("tự đăng tin đã bật tự mời ⇒ kích hoạt; tin chưa bật hoặc phải chờ duyệt ⇒ không", async () => {
  // Cột cuối: bảng điểm lưu sẵn (AD-24) chấm MỌI tin vừa hiển thị, bật tự mời hay không.
  for (const [requiresApproval, autoOutreachEnabled, expected, expectedRescored] of [
    [false, true, ["co-1"], ["job-1"]],
    [false, false, [], ["job-1"]],
    [true, true, [], []],
  ] as const) {
    const triggered: string[] = [];
    const rescored: string[] = [];
    const company = { id: "co-1", name: "Công ty A", isVerified: true, requiresApproval, verifiedAt: new Date() };
    const jobPost = {
      id: "job-1",
      companyId: "co-1",
      // Cùng bộ trường với job-post-resubmit.test.ts (đủ để qua kiểm trước khi gửi và mapper).
      company: { ...company, logoUrl: null, website: null, industryId: null, cityId: null, address: null, taxCode: null, description: null },
      title: "Thực tập sinh Backend",
      description: "Mô tả",
      jobType: "INTERNSHIP",
      status: "DRAFT",
      salaryMin: null,
      salaryMax: null,
      isNegotiable: true,
      requirements: null,
      benefits: null,
      cityId: "city-1",
      city: null,
      address: "1 Lê Lợi",
      industryId: "ind-1",
      industry: null,
      publishedAt: null,
      expiresAt: new Date(Date.now() + 30 * 24 * HOUR_MS),
      closedAt: null,
      viewCount: 0,
      minExperienceYears: null,
      requirementsExtra: null,
      requirementsConfirmedAt: null,
      autoOutreachEnabled,
      moderationActions: [],
      skills: [{ skill: { id: "sk-1", name: "Node.js", status: "APPROVED" }, importance: "REQUIRED", minYears: null }],
      majors: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const service = new JobPostsService({
      prisma: { $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({}) },
      jobPostRepository: {
        findById: async () => jobPost,
        countModerationActions: async () => 0,
        createModerationAction: async () => {},
        update: async (_id: string, data: object) => ({ ...jobPost, ...data }),
      },
      employerIdentityCache: { require: async () => ({ employerId: "emp-1", userId: "user-emp-1", companyId: "co-1" }) },
      companyRepository: { findById: async () => company },
      subscriptionsService: { getCompanySubscriptionAccess: async () => ({ mode: "SUBSCRIBED", publishRemaining: 5 }) },
      notificationsService: { notifyMany: async () => {} },
      userRepository: { findAdminIds: async () => [] },
      auditLogService: { record: async () => {} },
      autoOutreachTrigger: (companyId: string) => triggered.push(companyId),
      matchScoreTrigger: (jobPostId: string) => rescored.push(jobPostId),
    } as unknown as ConstructorParameters<typeof JobPostsService>[0]);
    await service.submitForApproval("user-emp-1", "job-1");
    assert.deepEqual(triggered, expected, `requiresApproval=${requiresApproval}, enabled=${autoOutreachEnabled}`);
    assert.deepEqual(rescored, expectedRescored, `bảng điểm: requiresApproval=${requiresApproval}, enabled=${autoOutreachEnabled}`);
  }
});

// ─── 0.6 bước 6: tự mời đọc bảng điểm (AD-27 mục 7) ─────────────────────────

const SCORED_AT = new Date("2026-11-14T03:30:00.000Z");

test("bảng điểm: tin đã chấm ⇒ đọc hàng chờ từ bảng (ngưỡng của tin, tối đa 2R), không lọc pool, không chấm lại", async () => {
  const { service, calls } = buildRunService({
    jobs: [row("A", { active: 2, matchScoresAt: SCORED_AT, minScore: 75 })], // target 5 ⇒ thiếu 3
    scoredQueues: { A: [{ candidateId: "a9", score: 96 }, { candidateId: "a2", score: 88 }, { candidateId: "a7", score: 80 }, { candidateId: "a1", score: 70 }] },
    refuse: { a2: "BLOCKED" },
  });
  const result = done(await service.runForCompany("co-1", FUTURE()));
  assert.deepEqual(calls.scoredQueue, [{ jobPostId: "A", minScore: 75, limit: 22 }], "R = 11 ⇒ 22 người");
  assert.deepEqual(calls.pool, []);
  assert.deepEqual(calls.scored, []);
  assert.deepEqual(
    calls.invites.map((input) => input.candidateId),
    ["a9", "a2", "a7"],
    "theo thứ tự của bảng; a2 bị bỏ qua thì a7 thế chỗ; a1 dưới ngưỡng",
  );
  assert.deepEqual(calls.invites[0]!.match, { score: 96, weightsVersion: "hybrid-v2" }, "lưu điểm và phiên bản trọng số từ bảng");
  assert.equal(result.sent, 2);
  assert.deepEqual(result.skipped, { BLOCKED: 1 });
});

test("bảng điểm: không ai đạt ngưỡng ⇒ đặt dấu như đường cũ; có người lại thì xoá dấu", async () => {
  const old = new Date(Date.now() - 4 * HOUR_MS);
  const { service, calls } = buildRunService({
    jobs: [
      row("X", { matchScoresAt: SCORED_AT }),
      row("Z", { matchScoresAt: SCORED_AT, exhaustedAt: old, exhaustedReason: "NO_MATCH" }),
    ],
    scoredQueues: { X: [{ candidateId: "x1", score: 60 }], Z: [{ candidateId: "z1", score: 85 }] },
  });
  const result = done(await service.runForCompany("co-1", FUTURE()));
  assert.deepEqual(calls.marked, [["X", "NO_MATCH"]]);
  assert.deepEqual(calls.cleared, ["Z"]);
  assert.deepEqual(
    calls.invites.map((input) => input.candidateId),
    ["z1"],
  );
  assert.equal(result.jobsExhausted, 1);
});

test("bảng điểm: tin chưa chấm lần nào (matchScoresAt null) vẫn đi đường cũ, cùng lượt với tin đọc bảng", async () => {
  const { service, calls } = buildRunService({
    jobs: [row("A", { matchScoresAt: SCORED_AT }), row("B")],
    scoredQueues: { A: [{ candidateId: "a1", score: 90 }] },
    pools: { B: ["b1"] },
    scores: { b1: 90 },
  });
  done(await service.runForCompany("co-1", FUTURE()));
  assert.deepEqual(
    calls.scoredQueue.map((call) => call.jobPostId),
    ["A"],
  );
  assert.deepEqual(
    calls.pool.map((call) => call.jobPostId),
    ["B"],
  );
  assert.deepEqual(calls.invites.map((input) => input.candidateId).sort(), ["a1", "b1"]);
});
