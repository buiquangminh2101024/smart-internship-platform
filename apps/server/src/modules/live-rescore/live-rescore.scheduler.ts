import type { Logger } from "../../shared/logger";
import { LIVE_RESCORE_DEBOUNCE_MS, LIVE_RESCORE_MAX_TIMERS } from "./live-rescore.config";

/**
 * Yêu cầu một lượt chấm theo ứng viên. Lượt chấm (bước 3) tự gom mọi người đang có dấu
 * và không chạy chồng, nên gọi nhiều lần liên tiếp là an toàn.
 */
export type LiveRescoreDrainRequester = () => void;

/**
 * Xếp các tin vào hàng chờ chấm lại theo tin của lượt chấm (Q1, danh mục đổi) rồi yêu cầu
 * một lượt. Tin trùng chỉ chấm một lần.
 */
export type LiveRescoreJobRequester = (jobPostIds: string[]) => void;

export interface LiveRescoreSchedulerOptions {
  debounceMs?: number;
  maxTimers?: number;
}

/**
 * Hẹn giờ chờ người dùng ngừng sửa (AD-27 mục 3, D3). Mỗi ứng viên có tối đa một hẹn
 * giờ; sửa tiếp thì dời hẹn giờ, nên một loạt sửa liên tiếp chỉ ra một yêu cầu chấm.
 *
 * Hẹn giờ chỉ nằm trong bộ nhớ của process: khởi động lại server thì mất, nhưng dấu vẫn
 * còn trong DB và cron 15 phút chấm sau. Vì vậy hẹn giờ được `unref()`, không giữ process
 * sống khi tắt server.
 */
export class LiveRescoreScheduler {
  private readonly requestDrain: LiveRescoreDrainRequester;
  private readonly logger: Logger;
  private readonly debounceMs: number;
  private readonly maxTimers: number;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private capWarned = false;

  constructor({
    liveRescoreDrainRequester,
    logger,
    liveRescoreSchedulerOptions,
  }: {
    liveRescoreDrainRequester: LiveRescoreDrainRequester;
    logger: Logger;
    liveRescoreSchedulerOptions?: LiveRescoreSchedulerOptions;
  }) {
    this.requestDrain = liveRescoreDrainRequester;
    this.logger = logger;
    this.debounceMs = liveRescoreSchedulerOptions?.debounceMs ?? LIVE_RESCORE_DEBOUNCE_MS;
    this.maxTimers = liveRescoreSchedulerOptions?.maxTimers ?? LIVE_RESCORE_MAX_TIMERS;
  }

  /** Đặt (hoặc dời) hẹn giờ của ứng viên. */
  touch(candidateId: string): void {
    const existing = this.timers.get(candidateId);
    if (existing) {
      clearTimeout(existing);
    } else if (this.timers.size >= this.maxTimers) {
      // Dấu đã nằm trong DB: cron chấm sau, chỉ chậm hơn. Cảnh báo một lần mỗi đợt tràn.
      if (!this.capWarned) {
        this.capWarned = true;
        this.logger.warn("Live rescore: quá trần hẹn giờ, phần dư chờ cron", { maxTimers: this.maxTimers });
      }
      return;
    }

    const timer = setTimeout(() => this.fire(candidateId), this.debounceMs);
    timer.unref();
    this.timers.set(candidateId, timer);
  }

  /** Số hẹn giờ đang chờ (cho test và số liệu). */
  get pendingCount(): number {
    return this.timers.size;
  }

  /** Huỷ mọi hẹn giờ (khi dừng server). Dấu vẫn còn trong DB. */
  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.capWarned = false;
  }

  private fire(candidateId: string): void {
    this.timers.delete(candidateId);
    if (this.timers.size < this.maxTimers) this.capWarned = false;
    try {
      this.requestDrain();
    } catch (error) {
      this.logger.error("Live rescore: yêu cầu lượt chấm lỗi", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
