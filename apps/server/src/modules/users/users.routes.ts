import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { authenticate } from "../../shared/middleware/authenticate";

export function usersRouter(container: AwilixContainer): Router {
  container.register({
    usersService: asClass(UsersService).singleton(),
    usersController: asClass(UsersController).singleton(),
  });

  const router = Router();

  router.get("/users/me", authenticate(container), (req, res, next) => {
    const controller = container.resolve<UsersController>("usersController");
    void controller.me(req, res, next);
  });

  return router;
}
