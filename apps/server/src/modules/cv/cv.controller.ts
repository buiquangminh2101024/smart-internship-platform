import type { NextFunction, Request, Response } from "express";
import type { ApiResponse } from "@sip/shared-types";
import type { CvService } from "./cv.service";

export class CvController {
  private readonly cvService: CvService;

  constructor({ cvService }: { cvService: CvService }) {
    this.cvService = cvService;
  }

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await this.cvService.listForCandidate(req.user!.id);
      res.json({ success: true, data: items } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const item = await this.cvService.getForCandidate(req.user!.id, String(req.params.id));
      res.json({ success: true, data: item } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  upload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = req.file;
      const result = await this.cvService.uploadForCandidate(req.user!.id, file);
      res.status(201).json({ success: true, data: result } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  setDefault = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const item = await this.cvService.setDefaultForCandidate(req.user!.id, String(req.params.id));
      res.json({ success: true, data: item } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.cvService.deleteForCandidate(req.user!.id, String(req.params.id));
      res.json({ success: true, data: { deleted: true } } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };
}
