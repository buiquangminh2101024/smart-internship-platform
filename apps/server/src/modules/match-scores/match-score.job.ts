import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import type { MatchScoreRunStore } from "./match-score-run-store";
import type { MatchScoreRepository } from "./match-score.repository";
import type { MatchScoreService, RescoreAllOptions, RescoreAllResult } from "./match-score.service";
import { MATCH_SCORE_NIGHTLY_BUDGET_MS } from "./match-scores.config";

export interface MatchScoreJobDeps {
  matchScoreRepository: MatchScoreRepository;
  matchScoreService: MatchScoreService;
  logger: Logger;
}

export interface MatchScoreCronDeps extends MatchScoreJobDeps {
  /** Lưu lượt đêm gần nhất cho thẻ "Hệ thống tự động" của Admin (0.6 bước 8). */
  matchScoreRunStore: MatchScoreRunStore;
}

export interface MatchScoreNightlyResult {
  /** Dòng của tin không còn hiển thị đã xoá, và số tin được đặt lại `matchScoresAt = null`. */
  cleaned: { deletedRows: number; resetJobs: number };
  rescore: RescoreAllResult;
}

/**
 * Một lượt đêm của bảng điểm lưu sẵn (AD-24, plan bước 4): xoá dòng của tin hết hiển
 * thị, rồi chấm lại mọi tin đang hiển thị với một cache hồ sơ cho cả lượt. Dùng chung
 * cho cron và script `rescore-match-scores`. Không chạy chồng: `rescoreAll` trả LOCKED
 * khi đang có lượt khác trong cùng process.
 */
export async function runMatchScoreNightly(
  deps: MatchScoreJobDeps,
  options: Pick<RescoreAllOptions, "budgetMs" | "onJobDone"> = { budgetMs: MATCH_SCORE_NIGHTLY_BUDGET_MS },
): Promise<MatchScoreNightlyResult> {
  const cleaned = await deps.matchScoreRepository.deleteForInactiveJobs();
  const rescore = await deps.matchScoreService.rescoreAll(options);
  return { cleaned, rescore };
}

/** 03:30 giờ Việt Nam, sau job chuyển nhật ký sang lưu trữ lúc 03:00. */
export function startMatchScoreJob(deps: MatchScoreCronDeps): void {
  const run = async () => {
    try {
      const { cleaned, rescore } = await runMatchScoreNightly(deps);
      if (rescore.status === "LOCKED") {
        deps.logger.warn("Match score nightly run skipped: another run is in progress", cleaned);
        return;
      }
      deps.logger.info("Match score nightly run", { ...cleaned, ...rescore });
      await deps.matchScoreRunStore
        .saveNightly({
          finishedAt: new Date().toISOString(),
          durationMs: rescore.durationMs,
          jobsTotal: rescore.jobsTotal,
          jobsScored: rescore.jobsScored,
          jobsFailed: rescore.jobsFailed,
          jobsDeferred: rescore.jobsDeferred,
        })
        .catch((error: unknown) => {
          // Chỉ là số liệu cho thẻ Admin; lượt đêm đã xong.
          deps.logger.warn("Match score nightly summary not saved", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
    } catch (error) {
      deps.logger.error("Match score nightly run failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  cron.schedule("30 3 * * *", () => void run(), { timezone: "Asia/Ho_Chi_Minh" });
}
