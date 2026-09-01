import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { HealthController } from "./health.controller";

// Pattern demo cho các module nghiệp vụ sau: đăng ký controller/service/
// repository của module vào container bằng asClass, rồi resolve trong route.
export function healthRouter(container: AwilixContainer): Router {
  container.register({
    healthController: asClass(HealthController).singleton(),
  });

  const router = Router();

  router.get("/health", (req, res, next) => {
    const controller = container.resolve<HealthController>("healthController");
    void controller.check(req, res, next);
  });

  return router;
}
