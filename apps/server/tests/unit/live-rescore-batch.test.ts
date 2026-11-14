// Chạy: node --import tsx --test tests/unit/live-rescore-batch.test.ts (từ apps/server)
// Bước 3 của chấm lại theo ứng viên (docs/06-backend/live-rescore/PLAN.md, AD-27 mục 4–5, Q2, Q8):
// - MatchEmbeddingService.similarityForPairs: cùng cosine với lối theo tin, giới hạn vector mới;
// - CandidateOutreachService.scoreCandidatesAgainstJobs cho cùng điểm với scoreProfiles (bộ chấm thật);
// - InMemoryJobProfileCache: TTL, trần, xoá;
// - LiveRescoreService: lô, xoá dấu, giữ dấu, lỗi, không chạy chồng, chạy tiếp;
// - MatchScoreService (Q2): đánh dấu lại người sửa hồ sơ sau lúc nạp.
// Repository, loader và model là bản giả; không cần DB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import type { MatchResult } from "@sip/shared-types";
import type { EmbeddingProvider } from "../../src/shared/ports/EmbeddingProvider";
import type { CandidateMatchProfile, JobMatchProfile } from "../../src/shared/ports/JobMatcher";
import type { Logger } from "../../src/shared/logger";
import {
  computeContentHash,
  MatchEmbeddingService,
  type EmbeddingTarget,
} from "../../src/modules/job-matching/match-embedding.service";
import type {
  EmbeddingKind,
  EmbeddingRecord,
  MatchEmbeddingRepository,
} from "../../src/modules/job-matching/match-embedding.repository";
import { HYBRID_WEIGHTS_V2, RULE_WEIGHTS_V1 } from "../../src/modules/job-matching/job-matching.config";
import { ScoringJobMatcher } from "../../src/modules/job-matching/scoring-job-matcher";
import { CandidateOutreachService } from "../../src/modules/candidate-outreach/candidate-outreach.service";
import { InMemoryJobProfileCache } from "../../src/modules/live-rescore/job-profile-cache";
import { LiveRescoreService } from "../../src/modules/live-rescore/live-rescore.service";
import type { LiveRescoreRunSummary } from "../../src/modules/live-rescore/live-rescore-run-store";
import type { CandidateScoreRow, MatchTransition } from "../../src/modules/match-scores/match-score.repository";
import type { FollowUpRun } from "../../src/modules/live-rescore/live-rescore-follow-ups";
import { MatchScoreService } from "../../src/modules/match-scores/match-score.service";
import { MATCH_SCORE_REMARK_CLOCK_MARGIN_MS } from "../../src/modules/match-scores/match-scores.config";

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

// ─── Embedding giả: vector trong bộ nhớ, cosine = tích vô hướng (vector đã chuẩn hoá) ──────

class FakeEmbeddingRepository {
  readonly stored: Record<EmbeddingKind, Map<string, EmbeddingRecord>> = { candidate: new Map(), job: new Map() };
  pairQueries = 0;
  failPairs = false;

  async findHashes(kind: EmbeddingKind, ids: string[]) {
    return new Map(ids.filter((id) => this.stored[kind].has(id)).map((id) => [id, this.stored[kind].get(id)!.contentHash]));
  }

  async upsertMany(kind: EmbeddingKind, records: EmbeddingRecord[]) {
    for (const record of records) this.stored[kind].set(record.id, record);
  }

  private cosine(candidateId: string, jobPostId: string): number | undefined {
    const c = this.stored.candidate.get(candidateId);
    const j = this.stored.job.get(jobPostId);
    if (!c || !j) return undefined;
    return c.vector.reduce((sum, value, index) => sum + value * j.vector[index]!, 0);
  }

  async cosinesForJob(jobPostId: string, candidateIds: string[]) {
    const result = new Map<string, number>();
    for (const id of candidateIds) {
      const cosine = this.cosine(id, jobPostId);
      if (cosine !== undefined) result.set(id, cosine);
    }
    return result;
  }

  async cosinesForPairs(pairs: Array<{ candidateId: string; jobPostId: string }>) {
    this.pairQueries += 1;
    if (this.failPairs) throw new Error("db down");
    const result = new Map<string, Map<string, number>>();
    for (const { candidateId, jobPostId } of pairs) {
      const cosine = this.cosine(candidateId, jobPostId);
      if (cosine === undefined) continue;
      if (!result.has(candidateId)) result.set(candidateId, new Map());
      result.get(candidateId)!.set(jobPostId, cosine);
    }
    return result;
  }
}

class FakeProvider implements EmbeddingProvider {
  modelId = "model-a";
  calls: string[] = [];
  available = true;
  vectors = new Map<string, number[]>();

  async embed(text: string) {
    this.calls.push(text);
    if (!this.available) return null;
    return this.vectors.get(text) ?? [1, 0];
  }
}

