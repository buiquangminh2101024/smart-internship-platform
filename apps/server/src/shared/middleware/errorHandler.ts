import type { ErrorRequestHandler } from "express";
import type { ApiResponse } from "@sip/shared-types";
import { AppError } from "../errors/AppError";
import { logger } from "../logger";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const body: ApiResponse = { success: false, error: err.message };
    res.status(err.statusCode).json(body);
    return;
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  logger.error("Unhandled error", { message, stack: err instanceof Error ? err.stack : undefined });

  const body: ApiResponse = { success: false, error: "Internal server error" };
  res.status(500).json(body);
};
