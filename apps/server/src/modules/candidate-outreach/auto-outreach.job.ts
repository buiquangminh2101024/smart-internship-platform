import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import { orderCompaniesByLastRun } from "./auto-outreach.policy";
import type { AutoOutreachRepository } from "./auto-outreach.repository";
import type { AutoOutreachRunStore } from "./auto-outreach-run-store";
import type { AutoOutreachService } from "./auto-outreach.service";
import { AUTO_OUTREACH_RUN_BUDGET_MS } from "./candidate-outreach.config";

export interface AutoOutreachJobDeps {
  autoOutreachRepository: AutoOutreachRepository;
  autoOutreachRunStore: AutoOutreachRunStore;
  autoOutreachService: AutoOutreachService;
  logger: Logger;
}

export interface AutoOutreachCycleResult {
  companies: number;
  processed: number;
  /** Công ty chưa tới lượt vì hết thời gian — `last-run` cũ hơn nên lượt sau xử lý trước. */
  deferred: number;
  sent: number;
}

/**
 * Một lượt cron (AD-23, plan bước 5, Q3/Q4): lưới an toàn cho các lối kích hoạt tức thì
 * (đăng tin, ứng viên từ chối, đổi cài đặt) và nơi mời bù khi lời mời hết hạn. Chạy tuần
 * tự từng công ty, công ty chạy lâu nhất trước, dùng chung một mốc dừng.
 */
export async function runAutoOutreachCycle(
  deps: AutoOutreachJobDeps,
  budgetMs: number = AUTO_OUTREACH_RUN_BUDGET_MS,
): Promise<AutoOutreachCycleResult> {
  const deadline = Date.now() + budgetMs;
  const companyIds = await deps.autoOutreachRepository.findCompaniesWithAutoJobs();
  const ordered = orderCompaniesByLastRun(companyIds, await deps.autoOutreachRunStore.getLastRuns(companyIds));

  const result: AutoOutreachCycleResult = { companies: ordered.length, processed: 0, deferred: 0, sent: 0 };
  for (const [index, companyId] of ordered.entries()) {
    if (Date.now() >= deadline) {
      result.deferred = ordered.length - index;
      break;
    }
    try {
      const run = await deps.autoOutreachService.runForCompany(companyId, deadline);
      if (run.status === "DONE") result.sent += run.sent;
    } catch (error) {
      // Lỗi của một công ty không chặn các công ty sau.
      deps.logger.error("Auto outreach run failed", {
        companyId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    result.processed += 1;
  }
  return result;
}

/** Mỗi 15 phút (Q3). Không chạy chồng: lượt trước chưa xong thì lượt này bỏ qua. */
export function startAutoOutreachJob(deps: AutoOutreachJobDeps): void {
  let running = false;
  cron.schedule("*/15 * * * *", () => {
    if (running) {
      deps.logger.warn("Auto outreach cycle skipped — previous cycle still running");
      return;
    }
    running = true;
    const startedAt = Date.now();
    void runAutoOutreachCycle(deps)
      .then((result) => {
        if (result.companies > 0) {
          deps.logger.info("Auto outreach cycle", { ...result, durationMs: Date.now() - startedAt });
        }
      })
      .catch((error: unknown) => {
        deps.logger.error("Auto outreach cycle failed", { error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        running = false;
      });
  });
}
