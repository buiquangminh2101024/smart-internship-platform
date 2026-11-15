import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import { AUTOMATION_DAILY_RUN_VN } from "./application-automation.config";
import type { ApplicationAutomationService } from "./application-automation.service";

export interface ApplicationAutomationJobDeps {
  applicationAutomationService: ApplicationAutomationService;
  logger: Logger;
}

/** Biểu thức cron của lượt hằng ngày, dựng từ `AUTOMATION_DAILY_RUN_VN` (8h30 ⇒ "30 8 * * *"). */
export const APPLICATION_AUTOMATION_CRON = `${AUTOMATION_DAILY_RUN_VN.minute} ${AUTOMATION_DAILY_RUN_VN.hour} * * *`;

/**
 * AD-25 — lượt hằng ngày của tự xử lý hồ sơ (bước 7): tự chuyển "Đang xem xét" rồi tự đóng
 * "Tin đã đóng". Chạy 8h30 giờ Việt Nam: sau lượt chấm điểm 3h30 (bắt hồ sơ vừa có điểm) và ban
 * ngày để email tới ứng viên không gửi lúc nửa đêm. Nhắc tuần tính ngày tự đóng theo cùng hằng giờ.
 * `runDaily` tự ghi log tổng kết; ở đây chỉ báo lượt bị bỏ qua và lỗi.
 */
export function startApplicationAutomationJob(deps: ApplicationAutomationJobDeps): void {
  const run = async () => {
    try {
      const result = await deps.applicationAutomationService.runDaily();
      if (result.status === "LOCKED") {
        deps.logger.warn("Application automation run skipped: another run is in progress");
      }
    } catch (error) {
      deps.logger.error("Application automation run failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  cron.schedule(APPLICATION_AUTOMATION_CRON, () => void run(), { timezone: "Asia/Ho_Chi_Minh" });
}
