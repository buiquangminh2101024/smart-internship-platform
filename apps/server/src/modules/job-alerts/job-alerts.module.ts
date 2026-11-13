import { asClass, asValue, type AwilixContainer } from "awilix";
import type { JobScoredListener } from "../match-scores/match-score.service";
import { JobAlertRepository } from "./job-alert.repository";
import { JobAlertService } from "./job-alert.service";
import { JobAlertsController } from "./job-alerts.controller";

/**
 * Job alert (0.5, AD-26 D7–D9). `job-alerts` đọc bảng điểm và gọi `notifications`; chiều
 * ngược lại (match-scores báo "đã chấm xong tin") chỉ đi qua `jobScoredListener`, resolve
 * service lúc gọi ⇒ không có vòng phụ thuộc (giống `matchScoreTrigger`). Phải đăng ký trước
 * khi main.ts resolve matchScoreService.
 */
export function registerJobAlerts(container: AwilixContainer): void {
  container.register({
    jobAlertRepository: asClass(JobAlertRepository).singleton(),
    // Singleton bắt buộc: hàng đợi các lượt onJobScored phải dùng chung cho mọi lối gọi.
    jobAlertService: asClass(JobAlertService).singleton(),
    jobAlertsController: asClass(JobAlertsController).singleton(),
    jobScoredListener: asValue<JobScoredListener>((jobPostId) => {
      container.resolve<JobAlertService>("jobAlertService").trigger(jobPostId);
    }),
  });
}
