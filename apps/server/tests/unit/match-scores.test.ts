// Chạy: node --import tsx --test tests/unit/match-scores.test.ts (từ apps/server)
// Bảng điểm lưu sẵn (0.3, AD-24) — docs/06-backend/hiring-progress/PLAN.md bước 3.
// CandidateProfileCache và MatchScoreService với loader, repository và bộ chấm giả:
// không cần DB, chỉ kiểm phần điều phối (nạp hồ sơ, khúc chấm, chống chạy trùng, mốc dừng).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MatchResult } from "@sip/shared-types";
import type { CandidateMatchProfile, JobMatchProfile } from "../../src/shared/ports/JobMatcher";
import { CandidateProfileCache } from "../../src/modules/match-scores/candidate-profile-cache";
import type { MatchScoreRow } from "../../src/modules/match-scores/match-score.repository";
import { MatchScoreService } from "../../src/modules/match-scores/match-score.service";
import { runMatchScoreNightly } from "../../src/modules/match-scores/match-score.job";
import { MATCH_SCORE_NIGHTLY_BUDGET_MS } from "../../src/modules/match-scores/match-scores.config";

const profile = (candidateId: string) => ({ candidateId }) as unknown as CandidateMatchProfile;

/** Loader giả: ứng viên có trong `existing` mới có hồ sơ; ghi lại từng lần gọi. */
function fakeLoader(existing: string[]) {
  const calls: string[][] = [];
  const known = new Set(existing);
  return {
    calls,
    loadMany: async (ids: string[]) => {
      calls.push([...ids]);
      return new Map(ids.filter((id) => known.has(id)).map((id) => [id, profile(id)]));
    },
  };
}

// ─── CandidateProfileCache ─────────────────────────────────────────────────

test("cache: chỉ nạp id chưa có, theo lô; trả đúng thứ tự, bỏ trùng và id không còn hồ sơ", async () => {
  const loader = fakeLoader(["a", "b", "c", "d", "e"]);
  const cache = new CandidateProfileCache(loader, { batchSize: 2 });

  const first = await cache.getMany(["c", "a", "x", "a", "b"]);
  assert.deepEqual(first.map((p) => p.candidateId), ["c", "a", "b"]);
  assert.deepEqual(loader.calls, [["c", "a"], ["x", "b"]], "lô 2 id, không nạp trùng");

  const second = await cache.getMany(["e", "b", "d", "c"]);
  assert.deepEqual(second.map((p) => p.candidateId), ["e", "b", "d", "c"]);
  assert.deepEqual(loader.calls.slice(2), [["e", "d"]], "chỉ nạp phần chưa có");
  assert.equal(cache.loaded, 5);
  assert.equal(cache.size, 5);
});

test("cache: vượt trần ⇒ xoá sạch rồi nạp lại đủ danh sách đang cần", async () => {
  const loader = fakeLoader(["a", "b", "c", "d"]);
  const cache = new CandidateProfileCache(loader, { maxSize: 3 });

  await cache.getMany(["a", "b"]);
  const result = await cache.getMany(["b", "c", "d"]);
  assert.deepEqual(result.map((p) => p.candidateId), ["b", "c", "d"]);
  assert.deepEqual(loader.calls[1], ["b", "c", "d"], "b đã có nhưng cache bị xoá nên nạp lại");
  assert.equal(cache.size, 3);
  assert.equal(cache.loaded, 5);
});

test("cache: id không còn hồ sơ thì lần sau vẫn hỏi lại loader", async () => {
  const loader = fakeLoader([]);
  const cache = new CandidateProfileCache(loader);
  assert.deepEqual(await cache.getMany(["gone"]), []);
  assert.deepEqual(await cache.getMany(["gone"]), []);
  assert.equal(loader.calls.length, 2);
  assert.equal(cache.loaded, 0);
});

// ─── MatchScoreService ─────────────────────────────────────────────────────

function match(score: number | null, pending = false): MatchResult {
  return {
    score,
    weightsVersion: "v-test",
    semantic: { enabled: true, available: !pending },
  } as unknown as MatchResult;
}

interface FakeOptions {
  visible?: string[];
  pools?: Record<string, string[]>;
  /** Điểm theo ứng viên; thiếu ⇒ 70. */
  scores?: Record<string, MatchResult>;
  /** Tin thôi hiển thị trong lúc chấm ⇒ replaceForJob trả false. */
  goneWhileScoring?: string[];
  failingJobs?: string[];
  existingCandidates?: string[];
  /** Chờ trước khi trả pool (để thử chạy trùng). */
  poolGate?: Promise<void>;
  /** Mỗi lần chấm đẩy đồng hồ giả lên chừng này ms. */
  advancePerJobMs?: number;
}

