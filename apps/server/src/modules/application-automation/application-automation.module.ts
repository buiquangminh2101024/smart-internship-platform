import { asClass, asValue, type AwilixContainer } from "awilix";
import { ApplicationAutomationRepository } from "./application-automation.repository";
import { ApplicationAutomationService, type AutoReviewTrigger } from "./application-automation.service";

/**
 * Tự xử lý hồ sơ chờ lâu (0.4, AD-25). Chưa có route riêng: API cài đặt theo tin ở bước 6,
 * cron ở bước 7. Service cần applicationsService; resolve lúc dùng nên thứ tự đăng ký chỉ để
 * dễ đọc. Phải đăng ký trước request đầu tiên vì ApplicationsService cần `autoReviewTrigger`.
 */
export function registerApplicationAutomation(container: AwilixContainer): void {
  container.register({
    applicationAutomationRepository: asClass(ApplicationAutomationRepository).singleton(),
    // Singleton bắt buộc: cờ "đang chạy" của runDaily phải dùng chung cho mọi lối gọi.
    applicationAutomationService: asClass(ApplicationAutomationService).singleton(),
    autoReviewTrigger: asValue<AutoReviewTrigger>((target) => {
      container.resolve<ApplicationAutomationService>("applicationAutomationService").trigger(target);
    }),
  });
}
