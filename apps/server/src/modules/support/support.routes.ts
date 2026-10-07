import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { supportContactSchema } from "./support.dto";
import { validate } from "../../shared/middleware/validate";

// AD-17 — trang hỗ trợ bản A: endpoint công khai, không authenticate (người bị
// khoá tài khoản không đăng nhập được nhưng vẫn phải liên hệ được).
export function supportRouter(container: AwilixContainer): Router {
  container.register({
    supportService: asClass(SupportService).singleton(),
    supportController: asClass(SupportController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<SupportController>("supportController");

  router.post("/support/contact", validate(supportContactSchema), (req, res, next) => {
    void resolveController().contact(req, res, next);
  });

  return router;
}
