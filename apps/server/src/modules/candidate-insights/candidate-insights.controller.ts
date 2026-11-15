import type { NextFunction, Request, Response } from "express";
import type { ApiResponse, ProfileCompleteness, ProfileInsight } from "@sip/shared-types";
import type { CandidateInsightsService } from "./candidate-insights.service";

export class CandidateInsightsController {
  private readonly candidateInsightsService: CandidateInsightsService;

  constructor({ candidateInsightsService }: { candidateInsightsService: CandidateInsightsService }) {
    this.candidateInsightsService = candidateInsightsService;
  }

  /** `data: null` khi chưa từng phân tích — frontend hiện nút "Phân tích hồ sơ". */
  getInsight = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateInsightsService.getForUser(req.user!.id);
      const body: ApiResponse<ProfileInsight | null> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  /** AD-26 mục 8 — độ hoàn thiện tính bằng code, luôn có, không tốn hạn mức phân tích. */
  getCompleteness = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateInsightsService.completenessForUser(req.user!.id);
      const body: ApiResponse<ProfileCompleteness> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  generateInsight = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateInsightsService.generateForUser(req.user!.id);
      const body: ApiResponse<ProfileInsight> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
