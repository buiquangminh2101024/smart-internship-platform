import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { validate } from "../../shared/middleware/validate";
import { NotificationsController } from "./notifications.controller";
import { notificationListQuerySchema } from "./notifications.dto";
import { NotificationsRepository } from "./notifications.repository";
import { NotificationsService } from "./notifications.service";
import { OutboxRepository } from "./outbox/outbox.repository";

/**
 * API actor-agnostic: chỉ cần đăng nhập, mọi truy vấn tự scope theo req.user.id
 * nên candidate/employer/admin dùng chung endpoint.
 *
 * NotificationsService/OutboxRepository được đăng ký ở đây (không phải
 * container.ts) theo đúng pattern service dùng chéo của repo — các module
 * nghiệp vụ destructure `notificationsService` từ cradle. main.ts mount router
 * này trước khi start outbox job nên registration luôn sẵn sàng.
 */
export function notificationsRouter(container: AwilixContainer): Router {
  container.register({
    notificationsRepository: asClass(NotificationsRepository).singleton(),
    outboxRepository: asClass(OutboxRepository).singleton(),
    notificationsService: asClass(NotificationsService).singleton(),
    notificationsController: asClass(NotificationsController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<NotificationsController>("notificationsController");
  const guard = [authenticate(container)];

  router.get("/notifications", ...guard, validate(notificationListQuerySchema, "query"), (req, res, next) => {
    void resolveController().list(req, res, next);
  });

  router.get("/notifications/unread-count", ...guard, (req, res, next) => {
    void resolveController().unreadCount(req, res, next);
  });

  router.patch("/notifications/read-all", ...guard, (req, res, next) => {
    void resolveController().markAllRead(req, res, next);
  });

  router.patch("/notifications/:id/read", ...guard, (req, res, next) => {
    void resolveController().markRead(req, res, next);
  });

  return router;
}
