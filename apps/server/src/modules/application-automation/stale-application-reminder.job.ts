import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import type { ApplicationAutomationService } from "./application-automation.service";

export interface StaleApplicationReminderJobDeps {
  applicationAutomationService: ApplicationAutomationService;
  logger: Logger;
}

/**
 * AD-25 — nhắc công ty về hồ sơ tồn, thứ Hai 8h giờ Việt Nam (quyết định #4). Mỗi employer
 * chỉ nhận một thông báo mỗi tuần nhờ `dedupeKey`. Gọi trong `main.ts` ở bước 7.
 */
export function startStaleApplicationReminderJob(deps: StaleApplicationReminderJobDeps): void {
  cron.schedule(
    "0 8 * * 1",
    () => {
      void deps.applicationAutomationService.runWeeklyReminder().catch((error: unknown) => {
        deps.logger.error("Stale application reminder failed", { error: error instanceof Error ? error.message : String(error) });
      });
    },
    { timezone: "Asia/Ho_Chi_Minh" },
  );
}
