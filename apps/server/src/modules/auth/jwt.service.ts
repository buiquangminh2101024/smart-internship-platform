import jwt, { type SignOptions } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import { AppError } from "../../shared/errors/AppError";

export interface TokenIdentity {
  sub: string;
  role: Role;
}

export interface AccessTokenPayload extends TokenIdentity {
  jti: string;
  exp: number;
  iat: number;
}

export type RefreshTokenPayload = AccessTokenPayload;

export interface SignedToken {
  token: string;
  jti: string;
}

interface JwtConfig {
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRY: string;
  JWT_REFRESH_EXPIRY: string;
}

export class JwtService {
  private readonly jwtConfig: JwtConfig;

  constructor({ config }: { config: JwtConfig }) {
    this.jwtConfig = config;
  }

  signAccessToken(identity: TokenIdentity): SignedToken {
    return this.sign(identity, this.jwtConfig.JWT_ACCESS_SECRET, this.jwtConfig.JWT_ACCESS_EXPIRY);
  }

  signRefreshToken(identity: TokenIdentity): SignedToken {
    return this.sign(identity, this.jwtConfig.JWT_REFRESH_SECRET, this.jwtConfig.JWT_REFRESH_EXPIRY);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.verify(token, this.jwtConfig.JWT_ACCESS_SECRET);
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return this.verify(token, this.jwtConfig.JWT_REFRESH_SECRET);
  }

  private sign(identity: TokenIdentity, secret: string, expiresIn: string): SignedToken {
    const jti = randomUUID();
    const token = jwt.sign({ sub: identity.sub, role: identity.role, jti }, secret, {
      expiresIn: expiresIn as NonNullable<SignOptions["expiresIn"]>,
    });
    return { token, jti };
  }

  private verify(token: string, secret: string): AccessTokenPayload {
    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    } catch {
      throw new AppError(401, "Invalid or expired token");
    }

    if (
      typeof decoded.sub !== "string" ||
      typeof decoded.jti !== "string" ||
      typeof decoded.exp !== "number" ||
      typeof decoded.role !== "string"
    ) {
      throw new AppError(401, "Malformed token payload");
    }

    return {
      sub: decoded.sub,
      role: decoded.role as Role,
      jti: decoded.jti,
      exp: decoded.exp,
      iat: decoded.iat ?? 0,
    };
  }
}
