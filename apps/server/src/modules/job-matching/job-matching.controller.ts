import type { NextFunction, Request, Response } from "express";
import type { ApiResponse, ApplicationMatchSummary, JobRecommendationList, MatchResult } from "@sip/shared-types";
import type { JobMatchingService } from "./job-matching.service";
import type { JobRecommendationService } from "./job-recommendation.service";

export class JobMatchingController {
  private readonly jobMatchingService: JobMatchingService;
  private readonly jobRecommendationService: JobRecommendationService;

  constructor({
    jobMatchingService,
    jobRecommendationService,
  }: {
    jobMatchingService: JobMatchingService;
    jobRecommendationService: JobRecommendationService;
  }) {
    this.jobMatchingService = jobMatchingService;
    this.jobRecommendationService = jobRecommendationService;
  }

  matchForCandidate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobMatchingService.matchForCandidate(req.user!.id, req.params.id as string);
      const body: ApiResponse<MatchResult> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  listJobRecommendations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobRecommendationService.recommendForUser(req.user!.id);
      const body: ApiResponse<JobRecommendationList> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  listApplicationMatches = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobMatchingService.listApplicationMatches(req.user!.id, req.params.jobId as string);
      const body: ApiResponse<ApplicationMatchSummary[]> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  matchForApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobMatchingService.matchForApplication(req.user!.id, req.params.id as string);
      const body: ApiResponse<MatchResult> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
