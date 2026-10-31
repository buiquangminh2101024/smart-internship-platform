// Chạy: node --import tsx --test tests/unit/access-token-state.test.ts (từ apps/server)
// docs/06-backend/auth-redis-parallel/PLAN.md — 3 khoá Redis hỏi cùng lúc nhưng kết
// quả và thứ tự lỗi giữ như khi hỏi tuần tự (H3, H4). Store là bản giả.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AccountSuspensionStore } from "../../src/shared/ports/AccountSuspensionStore";
import type { SessionRevocationStore } from "../../src/shared/ports/SessionRevocationStore";
import type { TokenBlacklist } from "../../src/shared/ports/TokenBlacklist";
import { checkAccessTokenState } from "../../src/modules/auth/session-revocation.service";

const TOKEN = { jti: "jti-1", sub: "user-1", iat: 1_000 };

interface State {
  revoked?: boolean;
  suspended?: boolean;
  revokedAtSec?: number | null;
  error?: "blacklist" | "suspension" | "revocation";
}

function stores(state: State = {}) {
  const fail = (name: State["error"]) => (state.error === name ? Promise.reject(new Error(`${name} down`)) : null);
  return {
    tokenBlacklist: {
      isRevoked: async (jti: string) => (await fail("blacklist")) ?? (jti === TOKEN.jti && !!state.revoked),
    } as unknown as TokenBlacklist,
    accountSuspensionStore: {
      isSuspended: async (userId: string) => (await fail("suspension")) ?? (userId === TOKEN.sub && !!state.suspended),
    } as unknown as AccountSuspensionStore,
    sessionRevocationStore: {
      getRevokedAt: async (userId: string) => (await fail("revocation")) ?? (userId === TOKEN.sub ? (state.revokedAtSec ?? null) : null),
    } as unknown as SessionRevocationStore,
  };
}

test("không có khoá nào ⇒ null", async () => {
  assert.equal(await checkAccessTokenState(stores(), TOKEN), null);
});

test("từng điều kiện riêng ⇒ đúng loại", async () => {
  assert.equal(await checkAccessTokenState(stores({ revoked: true }), TOKEN), "TOKEN_REVOKED");
  assert.equal(await checkAccessTokenState(stores({ suspended: true }), TOKEN), "ACCOUNT_SUSPENDED");
  assert.equal(await checkAccessTokenState(stores({ revokedAtSec: TOKEN.iat + 60 }), TOKEN), "SESSION_REVOKED");
});

test("nhiều điều kiện cùng đúng ⇒ theo thứ tự cũ", async () => {
  const later = TOKEN.iat + 60;
  assert.equal(await checkAccessTokenState(stores({ revoked: true, suspended: true, revokedAtSec: later }), TOKEN), "TOKEN_REVOKED");
  assert.equal(await checkAccessTokenState(stores({ revoked: true, revokedAtSec: later }), TOKEN), "TOKEN_REVOKED");
  assert.equal(await checkAccessTokenState(stores({ suspended: true, revokedAtSec: later }), TOKEN), "ACCOUNT_SUSPENDED");
});

test("mốc thu hồi: cấp cùng giây bị chặn, cấp sau mốc thì qua", async () => {
  assert.equal(await checkAccessTokenState(stores({ revokedAtSec: TOKEN.iat }), TOKEN), "SESSION_REVOKED");
  assert.equal(await checkAccessTokenState(stores({ revokedAtSec: TOKEN.iat - 1 }), TOKEN), null);
});

test("một store lỗi ⇒ hàm ném lỗi (nơi gọi trả 401 như cũ)", async () => {
  for (const error of ["blacklist", "suspension", "revocation"] as const) {
    await assert.rejects(checkAccessTokenState(stores({ error }), TOKEN), new RegExp(`${error} down`));
  }
  // Store lỗi ở sau một điều kiện đã đúng vẫn làm cả lượt lỗi: giống bản tuần tự khi
  // Redis lỗi, và không để lại promise bị từ chối mà không ai bắt.
  await assert.rejects(checkAccessTokenState(stores({ revoked: true, error: "revocation" }), TOKEN), /revocation down/);
});

test("cả 3 store được gọi trước khi store nào trả lời", async () => {
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const held = <T>(name: string, value: T) => async () => {
    calls.push(name);
    await gate;
    return value;
  };
  const pending = checkAccessTokenState(
    {
      tokenBlacklist: { isRevoked: held("blacklist", false) } as unknown as TokenBlacklist,
      accountSuspensionStore: { isSuspended: held("suspension", false) } as unknown as AccountSuspensionStore,
      sessionRevocationStore: { getRevokedAt: held("revocation", null) } as unknown as SessionRevocationStore,
    },
    TOKEN,
  );
  await Promise.resolve();
  assert.deepEqual(calls, ["blacklist", "suspension", "revocation"]);
  release();
  assert.equal(await pending, null);
});
