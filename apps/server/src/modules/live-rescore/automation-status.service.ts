import type { AdminAutomationStatus } from "@sip/shared-types";
import type { Logger } from "../../shared/logger";
import type { MatchScoreRunStore } from "../match-scores/match-score-run-store";
import type { LiveRescoreRepository } from "./live-rescore.repository";
import type { LiveRescoreRunStore } from "./live-rescore-run-store";

/**
 * Thẻ "Hệ thống tự động" của Admin (0.6 bước 8, D12, AD-27 mục 10): số ứng viên chờ chấm
 * lại và dấu cũ nhất (DB), lượt chấm theo ứng viên và lượt đêm gần nhất (Redis, Q6), việc
 * hệ thống tự làm hôm nay (DB). Chỉ đọc.
 *
 * Redis lỗi thì phần lượt gần nhất trả null, phần đọc DB vẫn trả: thẻ dùng để phát hiện sự
 * cố, nên không được hỏng theo đúng thứ đang hỏng.
 */
export class AutomationStatusService {
  private readonly repository: LiveRescoreRepository;
  private readonly liveRunStore: LiveRescoreRunStore;
  private readonly nightlyRunStore: MatchScoreRunStore;
  private readonly logger: Logger;

  constructor({
    liveRescoreRepository,
    liveRescoreRunStore,
    matchScoreRunStore,
    logger,
  }: {
    liveRescoreRepository: LiveRescoreRepository;
    liveRescoreRunStore: LiveRescoreRunStore;
    matchScoreRunStore: MatchScoreRunStore;
    logger: Logger;
  }) {
    this.repository = liveRescoreRepository;
    this.liveRunStore = liveRescoreRunStore;
    this.nightlyRunStore = matchScoreRunStore;
    this.logger = logger;
  }

  async getStatus(): Promise<AdminAutomationStatus> {
    const [marked, today, lastRun, nightly] = await Promise.all([
      this.repository.markedSummary(),
      this.repository.countAutomationToday(),
      this.readRedis("live rescore last run", () => this.liveRunStore.getLastRun()),
      this.readRedis("match score nightly run", () => this.nightlyRunStore.getNightly()),
    ]);
    return {
      rescore: {
        pending: marked.pending,
        oldestRequestedAt: marked.oldestRequestedAt?.toISOString() ?? null,
        lastRun: lastRun
          ? {
              at: lastRun.finishedAt,
              candidates: lastRun.candidates,
              durationMs: lastRun.durationMs,
              remaining: lastRun.remaining,
              timedOut: lastRun.timedOut,
            }
          : null,
      },
      today,
      nightly: nightly
        ? { lastRunAt: nightly.finishedAt, jobsScored: nightly.jobsScored, jobsDeferred: nightly.jobsDeferred }
        : null,
    };
  }

  private async readRedis<T>(what: string, read: () => Promise<T | null>): Promise<T | null> {
    try {
      return await read();
    } catch (error) {
      this.logger.warn(`Automation status: cannot read ${what}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
