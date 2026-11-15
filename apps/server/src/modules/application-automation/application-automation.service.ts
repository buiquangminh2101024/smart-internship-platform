import type { JobApplicationAutomationSettings } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { ApplicationsService } from "../applications/applications.service";
import type { EmployerIdentityCache } from "../employers/employer-identity-cache";
import type { EmployerRepository } from "../employers/employer.repository";
import type { NotificationsService } from "../notifications/notifications.service";
import { AUTOMATION_MAX_PER_RUN, AUTOMATION_YIELD_EVERY } from "./application-automation.config";
import type { UpdateJobApplicationAutomationInput } from "./application-automation.dto";
import {
  closeDecision,
  effectiveRejectThreshold,
  nextAutoCloseRun,
  weeklyReminderDedupeKey,
  type AutoCloseGroup,
} from "./application-automation.policy";
import type {
  ApplicationAutomationRepository,
  AutomationScope,
  JobAutomationSettingsRow,
} from "./application-automation.repository";

/**
 * Tự chuyển "Đang xem xét" cho một hồ sơ (vừa nộp), một tin (vừa hạ X / bật lại công tắc) hoặc
 * các ứng viên vừa được chấm lại có tin vừa đạt ngưỡng (0.6, AD-27 mục 6): gọi, không chờ, lỗi chỉ ghi log. Đăng ký trong awilix dưới tên `autoReviewTrigger`, resolve
 * ApplicationAutomationService lúc gọi ⇒ ApplicationsService dùng được mà không tạo vòng phụ
 * thuộc (giống `autoOutreachTrigger`, `matchScoreTrigger`).
 */
export type AutoReviewTarget = { applicationId: string } | { jobPostId: string } | { candidateIds: string[] };
export type AutoReviewTrigger = (target: AutoReviewTarget) => void;

/** Kết quả một phần của lượt chạy — để ghi log, script và test đọc. */
export interface AutomationPartResult {
  /** Số hồ sơ câu SQL chọn ra. */
  selected: number;
  changed: number;
  /** Trạng thái vừa bị đổi (người dùng hoặc lượt khác chen vào) ⇒ bỏ qua, không ghi gì. */
  raced: number;
  failed: number;
  /** Chọn đủ `limit` ⇒ có thể còn hồ sơ, để lượt sau. */
  limited: boolean;
}

export interface AutoCloseResult extends AutomationPartResult {
  closedByGroup: Record<Exclude<AutoCloseGroup, "G3">, number>;
  /** SQL chọn nhưng `closeDecision` chưa tới hạn (lệch giờ DB và app) ⇒ để lượt sau. */
  notDue: number;
}

export type RunDailyResult =
  | { status: "LOCKED" }
  | { status: "DONE"; review: AutomationPartResult; close: AutoCloseResult; durationMs: number };

export type WeeklyReminderResult =
  | { status: "LOCKED" }
  | {
      status: "DONE";
      /** Công ty có ít nhất một số tồn khác 0. */
      companies: number;
      /** Thông báo mới tạo (mỗi employer một thông báo). */
      created: number;
      /** Đã nhắc trong tuần này (trùng `dedupeKey`) ⇒ không tạo lại. */
      duplicates: number;
      failed: number;
      durationMs: number;
    };

type Outcome = "CHANGED" | "RACED" | "NOT_DUE";

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Tự xử lý hồ sơ chờ lâu (0.4, AD-25) — docs/06-backend/application-automation/PLAN.md bước 4.
 * Chọn hồ sơ bằng SQL (chỉ đọc), đổi từng hồ sơ trong một transaction nhỏ qua
 * `ApplicationsService.changeStatusBySystem` (cùng chuỗi ghi với người dùng, lịch sử
 * `actorId = null`). Không bao giờ tự từ chối.
 */
export class ApplicationAutomationService {
  private readonly repository: ApplicationAutomationRepository;
  private readonly applicationsService: ApplicationsService;
  private readonly employerRepository: EmployerRepository;
  private readonly employerIdentityCache: EmployerIdentityCache;
  private readonly notificationsService: NotificationsService;
  private readonly logger: Logger;
  /** Không chạy chồng `runDaily` / `runWeeklyReminder` (một process, AD-23 mục 8). */
  private dailyRunning = false;
  private weeklyRunning = false;

  constructor({
    applicationAutomationRepository,
    applicationsService,
    employerRepository,
    employerIdentityCache,
    notificationsService,
    logger,
  }: {
    applicationAutomationRepository: ApplicationAutomationRepository;
    applicationsService: ApplicationsService;
    employerRepository: EmployerRepository;
    employerIdentityCache: EmployerIdentityCache;
    notificationsService: NotificationsService;
    logger: Logger;
  }) {
    this.repository = applicationAutomationRepository;
    this.applicationsService = applicationsService;
    this.employerRepository = employerRepository;
    this.employerIdentityCache = employerIdentityCache;
    this.notificationsService = notificationsService;
    this.logger = logger;
  }

