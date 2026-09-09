import type { NextFunction, Request, Response } from "express";
import type { ApiResponse, CatalogItem } from "@sip/shared-types";
import type { CatalogService } from "./catalog.service";

export class CatalogController {
  private readonly catalogService: CatalogService;

  constructor({ catalogService }: { catalogService: CatalogService }) {
    this.catalogService = catalogService;
  }

  industries = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body: ApiResponse<CatalogItem[]> = { success: true, data: await this.catalogService.industries() };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  companyTypes = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body: ApiResponse<CatalogItem[]> = { success: true, data: await this.catalogService.companyTypes() };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  cities = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body: ApiResponse<CatalogItem[]> = { success: true, data: await this.catalogService.cities() };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
