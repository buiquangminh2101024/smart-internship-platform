import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";
import { AuditLogController } from "./audit-log.controller";
import { activityListQuerySchema } from "./audit-log.dto";
import { AuditLogRepository } from "./audit-log.repository";
import { AuditLogService } from "./audit-log.service";

/**
 * AuditLogService là dịch vụ dùng chéo (AD-16), đăng ký ở đây theo đúng pattern
 * của notificationsRouter — các module nghiệp vụ destructure `auditLogService`
 * từ cradle. Route duy nhất là API đọc nhật ký cho Admin.
 */
export function auditLogRouter(container: AwilixContainer): Router {
  container.register({
    auditLogRepository: asClass(AuditLogRepository).singleton(),
    auditLogService: asClass(AuditLogService).singleton(),
    auditLogController: asClass(AuditLogController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<AuditLogController>("auditLogController");
  const adminGuard = [authenticate(container), authorize("ADMIN")];

  router.get("/admin/activity", ...adminGuard, validate(activityListQuerySchema, "query"), (req, res, next) => {
    void resolveController().listActivity(req, res, next);
  });

  return router;
}
