import type { NextFunction, Request, Response } from "express";
import type {
  AdminDashboardAnalytics,
  AdminDashboardOverview,
  AdminDashboardTasks,
  ApiResponse,
  EmployerDashboardAnalytics,
  EmployerDashboardOverview,
  EmployerDashboardTasks,
} from "@sip/shared-types";
import type { AdminDashboardService } from "./admin-dashboard.service";
import type { DashboardAnalyticsQuery } from "./dashboard.dto";
import type { EmployerDashboardService } from "./employer-dashboard.service";

export class DashboardController {
  private readonly employerDashboardService: EmployerDashboardService;
  private readonly adminDashboardService: AdminDashboardService;

  constructor({
    employerDashboardService,
    adminDashboardService,
  }: {
    employerDashboardService: EmployerDashboardService;
    adminDashboardService: AdminDashboardService;
  }) {
    this.employerDashboardService = employerDashboardService;
    this.adminDashboardService = adminDashboardService;
  }

  // --- Employer ---

  employerOverview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.employerDashboardService.overview(req.user!.id);
      const body: ApiResponse<EmployerDashboardOverview> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  employerTasks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.employerDashboardService.tasks(req.user!.id);
      const body: ApiResponse<EmployerDashboardTasks> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  employerAnalytics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { range } = req.query as unknown as DashboardAnalyticsQuery;
      const result = await this.employerDashboardService.analytics(req.user!.id, range);
      const body: ApiResponse<EmployerDashboardAnalytics> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  // --- Admin ---

  adminOverview = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.adminDashboardService.overview();
      const body: ApiResponse<AdminDashboardOverview> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  adminTasks = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.adminDashboardService.tasks();
      const body: ApiResponse<AdminDashboardTasks> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  adminAnalytics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { range } = req.query as unknown as DashboardAnalyticsQuery;
      const result = await this.adminDashboardService.analytics(range);
      const body: ApiResponse<AdminDashboardAnalytics> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
