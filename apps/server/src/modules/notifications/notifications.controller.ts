import type { NextFunction, Request, Response } from "express";
import type { ApiResponse } from "@sip/shared-types";
import type { NotificationListQuery } from "./notifications.dto";
import type { NotificationsService } from "./notifications.service";

export class NotificationsController {
  private readonly notificationsService: NotificationsService;

  constructor({ notificationsService }: { notificationsService: NotificationsService }) {
    this.notificationsService = notificationsService;
  }

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.query as NotificationListQuery;
      const result = await this.notificationsService.list(req.user!.id, query);
      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  unreadCount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.notificationsService.unreadCount(req.user!.id);
      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  markRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.notificationsService.markRead(req.user!.id, String(req.params.id));
      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  markAllRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.notificationsService.markAllRead(req.user!.id);
      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };
}
