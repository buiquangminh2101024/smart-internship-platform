import type { Logger } from "../../shared/logger";
import type { JobProfileCache } from "./job-profile-cache";
import type { LiveRescoreRepository } from "./live-rescore.repository";
import type { LiveRescoreDrainRequester, LiveRescoreJobRequester, LiveRescoreScheduler } from "./live-rescore.scheduler";

/**
 * Đánh dấu "cần chấm lại theo ứng viên" (AD-27 mục 1, D1; bước 2 của
 * docs/06-backend/live-rescore/PLAN.md). Là lối duy nhất các module khác (`candidates`,
 * `skills`, `education-catalog`, cron gộp danh mục) dùng để báo hồ sơ đổi theo nghĩa bộ
 * chấm. Không phụ thuộc ngược vào lượt chấm: chỉ ghi dấu, hẹn giờ, và yêu cầu một lượt.
 *
 * Mọi hàm **không ném lỗi** vì lý do đánh dấu: lỗi chỉ ghi log, không làm hỏng việc lưu hồ
 * sơ hay thao tác của Admin. Ứng viên lỡ dấu thì lượt đêm của AD-24 vẫn chấm lại.
 */
export class CandidateRescoreMarker {
  private readonly repository: LiveRescoreRepository;
  private readonly scheduler: LiveRescoreScheduler;
  private readonly requestDrain: LiveRescoreDrainRequester;
  private readonly requestJobRescore: LiveRescoreJobRequester;
  private readonly jobProfileCache: JobProfileCache;
  private readonly logger: Logger;

  constructor({
    liveRescoreRepository,
    liveRescoreScheduler,
    liveRescoreDrainRequester,
    liveRescoreJobRequester,
    jobProfileCache,
    logger,
  }: {
    liveRescoreRepository: LiveRescoreRepository;
    liveRescoreScheduler: LiveRescoreScheduler;
    liveRescoreDrainRequester: LiveRescoreDrainRequester;
    liveRescoreJobRequester: LiveRescoreJobRequester;
    jobProfileCache: JobProfileCache;
    logger: Logger;
  }) {
    this.repository = liveRescoreRepository;
    this.scheduler = liveRescoreScheduler;
    this.requestDrain = liveRescoreDrainRequester;
    this.requestJobRescore = liveRescoreJobRequester;
    this.jobProfileCache = jobProfileCache;
    this.logger = logger;
  }

  /**
   * Ứng viên vừa sửa hồ sơ: một câu `UPDATE`, rồi đặt (hoặc dời) hẹn giờ chờ ngừng sửa.
   * Gọi **sau khi** ghi hồ sơ thành công.
   */
  async mark(candidateId: string): Promise<void> {
    try {
      await this.repository.markCandidates([candidateId]);
    } catch (error) {
      this.logFailure("mark", error, { candidateId });
      return;
    }
    this.scheduler.touch(candidateId);
  }

  /**
   * Admin hoặc cron đổi danh mục kỹ năng (D6): lấy danh sách người đang có các kỹ năng đó
   * **trước** khi đổi (từ chối / gộp xoá hoặc chuyển liên kết, sau đó không còn tìm được),
   * chạy `change`, rồi đánh dấu những người đó. `change` lỗi thì không đánh dấu và lỗi
   * được ném lại nguyên vẹn.
   *
   * Không hẹn giờ cho từng người (có thể vài trăm): yêu cầu một lượt chấm ngay, phần còn
   * lại để lượt sau và cron.
   *
   * Sau khi `change` thành công thì xoá cache hồ sơ tin (bước 3): hồ sơ tin đọc tên và trạng
   * thái kỹ năng, tên ngành, nên tin gắn mục đó đã đổi yêu cầu.
   */
  markSkillHolders<T>(skillIds: string[], change: () => Promise<T>): Promise<T> {
    return this.markHolders(
      "skill",
      skillIds,
      (ids) => this.repository.findCandidateIdsBySkills(ids),
      (ids) => this.repository.findVisibleJobIdsBySkills(ids),
      change,
    );
  }

  /** Như `markSkillHolders`, cho ngành (học vấn của ứng viên, yêu cầu ngành của tin). */
  markMajorHolders<T>(majorIds: string[], change: () => Promise<T>): Promise<T> {
    return this.markHolders(
      "major",
      majorIds,
      (ids) => this.repository.findCandidateIdsByMajors(ids),
      (ids) => this.repository.findVisibleJobIdsByMajors(ids),
      change,
    );
  }

  /**
   * Q1 (bước 5): ngoài người có mục đó, các tin đang hiển thị gắn mục đó cũng đổi yêu cầu, nên
   * người khác trong pool của tin đang giữ điểm tính theo yêu cầu cũ. Lấy danh sách tin
   * **trước** khi đổi (cùng lý do với người), sau khi đổi thì xếp vào hàng chờ chấm lại theo
   * tin của lượt chấm (chạy sau phần theo ứng viên, không sinh job alert).
   */
  private async markHolders<T>(
    kind: "skill" | "major",
    entryIds: string[],
    findHolders: (ids: string[]) => Promise<string[]>,
    findJobs: (ids: string[]) => Promise<string[]>,
    change: () => Promise<T>,
  ): Promise<T> {
    let holders: string[] | null = null;
    try {
      holders = await findHolders(entryIds);
    } catch (error) {
      this.logFailure(`find ${kind} holders`, error, { entryIds });
    }
    let jobs: string[] = [];
    try {
      jobs = await findJobs(entryIds);
    } catch (error) {
      this.logFailure(`find ${kind} jobs`, error, { entryIds });
    }

    const result = await change();
    this.jobProfileCache.clear();

    if (jobs.length > 0) {
      try {
        // Xếp hàng trước khi đánh dấu: lượt mà requester yêu cầu đã có sẵn tin trong hàng.
        this.requestJobRescore(jobs);
        this.logger.info(`Live rescore: xếp ${jobs.length} tin chấm lại vì danh mục ${kind} đổi`, { entryIds });
      } catch (error) {
        this.logFailure(`queue ${kind} jobs`, error, { entryIds, jobs: jobs.length });
      }
    }

    if (holders && holders.length > 0) {
      try {
        const marked = await this.repository.markCandidates(holders);
        this.logger.info(`Live rescore: đánh dấu ${marked} ứng viên vì danh mục ${kind} đổi`, { entryIds });
        this.requestDrainSafely();
      } catch (error) {
        this.logFailure(`mark ${kind} holders`, error, { entryIds, candidates: holders.length });
      }
    }
    return result;
  }

  private requestDrainSafely(): void {
    try {
      this.requestDrain();
    } catch (error) {
      this.logFailure("request drain", error, {});
    }
  }

  private logFailure(step: string, error: unknown, meta: Record<string, unknown>): void {
    this.logger.error(`Live rescore: ${step} lỗi`, {
      ...meta,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
