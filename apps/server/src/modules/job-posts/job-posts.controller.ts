import type { NextFunction, Request, Response } from "express";
import type {
  ApiResponse,
  ConfirmRequirementsRequest,
  CreateJobPostRequest,
  EmployerJobPostListQuery,
  ExtractedJobRequirements,
  JobPost,
  JobPostSearchQuery,
  JobPostStats,
  JobPostStatus,
  PaginatedResponse,
  RejectJobPostRequest,
  RetractJobPostRequest,
  SubmitJobPostResponse,
  UpdateJobPostRequest,
} from "@sip/shared-types";
import type { JobPostRequirementsService } from "./job-post-requirements.service";
import type { JobPostsService } from "./job-posts.service";

export class JobPostsController {
  private readonly jobPostsService: JobPostsService;
  private readonly jobPostRequirementsService: JobPostRequirementsService;

  constructor({
    jobPostsService,
    jobPostRequirementsService,
  }: {
    jobPostsService: JobPostsService;
    jobPostRequirementsService: JobPostRequirementsService;
  }) {
    this.jobPostsService = jobPostsService;
    this.jobPostRequirementsService = jobPostRequirementsService;
  }

  // ─── Public ──────────────────────────────────────────────────────────────

  search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostsService.search(req.query as JobPostSearchQuery);
      const body: ApiResponse<PaginatedResponse<JobPost>> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  publicDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostsService.getPublicDetail(req.params.id as string);
      const body: ApiResponse<JobPost> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  // ─── Employer ────────────────────────────────────────────────────────────

  listOwn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostsService.listOwn(req.user!.id, req.query as EmployerJobPostListQuery);
      const body: ApiResponse<PaginatedResponse<JobPost>> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  ownStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostsService.ownStats(req.user!.id);
      const body: ApiResponse<JobPostStats> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  ownDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostsService.getOwn(req.user!.id, req.params.id as string);
      const body: ApiResponse<JobPost> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostsService.createDraft(req.user!.id, req.body as CreateJobPostRequest);
      const body: ApiResponse<JobPost> = { success: true, data: result };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostsService.updateDraft(
        req.user!.id,
        req.params.id as string,
        req.body as UpdateJobPostRequest,
      );
      const body: ApiResponse<JobPost> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.jobPostsService.deleteDraft(req.user!.id, req.params.id as string);
      res.json({ success: true, data: { deleted: true } } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  submit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostsService.submitForApproval(req.user!.id, req.params.id as string);
      const body: ApiResponse<SubmitJobPostResponse> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  close = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostsService.close(req.user!.id, req.params.id as string);
      const body: ApiResponse<JobPost> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  extractRequirements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostRequirementsService.extract(req.user!.id, req.params.id as string);
      const body: ApiResponse<ExtractedJobRequirements> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  confirmRequirements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostRequirementsService.confirm(
        req.user!.id,
        req.params.id as string,
        req.body as ConfirmRequirementsRequest,
      );
      const body: ApiResponse<JobPost> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  // ─── Admin ───────────────────────────────────────────────────────────────

  listForModeration = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, cursor } = req.query as { status?: JobPostStatus; cursor?: string };
      const result = await this.jobPostsService.listForModeration(status, cursor);
      const body: ApiResponse<PaginatedResponse<JobPost>> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  moderationStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostsService.moderationStats();
      const body: ApiResponse<JobPostStats> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  moderationDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostsService.getForModeration(req.params.id as string);
      const body: ApiResponse<JobPost> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobPostsService.approve(req.user!.id, req.params.id as string);
      const body: ApiResponse<JobPost> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reason } = req.body as RejectJobPostRequest;
      const result = await this.jobPostsService.reject(req.user!.id, req.params.id as string, reason);
      const body: ApiResponse<JobPost> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  retract = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reason } = req.body as RetractJobPostRequest;
      const result = await this.jobPostsService.retract(req.user!.id, req.params.id as string, reason);
      const body: ApiResponse<JobPost> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
