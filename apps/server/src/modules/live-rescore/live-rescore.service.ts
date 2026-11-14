import type { Logger } from "../../shared/logger";
import type { CandidateOutreachService } from "../candidate-outreach/candidate-outreach.service";
import type { CandidateMatchProfileLoader } from "../job-matching/candidate-match-profile.loader";
import type {
  CandidateScoreRow,
  CandidateScoreWriteResult,
  MatchScoreRepository,
} from "../match-scores/match-score.repository";
import type { MatchScoreService } from "../match-scores/match-score.service";
import type { JobProfileCache } from "./job-profile-cache";
import { newFollowUpRun, type FollowUpRun, type LiveRescoreFollowUps } from "./live-rescore-follow-ups";
import {
  LIVE_RESCORE_BATCH_SIZE,
  LIVE_RESCORE_CONTINUE_DELAY_MS,
  LIVE_RESCORE_MAX_NEW_EMBEDDINGS,
  LIVE_RESCORE_RUN_BUDGET_MS,
} from "./live-rescore.config";
import type { LiveRescoreRepository } from "./live-rescore.repository";
import type { LiveRescoreRunStore, LiveRescoreRunSummary } from "./live-rescore-run-store";

export type LiveRescoreTrigger = LiveRescoreRunSummary["trigger"];

export type LiveRescoreDrainResult =
  /** Đang có lượt khác: lượt đó chạy thêm một lượt khi xong. */
  | { status: "BUSY" }
  /** Lỗi ngoài từng lô (vd. không đọc được danh sách có dấu): dấu còn nguyên, lượt sau làm lại. */
  | { status: "FAILED" }
  | ({ status: "DONE" } & LiveRescoreRunSummary);

export interface LiveRescoreServiceOptions {
  budgetMs?: number;
  batchSize?: number;
  maxNewEmbeddings?: number;
  continueDelayMs?: number;
}

interface BatchOutcome {
  candidates: number;
  rows: number;
  marksCleared: number;
  kept: number;
  embedded: number;
  written: Pick<CandidateScoreWriteResult, "transitions" | "newlyScored">;
}

/** Phần của MatchScoreService mà hàng chờ theo tin (Q1) dùng. */
type JobRescorer = Pick<MatchScoreService, "rescoreJob">;

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Lượt chấm lại theo ứng viên (0.6, AD-27 mục 4–5; bước 3 của
 * docs/06-backend/live-rescore/PLAN.md). Lấy người có dấu, dấu cũ nhất trước, chấm theo lô
 * ~50 người với mọi tin đang hiển thị có chung kỹ năng (cùng bộ chấm với bảng điểm), ghi
 * bảng và xoá dấu trong một transaction mỗi lô. Mỗi lô ghi xong thì chạy việc kéo theo
 * (`LiveRescoreFollowUps`, bước 4); phần gom theo công ty gửi cuối lượt.
 *
 * Danh mục đổi (Q1, bước 5): tin gắn mục đó nằm trong một hàng chờ trong bộ nhớ, chấm lại
 * theo tin (`MatchScoreService.rescoreJob`, không sinh job alert) sau phần theo ứng viên của
 * lượt, trong cùng giới hạn thời gian. Khởi động lại server thì mất hàng chờ; lượt đêm sửa.
 *
 * Chung process với API (D5): một lượt mỗi lúc, nhường event loop giữa hai lô, giới hạn
 * thời gian và số vector mới mỗi lượt. Model embedding chạy trong worker (Q7).
 */
