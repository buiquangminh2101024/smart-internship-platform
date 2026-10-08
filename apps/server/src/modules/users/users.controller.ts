import type { NextFunction, Request, Response } from "express";
import type {
  ActivateUserRequest,
  AdminBulkActionResponse,
  AdminUserDetail,
  AdminUserListItem,
  AdminUserListResponse,
  ApiResponse,
  BulkReactivateUsersRequest,
  BulkSuspendUsersRequest,
  RevokeSessionsRequest,
  SuspendUserRequest,
  UserProfile,
} from "@sip/shared-types";
import type { AdminListUsersQuery } from "./users.dto";
import type { UsersService } from "./users.service";

export class UsersController {
  private readonly usersService: UsersService;

  constructor({ usersService }: { usersService: UsersService }) {
    this.usersService = usersService;
  }

  // Bảo vệ bằng middleware `authenticate` ở route — req.user luôn có giá trị.
  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await this.usersService.getProfile(req.user!.id);
      const body: ApiResponse<UserProfile> = { success: true, data: profile };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  adminList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.query as unknown as AdminListUsersQuery;
      const result = await this.usersService.listForAdmin(query);
      const body: ApiResponse<AdminUserListResponse> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  adminDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.usersService.getDetailForAdmin(req.params.id as string);
      const body: ApiResponse<AdminUserDetail> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  suspend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reason } = req.body as SuspendUserRequest;
      const result = await this.usersService.suspend(req.user!.id, req.params.id as string, reason);
      const body: ApiResponse<AdminUserListItem> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  reactivate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.usersService.reactivate(req.user!.id, req.params.id as string);
      const body: ApiResponse<AdminUserListItem> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  // ─── Mở rộng 1 (AD-18) ──────────────────────────────────────────────────

  revokeSessions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reason } = req.body as RevokeSessionsRequest;
      const result = await this.usersService.revokeSessions(req.user!.id, req.params.id as string, reason);
      const body: ApiResponse<AdminUserListItem> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  activate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reason } = req.body as ActivateUserRequest;
      const result = await this.usersService.activate(req.user!.id, req.params.id as string, reason);
      const body: ApiResponse<AdminUserListItem> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  sendPasswordResetGuide = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.usersService.sendPasswordResetGuide(req.user!.id, req.params.id as string);
      const body: ApiResponse<AdminUserListItem> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  bulkSuspend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userIds, reason } = req.body as BulkSuspendUsersRequest;
      const result = await this.usersService.bulkSuspend(req.user!.id, userIds, reason);
      const body: ApiResponse<AdminBulkActionResponse> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  bulkReactivate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userIds } = req.body as BulkReactivateUsersRequest;
      const result = await this.usersService.bulkReactivate(req.user!.id, userIds);
      const body: ApiResponse<AdminBulkActionResponse> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