function embeddingSetup() {
  const repository = new FakeEmbeddingRepository();
  const provider = new FakeProvider();
  const service = new MatchEmbeddingService({
    matchEmbeddingRepository: repository as unknown as MatchEmbeddingRepository,
    embeddingProvider: provider,
    config: { MATCH_EMBEDDING_TEMPLATE_VERSION: 1 },
    logger: quietLogger().logger,
  });
  return { repository, provider, service };
}

const target = (id: string): EmbeddingTarget => ({ id, text: `text of ${id}` });
const allPairs = (candidates: string[], jobs: string[]) =>
  candidates.flatMap((candidateId) => jobs.map((jobPostId) => ({ candidateId, jobPostId })));

test("similarityForPairs: cùng cosine với similarityForCandidates, một câu cosine cho mọi cặp", async () => {
  const { service, provider, repository } = embeddingSetup();
  provider.vectors.set("text of j1", [1, 0]);
  provider.vectors.set("text of j2", [0, 1]);
  provider.vectors.set("text of c1", [0.6, 0.8]);
  provider.vectors.set("text of c2", [0.8, 0.6]);

  const pairs = await service.similarityForPairs(
    [target("c1"), target("c2")],
    [target("j1"), target("j2")],
    allPairs(["c1", "c2"], ["j1", "j2"]),
    10,
  );
  assert.equal(pairs.embedded, 4);
  assert.deepEqual([...pairs.deferredCandidates], []);
  assert.equal(repository.pairQueries, 1);

  for (const job of ["j1", "j2"]) {
    const byJob = await service.similarityForCandidates(target(job), [target("c1"), target("c2")], 10);
    for (const candidate of ["c1", "c2"]) {
      assert.equal(pairs.cosines.get(candidate)?.get(job), byJob.get(candidate), `${candidate} × ${job}`);
    }
  }
  assert.equal(provider.calls.length, 4, "lối theo tin không phải embed lại");
});

test("similarityForPairs: giới hạn chung, tin trước; người vượt giới hạn là deferred, không có cosine", async () => {
  const { service, provider } = embeddingSetup();
  const result = await service.similarityForPairs(
    [target("c1"), target("c2"), target("c3")],
    [target("j1")],
    allPairs(["c1", "c2", "c3"], ["j1"]),
    2,
  );
  assert.deepEqual(provider.calls, ["text of j1", "text of c1"]);
  assert.equal(result.embedded, 2);
  assert.deepEqual([...result.deferredCandidates].sort(), ["c2", "c3"]);
  assert.ok(result.cosines.get("c1")?.has("j1"));
  assert.equal(result.cosines.get("c2"), undefined);
});

test("similarityForPairs: model lỗi ⇒ không có cosine nhưng không phải deferred; lỗi DB ⇒ không ném", async () => {
  const { service, provider, repository } = embeddingSetup();
  provider.available = false;
  const down = await service.similarityForPairs([target("c1")], [target("j1")], allPairs(["c1"], ["j1"]), 10);
  assert.equal(down.cosines.size, 0);
  assert.equal(down.deferredCandidates.size, 0);

  provider.available = true;
  repository.failPairs = true;
  const failed = await service.similarityForPairs([target("c1")], [target("j1")], allPairs(["c1"], ["j1"]), 10);
  assert.equal(failed.cosines.size, 0);
  assert.equal(failed.embedded, 2, "vector đã ghi trước khi lỗi vẫn tính vào giới hạn");
});

test("similarityForPairs: vector cũ (hash đổi) không được dùng khi không còn chỗ tính lại", async () => {
  const { service, repository } = embeddingSetup();
  repository.stored.job.set("j1", {
    id: "j1",
    vector: [1, 0],
    contentHash: computeContentHash({ templateVersion: 1, modelId: "model-a", text: "text of j1" }),
    model: "model-a",
    templateVersion: 1,
  });
  repository.stored.candidate.set("c1", { id: "c1", vector: [1, 0], contentHash: "old", model: "model-a", templateVersion: 1 });
  const result = await service.similarityForPairs([target("c1")], [target("j1")], allPairs(["c1"], ["j1"]), 0);
  assert.equal(result.cosines.size, 0);
  assert.deepEqual([...result.deferredCandidates], ["c1"]);
});

// ─── Chấm theo lô = chấm theo tin (bộ chấm thật) ──────────────────────────────

function candidateProfile(
  candidateId: string,
  skills: Array<[string, number]>,
  extra: Partial<CandidateMatchProfile> = {},
): CandidateMatchProfile {
  return {
    candidateId,
    skills: skills.map(([skillId, yearsOfExperience]) => ({ skillId, name: skillId, yearsOfExperience })),
    totalExperienceYears: 1,
    educations: [{ majorId: "m-it", majorName: "CNTT", degree: "BACHELOR" }],
    completeness: { hasSkills: true, hasWorkExperience: true, hasEducation: true, hasHeadlineOrBio: true },
    matchText: `text of ${candidateId}`,
    ...extra,
  };
}

