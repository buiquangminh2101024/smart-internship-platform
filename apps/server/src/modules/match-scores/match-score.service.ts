import type { Logger } from "../../shared/logger";
import type { CandidateOutreachService } from "../candidate-outreach/candidate-outreach.service";
import type { CandidateMatchProfileLoader } from "../job-matching/candidate-match-profile.loader";
import { CandidateProfileCache } from "./candidate-profile-cache";
import type { MatchScoreRepository, MatchScoreRow } from "./match-score.repository";
import {
  MATCH_SCORE_CHUNK_SIZE,
  MATCH_SCORE_MAX_NEW_EMBEDDINGS,
  MATCH_SCORE_REMARK_CLOCK_MARGIN_MS,
} from "./match-scores.config";

/**
 * Chấm lại một tin vừa hiển thị: gọi, không chờ, lỗi chỉ ghi log. Đăng ký trong awilix
 * dưới tên `matchScoreTrigger`, resolve MatchScoreService lúc gọi (giống
 * `autoOutreachTrigger`) ⇒ JobPostsService dùng được mà không tạo vòng phụ thuộc.
 */
export type MatchScoreTrigger = (jobPostId: string) => void;

/**
 * Gọi sau khi lối (a) chấm xong một tin (`trigger` → DONE), không gọi từ lượt đêm hay script
 * (AD-26 D7: chỉ tin mới được báo). Module job-alerts đăng ký dưới tên `jobScoredListener`.
 */
export type JobScoredListener = (jobPostId: string) => void;

/**
 * Lượt đêm báo "các ứng viên này trước chỉ có điểm rule-only, nay được chấm lại" để gửi job
 * alert lần đầu (AD-27 mục 6). Module job-alerts đăng ký dưới tên `candidateFirstScoredListener`.
 */
export type FirstScoredListener = (candidateIds: string[]) => void;

export type RescoreJobResult =
  /** RUNNING: tin đang được chấm ở lượt khác. NOT_VISIBLE: tin không còn hiển thị. */
  | { status: "SKIPPED"; reason: "RUNNING" | "NOT_VISIBLE" }
  /** Tin thôi hiển thị trong lúc chấm: không ghi điểm mới, dòng cũ đã xoá. */
  | { status: "GONE" }
  | {
      status: "DONE";
      /** Số người có chung ≥ 1 kỹ năng APPROVED với tin. */
      pool: number;
      /** Số dòng đã ghi (người có điểm). */
      rows: number;
      /** Số dòng rule-only vì chưa có embedding. */
      pendingRows: number;
      /** Ứng viên có dòng cũ rule-only với tin (từ câu xoá). */
      pendingBefore: string[];
      durationMs: number;
    };

export type RescoreAllResult =
  | { status: "LOCKED" }
  | {
      status: "DONE";
      /** Số tin cần chấm lúc bắt đầu lượt. */
      jobsTotal: number;
      jobsScored: number;
      /** Đang chấm ở lượt khác, hoặc thôi hiển thị trước hay trong lúc chấm. */
      jobsSkipped: number;
      jobsFailed: number;
      /** Chưa kịp chấm vì hết thời gian: tin cũ nhất, đêm sau được chấm trước. */
      jobsDeferred: number;
      rows: number;
      pendingRows: number;
      /** Số hồ sơ ứng viên đã nạp từ DB trong lượt. */
      profilesLoaded: number;
      /**
       * Ứng viên trước lượt chỉ có dòng rule-only, gửi sang job alert lần đầu (AD-27 mục 6).
       * Job alert tự bỏ người đã từng được báo và chỉ báo theo dòng có điểm đầy đủ.
       */
      firstScoreCandidates: number;
      durationMs: number;
    };

export interface RescoreAllOptions {
  /** Hết thời gian thì dừng trước tin kế tiếp (tin đang chấm vẫn chấm xong). */
  budgetMs: number;
  companyId?: string;
  jobPostId?: string;
  /** Gọi sau mỗi tin (script chạy tay in tiến độ). `result` null ⇒ tin lỗi. */
  onJobDone?: (jobPostId: string, result: RescoreJobResult | null) => void;
}

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Bảng điểm lưu sẵn (0.3, AD-24) — docs/06-backend/hiring-progress/PLAN.md bước 3.
 * Chấm mọi ứng viên có chung kỹ năng với tin bằng đúng bộ chấm của trang tìm ứng viên
 * (`CandidateOutreachService.scoreProfiles`), rồi thay điểm của tin trong một transaction.
 */
export class MatchScoreService {
  private readonly repository: MatchScoreRepository;
  private readonly outreachService: CandidateOutreachService;
  private readonly profileLoader: CandidateMatchProfileLoader;
  private readonly logger: Logger;
  private readonly jobScoredListener: JobScoredListener;
  private readonly requestLiveRescore: (() => void) | undefined;
  private readonly firstScoredListener: FirstScoredListener | undefined;
  /** Tin đang chấm (một process, AD-23 mục 8): lượt gọi sau cho cùng tin thì bỏ qua. */
  private readonly runningJobs = new Set<string>();
  private allRunning = false;