  // ─── Cài đặt của tin (bước 6) ────────────────────────────────────────────

  /** Chỉ người đăng tin (cùng quy tắc với cài đặt tự mời). Đọc được ở mọi trạng thái của tin. */
  async getJobSettings(userId: string, jobPostId: string): Promise<JobApplicationAutomationSettings> {
    return toSettingsDto(await this.requireOwnedJob(userId, jobPostId));
  }

  /**
   * Chỉ người đăng tin, sửa được ở mọi trạng thái của tin (form tạo tin gửi khi tin còn là bản
   * nháp; công tắc tự đóng hồ sơ đã phỏng vấn chỉ có tác dụng sau khi tin đóng). Y ≥ X ⇒ 400.
   * Bật lại `autoReviewEnabled` ⇒ quét ngay hồ sơ Chờ duyệt của tin (lối 3 của bước 4b).
   */
  async updateJobSettings(
    userId: string,
    jobPostId: string,
    patch: UpdateJobApplicationAutomationInput,
  ): Promise<JobApplicationAutomationSettings> {
    const job = await this.requireOwnedJob(userId, jobPostId);
    const rejectBelow = patch.rejectSuggestBelowScore;
    if (rejectBelow !== undefined && rejectBelow >= job.autoOutreachMinScore) {
      throw rejectAboveThresholdError(job.autoOutreachMinScore);
    }
    if (!(await this.repository.updateJobSettings(job.id, patch))) {
      // X vừa bị hạ ở cài đặt tự mời giữa lúc đọc và lúc ghi (câu UPDATE có điều kiện Y < X).
      const latest = await this.repository.findJobSettings(job.id);
      if (!latest) throw new AppError(404, "Job post not found");
      throw rejectAboveThresholdError(latest.autoOutreachMinScore);
    }
    const updated = await this.repository.findJobSettings(job.id);
    if (!updated) throw new AppError(404, "Job post not found");
    // Câu chọn của autoReview tự lọc tin không hiển thị; xét PUBLISHED trước chỉ để bớt một câu SQL.
    if (patch.autoReviewEnabled === true && !job.autoReviewEnabled && updated.status === "PUBLISHED") {
      this.trigger({ jobPostId: job.id });
    }
    return toSettingsDto(updated);
  }

  /** Tin của người khác hoặc không có ⇒ 404 như không tồn tại (cùng quy tắc với cài đặt tự mời). */
  private async requireOwnedJob(userId: string, jobPostId: string): Promise<JobAutomationSettingsRow> {
    const { employerId } = await this.employerIdentityCache.require(userId);
    const job = await this.repository.findJobSettings(jobPostId);
    if (!job || job.employerId !== employerId) throw new AppError(404, "Job post not found");
    return job;
  }

  /**
   * Nhắc tuần (bước 5): mỗi employer của công ty có hồ sơ tồn nhận một thông báo gộp (trong app
   * và email). `dedupeKey` theo công ty + người nhận + thứ Hai của tuần (giờ Việt Nam), nên chạy
   * lại trong tuần không tạo trùng. Lỗi của một người nhận thì ghi log rồi đi tiếp.
   */
  async runWeeklyReminder(scope: Pick<AutomationScope, "companyId"> = {}, now = new Date()): Promise<WeeklyReminderResult> {
    if (this.weeklyRunning) return { status: "LOCKED" };
    this.weeklyRunning = true;
    const startedAt = Date.now();
    try {
      const rows = await this.repository.backlogByCompany(scope);
      const result = { status: "DONE" as const, companies: rows.length, created: 0, duplicates: 0, failed: 0, durationMs: 0 };
      for (const [index, row] of rows.entries()) {
        if (index > 0) await yieldToEventLoop();
        const { closingDueAt, ...counts } = row;
        const payload = { ...counts, closingOn: closingDueAt ? nextAutoCloseRun(closingDueAt, now) : null };
        try {
          const employers = await this.employerRepository.findManyByCompanyId(row.companyId);
          for (const { userId } of employers) {
            try {
              const isNew = await this.notificationsService.notifyOnce(
                "APPLICATIONS_NEED_ATTENTION",
                userId,
                payload,
                weeklyReminderDedupeKey(row.companyId, userId, now),
              );
              if (isNew) result.created += 1;
              else result.duplicates += 1;
            } catch (error) {
              result.failed += 1;
              this.logger.error("Weekly reminder failed for recipient", { companyId: row.companyId, userId, error: errorMessage(error) });
            }
          }
        } catch (error) {
          result.failed += 1;
          this.logger.error("Weekly reminder failed for company", { companyId: row.companyId, error: errorMessage(error) });
        }
      }
      result.durationMs = Date.now() - startedAt;
      this.logger.info("Stale application reminder", { ...scope, ...result });
      return result;
    } finally {
      this.weeklyRunning = false;
    }
  }

