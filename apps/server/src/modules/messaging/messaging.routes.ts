import { Router } from "express";
import { asClass } from "awilix";
import { MessagingController } from "./messaging.controller";
import { MessagingService } from "./messaging.service";
import { MessagingRepository } from "./messaging.repository";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import type { AwilixContainer } from "awilix";

export function messagingRoutes(container: AwilixContainer) {
  const router = Router();

  container.register({
    messagingRepository: asClass(MessagingRepository).singleton(),
    messagingService: asClass(MessagingService).singleton(),
    messagingController: asClass(MessagingController).singleton(),
  });

  const resolveController = () => container.resolve<MessagingController>("messagingController");

  router.use(authenticate(container));
  router.use(authorize("CANDIDATE", "EMPLOYER"));

  router.get("/", (req, res, next) => resolveController().listConversations(req, res).catch(next));
  // Khai báo trước "/:id/..." cho rõ ràng — dòng ghim "N tin nhắn mới" ở NotificationBell.
  router.get("/unread-summary", (req, res, next) => resolveController().unreadSummary(req, res).catch(next));
  router.post("/", (req, res, next) => resolveController().createConversation(req, res).catch(next));
  router.get("/:id/messages", (req, res, next) => resolveController().listMessages(req, res).catch(next));
  router.put("/:id/read", (req, res, next) => resolveController().markAsRead(req, res).catch(next));
  router.delete("/:id", (req, res, next) => resolveController().deleteConversation(req, res).catch(next));

  return router;
}
