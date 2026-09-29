import type { NextFunction, Request, Response } from "express";
import type { ApiResponse, AuditActivityItem, PaginatedResponse } from "@sip/shared-types";
import type { ActivityListQuery } from "./audit-log.dto";
import type { AuditLogService } from "./audit-log.service";

export class AuditLogController {
  private readonly auditLogService: AuditLogService;

  constructor({ auditLogService }: { auditLogService: AuditLogService }) {
    this.auditLogService = auditLogService;
  }

  listActivity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.query as unknown as ActivityListQuery;
      const result = await this.auditLogService.listActivity(query);
      const body: ApiResponse<PaginatedResponse<AuditActivityItem>> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