  constructor({
    matchScoreRepository,
    candidateOutreachService,
    candidateMatchProfileLoader,
    logger,
    jobScoredListener,
    liveRescoreDrainRequester,
    candidateFirstScoredListener,
  }: {
    matchScoreRepository: MatchScoreRepository;
    candidateOutreachService: CandidateOutreachService;
    candidateMatchProfileLoader: CandidateMatchProfileLoader;
    logger: Logger;
    jobScoredListener: JobScoredListener;
    /**
     * Q2 (AD-27): yêu cầu một lượt chấm theo ứng viên sau khi đánh dấu lại. Server truyền
     * qua awilix (module live-rescore); script chạy process riêng không truyền — dấu nằm
     * trong DB cho cron 15 phút của server.
     */
    liveRescoreDrainRequester?: () => void;
    /**
     * Job alert lần đầu sau lượt đêm (AD-27 mục 6). Server truyền qua awilix (module
     * job-alerts); script chạy process riêng không truyền nên không báo.
     */
    candidateFirstScoredListener?: FirstScoredListener;
  }) {
    this.repository = matchScoreRepository;
    this.outreachService = candidateOutreachService;
    this.profileLoader = candidateMatchProfileLoader;
    this.logger = logger;
    this.jobScoredListener = jobScoredListener;
    this.requestLiveRescore = liveRescoreDrainRequester;
    this.firstScoredListener = candidateFirstScoredListener;
  }

