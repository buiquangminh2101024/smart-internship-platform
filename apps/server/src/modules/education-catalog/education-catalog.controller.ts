import type { NextFunction, Request, Response } from "express";
import type { CatalogEntryStatus } from "@prisma/client";
import type {
  AdminEducationCatalogEntryDto,
  ApiResponse,
  PaginatedResponse,
  SuggestCatalogEntryResponse,
} from "@sip/shared-types";
import type { EducationCatalogDomain } from "./education-catalog.types";
import type { EducationCatalogService } from "./education-catalog.service";

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Mỗi hành động là một factory nhận `domain` — routes gắn cùng một controller
 * cho cả /universities lẫn /majors thay vì viết hai controller giống hệt nhau.
 */
export class EducationCatalogController {
  private readonly educationCatalogService: EducationCatalogService;

  constructor({ educationCatalogService }: { educationCatalogService: EducationCatalogService }) {
    this.educationCatalogService = educationCatalogService;
  }

  suggest =
    (domain: EducationCatalogDomain): Handler =>
    async (req, res, next) => {
      try {
        const data = await this.educationCatalogService.suggest(domain, req.user!.id, String(req.body.name));
        const body: ApiResponse<SuggestCatalogEntryResponse> = { success: true, data };
        res.json(body);
      } catch (error) {
        next(error);
      }
    };

  list =
    (domain: EducationCatalogDomain): Handler =>
    async (req, res, next) => {
      try {
        const data = await this.educationCatalogService.listForAdmin(
          domain,
          req.query.status as CatalogEntryStatus | undefined,
          req.query.cursor as string | undefined,
        );
        const body: ApiResponse<PaginatedResponse<AdminEducationCatalogEntryDto>> = { success: true, data };
        res.json(body);
      } catch (error) {
        next(error);
      }
    };

  approve =
    (domain: EducationCatalogDomain): Handler =>
    async (req, res, next) => {
      try {
        const data = await this.educationCatalogService.approve(domain, String(req.params.id));
        const body: ApiResponse<AdminEducationCatalogEntryDto> = { success: true, data };
        res.json(body);
      } catch (error) {
        next(error);
      }
    };

  renameApprove =
    (domain: EducationCatalogDomain): Handler =>
    async (req, res, next) => {
      try {
        const data = await this.educationCatalogService.renameApprove(
          domain,
          String(req.params.id),
          String(req.body.correctedName),
        );
        const body: ApiResponse<AdminEducationCatalogEntryDto> = { success: true, data };
        res.json(body);
      } catch (error) {
        next(error);
      }
    };

  reject =
    (domain: EducationCatalogDomain): Handler =>
    async (req, res, next) => {
      try {
        await this.educationCatalogService.reject(domain, String(req.params.id));
        // Envelope rỗng thay vì 204 — cùng lý do với skills.controller.ts.
        res.json({ success: true } satisfies ApiResponse);
      } catch (error) {
        next(error);
      }
    };

  merge =
    (domain: EducationCatalogDomain): Handler =>
    async (req, res, next) => {
      try {
        await this.educationCatalogService.merge(domain, String(req.params.id), String(req.body.targetId));
        res.json({ success: true } satisfies ApiResponse);
      } catch (error) {
        next(error);
      }
    };
}