function jobProfile(jobPostId: string, required: string[], preferred: string[] = []): JobMatchProfile {
  return {
    jobPostId,
    skills: [
      ...required.map((skillId) => ({ skillId, name: skillId, importance: "REQUIRED" as const, minYears: null })),
      ...preferred.map((skillId) => ({ skillId, name: skillId, importance: "PREFERRED" as const, minYears: null })),
    ],
    minExperienceYears: 1,
    majors: [{ majorId: "m-it", name: "CNTT", relevance: "PRIMARY" as never }],
    matchText: `text of ${jobPostId}`,
  };
}

function outreachService(mode: "hybrid" | "rule") {
  const embedding = embeddingSetup();
  embedding.provider.vectors.set("text of j1", [1, 0]);
  embedding.provider.vectors.set("text of j2", [0.6, 0.8]);
  embedding.provider.vectors.set("text of c1", [0.8, 0.6]);
  embedding.provider.vectors.set("text of c2", [0, 1]);
  const service = new CandidateOutreachService({
    ruleJobMatcher: new ScoringJobMatcher(RULE_WEIGHTS_V1),
    hybridJobMatcher: new ScoringJobMatcher(HYBRID_WEIGHTS_V2),
    matchEmbeddingService: embedding.service,
    logger: quietLogger().logger,
    config: { JOB_MATCHER_MODE: mode },
  } as unknown as ConstructorParameters<typeof CandidateOutreachService>[0]);
  return { service, embedding };
}

for (const mode of ["hybrid", "rule"] as const) {
  test(`scoreCandidatesAgainstJobs (${mode}): mỗi cặp cùng điểm với scoreProfiles`, async () => {
    const { service } = outreachService(mode);
    const candidates = [
      candidateProfile("c1", [["react", 2], ["ts", 1]]),
      candidateProfile("c2", [["react", 0]], { totalExperienceYears: 0 }),
      // Văn bản rỗng ⇒ không có semantic, điểm rule-only (semanticPending).
      candidateProfile("c3", [["ts", 3]], { matchText: "" }),
    ];
    const jobs = [jobProfile("j1", ["react"], ["ts"]), jobProfile("j2", ["ts"])];

    const batch = await service.scoreCandidatesAgainstJobs(
      candidates.map((profile) => ({ profile, jobs })),
      100,
    );
    for (const job of jobs) {
      const byJob = await service.scoreProfiles(job, candidates, 100);
      for (const candidate of candidates) {
        assert.deepEqual(
          batch.results.get(candidate.candidateId)?.get(job.jobPostId),
          byJob.get(candidate.candidateId),
          `${candidate.candidateId} × ${job.jobPostId}`,
        );
      }
    }
    if (mode === "hybrid") {
      const pending = batch.results.get("c3")?.get("j1");
      assert.equal(pending?.semantic.enabled && !pending.semantic.available, true);
    }
  });
}

test("scoreCandidatesAgainstJobs: người không có tin nào vẫn có khoá (Map rỗng)", async () => {
  const { service } = outreachService("hybrid");
  const batch = await service.scoreCandidatesAgainstJobs([{ profile: candidateProfile("c1", [["react", 1]]), jobs: [] }], 10);
  assert.deepEqual([...batch.results.keys()], ["c1"]);
  assert.equal(batch.results.get("c1")?.size, 0);
});

// ─── InMemoryJobProfileCache ─────────────────────────────────────────────────

function jobLoader(existing: string[]) {
  const calls: string[][] = [];
  const known = new Set(existing);
  return {
    calls,
    loadMany: async (ids: string[]) => {
      calls.push([...ids]);
      return new Map(ids.filter((id) => known.has(id)).map((id) => [id, jobProfile(id, ["react"])]));
    },
  };
}

test("job cache: chỉ nạp phần thiếu, một lần gọi; tin không còn thì không có trong Map", async () => {
  const loader = jobLoader(["j1", "j2", "j3"]);
  const cache = new InMemoryJobProfileCache({ jobMatchProfileLoader: loader });
  assert.deepEqual([...(await cache.getMany(["j1", "j2", "gone", "j1"])).keys()].sort(), ["j1", "j2"]);
  assert.deepEqual([...(await cache.getMany(["j2", "j3"])).keys()].sort(), ["j2", "j3"]);
  assert.deepEqual(loader.calls, [["j1", "j2", "gone"], ["j3"]]);
});

