import type { NextFunction, Request, Response } from "express";
import type { ApiResponse, CompanyOutreachSettings, JobAutoOutreachDto } from "@sip/shared-types";
import type { UpdateJobAutoOutreachInput } from "./candidate-outreach.dto";
import type { AutoOutreachService } from "./auto-outreach.service";

export class AutoOutreachController {
  private readonly autoOutreachService: AutoOutreachService;

  constructor({ autoOutreachService }: { autoOutreachService: AutoOutreachService }) {
    this.autoOutreachService = autoOutreachService;
  }

  getJobSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.autoOutreachService.getJobSettings(req.user!.id, req.params.jobId as string);
      const body: ApiResponse<JobAutoOutreachDto> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  updateJobSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.autoOutreachService.updateJobSettings(
        req.user!.id,
        req.params.jobId as string,
        req.body as UpdateJobAutoOutreachInput,
      );
      const body: ApiResponse<JobAutoOutreachDto> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  getCompanySettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.autoOutreachService.getCompanySettings(req.user!.id);
      const body: ApiResponse<CompanyOutreachSettings> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  updateCompanySettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.autoOutreachService.updateCompanySettings(
        req.user!.id,
        req.body as CompanyOutreachSettings,
      );
      const body: ApiResponse<CompanyOutreachSettings> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
