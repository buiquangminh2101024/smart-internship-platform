import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { adminListUsersQuerySchema, suspendUserSchema } from "./users.dto";
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
  router.post("/admin/users/:id/suspend", ...adminGuard, validate(suspendUserSchema), (req, res, next) => {
    void resolveController().suspend(req, res, next);
  });
  router.post("/admin/users/:id/reactivate", ...adminGuard, (req, res, next) => {
    void resolveController().reactivate(req, res, next);
  });

  return router;
}
