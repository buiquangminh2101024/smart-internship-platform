// AD-29 — chấm và lưu điểm chất lượng tin (docs/06-backend/job-quality-moderation/PLAN.md, bước 4–4b).
// Nạp input qua `JobQualityInputLoader`, chấm bằng hàm thuần `scoreJobPost`, ghi các cột `quality*`
// của `job_posts`. Điểm chỉ là gợi ý cho Admin: không đổi trạng thái tin, không tự gỡ tin.
import { Prisma, type JobQualityBand, type ModerationActionType, type PrismaClient } from "@prisma/client";
import type { JobQualityDto, JobQualityScoredReason } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { NotificationsService } from "../notifications/notifications.service";
import type { UserRepository } from "../users/user.repository";
import { contentHash, scoreJobPost, type JobQualityResult } from "./job-quality";
import type { JobQualityInputLoader } from "./job-quality-input.loader";
import { toJobQualityDto } from "./job-quality.mapper";

type Db = PrismaClient | Prisma.TransactionClient;

/** Nội dung cột `qualityBreakdown`. */
export interface StoredJobQualityBreakdown {
  criteria: JobQualityResult["criteria"];
  flags: JobQualityResult["flags"];
  /** Vì sao chấm lần này — trang chi tiết hiện cho Admin biết vì sao điểm đổi. */
  reason: JobQualityScoredReason;
  /** Cờ "gửi lại không sửa": các lần chấm lại tin PENDING giữ nguyên cờ này (xem loader). */
  resubmittedUnchanged: boolean;
}

/** Các cột `job_posts` mà một lần chấm ghi. */
export interface JobQualityColumns {
  qualityScore: number | null;
  qualityBand: JobQualityBand | null;
  qualityBreakdown: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  qualityVersion: number | null;
  qualityScoredAt: Date | null;
}

/** Cột ghi cùng lệnh đổi trạng thái của `submitForApproval`. */
export interface JobQualitySubmissionColumns extends JobQualityColumns {
  submittedAt: Date;
  /** Chỉ có khi chấm được; chấm lỗi thì giữ mã của lần gửi trước. */
  submittedContentHash?: string;
}

/** Tin đang gửi duyệt, như `JobPostRepository.findById` trả về (thao tác kiểm duyệt mới nhất trước). */
export interface JobQualitySubmissionTarget {
  id: string;
  submittedContentHash: string | null;
  moderationActions: ReadonlyArray<{ action: ModerationActionType }>;
}

export interface StoredJobQuality {
  jobPostId: string;
  status: string;
  title: string;
  result: JobQualityResult;
  columns: JobQualityColumns;
}

/** Chấm lỗi lúc gửi duyệt ⇒ tin vẫn vào hàng đợi, ở vùng "chưa chấm". */
const UNSCORED_COLUMNS: JobQualityColumns = {
  qualityScore: null,
  qualityBand: null,
  qualityBreakdown: Prisma.DbNull,
  qualityVersion: null,
  qualityScoredAt: null,
};