test("job cache: hết hạn thì nạp lại; invalidate / clear bỏ mục", async () => {
  const loader = jobLoader(["j1", "j2"]);
  const clock = { now: 0 };
  const cache = new InMemoryJobProfileCache({
    jobMatchProfileLoader: loader,
    jobProfileCacheOptions: { ttlMs: 1_000, now: () => clock.now },
  });
  await cache.getMany(["j1", "j2"]);
  clock.now = 999;
  await cache.getMany(["j1"]);
  assert.equal(loader.calls.length, 1, "còn hạn");
  clock.now = 1_000;
  await cache.getMany(["j1"]);
  assert.deepEqual(loader.calls[1], ["j1"], "hết hạn");

  cache.invalidate(["j2"]);
  await cache.getMany(["j2"]);
  assert.deepEqual(loader.calls[2], ["j2"]);
  cache.clear();
  assert.equal(cache.size, 0);
});

test("job cache: vượt trần thì bỏ mục dùng lâu nhất", async () => {
  const loader = jobLoader(["j1", "j2", "j3"]);
  const cache = new InMemoryJobProfileCache({ jobMatchProfileLoader: loader, jobProfileCacheOptions: { maxEntries: 2 } });
  await cache.getMany(["j1", "j2"]);
  await cache.getMany(["j1"]); // j1 vừa dùng ⇒ j2 là mục cũ nhất
  await cache.getMany(["j3"]);
  assert.equal(cache.size, 2);
  await cache.getMany(["j1", "j3"]);
  assert.equal(loader.calls.length, 2, "j1, j3 vẫn còn");
  await cache.getMany(["j2"]);
  assert.deepEqual(loader.calls[2], ["j2"], "j2 đã bị bỏ");
});

// ─── LiveRescoreService ────────────────────────────────────────────────────

function match(score: number | null, pending = false): MatchResult {
  return { score, weightsVersion: "v-test", semantic: { enabled: true, available: !pending } } as unknown as MatchResult;
}

interface LiveOptions {
  marks: string[];
  pools?: Record<string, string[]>;
  /** Điểm theo `${candidate}|${job}`; thiếu ⇒ 70. */
  scores?: Record<string, MatchResult>;
  deferred?: string[];
  /** Lần gọi replaceForCandidates thứ n (từ 1) ném lỗi. */
  failWriteCall?: number;
  /** Ứng viên sửa hồ sơ trong lúc lô của họ đang chấm (dấu mới hơn lúc bắt đầu lô). */
  editedDuringScoring?: string[];
  missingProfiles?: string[];
  batchSize?: number;
  budgetMs?: number;
  continueDelayMs?: number;
  /** Mỗi lần chọn lô đẩy đồng hồ giả lên chừng này ms. */
  advancePerBatchMs?: number;
  batchGate?: Promise<void>;
  failSaveRun?: boolean;
  /** Cặp đổi ngưỡng mà lần ghi thứ n (từ 1) trả về. */
  transitionsByWrite?: Record<number, MatchTransition[]>;
  /** Lần chọn lô thứ n (từ 1) ném lỗi. */
  failSelectCall?: number;
  /** Q1: kết quả rescoreJob theo tin, lần lượt mỗi lần gọi (thiếu ⇒ DONE). */
  jobResults?: Record<string, Array<"DONE" | "RUNNING" | "NOT_VISIBLE" | "THROW">>;
  /** Mỗi lần rescoreJob đẩy đồng hồ giả lên chừng này ms. */
  advancePerJobMs?: number;
}

