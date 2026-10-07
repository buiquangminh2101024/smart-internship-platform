import type { NextFunction, Request, Response } from "express";
import type { ApiResponse } from "@sip/shared-types";
import type { SupportService } from "./support.service";
import type { SupportContactInput } from "./support.dto";

export class SupportController {
  private readonly supportService: SupportService;

  constructor({ supportService }: { supportService: SupportService }) {
    this.supportService = supportService;
  }

  contact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.supportService.submitContact(req.body as SupportContactInput, req.ip ?? "unknown");
      const body: ApiResponse = { success: true, message: "Đã gửi yêu cầu" };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
