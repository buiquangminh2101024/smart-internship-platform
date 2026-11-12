import { Router } from "express";
import { asClass, asValue, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";
import { ApplicationAutomationController } from "./application-automation.controller";
import { updateJobApplicationAutomationSchema } from "./application-automation.dto";
import { ApplicationAutomationRepository } from "./application-automation.repository";
import { ApplicationAutomationService, type AutoReviewTrigger } from "./application-automation.service";

/**
 * Tự xử lý hồ sơ chờ lâu (0.4, AD-25). Cron ở bước 7. Service cần applicationsService; resolve
 * lúc dùng nên thứ tự đăng ký chỉ để dễ đọc. Phải đăng ký trước request đầu tiên vì
 * ApplicationsService cần `autoReviewTrigger`, và trước khi main.ts resolve autoOutreachService
 * (service đó cũng nhận `autoReviewTrigger`).
 */
export function registerApplicationAutomation(container: AwilixContainer): void {
  container.register({
    applicationAutomationRepository: asClass(ApplicationAutomationRepository).singleton(),
    // Singleton bắt buộc: cờ "đang chạy" của runDaily phải dùng chung cho mọi lối gọi.
    applicationAutomationService: asClass(ApplicationAutomationService).singleton(),
    applicationAutomationController: asClass(ApplicationAutomationController).singleton(),
    autoReviewTrigger: asValue<AutoReviewTrigger>((target) => {
      container.resolve<ApplicationAutomationService>("applicationAutomationService").trigger(target);
    }),
  });
}

/** Đăng ký module rồi trả route cài đặt theo tin (bước 6). */
export function applicationAutomationRouter(container: AwilixContainer): Router {
  registerApplicationAutomation(container);

  const router = Router();
  const resolveController = () => container.resolve<ApplicationAutomationController>("applicationAutomationController");
  const employerGuard = [authenticate(container), authorize("EMPLOYER")];

  // Chỉ người đăng tin (như cài đặt tự mời); tin của người khác ⇒ 404.
  router.get("/employer/job-posts/:jobId/application-automation", ...employerGuard, (req, res, next) => {
    void resolveController().getJobSettings(req, res, next);
  });

  router.patch(
    "/employer/job-posts/:jobId/application-automation",
    ...employerGuard,
    validate(updateJobApplicationAutomationSchema),
    (req, res, next) => {
      void resolveController().updateJobSettings(req, res, next);
    },
  );

  return router;
}