function buildLive(options: LiveOptions) {
  const clock = { now: 1_000_000 };
  const marks = new Map(options.marks.map((id, index) => [id, clock.now - 1_000 + index]));
  const pools = options.pools ?? {};
  const writes: Array<{ rowsByCandidate: Map<string, CandidateScoreRow[]>; clearMarksFor: string[] }> = [];
  const batchesSelected: string[][] = [];
  const saved: LiveRescoreRunSummary[] = [];
  const { logger, errors, warns, infos } = quietLogger();
  let writeCalls = 0;
  let selectCalls = 0;
  const afterBatch: Array<{ transitions: MatchTransition[]; newlyScored: string[] }> = [];
  const finished: FollowUpRun[] = [];
  /** Thứ tự ghi lô ("write") và chấm theo tin ("job:<id>"). */
  const events: string[] = [];
  const jobCalls = new Map<string, number>();

  const service = new LiveRescoreService({
    liveRescoreRepository: {
      findMarkedBatch: async (limit: number, exclude: ReadonlySet<string>) => {
        await options.batchGate;
        selectCalls += 1;
        if (selectCalls === options.failSelectCall) throw new Error("select failed");
        clock.now += options.advancePerBatchMs ?? 0;
        const ids = [...marks]
          .filter(([id]) => !exclude.has(id))
          .sort((a, b) => a[1] - b[1])
          .slice(0, limit)
          .map(([id]) => id);
        if (ids.length > 0) batchesSelected.push(ids);
        return { ids, startedAt: new Date(clock.now) };
      },
      findJobPools: async (ids: string[]) =>
        new Map(ids.filter((id) => pools[id]).map((id) => [id, pools[id]!])),
      countMarked: async () => marks.size,
    },
    matchScoreRepository: {
      replaceForCandidates: async (input: {
        rowsByCandidate: Map<string, CandidateScoreRow[]>;
        clearMarksFor: string[];
        batchStartedAt: Date;
      }) => {
        writeCalls += 1;
        if (writeCalls === options.failWriteCall) throw new Error("tx failed");
        writes.push({ rowsByCandidate: input.rowsByCandidate, clearMarksFor: input.clearMarksFor });
        events.push("write");
        let cleared = 0;
        for (const id of input.clearMarksFor) {
          const mark = marks.get(id);
          if (mark !== undefined && mark <= input.batchStartedAt.getTime()) {
            marks.delete(id);
            cleared += 1;
          }
        }
        const rows = [...input.rowsByCandidate.values()].reduce((sum, list) => sum + list.length, 0);
        const transitions = options.transitionsByWrite?.[writeCalls] ?? [];
        return { rows, marksCleared: cleared, transitions, newlyScored: [`new-${writeCalls}`] };
      },
    },
    matchScoreService: {
      rescoreJob: async (jobPostId: string) => {
        const call = jobCalls.get(jobPostId) ?? 0;
        jobCalls.set(jobPostId, call + 1);
        events.push(`job:${jobPostId}`);
        clock.now += options.advancePerJobMs ?? 0;
        const outcome = options.jobResults?.[jobPostId]?.[call] ?? "DONE";
        if (outcome === "THROW") throw new Error("job failed");
        if (outcome === "RUNNING") return { status: "SKIPPED", reason: "RUNNING" };
        if (outcome === "NOT_VISIBLE") return { status: "SKIPPED", reason: "NOT_VISIBLE" };
        return { status: "DONE", pool: 1, rows: 1, pendingRows: 0, pendingBefore: [], durationMs: 1 };
      },
    },
    candidateOutreachService: {
      scoreCandidatesAgainstJobs: async (entries: Array<{ profile: CandidateMatchProfile; jobs: JobMatchProfile[] }>) => {
        for (const id of options.editedDuringScoring ?? []) if (marks.has(id)) marks.set(id, clock.now + 1);
        const deferred = new Set((options.deferred ?? []).filter((id) => entries.some((e) => e.profile.candidateId === id)));
        return {
          results: new Map(
            entries.map(({ profile, jobs }) => [
              profile.candidateId,
              new Map(jobs.map((job) => [job.jobPostId, options.scores?.[`${profile.candidateId}|${job.jobPostId}`] ?? match(70)])),
            ]),
          ),
          embedded: 0,
          deferredCandidates: deferred,
        };
      },
    },
    candidateMatchProfileLoader: {
      loadMany: async (ids: string[]) =>
        new Map(
          ids
            .filter((id) => !options.missingProfiles?.includes(id))
            .map((id) => [id, { candidateId: id } as unknown as CandidateMatchProfile]),
        ),
    },
    jobProfileCache: {
      getMany: async (ids: string[]) => new Map(ids.map((id) => [id, { jobPostId: id } as unknown as JobMatchProfile])),
      invalidate: () => {},
      clear: () => {},
    },
    liveRescoreRunStore: {
      saveLastRun: async (summary: LiveRescoreRunSummary) => {
        if (options.failSaveRun) throw new Error("redis down");
        saved.push(summary);
      },
    },
    liveRescoreFollowUps: {
      afterBatch: async (written: { transitions: MatchTransition[]; newlyScored: string[] }, run: FollowUpRun) => {
        afterBatch.push(written);
        run.reached += written.transitions.filter((transition) => transition.matched).length;
        for (const transition of written.transitions) run.outreachCompanies.add(transition.companyId);
      },
      finishRun: (run: FollowUpRun) => finished.push(run),
    },
    logger,
    liveRescoreServiceOptions: {
      batchSize: options.batchSize ?? 2,
      budgetMs: options.budgetMs ?? 60_000,
      continueDelayMs: options.continueDelayMs ?? 5,
      maxNewEmbeddings: 300,
    },
  } as unknown as ConstructorParameters<typeof LiveRescoreService>[0]);

  return { service, marks, writes, batchesSelected, saved, errors, warns, infos, clock, afterBatch, finished, events };
}

test("drain: chấm theo lô, mỗi lô một lần ghi kèm xoá dấu, lưu tóm tắt lượt", async (t) => {
  const live = buildLive({
    marks: ["a", "b", "c", "d", "e"],
    pools: { a: ["j1", "j2"], b: ["j1"], c: ["j2"], d: ["j1"], e: ["j1", "j2"] },
  });
  t.after(() => live.service.stop());
  const result = await live.service.drain("cron");
  assert.equal(result.status, "DONE");
  assert.deepEqual(live.batchesSelected, [["a", "b"], ["c", "d"], ["e"]], "dấu cũ nhất trước, lô 2 người");
  assert.equal(live.writes.length, 3);
  assert.equal(live.marks.size, 0);
  assert.equal(result.status === "DONE" && result.candidates, 5);
  assert.equal(result.status === "DONE" && result.rows, 7);
  assert.equal(result.status === "DONE" && result.remaining, 0);
  assert.equal(live.saved.length, 1);
  assert.equal(live.saved[0]?.trigger, "cron");
});

