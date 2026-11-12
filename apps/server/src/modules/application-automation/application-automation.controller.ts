import type { NextFunction, Request, Response } from "express";
import type { ApiResponse, JobApplicationAutomationSettings } from "@sip/shared-types";
import type { UpdateJobApplicationAutomationInput } from "./application-automation.dto";
import type { ApplicationAutomationService } from "./application-automation.service";

export class ApplicationAutomationController {
  private readonly applicationAutomationService: ApplicationAutomationService;

  constructor({ applicationAutomationService }: { applicationAutomationService: ApplicationAutomationService }) {
    this.applicationAutomationService = applicationAutomationService;
  }

  getJobSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.applicationAutomationService.getJobSettings(req.user!.id, req.params.jobId as string);
      const body: ApiResponse<JobApplicationAutomationSettings> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  updateJobSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.applicationAutomationService.updateJobSettings(
        req.user!.id,
        req.params.jobId as string,
        req.body as UpdateJobApplicationAutomationInput,
      );
      const body: ApiResponse<JobApplicationAutomationSettings> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
