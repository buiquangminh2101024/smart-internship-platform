import type { Logger } from "../../shared/logger";
import type { AutoReviewTrigger } from "../application-automation/application-automation.service";
import type { AutoOutreachRepository } from "../candidate-outreach/auto-outreach.repository";
import type { AutoOutreachTrigger } from "../candidate-outreach/auto-outreach.service";
import type { CandidateFirstScoredListener } from "../job-alerts/job-alert.service";
import type { CandidateScoreWriteResult } from "../match-scores/match-score.repository";
import type { MatchUpdatePublisher } from "./match-update-publisher";

/** Việc kéo theo gom trong một lượt chấm, gửi ở `finishRun`. */
export interface FollowUpRun {
  /** Công ty có tin tự mời vừa có người đạt ngưỡng và còn mời được. */
  outreachCompanies: Set<string>;
  /** companyId → tin vừa đổi số "Phù hợp". */
  matchUpdates: Map<string, Set<string>>;
  /** Số cặp (ứng viên, tin) vừa đạt ngưỡng. */
  reached: number;
  /** Số ứng viên đã báo sang job alert lần đầu (để ghi tóm tắt lượt). */
  firstScored: number;
  /** Số ứng viên đã gửi sang tự chuyển "Đang xem xét". */
  reviewCandidates: number;
}

export function newFollowUpRun(): FollowUpRun {
  return { outreachCompanies: new Set(), matchUpdates: new Map(), reached: 0, firstScored: 0, reviewCandidates: 0 };
}

/**
 * Việc kéo theo sau khi chấm lại theo ứng viên (0.6, AD-27 mục 6, plan bước 4). Mỗi lô đã
 * ghi xong (`afterBatch`), cuối lượt (`finishRun`):
 * - **tự mời:** cặp vừa đạt ngưỡng ở tin bật tự mời, ứng viên còn mời được ⇒ xoá dấu "hết
 *   ứng viên" của tin (một câu mỗi lô); cuối lượt gọi `autoOutreachTrigger` một lần mỗi công ty;
 * - **tự chuyển "Đang xem xét":** ứng viên có tin vừa đạt ngưỡng ⇒ `autoReviewTrigger` theo lô;
 * - **job alert lần đầu (Q3):** `newlyScored` ⇒ `candidateFirstScoredListener` theo lô;
 * - **realtime (Q5):** gom công ty → tin vừa đổi số "Phù hợp" (vào hoặc ra khỏi ngưỡng); cuối
 *   lượt gửi qua `MatchUpdatePublisher` (tối đa một sự kiện mỗi công ty mỗi 15 giây).
 *
 * Mọi lỗi chỉ ghi log: điểm đã ghi xong, lượt chấm không bị hỏng vì việc kéo theo. Các trigger
 * nhận qua awilix theo tên, resolve service lúc gọi (không có vòng phụ thuộc).
 */
export class LiveRescoreFollowUps {
  private readonly autoOutreachRepository: AutoOutreachRepository;
  private readonly autoOutreachTrigger: AutoOutreachTrigger;
  private readonly autoReviewTrigger: AutoReviewTrigger;
  private readonly candidateFirstScoredListener: CandidateFirstScoredListener;
  private readonly matchUpdatePublisher: MatchUpdatePublisher;
  private readonly logger: Logger;

  constructor({
    autoOutreachRepository,
    autoOutreachTrigger,
    autoReviewTrigger,
    candidateFirstScoredListener,
    matchUpdatePublisher,
    logger,
  }: {
    autoOutreachRepository: AutoOutreachRepository;
    autoOutreachTrigger: AutoOutreachTrigger;
    autoReviewTrigger: AutoReviewTrigger;
    candidateFirstScoredListener: CandidateFirstScoredListener;
    matchUpdatePublisher: MatchUpdatePublisher;
    logger: Logger;
  }) {
    this.autoOutreachRepository = autoOutreachRepository;
    this.autoOutreachTrigger = autoOutreachTrigger;
    this.autoReviewTrigger = autoReviewTrigger;
    this.candidateFirstScoredListener = candidateFirstScoredListener;
    this.matchUpdatePublisher = matchUpdatePublisher;
    this.logger = logger;
  }

  async afterBatch(written: Pick<CandidateScoreWriteResult, "transitions" | "newlyScored">, run: FollowUpRun): Promise<void> {
    const reached = written.transitions.filter((transition) => transition.matched);
    run.reached += reached.length;

    for (const transition of written.transitions) {
      let jobs = run.matchUpdates.get(transition.companyId);
      if (!jobs) run.matchUpdates.set(transition.companyId, (jobs = new Set()));
      jobs.add(transition.jobPostId);
    }

    const reviewCandidates = [...new Set(reached.map((transition) => transition.candidateId))];
    if (reviewCandidates.length > 0) {
      run.reviewCandidates += reviewCandidates.length;
      this.safely("auto review", () => this.autoReviewTrigger({ candidateIds: reviewCandidates }));
    }

    if (written.newlyScored.length > 0) {
      run.firstScored += written.newlyScored.length;
      this.safely("first-score job alert", () => this.candidateFirstScoredListener(written.newlyScored));
    }

    const outreachPairs = reached
      .filter((transition) => transition.autoOutreachEnabled)
      .map(({ candidateId, jobPostId }) => ({ candidateId, jobPostId }));
    if (outreachPairs.length > 0) {
      try {
        for (const companyId of await this.autoOutreachRepository.clearExhaustedForMatches(outreachPairs)) {
          run.outreachCompanies.add(companyId);
        }
      } catch (error) {
        this.logger.error("Live rescore: reopening auto outreach failed", {
          pairs: outreachPairs.length,
          error: errorMessage(error),
        });
      }
    }
  }

  finishRun(run: FollowUpRun): void {
    for (const companyId of run.outreachCompanies) {
      this.safely("auto outreach", () => this.autoOutreachTrigger(companyId));
    }
    if (run.matchUpdates.size > 0) this.safely("match update push", () => this.matchUpdatePublisher.publish(run.matchUpdates));
  }

  /** Các trigger tự bắt lỗi của lượt chúng chạy; đây chỉ chặn lỗi ném ngay lúc gọi. */
  private safely(label: string, call: () => void): void {
    try {
      call();
    } catch (error) {
      this.logger.error(`Live rescore: ${label} failed`, { error: errorMessage(error) });
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