test("drain: điểm null không có dòng; người không còn tin nào vẫn được ghi (xoá dòng cũ) và xoá dấu", async (t) => {
  const live = buildLive({
    marks: ["a", "b"],
    pools: { a: ["j1", "j2"] },
    scores: { "a|j2": match(null), "a|j1": match(55, true) },
  });
  t.after(() => live.service.stop());
  await live.service.drain();
  const write = live.writes[0]!;
  assert.deepEqual(write.rowsByCandidate.get("a"), [
    { jobPostId: "j1", score: 55, semanticPending: true, weightsVersion: "v-test" },
  ]);
  assert.deepEqual(write.rowsByCandidate.get("b"), []);
  assert.deepEqual(write.clearMarksFor, ["a", "b"]);
  assert.equal(live.marks.size, 0);
});

test("drain: người vượt giới hạn embedding được ghi điểm nhưng giữ dấu, không bị chọn lại trong lượt", async (t) => {
  const live = buildLive({ marks: ["a", "b", "c"], pools: { a: ["j1"], b: ["j1"], c: ["j1"] }, deferred: ["b"] });
  t.after(() => live.service.stop());
  const result = await live.service.drain();
  assert.deepEqual(live.writes[0]?.clearMarksFor, ["a"]);
  assert.ok(live.writes[0]?.rowsByCandidate.has("b"));
  assert.deepEqual([...live.marks.keys()], ["b"]);
  assert.deepEqual(live.batchesSelected, [["a", "b"], ["c"]]);
  assert.equal(result.status === "DONE" && result.kept, 1);
  assert.equal(result.status === "DONE" && result.remaining, 1);
});

test("drain: lô ghi lỗi ⇒ cả lô giữ dấu, ghi log, lô sau vẫn chạy", async (t) => {
  const live = buildLive({ marks: ["a", "b", "c"], pools: { a: ["j1"], b: ["j1"], c: ["j1"] }, failWriteCall: 1 });
  t.after(() => live.service.stop());
  const result = await live.service.drain();
  assert.deepEqual([...live.marks.keys()].sort(), ["a", "b"]);
  assert.equal(live.errors.length, 1);
  assert.equal(result.status === "DONE" && result.kept, 2);
  assert.equal(result.status === "DONE" && result.candidates, 1);
});

test("drain: sửa hồ sơ trong lúc chấm (dấu mới hơn lúc bắt đầu lô) ⇒ giữ dấu (D2)", async (t) => {
  const live = buildLive({ marks: ["a", "b"], pools: { a: ["j1"], b: ["j1"] }, editedDuringScoring: ["b"] });
  t.after(() => live.service.stop());
  await live.service.drain();
  assert.deepEqual([...live.marks.keys()], ["b"]);
});

test("drain: ứng viên không còn (đã xoá) thì bỏ qua", async (t) => {
  const live = buildLive({ marks: ["a", "gone"], pools: { a: ["j1"] }, missingProfiles: ["gone"] });
  t.after(() => live.service.stop());
  const result = await live.service.drain();
  assert.deepEqual([...live.writes[0]!.rowsByCandidate.keys()], ["a"]);
  assert.equal(result.status === "DONE" && result.candidates, 1);
});

test("drain: đang có lượt ⇒ BUSY, xong lượt đó thì chạy thêm một lượt", async (t) => {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const live = buildLive({ marks: ["a"], pools: { a: ["j1"] }, batchGate: gate });
  t.after(() => live.service.stop());
  const first = live.service.drain();
  assert.deepEqual(await live.service.drain(), { status: "BUSY" });
  open();
  await first;
  await sleep(40);
  assert.equal(live.saved.length, 2, "lượt thêm đã chạy");
});

test("drain: hết giờ mà còn dấu ⇒ dừng trước lô kế tiếp và hẹn lượt tiếp", async (t) => {
  const live = buildLive({
    marks: ["a", "b", "c", "d"],
    pools: { a: ["j1"], b: ["j1"], c: ["j1"], d: ["j1"] },
    batchSize: 1,
    budgetMs: 1_000,
    advancePerBatchMs: 600,
  });
  t.mock.method(Date, "now", () => live.clock.now);
  t.after(() => live.service.stop());
  const result = await live.service.drain();
  assert.equal(result.status === "DONE" && result.timedOut, true);
  assert.equal(result.status === "DONE" && result.candidates, 2);
  await sleep(40);
  assert.ok(live.saved.length >= 2, "lượt tiếp đã chạy");
});

