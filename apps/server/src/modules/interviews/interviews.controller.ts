import type { NextFunction, Request, Response } from "express";
import type {
  ApiResponse,
  AwaitingScheduleApplication,
  BatchScheduleInterviewsFailure,
  BatchScheduleInterviewsResponse,
  CandidateInterview,
  EmployerInterview,
  PaginatedResponse,
} from "@sip/shared-types";
import type { ListAwaitingScheduleQuery, ListEmployerInterviewsQuery } from "./interviews.dto";
import type { InterviewsService } from "./interviews.service";

export class InterviewsController {
  private readonly interviewsService: InterviewsService;

  constructor({ interviewsService }: { interviewsService: InterviewsService }) {
    this.interviewsService = interviewsService;
  }

  // --- Employer ---

  schedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.interviewsService.schedule(req.user!.id, req.params.id as string, req.body);
      const body: ApiResponse<EmployerInterview> = { success: true, data };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  /** D12 — lô có hồ sơ lỗi trả 409 kèm lỗi từng hồ sơ trong `data`, không tạo lịch nào. */
  scheduleBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.interviewsService.scheduleBatch(req.user!.id, req.body);
      if (!result.ok) {
        const body: ApiResponse<BatchScheduleInterviewsFailure> = {
          success: false,
          error: "Some applications cannot be scheduled; no interview was created",
          data: { failures: result.failures },
        };
        res.status(409).json(body);
        return;
      }
      const body: ApiResponse<BatchScheduleInterviewsResponse> = { success: true, data: { items: result.items } };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  reschedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.interviewsService.reschedule(req.user!.id, req.params.id as string, req.body);
      const body: ApiResponse<EmployerInterview> = { success: true, data };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.interviewsService.cancel(req.user!.id, req.params.id as string, req.body);
      const body: ApiResponse<EmployerInterview> = { success: true, data };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  listEmployer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await this.interviewsService.listForEmployer(
        req.user!.id,
        req.query as unknown as ListEmployerInterviewsQuery,
      );
      const body: ApiResponse<PaginatedResponse<EmployerInterview>> = { success: true, data: { items, hasMore: false } };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  listAwaiting = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await this.interviewsService.listAwaiting(req.user!.id, req.query as unknown as ListAwaitingScheduleQuery);
      const body: ApiResponse<PaginatedResponse<AwaitingScheduleApplication>> = {
        success: true,
        data: { items, hasMore: false },
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  // --- Candidate ---

  listCandidate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await this.interviewsService.listForCandidate(req.user!.id);
      const body: ApiResponse<PaginatedResponse<CandidateInterview>> = { success: true, data: { items, hasMore: false } };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
