import type { Logger } from "../../shared/logger";
import type { RealtimeNotifier } from "../../shared/ports/RealtimeNotifier";
import type { EmployerRepository } from "../employers/employer.repository";
import { LIVE_RESCORE_PUSH_THROTTLE_MS } from "./live-rescore.config";

export interface MatchUpdatePublisherOptions {
  throttleMs?: number;
  now?: () => number;
}

/**
 * Realtime cho nhà tuyển dụng (0.6, AD-27 mục 6, Q5): gửi `match-scores:updated` cho mọi
 * employer của công ty có tin vừa đổi số "Phù hợp". Tối đa một sự kiện mỗi công ty mỗi
 * `LIVE_RESCORE_PUSH_THROTTLE_MS`; tin đổi trong lúc chờ gộp vào sự kiện kế tiếp (hẹn giờ).
 * Gửi là best-effort: lỗi chỉ ghi log, không ghi bảng `notifications`.
 *
 * Trạng thái nằm trong bộ nhớ của process (như hẹn giờ chờ ngừng sửa): singleton.
 */
export class MatchUpdatePublisher {
  private readonly realtimeNotifier: RealtimeNotifier;
  private readonly employerRepository: EmployerRepository;
  private readonly logger: Logger;
  private readonly throttleMs: number;
  private readonly now: () => number;
  /** Tin đang chờ gửi theo công ty. */
  private readonly pending = new Map<string, Set<string>>();
  private readonly lastSentAt = new Map<string, number>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor({
    realtimeNotifier,
    employerRepository,
    logger,
    matchUpdatePublisherOptions,
  }: {
    realtimeNotifier: RealtimeNotifier;
    employerRepository: EmployerRepository;
    logger: Logger;
    matchUpdatePublisherOptions?: MatchUpdatePublisherOptions;
  }) {
    this.realtimeNotifier = realtimeNotifier;
    this.employerRepository = employerRepository;
    this.logger = logger;
    this.throttleMs = matchUpdatePublisherOptions?.throttleMs ?? LIVE_RESCORE_PUSH_THROTTLE_MS;
    this.now = matchUpdatePublisherOptions?.now ?? Date.now;
  }

  /** Gọi, không chờ. Công ty vừa gửi trong khoảng chặn thì hẹn gửi khi hết khoảng. */
  publish(updates: ReadonlyMap<string, ReadonlySet<string>>): void {
    for (const [companyId, jobPostIds] of updates) {
      if (jobPostIds.size === 0) continue;
      let pending = this.pending.get(companyId);
      if (!pending) this.pending.set(companyId, (pending = new Set()));
      for (const id of jobPostIds) pending.add(id);
      if (this.timers.has(companyId)) continue;

      const wait = (this.lastSentAt.get(companyId) ?? -Infinity) + this.throttleMs - this.now();
      if (wait <= 0) {
        void this.flush(companyId);
        continue;
      }
      const timer = setTimeout(() => {
        this.timers.delete(companyId);
        void this.flush(companyId);
      }, wait);
      timer.unref();
      this.timers.set(companyId, timer);
    }
  }

  /** Huỷ các lần gửi đã hẹn (test, dừng server). */
  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async flush(companyId: string): Promise<void> {
    const jobPostIds = this.pending.get(companyId);
    this.pending.delete(companyId);
    if (!jobPostIds || jobPostIds.size === 0) return;
    this.lastSentAt.set(companyId, this.now());
    try {
      const employers = await this.employerRepository.findManyByCompanyId(companyId);
      const payload = { jobPostIds: [...jobPostIds].sort() };
      for (const { userId } of employers) await this.realtimeNotifier.pushMatchUpdate(userId, payload);
    } catch (error) {
      this.logger.warn("Match update push failed", {
        companyId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
