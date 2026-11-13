import type { Logger } from "../../shared/logger";
import type { CandidateOutreachService } from "../candidate-outreach/candidate-outreach.service";
import type { CandidateMatchProfileLoader } from "../job-matching/candidate-match-profile.loader";
import { CandidateProfileCache } from "./candidate-profile-cache";
import type { MatchScoreRepository, MatchScoreRow } from "./match-score.repository";
import { MATCH_SCORE_CHUNK_SIZE, MATCH_SCORE_MAX_NEW_EMBEDDINGS } from "./match-scores.config";

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
  /** Tin đang chấm (một process, AD-23 mục 8): lượt gọi sau cho cùng tin thì bỏ qua. */
  private readonly runningJobs = new Set<string>();
  private allRunning = false;

  constructor({
    matchScoreRepository,
    candidateOutreachService,
    candidateMatchProfileLoader,
    logger,
    jobScoredListener,
  }: {
    matchScoreRepository: MatchScoreRepository;
    candidateOutreachService: CandidateOutreachService;
    candidateMatchProfileLoader: CandidateMatchProfileLoader;
    logger: Logger;
    jobScoredListener: JobScoredListener;
  }) {
    this.repository = matchScoreRepository;
    this.outreachService = candidateOutreachService;
    this.profileLoader = candidateMatchProfileLoader;
    this.logger = logger;
    this.jobScoredListener = jobScoredListener;
  }

  /**
   * Lối kích hoạt khi tin chuyển PUBLISHED: cache mới, chỉ nạp hồ sơ của pool tin đó. Chấm
   * xong (DONE) thì báo `jobScoredListener` (job alert); SKIPPED / GONE thì không.
   */
  trigger(jobPostId: string): void {
    void this.rescoreJob(jobPostId)
      .then((result) => {
        if (result.status !== "DONE") return;
        this.logger.info("Match scores rescored", { jobPostId, ...result });
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
      return {
        status: "DONE",
        pool: pool.length,
        rows: rows.length,
        pendingRows: rows.filter((row) => row.semanticPending).length,
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
        durationMs: 0,
      };

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
      result.durationMs = Date.now() - startedAt;
      return result;
    } finally {
      this.allRunning = false;
    }
  }

  private createCache(): CandidateProfileCache {
    return new CandidateProfileCache(this.profileLoader);
  }
}
