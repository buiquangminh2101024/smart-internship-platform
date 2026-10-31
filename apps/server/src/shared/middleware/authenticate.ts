import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AwilixContainer } from "awilix";
import type { Role } from "@prisma/client";
import { AppError } from "../errors/AppError";
import type { JwtService } from "../../modules/auth/jwt.service";
import type { TokenBlacklist } from "../ports/TokenBlacklist";
import type { AccountSuspensionStore } from "../ports/AccountSuspensionStore";
import type { SessionRevocationStore } from "../ports/SessionRevocationStore";
import { checkAccessTokenState } from "../../modules/auth/session-revocation.service";

export interface AuthenticatedUser {
  id: string;
  role: Role;
  jti: string;
  exp: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Middleware dùng chung cho mọi module cần bảo vệ route từ Phase 3 trở đi —
// verify access token + kiểm tra blacklist, gắn req.user cho middleware/
// controller phía sau (vd. authorize(...roles)).
export function authenticate(container: AwilixContainer): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void (async () => {
      try {
        const header = req.headers.authorization;
        if (!header?.startsWith("Bearer ")) {
          throw new AppError(401, "Missing bearer token");
        }

        const jwtService = container.resolve<JwtService>("jwtService");
        const tokenBlacklist = container.resolve<TokenBlacklist>("tokenBlacklist");
        const accountSuspensionStore = container.resolve<AccountSuspensionStore>("accountSuspensionStore");
        const sessionRevocationStore = container.resolve<SessionRevocationStore>("sessionRevocationStore");

        const payload = jwtService.verifyAccessToken(header.slice(7));

        // Blacklist jti → Admin khoá tài khoản (AD-17) → "đăng xuất mọi thiết
        // bị" (AD-18; không có mốc trong Redis ⇒ không hỏi lại DB). 3 khoá hỏi
        // cùng lúc, xét theo đúng thứ tự này.
        const rejection = await checkAccessTokenState(
          { tokenBlacklist, accountSuspensionStore, sessionRevocationStore },
          payload,
        );
        if (rejection === "TOKEN_REVOKED") {
          throw new AppError(401, "Token has been revoked");
        }
        if (rejection === "ACCOUNT_SUSPENDED") {
          throw new AppError(401, "Account is suspended", "ACCOUNT_SUSPENDED");
        }
        if (rejection === "SESSION_REVOKED") {
          throw new AppError(401, "Session has been revoked", "SESSION_REVOKED");
        }

        req.user = { id: payload.sub, role: payload.role, jti: payload.jti, exp: payload.exp };
        next();
      } catch (error) {
        next(error instanceof AppError ? error : new AppError(401, "Invalid or expired token"));
      }
    })();
  };
}
