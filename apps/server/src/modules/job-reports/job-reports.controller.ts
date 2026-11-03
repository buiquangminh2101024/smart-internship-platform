import type { Request, Response, NextFunction } from "express";
import type { ApiResponse } from "@sip/shared-types";
import type { JobReportsService } from "./job-reports.service";

export class JobReportsController {
  private readonly jobReportsService: JobReportsService;

  constructor({ jobReportsService }: { jobReportsService: JobReportsService }) {
    this.jobReportsService = jobReportsService;
  }

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reporterId = req.user!.id;
      const jobId = String(req.params.jobId);
      const result = await this.jobReportsService.createReport(reporterId, jobId, req.body);
      res.status(201).json({
        success: true,
        data: result,
        message: "Gửi báo cáo tin tuyển dụng thành công",
      } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  checkStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reporterId = req.user!.id;
      const jobId = String(req.params.jobId);
      const result = await this.jobReportsService.checkUserReport(reporterId, jobId);
      res.json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  uploadEvidence = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const result = await this.jobReportsService.uploadEvidence(userId, req.file);
      res.status(201).json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  listAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobReportsService.listForAdmin(req.query as any);
      res.json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  statsAdmin = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobReportsService.getAdminStats();
      res.json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  detailAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id);
      const result = await this.jobReportsService.getDetailForAdmin(id);
      res.json({
        success: true,
        data: result,
      } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  actionAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.id;
      const id = String(req.params.id);
      const result = await this.jobReportsService.executeAction(adminId, id, req.body);
      res.json({
        success: true,
        data: result,
        message: "Xử lý báo cáo vi phạm thành công",
      } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };
}
