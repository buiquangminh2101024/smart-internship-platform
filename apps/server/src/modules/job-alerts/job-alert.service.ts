import type { JobAlertSettings, UpdateJobAlertSettingsRequest } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import {
  OUTBOX_EVENT_NOTIFICATION_EMAIL,
  type NotificationEmailPayload,
} from "../notifications/notification.types";
import type { NotificationsService } from "../notifications/notifications.service";
import type { OutboxRepository } from "../notifications/outbox/outbox.repository";
import { renderJobAlertDigestEmail } from "../notifications/templates/notification-templates";
import type { CandidateJobAlertSettingsRow, JobAlertRepository, SkillsReminderTarget } from "./job-alert.repository";
import {
  JOB_ALERT_DIGEST_MAX_JOBS,
  JOB_ALERT_MIN_SCORE_FLOOR,
  SKILLS_REMINDER_MIN_ACCOUNT_AGE_HOURS,
  VN_OFFSET_MS,
} from "./job-alerts.config";

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

/** AD-26 D10 — khoá nhắc một lần: `profile-skills-reminder:<candidateId>`. */
export const SKILLS_REMINDER_DEDUPE_PREFIX = "profile-skills-reminder:";

/** Outbox của email gộp gắn với ứng viên (không có thông báo trong ứng dụng đi kèm). */
export const OUTBOX_AGGREGATE_CANDIDATE = "Candidate";

export interface DigestRunResult {
  /** Ứng viên có dòng chưa xét lúc bắt đầu lượt. */
  candidates: number;
  /** Số email đã xếp vào outbox (mỗi ứng viên tối đa một). */
  emailsQueued: number;
  /** Tổng số tin còn đáng gửi trong các email đó (kể cả phần "và N tin khác"). */
  jobsInEmails: number;
  /** Ứng viên bật email nhưng mọi tin đã hết hiển thị / đã ứng tuyển / được mời ⇒ không gửi. */
  nothingToSend: number;
  /** Lượt khác đã nhận hết dòng của ứng viên này (cron và script chạy chồng). */
  raced: number;
  /** Ứng viên tắt email / tắt alert / tài khoản không `ACTIVE`: chỉ đánh dấu đã xét. */
  notSendable: number;
  /** Số dòng `job_alerts` của nhóm `notSendable` đã đánh dấu. */
  rowsMarkedWithoutSending: number;
  failed: number;
}

export interface DigestPreview {
  candidates: number;
  wouldEmail: number;
  jobsInEmails: number;
  nothingToSend: number;
  notSendable: number;
  rowsMarkedWithoutSending: number;
}

export interface SkillsReminderResult {
  targets: number;
  created: number;
  /** Khoá đã có (lượt khác vừa tạo). */
  duplicates: number;
  failed: number;
}

export type JobAlertDailyResult =
  | { status: "LOCKED" }
  | { status: "DONE"; digest: DigestRunResult; reminders: SkillsReminderResult; durationMs: number };

interface JobAlertConfig {
  CORS_ORIGIN: string;
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
  private readonly outboxRepository: OutboxRepository;
  private readonly webBaseUrl: string;
  /** Lượt hằng ngày đang chạy (một process): lượt gọi sau trả LOCKED. */
  private dailyRunning = false;