export class LiveRescoreService {
  private readonly repository: LiveRescoreRepository;
  private readonly matchScoreRepository: MatchScoreRepository;
  private readonly matchScoreService: JobRescorer;
  private readonly outreachService: CandidateOutreachService;
  private readonly profileLoader: CandidateMatchProfileLoader;
  private readonly jobProfileCache: JobProfileCache;
  private readonly runStore: LiveRescoreRunStore;
  private readonly followUps: LiveRescoreFollowUps;
  private readonly logger: Logger;
  private readonly budgetMs: number;
  private readonly batchSize: number;
  private readonly maxNewEmbeddings: number;
  private readonly continueDelayMs: number;
  private running = false;
  private rerunRequested = false;
  private continueTimer: NodeJS.Timeout | null = null;
  /** Hàng chờ chấm lại theo tin (Q1), theo thứ tự xếp vào. */
  private readonly pendingJobs = new Set<string>();

  constructor({
    liveRescoreRepository,
    matchScoreRepository,
    matchScoreService,
    candidateOutreachService,
    candidateMatchProfileLoader,
    jobProfileCache,
    liveRescoreRunStore,
    liveRescoreFollowUps,
    logger,
    liveRescoreServiceOptions,
  }: {
    liveRescoreRepository: LiveRescoreRepository;
    matchScoreRepository: MatchScoreRepository;
    matchScoreService: JobRescorer;
    candidateOutreachService: CandidateOutreachService;
    candidateMatchProfileLoader: CandidateMatchProfileLoader;
    jobProfileCache: JobProfileCache;
    liveRescoreRunStore: LiveRescoreRunStore;
    liveRescoreFollowUps: LiveRescoreFollowUps;
    logger: Logger;
    liveRescoreServiceOptions?: LiveRescoreServiceOptions;
  }) {
    this.repository = liveRescoreRepository;
    this.matchScoreRepository = matchScoreRepository;
    this.matchScoreService = matchScoreService;
    this.outreachService = candidateOutreachService;
    this.profileLoader = candidateMatchProfileLoader;
    this.jobProfileCache = jobProfileCache;
    this.runStore = liveRescoreRunStore;
    this.followUps = liveRescoreFollowUps;
    this.logger = logger;
    this.budgetMs = liveRescoreServiceOptions?.budgetMs ?? LIVE_RESCORE_RUN_BUDGET_MS;
    this.batchSize = liveRescoreServiceOptions?.batchSize ?? LIVE_RESCORE_BATCH_SIZE;
    this.maxNewEmbeddings = liveRescoreServiceOptions?.maxNewEmbeddings ?? LIVE_RESCORE_MAX_NEW_EMBEDDINGS;
    this.continueDelayMs = liveRescoreServiceOptions?.continueDelayMs ?? LIVE_RESCORE_CONTINUE_DELAY_MS;
  }

  /** Lối của hẹn giờ và của danh mục đổi (`liveRescoreDrainRequester`): gọi, không chờ. */
  requestDrain(): void {
    void this.drain("request");
  }

  /**
   * Danh mục đổi (Q1, `liveRescoreJobRequester`): xếp tin vào hàng chờ theo tin rồi yêu cầu
   * một lượt. Đang có lượt thì lượt đó (hoặc lượt chạy tiếp) lấy tin trong hàng.
   */
  requestJobRescore(jobPostIds: string[]): void {
    for (const id of jobPostIds) this.pendingJobs.add(id);
    this.requestDrain();
  }

  /** Huỷ lượt chạy tiếp đã hẹn (test, dừng server). Lượt đang chạy vẫn chạy xong. */
  stop(): void {
    if (this.continueTimer) clearTimeout(this.continueTimer);
    this.continueTimer = null;
  }

