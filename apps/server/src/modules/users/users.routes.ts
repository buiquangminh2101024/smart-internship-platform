import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import {
  activateUserSchema,
  adminListUsersQuerySchema,
  bulkReactivateSchema,
  bulkSuspendSchema,
  revokeSessionsSchema,
  suspendUserSchema,
} from "./users.dto";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";

export function usersRouter(container: AwilixContainer): Router {
  container.register({
    usersService: asClass(UsersService).singleton(),
    usersController: asClass(UsersController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<UsersController>("usersController");

  router.get("/users/me", authenticate(container), (req, res, next) => {
    void resolveController().me(req, res, next);
  });

  // AD-17 — quản lý người dùng; hành động chỉ-Admin nằm trong module sở hữu
  // resource (PROJECT_STRUCTURE.md §5), như companies.
  const adminGuard = [authenticate(container), authorize("ADMIN")];

  router.get("/admin/users", ...adminGuard, validate(adminListUsersQuerySchema, "query"), (req, res, next) => {
    void resolveController().adminList(req, res, next);
  });
  // Hàng loạt (E7) — PHẢI đăng ký trước các route `/admin/users/:id/...`: nếu
  // không, "/admin/users/bulk/suspend" khớp `:id/suspend` với id = "bulk".
  router.post("/admin/users/bulk/suspend", ...adminGuard, validate(bulkSuspendSchema), (req, res, next) => {
    void resolveController().bulkSuspend(req, res, next);
  });
  router.post("/admin/users/bulk/reactivate", ...adminGuard, validate(bulkReactivateSchema), (req, res, next) => {
    void resolveController().bulkReactivate(req, res, next);
  });
  // Chi tiết (E4, E5) — sau `bulk/*` cho thống nhất, dù khác method nên không đụng nhau.
  router.get("/admin/users/:id", ...adminGuard, (req, res, next) => {
    void resolveController().adminDetail(req, res, next);
  });
  router.post("/admin/users/:id/suspend", ...adminGuard, validate(suspendUserSchema), (req, res, next) => {
    void resolveController().suspend(req, res, next);
  });
  router.post("/admin/users/:id/reactivate", ...adminGuard, (req, res, next) => {
    void resolveController().reactivate(req, res, next);
  });
  // Mở rộng 1 (AD-18) — docs/06-backend/admin-users-ext1/PLAN.md B6.
  router.post("/admin/users/:id/revoke-sessions", ...adminGuard, validate(revokeSessionsSchema), (req, res, next) => {
    void resolveController().revokeSessions(req, res, next);
  });
  router.post("/admin/users/:id/activate", ...adminGuard, validate(activateUserSchema), (req, res, next) => {
    void resolveController().activate(req, res, next);
  });
  // Chỉ gửi thông báo + email có link /forgot-password; KHÔNG đổi mật khẩu — người
  // dùng tự xin OTP và đặt mật khẩu mới ở trang đó (E1).
  router.post("/admin/users/:id/send-password-reset-guide", ...adminGuard, (req, res, next) => {
    void resolveController().sendPasswordResetGuide(req, res, next);
  });

  return router;
}
