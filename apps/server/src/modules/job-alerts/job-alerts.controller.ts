import type { NextFunction, Request, Response } from "express";
import type { ApiResponse, JobAlertSettings, UpdateJobAlertSettingsRequest } from "@sip/shared-types";
import type { JobAlertService } from "./job-alert.service";

export class JobAlertsController {
  private readonly jobAlertService: JobAlertService;

  constructor({ jobAlertService }: { jobAlertService: JobAlertService }) {
    this.jobAlertService = jobAlertService;
  }

  getSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobAlertService.getSettingsForUser(req.user!.id);
      const body: ApiResponse<JobAlertSettings> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobAlertService.updateSettingsForUser(
        req.user!.id,
        req.body as UpdateJobAlertSettingsRequest,
      );
      const body: ApiResponse<JobAlertSettings> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