  /**
   * Một lượt. Đang có lượt khác thì chỉ ghi nhận "chạy thêm lượt nữa" rồi trả BUSY (không
   * chạy chồng). Lượt dừng vì hết giờ mà còn dấu, hoặc có yêu cầu trong lúc chạy, thì hẹn
   * lượt tiếp sau `continueDelayMs`. Không ném lỗi.
   */
  async drain(trigger: LiveRescoreTrigger = "request"): Promise<LiveRescoreDrainResult> {
    if (this.running) {
      this.rerunRequested = true;
      return { status: "BUSY" };
    }
    this.running = true;
    this.rerunRequested = false;

    let summary: LiveRescoreRunSummary | null = null;
    try {
      summary = await this.runOnce(trigger);
    } catch (error) {
      this.logger.error("Live rescore run failed", { error: errorMessage(error) });
    } finally {
      this.running = false;
    }

    if (summary) {
      if (summary.candidates > 0 || summary.kept > 0 || (summary.jobs?.rescored ?? 0) > 0) this.logger.info("Live rescore run", { ...summary });
      try {
        await this.runStore.saveLastRun(summary);
      } catch (error) {
        this.logger.warn("Live rescore: saving run summary failed", { error: errorMessage(error) });
      }
    }

    const workLeft = (summary?.remaining ?? 0) > 0 || this.pendingJobs.size > 0;
    if (this.rerunRequested || (summary?.timedOut && workLeft)) this.scheduleContinue();
    return summary ? { status: "DONE", ...summary } : { status: "FAILED" };
  }

  private scheduleContinue(): void {
    if (this.continueTimer) return;
    this.continueTimer = setTimeout(() => {
      this.continueTimer = null;
      this.requestDrain();
    }, this.continueDelayMs);
    this.continueTimer.unref();
  }

  private async runOnce(trigger: LiveRescoreTrigger): Promise<LiveRescoreRunSummary> {
    const startedAt = Date.now();
    const deadline = startedAt + this.budgetMs;
    const processed = new Set<string>();
    let embeddingBudget = this.maxNewEmbeddings;
    const totals = { batches: 0, candidates: 0, rows: 0, marksCleared: 0, kept: 0, embedded: 0 };
    let timedOut = false;
    const followUps: FollowUpRun = newFollowUpRun();
    const jobs = { rescored: 0, deferred: 0, failed: 0 };

    try {
      for (;;) {
        if (Date.now() >= deadline) {
          timedOut = true;
          break;
        }
        const batch = await this.repository.findMarkedBatch(this.batchSize, processed);
        if (batch.ids.length === 0) break;
        for (const id of batch.ids) processed.add(id);
        totals.batches += 1;

        let outcome: BatchOutcome | null = null;
        try {
          outcome = await this.rescoreBatch(batch.ids, batch.startedAt, embeddingBudget);
        } catch (error) {
          // Cả lô giữ dấu (transaction chưa commit); không chọn lại trong lượt này.
          totals.kept += batch.ids.length;
          this.logger.error("Live rescore batch failed", { candidates: batch.ids.length, error: errorMessage(error) });
        }
        if (outcome) {
          embeddingBudget = Math.max(0, embeddingBudget - outcome.embedded);
          totals.candidates += outcome.candidates;
          totals.rows += outcome.rows;
          totals.marksCleared += outcome.marksCleared;
          totals.kept += outcome.kept;
          totals.embedded += outcome.embedded;
          // Lô đã commit: việc kéo theo tự bắt lỗi, không làm lô thành lỗi.
          await this.followUps.afterBatch(outcome.written, followUps);
        }
        await yieldToEventLoop();
      }
      // Q1: sau phần theo ứng viên, nếu còn giờ.
      if (!timedOut) timedOut = await this.rescoreQueuedJobs(deadline, jobs);
    } finally {
      // Cả khi lượt hỏng giữa chừng: các lô đã ghi vẫn được kích hoạt tự mời / realtime.
      this.followUps.finishRun(followUps);
    }

    return {
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      trigger,
      ...totals,
      timedOut,
      remaining: await this.repository.countMarked(),
      jobs: { ...jobs, remaining: this.pendingJobs.size },
      followUps: {
        reached: followUps.reached,
        outreachCompanies: followUps.outreachCompanies.size,
        reviewCandidates: followUps.reviewCandidates,
        firstScored: followUps.firstScored,
        matchUpdateCompanies: followUps.matchUpdates.size,
      },
    };
  }