  /**
   * Lối kích hoạt khi tin chuyển PUBLISHED: cache mới, chỉ nạp hồ sơ của pool tin đó. Chấm
   * xong (DONE) thì báo `jobScoredListener` (job alert); SKIPPED / GONE thì không.
   */
  trigger(jobPostId: string): void {
    void this.rescoreJob(jobPostId)
      .then((result) => {
        if (result.status !== "DONE") return;
        const { pendingBefore, ...summary } = result;
        this.logger.info("Match scores rescored", { jobPostId, ...summary, pendingBefore: pendingBefore.length });
        this.jobScoredListener(jobPostId);
      })
      .catch((error: unknown) => {
        this.logger.error("Match score rescoring failed", {
          jobPostId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  /**
   * Chấm lại toàn bộ pool của một tin. Lỗi (kể cả tin không còn hồ sơ chấm) ném ra; tin
   * giữ điểm cũ và được chấm lại ở lượt sau.
   */
  async rescoreJob(jobPostId: string, cache: CandidateProfileCache = this.createCache()): Promise<RescoreJobResult> {
    if (this.runningJobs.has(jobPostId)) return { status: "SKIPPED", reason: "RUNNING" };
    this.runningJobs.add(jobPostId);
    const startedAt = Date.now();
    try {
      if (!(await this.repository.isJobVisible(jobPostId))) return { status: "SKIPPED", reason: "NOT_VISIBLE" };

      const pool = await this.repository.findScoringPool(jobPostId);
      const job = await this.outreachService.loadJobProfile(jobPostId);
      const profiles = await cache.getMany(pool);

      const rows: MatchScoreRow[] = [];
      for (let i = 0; i < profiles.length; i += MATCH_SCORE_CHUNK_SIZE) {
        if (i > 0) await yieldToEventLoop();
        const results = await this.outreachService.scoreProfiles(
          job,
          profiles.slice(i, i + MATCH_SCORE_CHUNK_SIZE),
          MATCH_SCORE_MAX_NEW_EMBEDDINGS,
        );
        for (const [candidateId, match] of results) {
          // Không chấm được (score null) ⇒ không có dòng, tức không được đếm (plan bước 1).
          if (match.score === null) continue;
          rows.push({
            candidateId,
            score: match.score,
            semanticPending: match.semantic.enabled && !match.semantic.available,
            weightsVersion: match.weightsVersion,
          });
        }
      }

      const written = await this.repository.replaceForJob(jobPostId, rows, new Date(startedAt));
      if (!written) return { status: "GONE" };
      await this.remarkChangedProfiles(jobPostId, pool, cache);
      return {
        status: "DONE",
        pool: pool.length,
        rows: rows.length,
        pendingRows: rows.filter((row) => row.semanticPending).length,
        pendingBefore: written.pendingBefore,
        durationMs: Date.now() - startedAt,
      };
    } finally {
      this.runningJobs.delete(jobPostId);
    }
  }

  /**
   * Một lượt chấm các tin đang hiển thị, tin chấm lâu nhất (hoặc chưa chấm) trước, với
   * MỘT cache hồ sơ cho cả lượt (AD-24 mục 6). Lỗi của một tin chỉ ghi log rồi đi tiếp.
   * Đang có lượt khác thì trả LOCKED.
   */
  async rescoreAll(options: RescoreAllOptions): Promise<RescoreAllResult> {
    if (this.allRunning) return { status: "LOCKED" };
    this.allRunning = true;
    const startedAt = Date.now();
    const deadline = startedAt + options.budgetMs;
    try {
      const { companyId, jobPostId } = options;
      const jobs = await this.repository.findJobsToRescore({
        ...(companyId ? { companyId } : {}),
        ...(jobPostId ? { jobPostId } : {}),
      });
      const cache = this.createCache();
      const result = {
        status: "DONE" as const,
        jobsTotal: jobs.length,
        jobsScored: 0,
        jobsSkipped: 0,
        jobsFailed: 0,
        jobsDeferred: 0,
        rows: 0,
        pendingRows: 0,
        profilesLoaded: 0,
        firstScoreCandidates: 0,
        durationMs: 0,
      };
      /** Ứng viên → số tin mà người đó có dòng cũ rule-only (bình thường rỗng). */
      const pendingBefore = new Map<string, number>();

      for (const [index, job] of jobs.entries()) {
        if (Date.now() >= deadline) {
          result.jobsDeferred = jobs.length - index;
          break;
        }
        try {
          const outcome = await this.rescoreJob(job.id, cache);
          options.onJobDone?.(job.id, outcome);
          if (outcome.status === "DONE") {
            result.jobsScored += 1;
            result.rows += outcome.rows;
            result.pendingRows += outcome.pendingRows;
            for (const id of outcome.pendingBefore) pendingBefore.set(id, (pendingBefore.get(id) ?? 0) + 1);
          } else {
            result.jobsSkipped += 1;
          }
        } catch (error) {
          result.jobsFailed += 1;
          options.onJobDone?.(job.id, null);
          this.logger.error("Match score rescoring failed", {
            jobPostId: job.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        await yieldToEventLoop();
      }

      result.profilesLoaded = cache.loaded;
      result.firstScoreCandidates = await this.notifyFirstScored(pendingBefore);
      result.durationMs = Date.now() - startedAt;
      return result;
    } finally {
      this.allRunning = false;
    }
  }

  /**
   * Q2 (AD-27): người sửa hồ sơ sau lúc cache nạp hồ sơ, đã được chấm lại theo ứng viên
   * (dấu đã xoá), vừa bị lượt này ghi đè bằng điểm từ hồ sơ cũ ⇒ đánh dấu lại rồi yêu cầu
   * một lượt chấm theo ứng viên (không có hẹn giờ cho từng người). Mốc lùi thêm một khoảng để bù lệch đồng hồ giữa
   * server và DB: đánh dấu thừa chỉ tốn một lần chấm lại. Lỗi chỉ ghi log (lượt đêm sau
   * vẫn chấm lại tin).
   */
  private async remarkChangedProfiles(jobPostId: string, pool: string[], cache: CandidateProfileCache): Promise<void> {
    const loadedAt = cache.firstLoadAt;
    if (!loadedAt || pool.length === 0) return;
    try {
      const since = new Date(loadedAt.getTime() - MATCH_SCORE_REMARK_CLOCK_MARGIN_MS);
      const remarked = await this.repository.markChangedSince(pool, since);
      if (remarked > 0) {
        this.logger.info("Match scores: re-marked candidates changed during rescoring", { jobPostId, remarked });
        // Đang có lượt thì lượt đó chạy thêm một lượt; không chạy chồng.
        this.requestLiveRescore?.();
      }
    } catch (error) {
      this.logger.error("Match scores: re-marking changed candidates failed", {
        jobPostId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Job alert lần đầu sau lượt đêm (AD-27 mục 6, D+): chỉ người có **mọi** dòng cũ với tin
   * đang hiển thị là rule-only, tức số tin có dòng cũ rule-only ≥ số dòng hiện có. Người chỉ
   * có dòng rule-only ở vài tin (ví dụ tin thiếu vector) không phải "lần đầu" nên không báo.
   * Thêm một câu đếm, chỉ khi lượt có dòng cũ rule-only. Lỗi chỉ ghi log.
   */
  private async notifyFirstScored(pendingBefore: Map<string, number>): Promise<number> {
    if (!this.firstScoredListener || pendingBefore.size === 0) return 0;
    try {
      const rowsNow = await this.repository.countVisibleRows([...pendingBefore.keys()]);
      const candidateIds = [...pendingBefore]
        .filter(([candidateId, pendingJobs]) => pendingJobs >= (rowsNow.get(candidateId) ?? 0))
        .map(([candidateId]) => candidateId);
      if (candidateIds.length > 0) this.firstScoredListener(candidateIds);
      return candidateIds.length;
    } catch (error) {
      this.logger.error("Match scores: first-score job alert after nightly run failed", {
        candidates: pendingBefore.size,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /** Public cho lượt việc sau duyệt hàng loạt (AD-29 bước 8): một cache cho cả lượt, như `rescoreAll`. */
  createCache(): CandidateProfileCache {
    return new CandidateProfileCache(this.profileLoader);
  }
}
