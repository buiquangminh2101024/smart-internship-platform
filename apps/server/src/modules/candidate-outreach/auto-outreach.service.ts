import type { CompanyOutreachSettings, JobAutoOutreachDto, MatchResult, OutreachInviteSkipReason } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { AutoReviewTrigger } from "../application-automation/application-automation.service";
import type { EmployerIdentityCache } from "../employers/employer-identity-cache";
import type { EmployerRepository } from "../employers/employer.repository";
import type { MatchScoreRepository } from "../match-scores/match-score.repository";
import type { NotificationsService } from "../notifications/notifications.service";
import {
  allocateRoundRobin,
  autoRunRemaining,
  isAwaitingRecheck,
  reopensAutoOutreach,
  resolveAutoOutreachState,
  type AllocationJob,
} from "./auto-outreach.policy";
import type { AutoOutreachRepository, JobAutoOutreachRow, RunnableJobRow } from "./auto-outreach.repository";
import type { AutoOutreachRunStore } from "./auto-outreach-run-store";
import {
  autoDailyLimit,
  type CandidateOutreachRateLimitService,
  type OutreachDailyLimit,
} from "./candidate-outreach-rate-limit.service";
import {
  AUTO_OUTREACH_MAX_NEW_EMBEDDINGS,
  AUTO_OUTREACH_PREFILTER_LIMIT,
  AUTO_OUTREACH_RUN_BUDGET_MS,
} from "./candidate-outreach.config";
import type { UpdateJobAutoOutreachInput } from "./candidate-outreach.dto";
import type { CandidateOutreachRepository, OutreachEmployer } from "./candidate-outreach.repository";
import type { CandidateOutreachService, InvitationMatch, OutreachQuotaPolicy } from "./candidate-outreach.service";

/**
 * Kích hoạt một lượt tự động mời cho công ty: gọi, không chờ, lỗi chỉ ghi log (bước 5).
 * Đăng ký trong awilix dưới tên `autoOutreachTrigger`, resolve AutoOutreachService lúc
 * gọi ⇒ JobPostsService/CandidateOutreachService dùng được mà không tạo vòng phụ thuộc.
 */
export type AutoOutreachTrigger = (companyId: string) => void;

export type AutoOutreachSkipCounts = Partial<Record<OutreachInviteSkipReason, number>>;

/** Kết quả một lượt — để ghi log, cron và test đọc. */
export type AutoOutreachRunResult =
  | { status: "LOCKED" }
  | { status: "SKIPPED"; reason: "NO_COMPANY" | "PLAN_NOT_ALLOWED" | "NO_ROOM" | "NO_JOB" }
  | {
      status: "DONE";
      /** Tin còn thiếu lời mời và đã được xét (tìm + chấm) trong lượt này. */
      jobsScanned: number;
      /** Tin còn thiếu nhưng chưa tới lúc kiểm lại (dấu "hết ứng viên"). */
      jobsAwaitingRecheck: number;
      /** Tin chưa kịp xét vì quá mốc dừng — để lượt sau. */
      jobsDeferred: number;
      /** Tin vừa được đặt dấu "hết ứng viên". */
      jobsExhausted: number;
      sent: number;
      /** Số lần bỏ qua theo lý do (người bị bỏ qua không tốn lượt). */
      skipped: AutoOutreachSkipCounts;
      stoppedByQuota: boolean;
    };

/** Một tin còn thiếu lời mời, kèm hàng chờ ứng viên đạt ngưỡng (điểm giảm dần). */
interface ScannedJob {
  row: RunnableJobRow;
  target: number;
  deficit: number;
  queue: Array<{ candidateId: string; match: InvitationMatch }>;
  sent: number;
}

