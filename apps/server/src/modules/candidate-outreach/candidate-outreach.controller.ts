import type { NextFunction, Request, Response } from "express";
import type {
  ApiResponse,
  CandidateOutreachInvitationDto,
  CandidateSearchResultDto,
  OutreachSettings,
  RespondOutreachInvitationRequest,
  RespondOutreachInvitationResponse,
  SentOutreachInvitationDto,
} from "@sip/shared-types";
import type { CandidateOutreachService } from "./candidate-outreach.service";

export class CandidateOutreachController {
  private readonly candidateOutreachService: CandidateOutreachService;

  constructor({ candidateOutreachService }: { candidateOutreachService: CandidateOutreachService }) {
    this.candidateOutreachService = candidateOutreachService;
  }

  // --- Employer ---

  searchCandidates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateOutreachService.searchCandidates(req.user!.id, req.params.jobId as string);
      const body: ApiResponse<CandidateSearchResultDto[]> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  listSentInvitations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateOutreachService.listSentInvitations(req.user!.id, req.params.jobId as string);
      const body: ApiResponse<SentOutreachInvitationDto[]> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  invite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateOutreachService.invite(
        req.user!.id,
        req.params.jobId as string,
        req.params.candidateId as string,
      );
      const body: ApiResponse<SentOutreachInvitationDto> = { success: true, data: result };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  // --- Candidate ---

  listForCandidate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateOutreachService.listForCandidate(req.user!.id);
      const body: ApiResponse<CandidateOutreachInvitationDto[]> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  respond = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { action } = req.body as RespondOutreachInvitationRequest;
      const result = await this.candidateOutreachService.respond(req.user!.id, req.params.id as string, action);
      const body: ApiResponse<RespondOutreachInvitationResponse> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.candidateOutreachService.updateSettings(req.user!.id, req.body as OutreachSettings);
      const body: ApiResponse<OutreachSettings> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
