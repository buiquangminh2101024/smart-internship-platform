import type { NextFunction, Request, Response } from "express";
import type {
  ApiResponse,
  Company,
  CompanyDetail,
  CompanyVerificationStatus,
  PaginatedResponse,
  RejectCompanyRequest,
  SetRequiresApprovalRequest,
} from "@sip/shared-types";
import type { CompaniesService } from "./companies.service";

export class CompaniesController {
  private readonly companiesService: CompaniesService;

  constructor({ companiesService }: { companiesService: CompaniesService }) {
    this.companiesService = companiesService;
  }

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, cursor } = req.query as { status?: CompanyVerificationStatus; cursor?: string };
      const result = await this.companiesService.list(status, cursor);
      const body: ApiResponse<PaginatedResponse<Company>> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  detail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.companiesService.getDetail(req.params.id as string);
      const body: ApiResponse<CompanyDetail> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  publicDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.companiesService.getPublicDetail(req.params.id as string);
      const body: ApiResponse<Company> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  verify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.companiesService.verify(req.params.id as string);
      const body: ApiResponse<Company> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reason } = req.body as RejectCompanyRequest;
      const result = await this.companiesService.reject(req.params.id as string, reason);
      const body: ApiResponse<Company> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  setRequiresApproval = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { requiresApproval } = req.body as SetRequiresApprovalRequest;
      const result = await this.companiesService.setRequiresApproval(req.params.id as string, requiresApproval);
      const body: ApiResponse<Company> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