interface RunContext {
  companyId: string;
  companyName: string;
  limit: OutreachDailyLimit;
  skipped: AutoOutreachSkipCounts;
}

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Tự động mời ứng viên theo tin (AD-23) — docs/06-backend/auto-outreach/PLAN.md.
 * Cài đặt của tin và của công ty (bước 4), lượt chạy nền `runForCompany` (bước 5).
 * Phụ thuộc một chiều vào CandidateOutreachService (hạn mức theo gói, chấm điểm, tạo lời
 * mời); chiều ngược lại chỉ đi qua `autoOutreachTrigger`, resolve lúc gọi.
 */
export class AutoOutreachService {
  private readonly repository: AutoOutreachRepository;
  private readonly outreachRepository: CandidateOutreachRepository;
  private readonly outreachService: CandidateOutreachService;
  private readonly employerIdentityCache: EmployerIdentityCache;
  private readonly employerRepository: EmployerRepository;
  private readonly runStore: AutoOutreachRunStore;
  private readonly rateLimit: CandidateOutreachRateLimitService;
  private readonly notificationsService: NotificationsService;
  private readonly matchScoreRepository: MatchScoreRepository;
  private readonly autoReviewTrigger: AutoReviewTrigger;
  private readonly logger: Logger;

  constructor({
    autoOutreachRepository,
    candidateOutreachRepository,
    candidateOutreachService,
    employerIdentityCache,
    employerRepository,
    autoOutreachRunStore,
    candidateOutreachRateLimitService,
    notificationsService,
    matchScoreRepository,
    autoReviewTrigger,
    logger,
  }: {
    autoOutreachRepository: AutoOutreachRepository;
    candidateOutreachRepository: CandidateOutreachRepository;
    candidateOutreachService: CandidateOutreachService;
    employerIdentityCache: EmployerIdentityCache;
    employerRepository: EmployerRepository;
    autoOutreachRunStore: AutoOutreachRunStore;
    candidateOutreachRateLimitService: CandidateOutreachRateLimitService;
    notificationsService: NotificationsService;
    matchScoreRepository: MatchScoreRepository;
    /** 0.4 — lối kích hoạt tự chuyển "Đang xem xét", resolve ApplicationAutomationService lúc gọi. */
    autoReviewTrigger: AutoReviewTrigger;
    logger: Logger;
  }) {
    this.repository = autoOutreachRepository;
    this.outreachRepository = candidateOutreachRepository;
    this.outreachService = candidateOutreachService;
    this.employerIdentityCache = employerIdentityCache;
    this.employerRepository = employerRepository;
    this.runStore = autoOutreachRunStore;
    this.rateLimit = candidateOutreachRateLimitService;
    this.notificationsService = notificationsService;
    this.matchScoreRepository = matchScoreRepository;
    this.autoReviewTrigger = autoReviewTrigger;
    this.logger = logger;
  }

  // ─── Cài đặt của tin ─────────────────────────────────────────────────────

  /** Chỉ người đăng tin. Đọc được ở mọi trạng thái của tin và mọi gói. */
  async getJobSettings(userId: string, jobPostId: string): Promise<JobAutoOutreachDto> {
    const employer = await this.requireEmployer(userId);
    const job = await this.requireOwnedJob(employer, jobPostId);
    return this.toJobDto(job, await this.outreachService.lookupDailyQuota(employer));
  }