  constructor({
    jobAlertRepository,
    notificationsService,
    outboxRepository,
    logger,
    config,
  }: {
    jobAlertRepository: JobAlertRepository;
    notificationsService: NotificationsService;
    outboxRepository: OutboxRepository;
    logger: Logger;
    config: JobAlertConfig;
  }) {
    this.repository = jobAlertRepository;
    this.notificationsService = notificationsService;
    this.outboxRepository = outboxRepository;
    this.logger = logger;
    // CORS_ORIGIN là origin của web app (như NotificationsService).
    this.webBaseUrl = config.CORS_ORIGIN;
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

  // ─── Lượt hằng ngày 8h (bước 6) ──────────────────────────────────────────

  /** Cron 8h: email gộp rồi nhắc thêm kỹ năng. Đang có lượt khác trong process ⇒ LOCKED. */
  async runDaily(now: Date = new Date()): Promise<JobAlertDailyResult> {
    if (this.dailyRunning) return { status: "LOCKED" };
    this.dailyRunning = true;
    const startedAt = Date.now();
    try {
      const digest = await this.sendDailyDigests(now);
      const reminders = await this.sendSkillsReminders(now);
      const durationMs = Date.now() - startedAt;
      this.logger.info("Job alert daily run done", { digest, reminders, durationMs });
      return { status: "DONE", digest, reminders, durationMs };
    } finally {
      this.dailyRunning = false;
    }
  }

  /**
   * Email gộp (AD-26 D8): mỗi ứng viên có dòng `job_alerts` chưa xét một email liệt kê tối đa
   * `JOB_ALERT_DIGEST_MAX_JOBS` tin (điểm lúc báo cao trước), chỉ tin còn hiển thị và chưa ứng
   * tuyển / chưa được mời. Mọi dòng đã xét (kể cả tin bị bỏ) được đặt `emailedAt` trong cùng
   * transaction với outbox; không còn tin nào thì không gửi. Ứng viên tắt email / tắt alert /
   * tài khoản không `ACTIVE` chỉ được đánh dấu đã xét. Lỗi của một người ghi log rồi đi tiếp
   * (transaction huỷ ⇒ dòng còn nguyên cho lượt sau).
   */
  async sendDailyDigests(now: Date = new Date()): Promise<DigestRunResult> {
    const pending = await this.repository.findPendingDigestCandidates(now);
    const notSendable = pending.filter((candidate) => !candidate.sendable);
    const result: DigestRunResult = {
      candidates: pending.length,
      emailsQueued: 0,
      jobsInEmails: 0,
      nothingToSend: 0,
      raced: 0,
      notSendable: notSendable.length,
      rowsMarkedWithoutSending: await this.repository.markWithoutSending(
        notSendable.map((candidate) => candidate.candidateId),
        now,
        now,
      ),
      failed: 0,
    };

    for (const candidate of pending) {
      if (!candidate.sendable) continue;
      try {
        const outcome = await this.repository.runInTransaction(async (tx) => {
          const claimed = await this.repository.claimForDigest(tx, candidate.candidateId, now, now);
          if (claimed.length === 0) return "RACED" as const;
          const jobs = await this.repository.findDigestJobs(tx, candidate.candidateId, claimed);
          if (jobs.length === 0) return 0;
          const email = renderJobAlertDigestEmail(
            { jobs: jobs.slice(0, JOB_ALERT_DIGEST_MAX_JOBS), total: jobs.length },
            { webBaseUrl: this.webBaseUrl },
          );
          const payload: NotificationEmailPayload = {
            to: candidate.email,
            subject: email.subject,
            html: email.html,
            notificationType: "JOB_ALERT",
          };
          await this.outboxRepository.create(
            {
              eventType: OUTBOX_EVENT_NOTIFICATION_EMAIL,
              aggregateType: OUTBOX_AGGREGATE_CANDIDATE,
              aggregateId: candidate.candidateId,
              payload: { ...payload },
            },
            tx,
          );
          return jobs.length;
        });
        if (outcome === "RACED") result.raced += 1;
        else if (outcome === 0) result.nothingToSend += 1;
        else {
          result.emailsQueued += 1;
          result.jobsInEmails += outcome;
        }
      } catch (error) {
        result.failed += 1;
        this.logger.error("Job alert digest failed", {
          candidateId: candidate.candidateId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return result;
  }

  /** `--dry-run` của email gộp: cùng cách chọn, không nhận dòng, không ghi outbox. */
  async previewDailyDigests(now: Date = new Date()): Promise<DigestPreview> {
    const pending = await this.repository.findPendingDigestCandidates(now);
    const preview: DigestPreview = {
      candidates: pending.length,
      wouldEmail: 0,
      jobsInEmails: 0,
      nothingToSend: 0,
      notSendable: 0,
      rowsMarkedWithoutSending: 0,
    };
    for (const candidate of pending) {
      if (!candidate.sendable) {
        preview.notSendable += 1;
        preview.rowsMarkedWithoutSending += candidate.pending;
        continue;
      }
      const ids = await this.repository.findPendingJobPostIds(candidate.candidateId, now);
      const jobs = await this.repository.findDigestJobs(undefined, candidate.candidateId, ids);
      if (jobs.length === 0) preview.nothingToSend += 1;
      else {
        preview.wouldEmail += 1;
        preview.jobsInEmails += jobs.length;
      }
    }
    return preview;
  }

  /**
   * Nhắc một lần (AD-26 D10): tài khoản `ACTIVE` tạo từ ≥ 24 giờ, chưa có kỹ năng, chưa được
   * nhắc ⇒ `notifyOnce("PROFILE_SKILLS_REMINDER")` kèm email. Lỗi một người ghi log rồi đi tiếp.
   */
  async sendSkillsReminders(now: Date = new Date()): Promise<SkillsReminderResult> {
    const targets = await this.findSkillsReminderTargets(now);
    const result: SkillsReminderResult = { targets: targets.length, created: 0, duplicates: 0, failed: 0 };
    for (const target of targets) {
      try {
        const created = await this.notificationsService.notifyOnce(
          "PROFILE_SKILLS_REMINDER",
          target.userId,
          {},
          `${SKILLS_REMINDER_DEDUPE_PREFIX}${target.candidateId}`,
        );
        if (created) result.created += 1;
        else result.duplicates += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error("Skills reminder failed", {
          candidateId: target.candidateId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return result;
  }

  /** Người sẽ được nhắc nếu chạy lúc `now` (dùng cho lượt thật và `--dry-run`). */
  findSkillsReminderTargets(now: Date = new Date()): Promise<SkillsReminderTarget[]> {
    const createdBefore = new Date(now.getTime() - SKILLS_REMINDER_MIN_ACCOUNT_AGE_HOURS * 60 * 60 * 1000);
    return this.repository.findSkillsReminderTargets(createdBefore, SKILLS_REMINDER_DEDUPE_PREFIX);
  }

  /** `--dry-run --job <id>` của script: số người đạt điều kiện, trong đó đã báo tin này. */
  countTargetsForJob(jobPostId: string): Promise<{ eligible: number; alreadyAlerted: number }> {
    return this.repository.countTargetsForJob(jobPostId, JOB_ALERT_MIN_SCORE_FLOOR);
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
