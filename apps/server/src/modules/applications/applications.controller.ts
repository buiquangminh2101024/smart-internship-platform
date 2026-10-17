import type { NextFunction, Request, Response } from "express";
import type {
  ApiResponse,
  BulkUpdateApplicationStatusResult,
  CandidateApplicationSummary,
  EmployerApplicationDetail,
  EmployerApplicationsPage,
  EmployerApplicationView,
  PaginatedResponse,
  ApplicationStatus,
} from "@sip/shared-types";
import { toApplicationInterview } from "../interviews/interview.mapper";
import type { ListCompanyApplicationsQuery } from "./applications.dto";
import type { ApplicationsService } from "./applications.service";
import { toCandidateApplicationSummary, toEmployerApplicationDetail } from "./application.mapper";

export class ApplicationsController {
  private readonly applicationsService: ApplicationsService;
  constructor({ applicationsService }: { applicationsService: ApplicationsService }) {
    this.applicationsService = applicationsService;
  }

  // --- Candidate ---

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.applicationsService.createApplication(req.user!.id, req.body);
      const body: ApiResponse<CandidateApplicationSummary> = { success: true, data: toCandidateApplicationSummary(result!) };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  listCandidate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const results = await this.applicationsService.listCandidateApplications(req.user!.id);
      const items = results.map(toCandidateApplicationSummary);
      const body: ApiResponse<PaginatedResponse<CandidateApplicationSummary>> = { success: true, data: { items, hasMore: false } };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  getCandidateDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.applicationsService.getCandidateApplicationDetail(req.user!.id, req.params.id as string);
      const body: ApiResponse<CandidateApplicationSummary> = { success: true, data: toCandidateApplicationSummary(result) };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.applicationsService.cancelApplication(req.user!.id, req.params.id as string);
      const body: ApiResponse<CandidateApplicationSummary> = { success: true, data: toCandidateApplicationSummary(result!) };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  // --- Employer ---

  listEmployer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = req.query.status as ApplicationStatus | undefined;
      const results = await this.applicationsService.listEmployerApplications(req.user!.id, req.params.jobId as string, status);
      const items = results.map(toEmployerApplicationDetail);
      const body: ApiResponse<PaginatedResponse<EmployerApplicationDetail>> = { success: true, data: { items, hasMore: false } };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  listCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.applicationsService.listCompanyApplications(
        req.user!.id,
        req.query as unknown as ListCompanyApplicationsQuery,
      );
      const body: ApiResponse<EmployerApplicationsPage> = { success: true, data };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  bulkUpdateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.applicationsService.bulkUpdateStatus(req.user!.id, req.body);
      const body: ApiResponse<BulkUpdateApplicationStatusResult> = { success: true, data };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  getEmployerDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { app, interviews } = await this.applicationsService.getEmployerApplicationDetail(req.user!.id, req.params.id as string);
      const body: ApiResponse<EmployerApplicationView> = {
        success: true,
        data: { ...toEmployerApplicationDetail(app), interviews: interviews.map(toApplicationInterview) },
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.applicationsService.updateApplicationStatus(req.user!.id, req.params.id as string, req.body);
      const body: ApiResponse<EmployerApplicationDetail> = { success: true, data: toEmployerApplicationDetail(result!) };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  updateEvaluation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.applicationsService.updateApplicationEvaluation(req.user!.id, req.params.id as string, req.body);
      const body: ApiResponse<EmployerApplicationDetail> = { success: true, data: toEmployerApplicationDetail(result!) };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