  /**
   * Chỉ người đăng tin, sửa được ở mọi trạng thái của tin (AD-23 mục 2). Bật khi công ty
   * dùng thử hoặc không có gói ⇒ 403; các trường khác vẫn sửa được (form tạo tin của gói
   * Dùng thử vẫn lưu số người cần tuyển). Bật lại, hạ ngưỡng hoặc tăng số người cần tuyển
   * ⇒ xoá dấu "hết ứng viên", và nếu tin đang hiển thị thì chạy một lượt ngay.
   */
  async updateJobSettings(userId: string, jobPostId: string, patch: UpdateJobAutoOutreachInput): Promise<JobAutoOutreachDto> {
    const employer = await this.requireEmployer(userId);
    const job = await this.requireOwnedJob(employer, jobPostId);
    const policy = await this.outreachService.lookupDailyQuota(employer);
    if (patch.enabled === true && !policy?.autoAllowed) {
      throw new AppError(403, "Tự động mời ứng viên có từ gói Cơ bản. Gói Dùng thử chỉ mời tay.");
    }

    // 0.4 bước 6 — X dùng chung cho tự xử lý hồ sơ, phải lớn hơn Y của tin.
    if (patch.minScore !== undefined && patch.minScore <= job.rejectSuggestBelowScore) {
      throw new AppError(
        400,
        `Ngưỡng phù hợp phải lớn hơn ngưỡng đề xuất từ chối (${job.rejectSuggestBelowScore}%).`,
      );
    }

    const reopens = reopensAutoOutreach(toSettings(job), patch);
    const updated = await this.repository.updateJob(job.id, { ...patch, clearExhausted: reopens });
    // Không chờ lượt chạy: trạng thái trả về là của lúc này, frontend đọc lại sau.
    if (reopens && updated.autoOutreachEnabled && updated.status === "PUBLISHED" && policy?.autoAllowed) {
      this.trigger(updated.companyId);
    }
    // Hạ X ⇒ hồ sơ Chờ duyệt vừa đạt ngưỡng được tự chuyển ngay (lối 3, bước 4b của 0.4). Không
    // phụ thuộc công tắc tự mời hay gói: câu chọn tự lọc `autoReviewEnabled` và tin không hiển thị.
    if (updated.autoOutreachMinScore < job.autoOutreachMinScore && updated.status === "PUBLISHED") {
      this.autoReviewTrigger({ jobPostId: updated.id });
    }
    return this.toJobDto(updated, policy);
  }

  // ─── Cài đặt của công ty ─────────────────────────────────────────────────

  /** Mọi employer của công ty đều xem được. */
  async getCompanySettings(userId: string): Promise<CompanyOutreachSettings> {
    const { companyId } = await this.employerIdentityCache.require(userId);
    const percent = await this.outreachRepository.findAutoSharePercent(companyId);
    if (percent === null) throw new AppError(404, "Employer profile not found");
    return { autoSharePercent: percent };
  }

  /** AD-23 mục 5 — chỉ quản trị viên công ty được sửa (như mua gói, tạo mã mời). */
  async updateCompanySettings(userId: string, settings: CompanyOutreachSettings): Promise<CompanyOutreachSettings> {
    const employer = await this.employerRepository.findByUserId(userId);
    if (!employer) throw new AppError(404, "Employer profile not found");
    if (!employer.isCompanyAdmin) {
      throw new AppError(403, "Chỉ quản trị viên công ty được đổi tỉ lệ tự động mời.");
    }
    const percent = await this.outreachRepository.updateAutoSharePercent(employer.companyId, settings.autoSharePercent);
    return { autoSharePercent: percent };
  }

  // ─── Lượt chạy nền (bước 5) ──────────────────────────────────────────────

