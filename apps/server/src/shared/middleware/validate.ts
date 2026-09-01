import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../errors/AppError";

type RequestPart = "body" | "query" | "params";

export function validate(schema: ZodType, part: RequestPart = "body"): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      next(new AppError(400, result.error.issues.map((issue) => issue.message).join(", ")));
      return;
    }

    req[part] = result.data;
    next();
  };
}
