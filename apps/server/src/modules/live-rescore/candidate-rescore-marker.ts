import type { Logger } from "../../shared/logger";
import type { JobProfileCache } from "./job-profile-cache";
import type { LiveRescoreRepository } from "./live-rescore.repository";
import type { LiveRescoreDrainRequester, LiveRescoreScheduler } from "./live-rescore.scheduler";

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
  private readonly jobProfileCache: JobProfileCache;
  private readonly logger: Logger;

  constructor({
    liveRescoreRepository,
    liveRescoreScheduler,
    liveRescoreDrainRequester,
    jobProfileCache,
    logger,
  }: {
    liveRescoreRepository: LiveRescoreRepository;
    liveRescoreScheduler: LiveRescoreScheduler;
    liveRescoreDrainRequester: LiveRescoreDrainRequester;
    jobProfileCache: JobProfileCache;
    logger: Logger;
  }) {
    this.repository = liveRescoreRepository;
    this.scheduler = liveRescoreScheduler;
    this.requestDrain = liveRescoreDrainRequester;
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
    return this.markHolders("skill", skillIds, (ids) => this.repository.findCandidateIdsBySkills(ids), change);
  }

  /** Như `markSkillHolders`, cho ngành (học vấn của ứng viên gắn ngành đó). */
  markMajorHolders<T>(majorIds: string[], change: () => Promise<T>): Promise<T> {
    return this.markHolders("major", majorIds, (ids) => this.repository.findCandidateIdsByMajors(ids), change);
  }

  private async markHolders<T>(
    kind: "skill" | "major",
    entryIds: string[],
    findHolders: (ids: string[]) => Promise<string[]>,
    change: () => Promise<T>,
  ): Promise<T> {
    let holders: string[] | null = null;
    try {
      holders = await findHolders(entryIds);
    } catch (error) {
      this.logFailure(`find ${kind} holders`, error, { entryIds });
    }

    const result = await change();
    this.jobProfileCache.clear();

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