test("drain: không có dấu ⇒ không ghi, không log info; lưu tóm tắt lỗi chỉ ghi warn", async (t) => {
  const live = buildLive({ marks: [], failSaveRun: true });
  t.after(() => live.service.stop());
  const result = await live.service.drain("cron");
  assert.equal(result.status === "DONE" && result.batches, 0);
  assert.equal(live.writes.length, 0);
  assert.deepEqual(live.infos, []);
  assert.equal(live.warns.length, 1);
});

function transition(candidateId: string, jobPostId: string, matched = true, companyId = "co-1"): MatchTransition {
  return { candidateId, jobPostId, companyId, autoOutreachEnabled: true, matched };
}

test("drain (bước 4): mỗi lô ghi xong thì chạy việc kéo theo, lô lỗi thì không; cuối lượt finishRun một lần", async (t) => {
  const live = buildLive({
    marks: ["a", "b", "c", "d", "e"],
    pools: { a: ["j1"], b: ["j1"], c: ["j1"], d: ["j1"], e: ["j1"] },
    failWriteCall: 2,
    transitionsByWrite: { 1: [transition("a", "j1"), transition("b", "j1", false)], 3: [transition("e", "j1", true, "co-2")] },
  });
  t.after(() => live.service.stop());
  const result = await live.service.drain();
  assert.deepEqual(
    live.afterBatch.map((written) => written.newlyScored),
    [["new-1"], ["new-3"]],
    "lô 2 lỗi ⇒ không có việc kéo theo",
  );
  assert.equal(live.afterBatch[0]?.transitions.length, 2);
  assert.equal(live.finished.length, 1);
  assert.deepEqual([...live.finished[0]!.outreachCompanies].sort(), ["co-1", "co-2"], "gom công ty qua các lô");
  assert.equal(result.status === "DONE" && result.followUps?.reached, 2);
  assert.equal(result.status === "DONE" && result.followUps?.outreachCompanies, 2);
});

test("drain (bước 4): lượt hỏng giữa chừng (FAILED) vẫn gửi việc kéo theo của các lô đã ghi", async (t) => {
  const live = buildLive({
    marks: ["a", "b", "c"],
    pools: { a: ["j1"], b: ["j1"], c: ["j1"] },
    failSelectCall: 2,
    transitionsByWrite: { 1: [transition("a", "j1")] },
  });
  t.after(() => live.service.stop());
  const result = await live.service.drain();
  assert.equal(result.status, "FAILED");
  assert.equal(live.afterBatch.length, 1);
  assert.equal(live.finished.length, 1);
  assert.deepEqual([...live.finished[0]!.outreachCompanies], ["co-1"]);
});

// ─── MatchScoreService (Q2) ─────────────────────────────────────────────────

function buildMatchScoreService(options: { gone?: boolean; failRemark?: boolean; remarked?: number; noRequester?: boolean } = {}) {
  const remarks: Array<{ ids: string[]; since: Date }> = [];
  let drainRequests = 0;
  const { logger, errors } = quietLogger();
  const service = new MatchScoreService({
    matchScoreRepository: {
      isJobVisible: async () => true,
      findScoringPool: async () => ["a", "b"],
      replaceForJob: async () => (options.gone ? null : { pendingBefore: [] }),
      markChangedSince: async (ids: string[], since: Date) => {
        if (options.failRemark) throw new Error("db down");
        remarks.push({ ids, since });
        return options.remarked ?? 1;
      },
    },
    candidateOutreachService: {
      loadJobProfile: async (id: string) => ({ jobPostId: id }) as unknown as JobMatchProfile,
      scoreProfiles: async (_job: JobMatchProfile, profiles: CandidateMatchProfile[]) =>
        new Map(profiles.map((p) => [p.candidateId, match(70)])),
    },
    candidateMatchProfileLoader: {
      loadMany: async (ids: string[]) => new Map(ids.map((id) => [id, { candidateId: id } as unknown as CandidateMatchProfile])),
    },
    logger,
    jobScoredListener: () => {},
    ...(options.noRequester ? {} : { liveRescoreDrainRequester: () => (drainRequests += 1) }),
  } as unknown as ConstructorParameters<typeof MatchScoreService>[0]);
  return { service, remarks, errors, drainRequests: () => drainRequests };
}

test("rescoreJob (Q2): ghi xong thì đánh dấu lại người sửa hồ sơ sau lúc nạp, lùi mốc bù lệch đồng hồ, rồi yêu cầu lượt chấm", async () => {
  const before = Date.now();
  const { service, remarks, drainRequests } = buildMatchScoreService();
  const result = await service.rescoreJob("job-1");
  assert.equal(result.status, "DONE");
  assert.equal(remarks.length, 1);
  assert.deepEqual(remarks[0]?.ids, ["a", "b"]);
  const since = remarks[0]!.since.getTime();
  assert.ok(since >= before - MATCH_SCORE_REMARK_CLOCK_MARGIN_MS && since <= Date.now() - MATCH_SCORE_REMARK_CLOCK_MARGIN_MS);
  assert.equal(drainRequests(), 1, "không chờ cron 15 phút");
});