  /**
   * Lối 2 và 3 của bước 4b, và lối "vừa chấm lại theo ứng viên" (0.6). Hồ sơ đang được lượt
   * khác xử lý thì câu UPDATE có điều kiện chặn trùng.
   */
  trigger(scope: AutoReviewTarget): void {
    void this.autoReview(scope)
      .then((result) => {
        if (result.changed > 0 || result.failed > 0) this.logger.info("Auto review", { ...scope, ...result });
      })
      .catch((error: unknown) => {
        this.logger.error("Auto review failed", { ...scope, error: errorMessage(error) });
      });
  }

  /** Lượt hằng ngày (lối 1): tự chuyển rồi tự đóng. Đang có lượt khác thì trả LOCKED. */
  async runDaily(scope: Pick<AutomationScope, "companyId"> = {}): Promise<RunDailyResult> {
    if (this.dailyRunning) return { status: "LOCKED" };
    this.dailyRunning = true;
    const startedAt = Date.now();
    try {
      const review = await this.autoReview(scope);
      const close = await this.autoClose(scope);
      const result = { status: "DONE" as const, review, close, durationMs: Date.now() - startedAt };
      this.logger.info("Application automation run", { ...scope, ...result });
      return result;
    } finally {
      this.dailyRunning = false;
    }
  }

  /** Bước 4b: Chờ duyệt, điểm ≥ X, tin hiển thị và bật công tắc ⇒ "Đang xem xét". */
  async autoReview(scope: AutomationScope, limit = AUTOMATION_MAX_PER_RUN): Promise<AutomationPartResult> {
    const targets = await this.repository.findAutoReviewTargets(scope, limit);
    const result: AutomationPartResult = { selected: targets.length, changed: 0, raced: 0, failed: 0, limited: targets.length >= limit };
    await this.forEach(targets, "Auto review", result, async (target) =>
      (await this.applicationsService.changeStatusBySystem(target, "REVIEWING")) ? "CHANGED" : "RACED",
    );
    return result;
  }

  /** Bước 4c: hồ sơ chưa kết thúc ở tin đã ngừng tuyển, tới hạn theo G1 / G2 / G4 ⇒ "Tin đã đóng". */
  async autoClose(scope: AutomationScope, limit = AUTOMATION_MAX_PER_RUN, now = new Date()): Promise<AutoCloseResult> {
    const rows = await this.repository.findCloseTargets(scope, limit);
    const result: AutoCloseResult = {
      selected: rows.length,
      changed: 0,
      raced: 0,
      failed: 0,
      limited: rows.length >= limit,
      closedByGroup: { G1: 0, G2: 0, G4: 0 },
      notDue: 0,
    };
    await this.forEach(rows, "Auto close", result, async (row) => {
      const decision = closeDecision(row);
      if (!decision?.dueAt || decision.dueAt > now || decision.group === "G3") return "NOT_DUE";
      const { id, status, jobPostId, jobPostTitle, companyName, candidateUserId } = row;
      const changed = await this.applicationsService.changeStatusBySystem(
        { id, status, jobPostId, jobPostTitle, companyName, candidateUserId },
        "JOB_CLOSED",
        { closeReason: decision.reason },
      );
      if (!changed) return "RACED";
      result.closedByGroup[decision.group] += 1;
      return "CHANGED";
    });
    return result;
  }

  /**
   * Xử lý lần lượt, mỗi hồ sơ một transaction (trong `changeStatusBySystem`). Lỗi một hồ sơ thì
   * ghi log rồi đi tiếp; nhường event loop sau mỗi `AUTOMATION_YIELD_EVERY` hồ sơ.
   */
  private async forEach<T extends { id: string }>(
    items: T[],
    label: string,
    result: AutomationPartResult & { notDue?: number },
    handle: (item: T) => Promise<Outcome>,
  ): Promise<void> {
    for (const [index, item] of items.entries()) {
      if (index > 0 && index % AUTOMATION_YIELD_EVERY === 0) await yieldToEventLoop();
      try {
        const outcome = await handle(item);
        if (outcome === "CHANGED") result.changed += 1;
        else if (outcome === "RACED") result.raced += 1;
        else result.notDue = (result.notDue ?? 0) + 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error(`${label} failed for application`, { applicationId: item.id, error: errorMessage(error) });
      }
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Y trả về là Y thực dùng (kẹp về X − 1 khi dữ liệu cũ có Y ≥ X), khớp nhóm đề xuất từ chối. */
function toSettingsDto(job: JobAutomationSettingsRow): JobApplicationAutomationSettings {
  return {
    autoReviewEnabled: job.autoReviewEnabled,
    matchThreshold: job.autoOutreachMinScore,
    rejectSuggestBelowScore: effectiveRejectThreshold(job.autoOutreachMinScore, job.rejectSuggestBelowScore),
    autoCloseInterviewedEnabled: job.autoCloseInterviewedEnabled,
  };
}

function rejectAboveThresholdError(matchThreshold: number): AppError {
  return new AppError(400, `Ngưỡng đề xuất từ chối phải nhỏ hơn ngưỡng phù hợp (${matchThreshold}%).`);
}