function buildService(options: FakeOptions = {}) {
  const pools = options.pools ?? { "job-1": ["a", "b", "c"] };
  const visible = new Set(options.visible ?? Object.keys(pools));
  const written = new Map<string, { rows: MatchScoreRow[]; scoredAt: Date }>();
  const scoredChunks: string[][] = [];
  const errors: Array<Record<string, unknown>> = [];
  const loader = fakeLoader(options.existingCandidates ?? [...new Set(Object.values(pools).flat())]);
  const clock = { now: 1_000_000 };
  const scoredListened: string[] = [];
  const remarks: Array<{ ids: string[]; since: Date }> = [];

  const service = new MatchScoreService({
    matchScoreRepository: {
      isJobVisible: async (id: string) => visible.has(id),
      findScoringPool: async (id: string) => {
        await options.poolGate;
        if (options.failingJobs?.includes(id)) throw new Error(`pool failed: ${id}`);
        clock.now += options.advancePerJobMs ?? 0;
        return pools[id] ?? [];
      },
      findJobsToRescore: async (filter: { companyId?: string; jobPostId?: string }) =>
        Object.keys(pools)
          .filter((id) => visible.has(id) && (!filter.jobPostId || filter.jobPostId === id))
          .map((id) => ({ id, matchScoresAt: null })),
      markChangedSince: async (ids: string[], since: Date) => {
        remarks.push({ ids, since });
        return 0;
      },
      replaceForJob: async (id: string, rows: MatchScoreRow[], scoredAt: Date) => {
        if (options.goneWhileScoring?.includes(id)) return false;
        written.set(id, { rows, scoredAt });
        return true;
      },
    },
    candidateOutreachService: {
      loadJobProfile: async (id: string) => ({ jobPostId: id }) as unknown as JobMatchProfile,
      scoreProfiles: async (_job: JobMatchProfile, profiles: CandidateMatchProfile[]) => {
        scoredChunks.push(profiles.map((p) => p.candidateId));
        return new Map(profiles.map((p) => [p.candidateId, options.scores?.[p.candidateId] ?? match(70)]));
      },
    },
    candidateMatchProfileLoader: loader,
    logger: { info: () => {}, warn: () => {}, error: (_msg: string, meta: Record<string, unknown>) => errors.push(meta) },
    jobScoredListener: (jobPostId: string) => scoredListened.push(jobPostId),
  } as unknown as ConstructorParameters<typeof MatchScoreService>[0]);

  return { service, written, scoredChunks, errors, loader, clock, scoredListened, remarks };
}

test("rescoreJob: ghi người có điểm, bỏ điểm null, semanticPending theo embedding", async () => {
  const { service, written } = buildService({
    scores: { a: match(90), b: match(null), c: match(40, true) },
  });
  const result = await service.rescoreJob("job-1");
  assert.equal(result.status, "DONE");
  assert.deepEqual(
    result.status === "DONE" && { pool: result.pool, rows: result.rows, pendingRows: result.pendingRows },
    { pool: 3, rows: 2, pendingRows: 1 },
  );
  assert.deepEqual(written.get("job-1")?.rows, [
    { candidateId: "a", score: 90, semanticPending: false, weightsVersion: "v-test" },
    { candidateId: "c", score: 40, semanticPending: true, weightsVersion: "v-test" },
  ]);
});

test("rescoreJob: tin không còn hiển thị ⇒ bỏ qua, không chấm, không ghi", async () => {
  const { service, written, scoredChunks } = buildService({ visible: [] });
  assert.deepEqual(await service.rescoreJob("job-1"), { status: "SKIPPED", reason: "NOT_VISIBLE" });
  assert.equal(scoredChunks.length, 0);
  assert.equal(written.size, 0);
});

test("rescoreJob: tin thôi hiển thị trong lúc chấm ⇒ GONE", async () => {
  const { service } = buildService({ goneWhileScoring: ["job-1"] });
  assert.deepEqual(await service.rescoreJob("job-1"), { status: "GONE" });
});

test("rescoreJob: pool > 1.000 hồ sơ ⇒ chấm theo khúc 1.000", async () => {
  const ids = Array.from({ length: 2_300 }, (_, i) => `c${String(i).padStart(4, "0")}`);
  const { service, scoredChunks, written } = buildService({ pools: { "job-1": ids } });
  await service.rescoreJob("job-1");
  assert.deepEqual(scoredChunks.map((chunk) => chunk.length), [1_000, 1_000, 300]);
  assert.equal(written.get("job-1")?.rows.length, 2_300);
});

test("rescoreJob: cùng tin đang chấm ⇒ lượt gọi sau bỏ qua; xong thì chấm lại được", async () => {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const { service } = buildService({ poolGate: gate });

  const first = service.rescoreJob("job-1");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await service.rescoreJob("job-1"), { status: "SKIPPED", reason: "RUNNING" });
  open();
  assert.equal((await first).status, "DONE");
  assert.equal((await service.rescoreJob("job-1")).status, "DONE");
});

test("rescoreJob: lỗi ⇒ ném ra và nhả khoá của tin", async () => {
  const { service } = buildService({ failingJobs: ["job-1"] });
  await assert.rejects(service.rescoreJob("job-1"), /pool failed/);
  await assert.rejects(service.rescoreJob("job-1"), /pool failed/, "không bị kẹt ở RUNNING");
});

