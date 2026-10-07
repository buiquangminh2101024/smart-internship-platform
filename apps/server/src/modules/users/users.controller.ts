import type { NextFunction, Request, Response } from "express";
import type { AdminUserListItem, ApiResponse, PaginatedResponse, SuspendUserRequest, UserProfile } from "@sip/shared-types";
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
      const body: ApiResponse<PaginatedResponse<AdminUserListItem>> = { success: true, data: result };
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
}
