import type { NextFunction, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import type { ApiResponse, HealthCheckResult } from "@sip/shared-types";

export class HealthController {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  check = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const body: ApiResponse<HealthCheckResult> = {
        success: true,
        data: { status: "ok", db: "connected" },
      };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
