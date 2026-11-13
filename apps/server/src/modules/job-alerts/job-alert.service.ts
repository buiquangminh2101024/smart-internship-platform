import type { JobAlertSettings, UpdateJobAlertSettingsRequest } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { NotificationsService } from "../notifications/notifications.service";
import type { CandidateJobAlertSettingsRow, JobAlertRepository } from "./job-alert.repository";
import { JOB_ALERT_MIN_SCORE_FLOOR, VN_OFFSET_MS } from "./job-alerts.config";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ngày theo giờ Việt Nam, dạng YYYY-MM-DD — phần ngày của khoá thông báo gộp. */
export function vnDateKey(instant: Date): string {
  return new Date(instant.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** 00:00 giờ Việt Nam của ngày chứa `instant`, đổi về UTC. */
export function vnDayStart(instant: Date): Date {
  const vn = instant.getTime() + VN_OFFSET_MS;
  return new Date(vn - (vn % DAY_MS) - VN_OFFSET_MS);
}

export function jobAlertDedupeKey(candidateId: string, instant: Date): string {
  return `job-alert:${candidateId}:${vnDateKey(instant)}`;
}

export interface JobAlertRunResult {
  /** Số ứng viên vừa được ghi vào `job_alerts` cho tin. */
  alerted: number;
  created: number;
  updated: number;
  /** Ghi `job_alerts` xong nhưng tạo / cập nhật thông báo lỗi (đã ghi log). */
  failed: number;
}

function toSettings(row: CandidateJobAlertSettingsRow): JobAlertSettings {
  return {
    enabled: row.enabled,
    emailEnabled: row.emailEnabled,
    sameCityOnly: row.sameCityOnly,
    cityName: row.cityName,
  };
}

/**
 * Job alert (0.5, AD-26 D7–D9) — docs/06-backend/job-discovery/PLAN.md bước 5.
 * Báo trong ứng dụng ngay khi lối (a) của AD-24 chấm xong một tin mới hiển thị; mỗi cặp
 * (ứng viên, tin) một lần; mỗi ứng viên một thông báo `JOB_ALERT` mỗi ngày, tin sau cập
 * nhật thông báo đó. Lượt chấm đêm không gọi tới đây.
 */
export class JobAlertService {
  private readonly repository: JobAlertRepository;
  private readonly notificationsService: NotificationsService;
  private readonly logger: Logger;
  /**
   * Các lượt `onJobScored` chạy lần lượt (một process, AD-23 mục 8): hai tin chấm xong cùng
   * lúc mà chạy song song thì lượt đếm sau có thể ghi đè tiêu đề "N tin" bằng số nhỏ hơn.
   */
  private queue: Promise<void> = Promise.resolve();

  constructor({
    jobAlertRepository,
    notificationsService,
    logger,
  }: {
    jobAlertRepository: JobAlertRepository;
    notificationsService: NotificationsService;
    logger: Logger;
  }) {
    this.repository = jobAlertRepository;
    this.notificationsService = notificationsService;
    this.logger = logger;
  }

  /** Lối gọi từ MatchScoreService sau lối (a): không chờ, lỗi chỉ ghi log, không làm hỏng lượt chấm. */
  trigger(jobPostId: string): void {
    this.queue = this.queue.then(async () => {
      try {
        const result = await this.onJobScored(jobPostId);
        if (result.alerted > 0) this.logger.info("Job alerts sent", { jobPostId, ...result });
      } catch (error) {
        this.logger.error("Job alert failed", {
          jobPostId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  /**
   * Ghi `job_alerts` cho mọi ứng viên đạt điều kiện (một câu, `ON CONFLICT DO NOTHING`), rồi
   * tạo hoặc cập nhật thông báo trong ngày của từng người vừa được ghi. Lỗi thông báo của
   * một người chỉ ghi log rồi đi tiếp (dòng `job_alerts` vẫn còn, email gộp vẫn liệt kê tin).
   */
  async onJobScored(jobPostId: string, now: Date = new Date()): Promise<JobAlertRunResult> {
    const result: JobAlertRunResult = { alerted: 0, created: 0, updated: 0, failed: 0 };
    const job = await this.repository.findJobSummary(jobPostId);
    if (!job) return result;

    const inserted = await this.repository.insertForJob(jobPostId, JOB_ALERT_MIN_SCORE_FLOOR, now);
    result.alerted = inserted.length;
    if (inserted.length === 0) return result;

    const todayCounts = await this.repository.countSince(
      inserted.map((row) => row.candidateId),
      vnDayStart(now),
    );
    for (const row of inserted) {
      try {
        const outcome = await this.notificationsService.upsertDaily(
          "JOB_ALERT",
          row.userId,
          {
            jobPostId,
            jobPostTitle: job.title,
            companyName: job.companyName,
            score: row.score,
            todayCount: todayCounts.get(row.candidateId) ?? 1,
          },
          jobAlertDedupeKey(row.candidateId, now),
        );
        if (outcome === "CREATED") result.created += 1;
        else if (outcome === "UPDATED") result.updated += 1;
        else result.failed += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error("Job alert notification failed", {
          jobPostId,
          candidateId: row.candidateId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return result;
  }

  // ─── Cài đặt (GET / PATCH /candidate/job-alert-settings) ─────────────────

  async getSettingsForUser(userId: string): Promise<JobAlertSettings> {
    return toSettings(await this.requireSettings(userId));
  }

  /** Bật "chỉ thành phố của tôi" khi hồ sơ chưa có thành phố ⇒ 400 `JOB_ALERT_CITY_REQUIRED`. */
  async updateSettingsForUser(userId: string, patch: UpdateJobAlertSettingsRequest): Promise<JobAlertSettings> {
    const current = await this.requireSettings(userId);
    if (patch.sameCityOnly === true && !current.cityId) {
      throw new AppError(
        400,
        "Thêm thành phố vào hồ sơ trước khi bật \"Chỉ tin ở thành phố của tôi\"",
        "JOB_ALERT_CITY_REQUIRED",
      );
    }
    return toSettings(await this.repository.updateSettings(current.candidateId, patch));
  }

  private async requireSettings(userId: string): Promise<CandidateJobAlertSettingsRow> {
    const row = await this.repository.findSettingsByUserId(userId);
    if (!row) throw new AppError(404, "Candidate profile not found");
    return row;
  }
}
