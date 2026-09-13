import type { NextFunction, Request, Response } from "express";
import type { ApiResponse } from "@sip/shared-types";
import type { SavedJobsService } from "./saved-jobs.service";

export class SavedJobsController {
  private readonly savedJobsService: SavedJobsService;

  constructor({ savedJobsService }: { savedJobsService: SavedJobsService }) {
    this.savedJobsService = savedJobsService;
  }

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await this.savedJobsService.listForCandidate(req.user!.id);
      res.json({ success: true, data: items } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  save = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.savedJobsService.saveForCandidate(req.user!.id, String(req.params.jobPostId));
      res.status(201).json({ success: true, data: result } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  unsave = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.savedJobsService.unsaveForCandidate(req.user!.id, String(req.params.jobPostId));
      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  check = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.savedJobsService.isSaved(req.user!.id, String(req.params.jobPostId));
      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };
}
