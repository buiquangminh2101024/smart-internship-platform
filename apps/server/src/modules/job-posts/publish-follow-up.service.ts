// AD-29 bước 8 — việc kéo theo sau khi duyệt hàng loạt: chấm bảng điểm rồi tự mời, chạy lần lượt
// (docs/06-backend/job-quality-moderation/PLAN.md, bước 8).
import type { Logger } from "../../shared/logger";
import type { AutoOutreachTrigger } from "../candidate-outreach/auto-outreach.service";
import type { CandidateProfileCache } from "../match-scores/candidate-profile-cache";
import type { JobScoredListener, RescoreJobResult } from "../match-scores/match-score.service";

/** Một tin vừa chuyển PUBLISHED trong lô duyệt hàng loạt. */
export interface PublishFollowUpItem {
  jobPostId: string;
  companyId: string;
  /** Tin bật tự mời ⇒ sau khi chấm xong các tin của công ty thì gọi tự mời (như duyệt một tin). */
  autoOutreachEnabled: boolean;
}

/** Tóm tắt một lượt (ghi log; test đọc qua `onRunDone`). */
export interface PublishFollowUpRunSummary {
  jobs: number;
  companies: number;
  scored: number;
  /** SKIPPED / GONE: tin đang chấm ở lượt khác hoặc không còn hiển thị. */
  skipped: number;
  failed: number;
  outreachCompanies: number;
  durationMs: number;
}

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Hàng đợi trong bộ nhớ, **một lượt tại một thời điểm** (service singleton). Duyệt một tin vẫn
 * gọi `matchScoreTrigger` + `autoOutreachTrigger` như cũ; chỉ lô hàng loạt đi qua đây, vì 50 tin
 * gọi trigger cùng lúc là 50 lượt chấm bảng điểm chạy chồng nhau.
 *
 * Mỗi lượt lấy hết tin đang chờ, nhóm theo công ty. Mỗi công ty: chấm bảng điểm từng tin lần
 * lượt (`rescoreJob`; DONE ⇒ `jobScoredListener` cho job alert, như `MatchScoreService.trigger`),
 * rồi gọi `autoOutreachTrigger` **một lần** nếu có tin bật tự mời: tự mời đọc bảng điểm (AD-27),
 * nên phải chấm xong rồi mới mời. Tin tới trong lúc đang chạy thì vào lượt kế tiếp.
 *
 * Mỗi lượt dùng **một** cache hồ sơ ứng viên cho mọi tin (như lượt đêm, AD-24 mục 6): pool các
 * tin chồng nhau nên không nạp lại hồ sơ. Đo Neon 20 tin: 41 s ⇒ 29 s. Hồ sơ sửa trong lúc chạy
 * được `rescoreJob` đánh dấu lại theo mốc nạp đầu tiên của cache (Q2, AD-27).
 *
 * Lỗi một tin chỉ ghi log, chạy tiếp tin sau. Server khởi động lại giữa chừng thì mất hàng đợi;
 * lượt chấm đêm (AD-24) và cron tự mời 15 phút là lưới an toàn.
 *
 * Các hàm phụ thuộc resolve lúc gọi (đăng ký ở job-posts.routes.ts) ⇒ không tạo vòng DI với
 * match-scores / candidate-outreach / job-alerts.
 */
export class PublishFollowUpService {
  private readonly rescoreJob: (jobPostId: string, cache: CandidateProfileCache) => Promise<RescoreJobResult>;
  private readonly createProfileCache: () => CandidateProfileCache;
  private readonly jobScoredListener: JobScoredListener;
  private readonly autoOutreachTrigger: AutoOutreachTrigger;
  private readonly logger: Logger;
  private readonly onRunDone: ((summary: PublishFollowUpRunSummary) => void) | undefined;
  private readonly queue: PublishFollowUpItem[] = [];
  private running = false;
  private current: Promise<void> = Promise.resolve();

  constructor(deps: {
    rescoreJob: (jobPostId: string, cache: CandidateProfileCache) => Promise<RescoreJobResult>;
    /** Gọi một lần mỗi lượt. */
    createProfileCache: () => CandidateProfileCache;
    jobScoredListener: JobScoredListener;
    autoOutreachTrigger: AutoOutreachTrigger;
    logger: Logger;
    onRunDone?: (summary: PublishFollowUpRunSummary) => void;
  }) {
    this.rescoreJob = deps.rescoreJob;
    this.createProfileCache = deps.createProfileCache;
    this.jobScoredListener = deps.jobScoredListener;
    this.autoOutreachTrigger = deps.autoOutreachTrigger;
    this.logger = deps.logger;
    this.onRunDone = deps.onRunDone;
  }

  /** Gọi, không chờ. */
  enqueue(items: PublishFollowUpItem[]): void {
    if (items.length === 0) return;
    this.queue.push(...items);
    if (this.running) return;
    this.running = true;
    this.current = this.drain();
  }

  /** Chờ tới khi hàng đợi rỗng (test, script). */
  whenIdle(): Promise<void> {
    return this.current;
  }

  private async drain(): Promise<void> {
    try {
      // Kiểm `queue.length` rồi vào `finally` không qua `await` nào ⇒ tin vừa enqueue không bị bỏ sót.
      while (this.queue.length > 0) {
        await this.runOnce(this.queue.splice(0));
      }
    } finally {
      this.running = false;
    }
  }

  private async runOnce(items: PublishFollowUpItem[]): Promise<void> {
    const startedAt = Date.now();
    // companyId → (jobPostId → tự mời); Map giữ thứ tự tin được duyệt, gộp tin trùng.
    const byCompany = new Map<string, Map<string, boolean>>();
    for (const item of items) {
      let jobs = byCompany.get(item.companyId);
      if (!jobs) byCompany.set(item.companyId, (jobs = new Map()));
      jobs.set(item.jobPostId, (jobs.get(item.jobPostId) ?? false) || item.autoOutreachEnabled);
    }

    const summary: PublishFollowUpRunSummary = {
      jobs: 0,
      companies: byCompany.size,
      scored: 0,
      skipped: 0,
      failed: 0,
      outreachCompanies: 0,
      durationMs: 0,
    };
    const cache = this.createProfileCache();
    for (const [companyId, jobs] of byCompany) {
      for (const jobPostId of jobs.keys()) {
        if (summary.jobs > 0) await yieldToEventLoop();
        summary.jobs += 1;
        try {
          const result = await this.rescoreJob(jobPostId, cache);
          if (result.status === "DONE") {
            summary.scored += 1;
            this.safely("job alert", { jobPostId }, () => this.jobScoredListener(jobPostId));
          } else {
            summary.skipped += 1;
          }
        } catch (error) {
          summary.failed += 1;
          this.logger.error("Publish follow-up: match score rescoring failed", { jobPostId, error: errorMessage(error) });
        }
      }
      if ([...jobs.values()].some(Boolean)) {
        summary.outreachCompanies += 1;
        this.safely("auto outreach", { companyId }, () => this.autoOutreachTrigger(companyId));
      }
    }

    summary.durationMs = Date.now() - startedAt;
    this.logger.info("Publish follow-ups done", { ...summary });
    this.onRunDone?.(summary);
  }

  /** Các trigger tự bắt lỗi của lượt chúng chạy; đây chỉ chặn lỗi ném ngay lúc gọi. */
  private safely(label: string, context: Record<string, string>, call: () => void): void {
    try {
      call();
    } catch (error) {
      this.logger.error(`Publish follow-up: ${label} failed`, { ...context, error: errorMessage(error) });
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
