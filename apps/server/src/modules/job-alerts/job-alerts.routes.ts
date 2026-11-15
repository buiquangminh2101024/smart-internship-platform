import { Router } from "express";
import type { AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";
import { updateJobAlertSettingsSchema } from "./job-alerts.dto";
import type { JobAlertsController } from "./job-alerts.controller";
import { registerJobAlerts } from "./job-alerts.module";

/** Đăng ký module rồi trả route cài đặt job alert của ứng viên (AD-26 D9). */
export function jobAlertsRouter(container: AwilixContainer): Router {
  registerJobAlerts(container);

  const router = Router();
  const resolveController = () => container.resolve<JobAlertsController>("jobAlertsController");
  const candidateGuard = [authenticate(container), authorize("CANDIDATE")];

  router.get("/candidate/job-alert-settings", ...candidateGuard, (req, res, next) => {
    void resolveController().getSettings(req, res, next);
  });

  router.patch(
    "/candidate/job-alert-settings",
    ...candidateGuard,
    validate(updateJobAlertSettingsSchema),
    (req, res, next) => {
      void resolveController().updateSettings(req, res, next);
    },
  );

  return router;
}