test("rescoreAll: một cache cho cả lượt — ứng viên chung giữa các tin chỉ nạp một lần", async () => {
  const { service, loader, written } = buildService({
    pools: { "job-1": ["a", "b"], "job-2": ["b", "c"], "job-3": ["a", "c", "d"] },
  });
  const result = await service.rescoreAll({ budgetMs: 60_000 });
  assert.equal(result.status, "DONE");
  if (result.status !== "DONE") return;
  assert.equal(result.jobsTotal, 3);
  assert.equal(result.jobsScored, 3);
  assert.equal(result.rows, 7);
  assert.equal(result.profilesLoaded, 4);
  assert.deepEqual(loader.calls.flat().sort(), ["a", "b", "c", "d"]);
  assert.equal(written.size, 3);
});

test("rescoreAll: lỗi một tin ⇒ ghi log, đếm jobsFailed, đi tiếp", async () => {
  const { service, errors, written } = buildService({
    pools: { "job-1": ["a"], "job-2": ["b"], "job-3": ["c"] },
    failingJobs: ["job-2"],
  });
  const result = await service.rescoreAll({ budgetMs: 60_000 });
  assert.equal(result.status === "DONE" && result.jobsFailed, 1);
  assert.equal(result.status === "DONE" && result.jobsScored, 2);
  assert.deepEqual([...written.keys()], ["job-1", "job-3"]);
  assert.equal(errors[0]?.jobPostId, "job-2");
});

test("rescoreAll: hết thời gian ⇒ dừng trước tin kế tiếp, phần còn lại là jobsDeferred", async (t) => {
  const { service, clock } = buildService({
    pools: { "job-1": ["a"], "job-2": ["b"], "job-3": ["c"] },
    advancePerJobMs: 600,
  });
  t.mock.method(Date, "now", () => clock.now);
  const result = await service.rescoreAll({ budgetMs: 1_000 });
  assert.equal(result.status === "DONE" && result.jobsScored, 2);
  assert.equal(result.status === "DONE" && result.jobsDeferred, 1);
});

test("rescoreAll: lọc theo tin; đang có lượt khác ⇒ LOCKED", async () => {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const { service, written } = buildService({ pools: { "job-1": ["a"], "job-2": ["b"] }, poolGate: gate });

  const first = service.rescoreAll({ budgetMs: 60_000, jobPostId: "job-2" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await service.rescoreAll({ budgetMs: 60_000 }), { status: "LOCKED" });
  open();
  const result = await first;
  assert.equal(result.status === "DONE" && result.jobsTotal, 1);
  assert.deepEqual([...written.keys()], ["job-2"]);
});

// ─── Job đêm ───────────────────────────────────────────────────────────────

test("job đêm: xoá điểm của tin hết hiển thị trước, rồi chấm lại với budget 45 phút", async () => {
  const calls: string[] = [];
  const result = await runMatchScoreNightly({
    matchScoreRepository: {
      deleteForInactiveJobs: async () => {
        calls.push("cleanup");
        return { deletedRows: 12, resetJobs: 2 };
      },
    },
    matchScoreService: {
      rescoreAll: async (options: { budgetMs: number }) => {
        calls.push(`rescore:${options.budgetMs}`);
        return { status: "LOCKED" as const };
      },
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as Parameters<typeof runMatchScoreNightly>[0]);
  assert.deepEqual(calls, ["cleanup", `rescore:${MATCH_SCORE_NIGHTLY_BUDGET_MS}`]);
  assert.equal(MATCH_SCORE_NIGHTLY_BUDGET_MS, 45 * 60 * 1000);
  assert.deepEqual(result.cleaned, { deletedRows: 12, resetJobs: 2 });
});

// ─── Lối (a) → job alert (AD-26 D7) ─────────────────────────────────────────

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
};

test("trigger: chấm xong (DONE) ⇒ báo jobScoredListener đúng một lần", async () => {
  const { service, scoredListened } = buildService();
  service.trigger("job-1");
  await settle();
  assert.deepEqual(scoredListened, ["job-1"]);
});

test("trigger: tin không hiển thị / thôi hiển thị lúc chấm / lỗi ⇒ không báo job alert", async () => {
  const notVisible = buildService({ visible: [] });
  notVisible.service.trigger("job-1");
  const gone = buildService({ goneWhileScoring: ["job-1"] });
  gone.service.trigger("job-1");
  const failing = buildService({ failingJobs: ["job-1"] });
  failing.service.trigger("job-1");
  await settle();
  assert.deepEqual(notVisible.scoredListened, []);
  assert.deepEqual(gone.scoredListened, []);
  assert.deepEqual(failing.scoredListened, []);
  assert.equal(failing.errors.length, 1);
});

test("rescoreJob / rescoreAll (lượt đêm, script) ⇒ không báo job alert", async () => {
  const { service, scoredListened } = buildService({ pools: { "job-1": ["a"], "job-2": ["b"] } });
  await service.rescoreJob("job-1");
  await service.rescoreAll({ budgetMs: 60_000 });
  assert.deepEqual(scoredListened, []);
});
