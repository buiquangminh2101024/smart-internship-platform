import type { NextFunction, Request, Response } from "express";
import type {
  ApiResponse,
  CreateCompanyRequest,
  EmployerMeResponse,
  InviteCodeResponse,
  JoinCompanyRequest,
  UpdateEmployerProfileRequest,
  VerificationCheckRequest,
  VerificationCheckResponse,
} from "@sip/shared-types";
import type { EmployersService } from "./employers.service";

export class EmployersController {
  private readonly employersService: EmployersService;

  constructor({ employersService }: { employersService: EmployersService }) {
    this.employersService = employersService;
  }

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.employersService.getMe(req.user!.id);
      const body: ApiResponse<EmployerMeResponse> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  updateMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, phone } = req.body as UpdateEmployerProfileRequest;
      const result = await this.employersService.updateOwnProfile(req.user!.id, {
        ...(title !== undefined ? { title } : {}),
        ...(phone !== undefined ? { phone } : {}),
      });
      const body: ApiResponse<EmployerMeResponse> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  checkVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { taxCode } = req.body as VerificationCheckRequest;
      const result = await this.employersService.checkVerification(req.user!.id, taxCode);
      const body: ApiResponse<VerificationCheckResponse> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  createCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateCompanyRequest;
      const file = req.file ? { buffer: req.file.buffer, originalName: req.file.originalname } : undefined;
      const result = await this.employersService.createOrResubmitCompany(req.user!.id, dto, file);
      const body: ApiResponse<EmployerMeResponse> = { success: true, data: result };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  joinCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { inviteCode } = req.body as JoinCompanyRequest;
      const result = await this.employersService.joinCompany(req.user!.id, inviteCode);
      const body: ApiResponse<EmployerMeResponse> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  issueInviteCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.employersService.issueInviteCode(req.user!.id);
      const body: ApiResponse<InviteCodeResponse> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
