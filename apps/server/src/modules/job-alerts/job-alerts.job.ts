import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import { JOB_ALERT_DAILY_CRON } from "./job-alerts.config";
import type { JobAlertService } from "./job-alert.service";

export interface JobAlertsJobDeps {
  jobAlertService: JobAlertService;
  logger: Logger;
}

/**
 * AD-26 D8, D10 — 8h giờ Việt Nam hằng ngày: email gộp job alert rồi nhắc một lần cho ứng viên
 * chưa có kỹ năng. `runDaily` tự ghi log tổng kết; ở đây chỉ báo lượt bị bỏ qua và lỗi.
 */
export function startJobAlertsJob(deps: JobAlertsJobDeps): void {
  const run = async () => {
    try {
      const result = await deps.jobAlertService.runDaily();
      if (result.status === "LOCKED") deps.logger.warn("Job alert daily run skipped: another run is in progress");
    } catch (error) {
      deps.logger.error("Job alert daily run failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  cron.schedule(JOB_ALERT_DAILY_CRON, () => void run(), { timezone: "Asia/Ho_Chi_Minh" });
}
