import type { Logger } from "../../shared/logger";
import type { ApplicationsService } from "../applications/applications.service";
import { AUTOMATION_MAX_PER_RUN, AUTOMATION_YIELD_EVERY } from "./application-automation.config";
import { closeDecision, type AutoCloseGroup } from "./application-automation.policy";
import type { ApplicationAutomationRepository, AutomationScope } from "./application-automation.repository";

/**
 * Tự chuyển "Đang xem xét" cho một hồ sơ (vừa nộp) hoặc một tin (vừa hạ X / bật lại công tắc):
 * gọi, không chờ, lỗi chỉ ghi log. Đăng ký trong awilix dưới tên `autoReviewTrigger`, resolve
 * ApplicationAutomationService lúc gọi ⇒ ApplicationsService dùng được mà không tạo vòng phụ
 * thuộc (giống `autoOutreachTrigger`, `matchScoreTrigger`).
 */
export type AutoReviewTrigger = (target: { applicationId: string } | { jobPostId: string }) => void;

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
  private readonly logger: Logger;
  /** Không chạy chồng `runDaily` (một process, AD-23 mục 8). */
  private dailyRunning = false;

  constructor({
    applicationAutomationRepository,
    applicationsService,
    logger,
  }: {
    applicationAutomationRepository: ApplicationAutomationRepository;
    applicationsService: ApplicationsService;
    logger: Logger;
  }) {
    this.repository = applicationAutomationRepository;
    this.applicationsService = applicationsService;
    this.logger = logger;
  }

  /** Lối 2 và 3 của bước 4b. Hồ sơ đang được lượt khác xử lý thì câu UPDATE có điều kiện chặn trùng. */
  trigger(scope: { applicationId: string } | { jobPostId: string }): void {
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
