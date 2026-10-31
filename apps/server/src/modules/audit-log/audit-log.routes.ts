import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";
import { AuditLogController } from "./audit-log.controller";
import {
  activityExportQuerySchema,
  activityItemParamsSchema,
  activityItemQuerySchema,
  activityListQuerySchema,
  activityStatsQuerySchema,
} from "./audit-log.dto";
import { AuditLogRepository } from "./audit-log.repository";
import { AuditLogService } from "./audit-log.service";

/**
 * AuditLogService là dịch vụ dùng chéo (AD-16), đăng ký ở đây theo đúng pattern
 * của notificationsRouter — các module nghiệp vụ destructure `auditLogService`
 * từ cradle. Các route là API đọc nhật ký cho Admin (AD-20).
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

  // `/stats` và `/export` đăng ký trước `/:id`.
  router.get("/admin/activity/stats", ...adminGuard, validate(activityStatsQuerySchema, "query"), (req, res, next) => {
    void resolveController().getStats(req, res, next);
  });

  router.get("/admin/activity/export", ...adminGuard, validate(activityExportQuerySchema, "query"), (req, res, next) => {
    void resolveController().exportCsv(req, res, next);
  });

  router.get(
    "/admin/activity/:id",
    ...adminGuard,
    validate(activityItemParamsSchema, "params"),
    validate(activityItemQuerySchema, "query"),
    (req, res, next) => {
      void resolveController().getActivity(req, res, next);
    },
  );

  return router;
}
