import type { NextFunction, Request, Response } from "express";
import type { CatalogEntryStatus } from "@prisma/client";
import type { AdminSkillDto, ApiResponse, PaginatedResponse, SuggestSkillResponse } from "@sip/shared-types";
import type { SkillsService } from "./skills.service";

export class SkillsController {
  private readonly skillsService: SkillsService;

  constructor({ skillsService }: { skillsService: SkillsService }) {
    this.skillsService = skillsService;
  }

  suggest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.skillsService.suggest(req.user!.id, String(req.body.name));
      const body: ApiResponse<SuggestSkillResponse> = { success: true, data };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.skillsService.listForAdmin(
        req.query.status as CatalogEntryStatus | undefined,
        req.query.cursor as string | undefined,
      );
      const body: ApiResponse<PaginatedResponse<AdminSkillDto>> = { success: true, data };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.skillsService.approve(String(req.params.id));
      const body: ApiResponse<AdminSkillDto> = { success: true, data };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.skillsService.reject(String(req.params.id));
      // Trả envelope rỗng thay vì 204: apiFetch phía web coi response không có
      // body là lỗi (parseBody trong lib/api-client.ts), và cả repo đều dùng
      // envelope { success, data } — không có ngoại lệ 204 nào khác.
      res.json({ success: true } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };

  merge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.skillsService.merge(String(req.params.id), String(req.body.targetSkillId));
      res.json({ success: true } satisfies ApiResponse);
    } catch (error) {
      next(error);
    }
  };
}