  /** Gọi, không chờ; lỗi chỉ ghi log. Mốc dừng = lúc gọi + AUTO_OUTREACH_RUN_BUDGET_MS. */
  trigger(companyId: string): void {
    void this.runForCompany(companyId, Date.now() + AUTO_OUTREACH_RUN_BUDGET_MS).catch((error: unknown) => {
      this.logger.error("Auto outreach run failed", {
        companyId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Một lượt tự động mời cho một công ty (AD-23 mục 3, plan bước 5). Khoá Redis theo công
   * ty: đang có lượt khác thì bỏ qua. `deadline` (epoch ms) chặn phần tìm + chấm điểm;
   * quá mốc thì các tin chưa xét để lượt sau. Phần gửi không xét mốc dừng: đã bị chặn
   * bởi số lượt còn lại R, và bỏ dở thì phí phần chấm điểm vừa làm.
   */
  async runForCompany(companyId: string, deadline: number): Promise<AutoOutreachRunResult> {
    if (!(await this.runStore.tryLock(companyId))) return { status: "LOCKED" };
    const startedAt = Date.now();
    try {
      const result = await this.runLocked(companyId, deadline);
      if (result.status === "DONE") {
        this.logger.info("Auto outreach run", { companyId, ...result, durationMs: Date.now() - startedAt });
      }
      return result;
    } finally {
      // Ghi mốc cả khi lượt dừng sớm: cron xoay vòng theo lần được xét, không theo lần có gửi.
      await this.runStore.setLastRun(companyId, new Date(startedAt)).catch(() => undefined);
      await this.runStore.unlock(companyId);
    }
  }

  private async runLocked(companyId: string, deadline: number): Promise<AutoOutreachRunResult> {
    // 1–3. Gói, hạn mức, số lượt tự động còn lại R.
    const company = await this.outreachRepository.findOutreachCompany(companyId);
    if (!company) return { status: "SKIPPED", reason: "NO_COMPANY" };
    const policy = await this.outreachService.lookupDailyQuota({ companyId, company });
    if (!policy?.autoAllowed) return { status: "SKIPPED", reason: "PLAN_NOT_ALLOWED" };
    const [usage, sharePercent] = await Promise.all([
      this.rateLimit.getUsage(companyId),
      this.outreachRepository.findAutoSharePercent(companyId),
    ]);
    const autoLimit = autoDailyLimit(policy.dailyQuota, sharePercent ?? 0);
    let remaining = autoRunRemaining(policy.dailyQuota, autoLimit, usage);
    if (remaining <= 0) return { status: "SKIPPED", reason: "NO_ROOM" };

    // 4. Lọc rẻ: tin còn thiếu, chưa tuyển đủ, người đăng không bị khoá, đã tới lúc kiểm lại.
    const now = new Date();
    let awaitingRecheck = 0;
    const dueJobs: Array<Pick<ScannedJob, "row" | "target" | "deficit">> = [];
    for (const row of await this.repository.findRunnableJobs(companyId)) {
      if (row.posterSuspended || row.hired >= row.hiringTarget) continue;
      const target = row.hiringTarget * policy.poolMultiplier;
      const deficit = target - row.active;
      if (deficit <= 0) continue;
      if (isAwaitingRecheck(row, now)) {
        awaitingRecheck += 1;
        continue;
      }
      dueJobs.push({ row, target, deficit });
    }
    if (dueJobs.length === 0) return { status: "SKIPPED", reason: "NO_JOB" };
    // Xét tin thiếu nhiều nhất trước: hết giờ giữa chừng thì tin cần nhất đã có hàng chờ.
    dueJobs.sort((left, right) => right.deficit / right.target - left.deficit / left.target);

    // 5. Tìm + chấm từng tin, nhường event loop cho request web giữa hai tin.
    const scanned: ScannedJob[] = [];
    let exhausted = 0;
    let deferred = 0;
    for (const [index, job] of dueJobs.entries()) {
      if (Date.now() >= deadline) {
        deferred = dueJobs.length - index;
        break;
      }
      if (index > 0) await yieldToEventLoop();
      // Đọc bảng: lấy tối đa 2R người (phần dư bù cho người bị bỏ qua do lượt khác vừa mời).
      const queue = await this.buildQueue(job.row, remaining * 2);
      if (queue === null) continue; // chấm lỗi ⇒ bỏ qua tin lượt này, không đặt dấu
      if (queue.length === 0) {
        const reason = (await this.repository.hasCappedSkillMatch(job.row.id)) ? "CANDIDATE_CAP" : "NO_MATCH";
        await this.repository.markExhausted(job.row.id, reason);
        exhausted += 1;
        continue;
      }
      if (job.row.exhaustedAt) await this.repository.clearExhausted(job.row.id);
      scanned.push({ ...job, queue, sent: 0 });
    }

    // 6–7. Chia lượt xoay vòng rồi gửi. Người bị bỏ qua thì thử người kế tiếp của cùng
    // tin, không tốn lượt; gặp QUOTA thì dừng cả lượt. Hàng chờ của một tin có thể cạn vì
    // bị bỏ qua ⇒ lượt dư được chia lại cho các tin còn người ở vòng sau.
    const context: RunContext = {
      companyId,
      companyName: company.name,
      limit: { daily: policy.dailyQuota, auto: autoLimit },
      skipped: {},
    };
    const byId = new Map(scanned.map((job) => [job.row.id, job]));
    let sent = 0;
    let stoppedByQuota = false;
    while (remaining > 0 && !stoppedByQuota) {
      const slots = allocateRoundRobin(scanned.map(toAllocationJob), remaining);
      if (slots.length === 0) break;
      let sentThisRound = 0;
      for (const jobPostId of slots) {
        const outcome = await this.sendNext(byId.get(jobPostId)!, context);
        if (outcome === "QUOTA") {
          stoppedByQuota = true;
          break;
        }
        if (outcome === "SENT") sentThisRound += 1;
      }
      sent += sentThisRound;
      remaining -= sentThisRound;
      if (sentThisRound === 0) break;
    }

    // 8. Một thông báo/tin/ngày cho người đăng tin.
    await this.notifySent(scanned.filter((job) => job.sent > 0));

    return {
      status: "DONE",
      jobsScanned: dueJobs.length - deferred,
      jobsAwaitingRecheck: awaitingRecheck,
      jobsDeferred: deferred,
      jobsExhausted: exhausted,
      sent,
      skipped: context.skipped,
      stoppedByQuota,
    };
  }

  /**
   * Hàng chờ của một tin, điểm giảm dần. Tin đã có bảng điểm (`matchScoresAt`) thì đọc thẳng
   * từ bảng, không chấm lại (0.6 bước 6, AD-27 mục 7): điểm được giữ mới bởi chấm lại theo
   * ứng viên. Tin chưa chấm lần nào thì đi đường cũ: pool ≤ 50 (bỏ người đủ trần hôm nay) →
   * chấm → lọc ≥ ngưỡng; null khi chấm lỗi.
   */
  private async buildQueue(row: RunnableJobRow, scoredLimit: number): Promise<ScannedJob["queue"] | null> {
    if (row.matchScoresAt) {
      const scored = await this.repository.findScoredQueue(row.id, row.minScore, scoredLimit);
      return scored.map(({ candidateId, score, weightsVersion }) => ({ candidateId, match: { score, weightsVersion } }));
    }
    const poolIds = await this.outreachRepository.searchCandidatePool(row.id, AUTO_OUTREACH_PREFILTER_LIMIT, {
      excludeCappedToday: true,
    });
    if (poolIds.length === 0) return [];
    let scores: Map<string, MatchResult>;
    try {
      scores = await this.outreachService.scorePool(row.id, poolIds, AUTO_OUTREACH_MAX_NEW_EMBEDDINGS);
    } catch (error) {
      this.logger.error("Auto outreach scoring failed — skipping job this run", {
        jobPostId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
    // sort ổn định ⇒ điểm bằng nhau giữ thứ tự của pool (nhiều kỹ năng giao hơn trước).
    return poolIds
      .flatMap((candidateId) => {
        const match = scores.get(candidateId);
        return match && match.score !== null && match.score >= row.minScore ? [{ candidateId, match }] : [];
      })
      .sort((left, right) => (right.match.score ?? 0) - (left.match.score ?? 0));
  }

  /** Gửi cho người kế tiếp trong hàng chờ của tin; người không mời được thì bỏ qua, thử tiếp. */
  private async sendNext(job: ScannedJob, context: RunContext): Promise<"SENT" | "EMPTY" | "QUOTA"> {
    while (job.queue.length > 0) {
      const next = job.queue.shift()!;
      const result = await this.outreachService.createInvitation({
        // AD-23 mục 9 — lời mời tự động đứng tên người đăng tin.
        sender: { employerId: job.row.employerId, companyId: context.companyId, companyName: context.companyName },
        jobPost: { id: job.row.id, title: job.row.title },
        candidateId: next.candidateId,
        source: "AUTO",
        limit: context.limit,
        match: next.match,
      });
      if (result.created) {
        job.sent += 1;
        job.deficit -= 1;
        return "SENT";
      }
      context.skipped[result.reason] = (context.skipped[result.reason] ?? 0) + 1;
      if (result.reason === "QUOTA") return "QUOTA";
    }
    return "EMPTY";
  }

  private async notifySent(jobs: ScannedJob[]): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    for (const job of jobs) {
      try {
        await this.notificationsService.notifyOnce(
          "AUTO_OUTREACH_SENT",
          job.row.employerUserId,
          { jobPostId: job.row.id, jobPostTitle: job.row.title, sentCount: job.sent },
          `auto-outreach:${job.row.id}:${day}`,
        );
      } catch (error) {
        // Lời mời đã gửi xong; thiếu thông báo không được làm hỏng lượt chạy.
        this.logger.error("Auto outreach notification failed", {
          jobPostId: job.row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async toJobDto(job: JobAutoOutreachRow, policy: OutreachQuotaPolicy | null): Promise<JobAutoOutreachDto> {
    const now = new Date();
    // Số Phù hợp đọc từ bảng điểm lưu sẵn (0.3), không chấm lúc mở thẻ.
    const [counts, progress] = await Promise.all([
      this.repository.countJob(job.id, now),
      this.matchScoreRepository.progressForJob(job.id),
    ]);
    const { state, nextCheckAt } = resolveAutoOutreachState(
      {
        autoAllowed: policy?.autoAllowed ?? false,
        enabled: job.autoOutreachEnabled,
        jobStatus: job.status,
        hiringTarget: job.hiringTarget,
        hiredCount: counts.hiredCount,
        exhaustedAt: job.autoOutreachExhaustedAt,
        exhaustedReason: job.autoOutreachExhaustedReason,
      },
      now,
    );
    return {
      ...toSettings(job),
      state,
      status: {
        target: policy?.autoAllowed ? job.hiringTarget * policy.poolMultiplier : null,
        active: counts.pending + counts.acceptedInvitations,
        pending: counts.pending,
        acceptedInvitations: counts.acceptedInvitations,
        hiredCount: counts.hiredCount,
        autoSentToday: counts.autoSentToday,
        nextCheckAt: nextCheckAt ? nextCheckAt.toISOString() : null,
        matched: progress?.matched ?? 0,
        matchedApplied: progress?.matchedApplied ?? 0,
        interviewing: progress?.interviewing ?? 0,
        matchScoresAt: progress?.matchScoresAt?.toISOString() ?? null,
      },
    };
  }

  // Cần company để tra gói ⇒ đọc mới nhất theo companyId (AD-19, như CandidateOutreachService).
  private async requireEmployer(userId: string): Promise<OutreachEmployer> {
    const { employerId, companyId } = await this.employerIdentityCache.require(userId);
    const company = await this.outreachRepository.findOutreachCompany(companyId);
    if (!company) throw new AppError(404, "Employer profile not found");
    return { id: employerId, companyId, company };
  }

  /** Chỉ người đăng tin — tin của người khác trả 404 như không tồn tại (cùng quy tắc B3). */
  private async requireOwnedJob(employer: Pick<OutreachEmployer, "id">, jobPostId: string): Promise<JobAutoOutreachRow> {
    const job = await this.repository.findJob(jobPostId);
    if (!job || job.employerId !== employer.id) throw new AppError(404, "Job post not found");
    return job;
  }
}

function toAllocationJob(job: ScannedJob): AllocationJob {
  return {
    jobPostId: job.row.id,
    deficit: job.deficit,
    target: job.target,
    expiresAt: job.row.expiresAt,
    available: job.queue.length,
  };
}

function toSettings(job: JobAutoOutreachRow): { enabled: boolean; minScore: number; hiringTarget: number } {
  return { enabled: job.autoOutreachEnabled, minScore: job.autoOutreachMinScore, hiringTarget: job.hiringTarget };
}
