import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import type { LiveRescoreService } from "./live-rescore.service";

export interface LiveRescoreJobDeps {
  liveRescoreService: LiveRescoreService;
  logger: Logger;
}

/**
 * Cron 15 phút của chấm lại theo ứng viên (D3, AD-27 mục 3): lưới an toàn cho hẹn giờ chờ
 * ngừng sửa (hẹn giờ mất khi server khởi động lại, vượt trần hẹn giờ, lô lỗi, người vượt
 * giới hạn embedding). Không chạy chồng: `drain` trả BUSY khi đang có lượt khác.
 */
export function startLiveRescoreJob(deps: LiveRescoreJobDeps): void {
  cron.schedule("*/15 * * * *", () => {
    void deps.liveRescoreService.drain("cron").then((result) => {
      if (result.status === "BUSY") deps.logger.info("Live rescore cron: a run is in progress, it will run once more");
    });
  });
}