function toColumns(
  result: JobQualityResult,
  options: { reason: JobQualityScoredReason; now: Date; resubmittedUnchanged: boolean },
): JobQualityColumns {
  const breakdown: StoredJobQualityBreakdown = {
    criteria: result.criteria,
    flags: result.flags,
    reason: options.reason,
    resubmittedUnchanged: options.resubmittedUnchanged,
  };
  return {
    qualityScore: result.score,
    qualityBand: result.band,
    qualityBreakdown: breakdown as unknown as Prisma.InputJsonValue,
    qualityVersion: result.version,
    qualityScoredAt: options.now,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Cờ chặn của lần chấm trước, đọc từ `qualityBreakdown` (null / hỏng ⇒ chưa có cờ). */
function storedFlags(breakdown: unknown): string[] {
  if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) return [];
  const flags = (breakdown as Record<string, unknown>).flags;
  return Array.isArray(flags) ? flags.filter((flag): flag is string => typeof flag === "string") : [];
}

/**
 * Q7 — tin đang hiển thị "chuyển sang xấu" sau khi sửa: vùng trước không phải SUGGEST_REJECT
 * (kể cả chưa từng chấm) mà vùng sau là SUGGEST_REJECT, hoặc có cờ chặn mà lần trước chưa có.
 * Sửa tiếp mà vẫn xấu như cũ ⇒ false, để không báo lặp.
 */
export function qualityTurnedBad(
  before: { band: JobQualityBand | null; flags: readonly string[] },
  after: { band: JobQualityBand; flags: readonly string[] },
): boolean {
  if (before.band !== "SUGGEST_REJECT" && after.band === "SUGGEST_REJECT") return true;
  return after.flags.some((flag) => !before.flags.includes(flag));
}

/**
 * Q4 — lối kích hoạt "công ty có sự kiện" (báo cáo mới, xử lý báo cáo, thu hồi tin): chấm lại
 * mọi tin PENDING của công ty. Gọi sau commit, không chờ, lỗi chỉ ghi log. Đăng ký `asValue`
 * trong job-posts.routes.ts, resolve JobQualityService lúc gọi (giống `matchScoreTrigger`), để
 * module job-reports gọi được mà không phụ thuộc ngược vào job-posts.
 */
export type JobQualityCompanyTrigger = (companyId: string) => void;

/** Tin đang hiển thị vừa được sửa, như `JobPostRepository.findById` trả về TRƯỚC khi sửa. */
export interface JobQualityPublishedEditTarget {
  id: string;
  title: string;
  company: { name: string };
  qualityBand: JobQualityBand | null;
  qualityBreakdown: unknown;
}

interface Deps {
  prisma: PrismaClient;
  jobQualityInputLoader: JobQualityInputLoader;
  logger: Logger;
  userRepository: UserRepository;
  notificationsService: NotificationsService;
}

export class JobQualityService {
  private readonly prisma: PrismaClient;
  private readonly loader: JobQualityInputLoader;
  private readonly logger: Logger;
  private readonly userRepository: UserRepository;
  private readonly notificationsService: NotificationsService;
  /**
   * Công ty đang được chấm lại (Q4). Sự kiện mới tới giữa lượt ⇒ chỉ bật `rerun`, lượt đang chạy
   * chấm thêm một vòng khi xong. Cần vì "gỡ tin theo báo cáo" gây hai sự kiện liền nhau (thu hồi
   * tin, rồi báo cáo mới được ghi là đã xác nhận): vòng đầu có thể chưa thấy báo cáo đã xác nhận.
   * Chỉ trong bộ nhớ của process; bắt buộc đăng ký singleton.
   */
  private readonly companyRuns = new Map<string, { rerun: boolean }>();

  constructor({ prisma, jobQualityInputLoader, logger, userRepository, notificationsService }: Deps) {
    this.prisma = prisma;
    this.loader = jobQualityInputLoader;
    this.logger = logger;
    this.userRepository = userRepository;
    this.notificationsService = notificationsService;
  }

  /**
   * Lối gửi duyệt (Q6: cả khi công ty được miễn kiểm duyệt). Chấm TRƯỚC transaction gửi duyệt,
   * nơi gọi ghi kết quả vào cùng lệnh đổi trạng thái. Không bao giờ ném lỗi: chấm lỗi thì ghi
   * log và trả cột rỗng, vì một câu lỗi bên trong transaction Postgres sẽ làm hỏng cả
   * transaction, nên không thể "bắt lỗi rồi gửi duyệt tiếp" nếu chấm bên trong.
   *
   * Tín hiệu được chỉnh như thể lần gửi này đã ghi (dòng SUBMITTED, và APPROVED khi tự đăng),
   * để điểm lúc gửi bằng điểm của một lần chấm lại ngay sau đó.
   */
  async submissionColumns(
    job: JobQualitySubmissionTarget,
    options: { now: Date; autoPublished: boolean },
  ): Promise<JobQualitySubmissionColumns> {
    const { now, autoPublished } = options;
    try {
      const [loaded] = await this.loader.loadMany([job.id], now);
      if (!loaded) throw new Error("Job post not found while scoring");
      const hash = contentHash(loaded.input);
      const signals = loaded.input.signals;
      // So với mã lần gửi trước CHỈ khi thao tác gần nhất là REJECTED: tin bị từ chối mà
      // gửi lại y nguyên. Được duyệt rồi gửi lại (sau khi đóng / hết hạn) không phải lỗi.
      const resubmittedUnchanged = job.moderationActions[0]?.action === "REJECTED" && job.submittedContentHash === hash;
      const result = scoreJobPost(
        {
          ...loaded.input,
          submittedAt: now,
          signals: {
            ...signals,
            resubmittedUnchanged,
            companySubmitCount: signals.companySubmitCount + 1,
            companyApprovedCount: signals.companyApprovedCount + (autoPublished ? 1 : 0),
          },
        },
        now,
      );
      return {
        submittedAt: now,
        ...toColumns(result, { reason: "SUBMITTED", now, resubmittedUnchanged }),
        submittedContentHash: result.contentHash,
      };
    } catch (error) {
      this.logger.error("Job quality scoring failed on submit", { jobPostId: job.id, error: errorMessage(error) });
      return { submittedAt: now, ...UNSCORED_COLUMNS };
    }
  }

  /**
   * Chấm lại và ghi cho nhiều tin (nạp theo lô, ghi từng tin). Không ghi `submittedContentHash`:
   * mã đó chỉ đổi lúc gửi duyệt, để "gửi lại không sửa" vẫn so được với lần gửi trước.
   * Tin không tồn tại (hoặc bị xoá giữa lúc nạp và lúc ghi) bị bỏ qua.
   */
  async scoreAndStoreMany(
    jobPostIds: readonly string[],
    options: { reason: JobQualityScoredReason; now?: Date; db?: Db },
  ): Promise<StoredJobQuality[]> {
    const now = options.now ?? new Date();
    const db = options.db ?? this.prisma;
    const loaded = await this.loader.loadMany(jobPostIds, now, db);
    const stored: StoredJobQuality[] = [];
    for (const row of loaded) {
      const result = scoreJobPost(row.input, now);
      const columns = toColumns(result, { reason: options.reason, now, resubmittedUnchanged: row.input.signals.resubmittedUnchanged });
      // updateMany: tin nháp bị xoá ngay lúc này thì không ném P2025 làm dừng cả lượt.
      const { count } = await db.jobPost.updateMany({ where: { id: row.jobPostId }, data: columns });
      if (count === 1) stored.push({ jobPostId: row.jobPostId, status: row.status, title: row.input.title, result, columns });
    }
    return stored;
  }

  async scoreAndStore(
    jobPostId: string,
    options: { reason: JobQualityScoredReason; now?: Date; db?: Db },
  ): Promise<StoredJobQuality | null> {
    const [stored] = await this.scoreAndStoreMany([jobPostId], options);
    return stored ?? null;
  }

  // ─── Bước 4b — chấm lại theo sự kiện ──────────────────────────────────────

  /**
   * Thân của `jobQualityCompanyTrigger`: không chờ, không ném, gộp các lần gọi trùng công ty.
   * Trả promise của lượt vừa khởi động (để test chờ được); nơi gọi thật bỏ qua giá trị này.
   */
  triggerCompany(companyId: string): Promise<void> {
    const running = this.companyRuns.get(companyId);
    if (running) {
      running.rerun = true;
      return Promise.resolve();
    }
    const state = { rerun: false };
    this.companyRuns.set(companyId, state);
    return (async () => {
      try {
        do {
          state.rerun = false;
          await this.rescorePendingForCompany(companyId);
        } while (state.rerun);
      } catch (error) {
        this.logger.error("Job quality company rescore failed", { companyId, error: errorMessage(error) });
      } finally {
        this.companyRuns.delete(companyId);
      }
    })();
  }

  /**
   * Chấm lại lần lượt mọi tin PENDING của công ty (lý do `COMPANY_EVENT`). Mỗi tin ghi riêng;
   * một tin lỗi chỉ ghi log rồi chạy tiếp tin sau.
   */
  async rescorePendingForCompany(companyId: string): Promise<{ scored: number; failed: number }> {
    const rows = await this.prisma.jobPost.findMany({
      where: { companyId, status: "PENDING" },
      select: { id: true },
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    });
    let scored = 0;
    let failed = 0;
    for (const { id } of rows) {
      try {
        if (await this.scoreAndStore(id, { reason: "COMPANY_EVENT" })) scored += 1;
      } catch (error) {
        failed += 1;
        this.logger.error("Job quality rescore failed for pending job post", { companyId, jobPostId: id, error: errorMessage(error) });
      }
    }
    return { scored, failed };
  }

  /**
   * Q7 — NTD vừa sửa tin PUBLISHED: chấm lại (lý do `PUBLISHED_EDIT`, không ghi
   * `submittedContentHash`) và báo mọi Admin bằng `JOB_POST_QUALITY_DROPPED` khi tin chuyển sang
   * xấu (`qualityTurnedBad`). Không đổi trạng thái tin. Không ném lỗi: lỗi chỉ ghi log, việc sửa
   * tin vẫn thành công. Nơi gọi chờ hàm này (chấm rẻ) trước khi trả response.
   */
  async rescoreAfterPublishedEdit(before: JobQualityPublishedEditTarget): Promise<void> {
    try {
      const stored = await this.scoreAndStore(before.id, { reason: "PUBLISHED_EDIT" });
      if (!stored) return;
      const { result } = stored;
      const turnedBad = qualityTurnedBad(
        { band: before.qualityBand, flags: storedFlags(before.qualityBreakdown) },
        { band: result.band, flags: result.flags },
      );
      if (!turnedBad) return;
      const adminIds = await this.userRepository.findAdminIds();
      await this.notificationsService.notifyMany("JOB_POST_QUALITY_DROPPED", adminIds, {
        jobPostId: before.id,
        jobPostTitle: before.title,
        companyName: before.company.name,
        score: result.score,
        blocked: result.flags.length > 0,
      });
    } catch (error) {
      this.logger.error("Job quality rescore failed after published edit", { jobPostId: before.id, error: errorMessage(error) });
    }
  }

  /** POST /admin/job-posts/:id/quality/rescore — mọi trạng thái, kể cả nháp. */
  async rescore(jobPostId: string): Promise<JobQualityDto> {
    const stored = await this.scoreAndStore(jobPostId, { reason: "MANUAL" });
    const dto = stored ? toJobQualityDto(stored.columns) : null;
    if (!dto) throw new AppError(404, "Job post not found");
    return dto;
  }
}
