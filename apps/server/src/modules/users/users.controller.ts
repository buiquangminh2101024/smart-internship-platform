import type { NextFunction, Request, Response } from "express";
import type { ApiResponse, UserProfile } from "@sip/shared-types";
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
}