  /**
   * Hàng chờ theo tin (Q1): lần lượt từng tin, nhường event loop giữa hai tin. Tin đang được
   * chấm ở lối khác (lượt đêm, lối a) có thể dùng hồ sơ nạp trước lúc danh mục đổi, nên xếp
   * lại cho lượt sau. Tin lỗi chỉ ghi log và bỏ khỏi hàng (lượt đêm sửa). Trả true nếu hết giờ
   * khi hàng còn tin.
   */
  private async rescoreQueuedJobs(
    deadline: number,
    jobs: { rescored: number; deferred: number; failed: number },
  ): Promise<boolean> {
    const deferred: string[] = [];
    try {
      for (const jobPostId of [...this.pendingJobs]) {
        if (Date.now() >= deadline) return true;
        this.pendingJobs.delete(jobPostId);
        try {
          const result = await this.matchScoreService.rescoreJob(jobPostId);
          if (result.status === "DONE") jobs.rescored += 1;
          else if (result.status === "SKIPPED" && result.reason === "RUNNING") {
            deferred.push(jobPostId);
            jobs.deferred += 1;
          }
        } catch (error) {
          jobs.failed += 1;
          this.logger.error("Live rescore: catalog job rescore failed", { jobPostId, error: errorMessage(error) });
        }
        await yieldToEventLoop();
      }
      return false;
    } finally {
      for (const id of deferred) this.pendingJobs.add(id);
      if (deferred.length > 0) this.rerunRequested = true;
    }
  }

  /**
   * Một lô: nạp hồ sơ, pool ngược, hồ sơ tin (cache), chấm, ghi bảng kèm xoá dấu. Người vượt
   * giới hạn embedding vẫn được ghi điểm rule-only nhưng giữ dấu. Ứng viên không còn (đã xoá)
   * thì bỏ qua.
   */
  private async rescoreBatch(candidateIds: string[], batchStartedAt: Date, maxNewEmbeddings: number): Promise<BatchOutcome> {
    const profiles = await this.profileLoader.loadMany(candidateIds);
    const pools = await this.repository.findJobPools([...profiles.keys()]);
    const jobs = await this.jobProfileCache.getMany([...new Set([...pools.values()].flat())]);

    const entries = [...profiles.values()].map((profile) => ({
      profile,
      jobs: (pools.get(profile.candidateId) ?? []).flatMap((jobPostId) => jobs.get(jobPostId) ?? []),
    }));
    const scored = await this.outreachService.scoreCandidatesAgainstJobs(entries, maxNewEmbeddings);

    // Mọi hồ sơ nạp được đều có khoá (kể cả không còn tin nào): dòng cũ của họ bị xoá.
    const rowsByCandidate = new Map<string, CandidateScoreRow[]>();
    for (const { profile } of entries) {
      const rows: CandidateScoreRow[] = [];
      for (const [jobPostId, match] of scored.results.get(profile.candidateId) ?? []) {
        // Không chấm được (score null) ⇒ không có dòng, như lượt theo tin.
        if (match.score === null) continue;
        rows.push({
          jobPostId,
          score: match.score,
          semanticPending: match.semantic.enabled && !match.semantic.available,
          weightsVersion: match.weightsVersion,
        });
      }
      rowsByCandidate.set(profile.candidateId, rows);
    }

    const clearMarksFor = [...profiles.keys()].filter((id) => !scored.deferredCandidates.has(id));
    const written = await this.matchScoreRepository.replaceForCandidates({
      rowsByCandidate,
      clearMarksFor,
      batchStartedAt,
      scoredAt: new Date(),
    });
    return {
      candidates: profiles.size,
      rows: written.rows,
      marksCleared: written.marksCleared,
      kept: scored.deferredCandidates.size,
      embedded: scored.embedded,
      written: { transitions: written.transitions, newlyScored: written.newlyScored },
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
