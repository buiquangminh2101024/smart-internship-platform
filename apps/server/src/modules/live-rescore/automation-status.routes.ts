import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import type { AdminAutomationStatus, ApiResponse } from "@sip/shared-types";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { AutomationStatusService } from "./automation-status.service";

/**
 * GET /admin/automation-status — thẻ "Hệ thống tự động" của Admin (0.6 bước 8). Chỉ Admin.
 * Gọi sau `registerLiveRescore` và `registerMatchScores`; các phụ thuộc resolve lúc có request.
 */
export function automationStatusRouter(container: AwilixContainer): Router {
  container.register({
    automationStatusService: asClass(AutomationStatusService).singleton(),
  });

  const router = Router();
  router.get("/admin/automation-status", authenticate(container), authorize("ADMIN"), async (_req, res, next) => {
    try {
      const data = await container.resolve<AutomationStatusService>("automationStatusService").getStatus();
      const body: ApiResponse<AdminAutomationStatus> = { success: true, data };
      res.json(body);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
