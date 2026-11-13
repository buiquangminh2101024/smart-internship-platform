import type { NextFunction, Request, Response } from "express";
import type {
  ApiResponse,
  ApplicationMatchSummary,
  JobRecommendationList,
  MatchResult,
  SimilarJobItem,
} from "@sip/shared-types";
import type { JobMatchingService } from "./job-matching.service";
import type { JobRecommendationService } from "./job-recommendation.service";
import type { SimilarJobsService } from "./similar-jobs.service";

export class JobMatchingController {
  private readonly jobMatchingService: JobMatchingService;
  private readonly jobRecommendationService: JobRecommendationService;
  private readonly similarJobsService: SimilarJobsService;

  constructor({
    jobMatchingService,
    jobRecommendationService,
    similarJobsService,
  }: {
    jobMatchingService: JobMatchingService;
    jobRecommendationService: JobRecommendationService;
    similarJobsService: SimilarJobsService;
  }) {
    this.jobMatchingService = jobMatchingService;
    this.jobRecommendationService = jobRecommendationService;
    this.similarJobsService = similarJobsService;
  }

  listSimilarJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.similarJobsService.listSimilar(req.params.id as string);
      const body: ApiResponse<SimilarJobItem[]> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

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
      // AD-26 — `?cursor=` là offset do trang trước trả về; service kiểm định dạng (400).
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const result = await this.jobRecommendationService.recommendForUser(req.user!.id, { cursor });
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