test("rescoreJob (Q2): không ai bị đánh dấu lại thì không yêu cầu lượt chấm; script không truyền requester vẫn chạy", async () => {
  const none = buildMatchScoreService({ remarked: 0 });
  assert.equal((await none.service.rescoreJob("job-1")).status, "DONE");
  assert.equal(none.drainRequests(), 0);

  const script = buildMatchScoreService({ noRequester: true });
  assert.equal((await script.service.rescoreJob("job-1")).status, "DONE");
  assert.equal(script.remarks.length, 1);
  assert.deepEqual(script.errors, []);
});

test("rescoreJob (Q2): tin thôi hiển thị (GONE) thì không đánh dấu lại; lỗi đánh dấu lại chỉ ghi log", async () => {
  const gone = buildMatchScoreService({ gone: true });
  assert.deepEqual(await gone.service.rescoreJob("job-1"), { status: "GONE" });
  assert.equal(gone.remarks.length, 0);

  const failing = buildMatchScoreService({ failRemark: true });
  assert.equal((await failing.service.rescoreJob("job-1")).status, "DONE");
  assert.equal(failing.errors.length, 1);
});

// ─── Q1 (bước 5): hàng chờ chấm lại theo tin khi danh mục đổi ───────────────

test("Q1: tin trong hàng chấm sau phần theo ứng viên, tin trùng chỉ chấm một lần; tóm tắt có jobs", async (t) => {
  const live = buildLive({ marks: ["a", "b", "c"], pools: { a: ["j1"], b: ["j1"], c: ["j1"] } });
  t.after(() => live.service.stop());
  live.service.requestJobRescore(["j1", "j2"]);
  live.service.requestJobRescore(["j2", "j3"]);
  await sleep(40);
  assert.deepEqual(live.events, ["write", "write", "job:j1", "job:j2", "job:j3"]);
  const summary = live.saved[0]!;
  assert.deepEqual(summary.jobs, { rescored: 3, deferred: 0, failed: 0, remaining: 0 });
  assert.ok(live.infos.includes("Live rescore run"));
});

test("Q1: tin đang được chấm ở lối khác ⇒ xếp lại, lượt tiếp chấm; tin lỗi bỏ khỏi hàng, ghi log; tin thôi hiển thị thì bỏ", async (t) => {
  const live = buildLive({
    marks: [],
    jobResults: { j1: ["RUNNING", "DONE"], j2: ["THROW"], j3: ["NOT_VISIBLE"] },
  });
  t.after(() => live.service.stop());
  live.service.requestJobRescore(["j1", "j2", "j3"]);
  await sleep(60);
  assert.deepEqual(live.events, ["job:j1", "job:j2", "job:j3", "job:j1"]);
  assert.deepEqual(live.saved[0]!.jobs, { rescored: 0, deferred: 1, failed: 1, remaining: 1 });
  assert.deepEqual(live.saved[1]!.jobs, { rescored: 1, deferred: 0, failed: 0, remaining: 0 });
  assert.equal(live.errors.length, 1);
});

test("Q1: hết giờ giữa hàng chờ ⇒ dừng, timedOut, lượt tiếp chấm phần còn lại", async (t) => {
  const live = buildLive({ marks: [], budgetMs: 1_000, advancePerJobMs: 600 });
  t.mock.method(Date, "now", () => live.clock.now);
  t.after(() => live.service.stop());
  live.service.requestJobRescore(["j1", "j2", "j3"]);
  await sleep(60);
  const first = live.saved[0]!;
  assert.equal(first.timedOut, true);
  assert.deepEqual(first.jobs, { rescored: 2, deferred: 0, failed: 0, remaining: 1 });
  assert.deepEqual(live.events, ["job:j1", "job:j2", "job:j3"]);
  assert.equal(live.saved[1]!.jobs?.remaining, 0);
});

test("Q1: phần theo ứng viên hết giờ ⇒ chưa chấm tin, để lượt tiếp", async (t) => {
  const live = buildLive({
    marks: ["a", "b"],
    pools: { a: ["j1"], b: ["j1"] },
    batchSize: 1,
    budgetMs: 1_000,
    advancePerBatchMs: 600,
  });
  t.mock.method(Date, "now", () => live.clock.now);
  t.after(() => live.service.stop());
  live.service.requestJobRescore(["j9"]);
  await sleep(60);
  assert.equal(live.saved[0]!.jobs?.rescored, 0);
  assert.equal(live.saved[0]!.jobs?.remaining, 1);
  assert.ok(live.events.includes("job:j9"), "lượt tiếp đã chấm tin");
  assert.ok(live.events.indexOf("job:j9") > live.events.lastIndexOf("write"));
});
