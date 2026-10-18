import type { NextFunction, Request, Response } from "express";
import type { ApiResponse, AuditActivityItem, AuditActivityPage, AuditActivityStats } from "@sip/shared-types";
import type { ActivityExportQuery, ActivityItemQuery, ActivityListQuery, ActivityStatsQuery } from "./audit-log.dto";
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
      const body: ApiResponse<AuditActivityPage> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  getActivity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { archived } = req.query as unknown as ActivityItemQuery;
      const result = await this.auditLogService.getActivity(req.params.id as string, archived);
      const body: ApiResponse<AuditActivityItem> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.query as unknown as ActivityStatsQuery;
      const result = await this.auditLogService.getStats(query);
      const body: ApiResponse<AuditActivityStats> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  // Bảo vệ bằng middleware `authenticate` ở route — req.user luôn có giá trị.
  exportCsv = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.query as unknown as ActivityExportQuery;
      const { fileName, content } = await this.auditLogService.exportCsv(req.user!.id, query);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
      res.send(content);
    } catch (error) {
      next(error);
    }
  };
}
