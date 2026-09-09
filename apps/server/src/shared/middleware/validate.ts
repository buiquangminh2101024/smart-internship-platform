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

    if (part === "query") {
      // Express 5: req.query là getter-only trên prototype (không có setter) —
      // gán trực tiếp ném "Cannot set property query of #<IncomingMessage>
      // which has only a getter". Định nghĩa lại thành own-property ghi đè
      // được để gắn data đã validate/coerce (vd. cursor/status ở /companies).
      Object.defineProperty(req, "query", { value: result.data, writable: true, configurable: true, enumerable: true });
    } else {
      req[part] = result.data;
    }
    next();
  };
}
