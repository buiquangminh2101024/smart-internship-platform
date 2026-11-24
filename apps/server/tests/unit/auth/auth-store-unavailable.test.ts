// Chạy: node --import tsx --test tests/unit/auth/auth-store-unavailable.test.ts (từ apps/server)
// AD-31 D1 (docs/06-backend/auth-hardening/PLAN.md bước 1): Redis / DB lỗi khi kiểm token
// ⇒ 503 AUTH_STORE_UNAVAILABLE, để web giữ phiên. Token sai, bị thu hồi, tài khoản bị khoá,
// phiên bị thu hồi vẫn 401 như cũ.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import type { AwilixContainer } from "awilix";
import { AppError } from "../../../src/shared/errors/AppError";
import { authenticate } from "../../../src/shared/middleware/authenticate";
import { AuthService } from "../../../src/modules/auth/auth.service";

const PAYLOAD = { sub: "user-1", role: "CANDIDATE", jti: "jti-1", exp: 9_999_999_999, iat: 1_000 };

interface Stores {
  verifyThrows?: boolean;
  revoked?: boolean;
  suspended?: boolean;
  revokedAt?: number | null;
  redisDown?: boolean;
}

function container(stores: Stores): AwilixContainer {
  const down = async () => {
    throw new Error("Command timed out");
  };
  const deps: Record<string, unknown> = {
    jwtService: {
      verifyAccessToken: () => {
        if (stores.verifyThrows) throw new AppError(401, "Invalid or expired token");
        return PAYLOAD;
      },
    },
    tokenBlacklist: { isRevoked: stores.redisDown ? down : async () => stores.revoked ?? false },
    accountSuspensionStore: { isSuspended: stores.redisDown ? down : async () => stores.suspended ?? false },
    sessionRevocationStore: { getRevokedAt: stores.redisDown ? down : async () => stores.revokedAt ?? null },
  };
  return { resolve: (name: string) => deps[name] } as unknown as AwilixContainer;
}

function run(stores: Stores, header = "Bearer token"): Promise<{ error: unknown; req: Request }> {
  const req = { headers: { authorization: header } } as Request;
  return new Promise((resolve) => {
    authenticate(container(stores))(req, {} as Response, (error?: unknown) => resolve({ error, req }));
  });
}

function assertAppError(error: unknown, status: number, code?: string) {
  assert.ok(error instanceof AppError, `cần AppError, nhận ${String(error)}`);
  assert.equal(error.statusCode, status);
  if (code !== undefined) assert.equal(error.code, code);
}

test("authenticate: token hợp lệ, Redis bình thường ⇒ gắn req.user", async () => {
  const { error, req } = await run({});
  assert.equal(error, undefined);
  assert.equal(req.user?.id, "user-1");
});

test("authenticate: Redis lỗi ⇒ 503 AUTH_STORE_UNAVAILABLE, không phải 401", async () => {
  const { error, req } = await run({ redisDown: true });
  assertAppError(error, 503, "AUTH_STORE_UNAVAILABLE");
  assert.equal(req.user, undefined);
});

test("authenticate: token sai / thiếu ⇒ 401", async () => {
  assertAppError((await run({ verifyThrows: true })).error, 401);
  assertAppError((await run({}, "")).error, 401);
});

test("authenticate: bị thu hồi / bị khoá / phiên bị thu hồi ⇒ 401 như cũ", async () => {
  assertAppError((await run({ revoked: true })).error, 401);
  assertAppError((await run({ suspended: true })).error, 401, "ACCOUNT_SUSPENDED");
  assertAppError((await run({ revokedAt: 2_000 })).error, 401, "SESSION_REVOKED");
});

function refreshService(options: { blacklistDown?: boolean; dbDown?: boolean; revoked?: boolean; status?: string }) {
  const errors: string[] = [];
  const service = new AuthService({
    prisma: {},
    userRepository: {
      findById: async () => {
        if (options.dbDown) throw new Error("Can't reach database server");
        return { id: "user-1", role: "CANDIDATE", status: options.status ?? "ACTIVE", sessionsRevokedAt: null };
      },
    },
    jwtService: {
      verifyRefreshToken: (token: string) => {
        if (token !== "refresh") throw new AppError(401, "Invalid or expired token");
        return PAYLOAD;
      },
      signAccessToken: () => ({ token: "access-moi" }),
    },
    tokenBlacklist: {
      isRevoked: async () => {
        if (options.blacklistDown) throw new Error("Command timed out");
        return options.revoked ?? false;
      },
    },
    logger: { error: (message: string) => errors.push(message), info: () => {} },
    config: { OTP_HARDCODE: true, OTP_HARDCODE_VALUE: "123456" },
  } as unknown as ConstructorParameters<typeof AuthService>[0]);
  return { service, errors };
}

test("refresh: bình thường ⇒ access token mới", async () => {
  assert.deepEqual(await refreshService({}).service.refresh("refresh"), { accessToken: "access-moi" });
});

test("refresh: Redis lỗi ⇒ 503 AUTH_STORE_UNAVAILABLE và có log", async () => {
  const { service, errors } = refreshService({ blacklistDown: true });
  await assert.rejects(service.refresh("refresh"), (error) => {
    assertAppError(error, 503, "AUTH_STORE_UNAVAILABLE");
    return true;
  });
  assert.equal(errors.length, 1);
});

test("refresh: DB lỗi ⇒ 503 AUTH_STORE_UNAVAILABLE", async () => {
  await assert.rejects(refreshService({ dbDown: true }).service.refresh("refresh"), (error) => {
    assertAppError(error, 503, "AUTH_STORE_UNAVAILABLE");
    return true;
  });
});

test("refresh: token sai / bị thu hồi / tài khoản không hoạt động ⇒ 401", async () => {
  for (const [options, token] of [
    [{}, "sai"],
    [{ revoked: true }, "refresh"],
    [{ status: "SUSPENDED" }, "refresh"],
  ] as const) {
    await assert.rejects(refreshService(options).service.refresh(token), (error) => {
      assertAppError(error, 401);
      return true;
    });
  }
});
