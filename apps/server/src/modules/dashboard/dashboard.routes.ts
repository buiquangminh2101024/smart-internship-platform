import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";
import { AdminDashboardService } from "./admin-dashboard.service";
import { DashboardController } from "./dashboard.controller";
import { dashboardAnalyticsQuerySchema } from "./dashboard.dto";
import { DashboardRepository } from "./dashboard.repository";
import { EmployerDashboardService } from "./employer-dashboard.service";

/**
 * Dashboard Employer & Admin (AD-16) — chỉ đọc, không có API thao tác (thao
 * tác tại chỗ gọi lại API của module chủ). jobPostsService/candidateOutreachService/
 * messagingService resolve lúc có request nên không phụ thuộc thứ tự mount.
 */
export function dashboardRouter(container: AwilixContainer): Router {
  container.register({
    dashboardRepository: asClass(DashboardRepository).singleton(),
    employerDashboardService: asClass(EmployerDashboardService).singleton(),
    adminDashboardService: asClass(AdminDashboardService).singleton(),
    dashboardController: asClass(DashboardController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<DashboardController>("dashboardController");
  const employerGuard = [authenticate(container), authorize("EMPLOYER")];
  const adminGuard = [authenticate(container), authorize("ADMIN")];

  // --- Employer ---
  router.get("/employer/dashboard/overview", ...employerGuard, (req, res, next) => {
    void resolveController().employerOverview(req, res, next);
  });

  router.get("/employer/dashboard/tasks", ...employerGuard, (req, res, next) => {
    void resolveController().employerTasks(req, res, next);
  });

  router.get(
    "/employer/dashboard/analytics",
    ...employerGuard,
    validate(dashboardAnalyticsQuerySchema, "query"),
    (req, res, next) => {
      void resolveController().employerAnalytics(req, res, next);
    },
  );

  // --- Admin ---
  router.get("/admin/dashboard/overview", ...adminGuard, (req, res, next) => {
    void resolveController().adminOverview(req, res, next);
  });

  router.get("/admin/dashboard/tasks", ...adminGuard, (req, res, next) => {
    void resolveController().adminTasks(req, res, next);
  });

  router.get("/admin/dashboard/analytics", ...adminGuard, validate(dashboardAnalyticsQuerySchema, "query"), (req, res, next) => {
    void resolveController().adminAnalytics(req, res, next);
  });

  return router;
}
