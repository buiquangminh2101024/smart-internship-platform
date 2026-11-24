// Chạy: node --import tsx --test tests/unit/auth/auth-login-lock.test.ts (từ apps/server)
// AD-31 D4 (docs/06-backend/auth-hardening/PLAN.md bước 3): sai 5 lần / 15 phút với cùng
// email + IP ⇒ chặn cặp đó (lần 5 trả 429 ngay, Q1); một IP sai 30 lần (mọi email) ⇒ chặn
// IP. Email không tồn tại cũng đếm (Q2). Redis lỗi ⇒ cho qua (Q3). Đúng mật khẩu xoá bộ
// đếm của cặp. Đang bị chặn thì không so mật khẩu. Đặt lại mật khẩu thành công cũng xoá bộ
// đếm của cặp (gỡ chặn), không xoá bộ đếm theo IP.
// RateLimiter là bản giả trong bộ nhớ, cửa sổ cố định, không hết hạn trong test.
import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { AppError } from "../../../src/shared/errors/AppError";
import {
  AuthService,
  LOGIN_IP_THRESHOLD,
  LOGIN_LOCK_THRESHOLD,
  LOGIN_LOCK_WINDOW_MINUTES,
} from "../../../src/modules/auth/auth.service";

const PASSWORD = "dung-mat-khau";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const IP = "203.0.113.7";
const EMAIL = "a@example.com";

function buildService(options: { redisDown?: boolean } = {}) {
  const counters = new Map<string, number>();
  const errors: string[] = [];
  let findCalls = 0;
  let compareCalls = 0;
  const down = () => {
    if (options.redisDown) throw new Error("Command timed out");
  };
  const users = [
    { id: "user-1", email: EMAIL, role: "CANDIDATE", status: "ACTIVE", passwordHash: PASSWORD_HASH },
    { id: "user-2", email: "b@example.com", role: "CANDIDATE", status: "ACTIVE", passwordHash: PASSWORD_HASH },
  ];

  const service = new AuthService({
    prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
    userRepository: {
      findByEmail: async (email: string) => {
        findCalls++;
        return users.find((item) => item.email === email) ?? null;
      },
      updatePassword: async (id: string, passwordHash: string) => {
        const user = users.find((item) => item.id === id);
        if (user) user.passwordHash = passwordHash;
      },
    },
    jwtService: { signAccessToken: () => ({ token: "access" }), signRefreshToken: () => ({ token: "refresh" }) },
    otpStore: { get: async () => "123456", delete: async () => {}, recordFailure: async () => 1 },
    rateLimiter: {
      consume: async (key: string, limit: number) => {
        down();
        const count = (counters.get(key) ?? 0) + 1;
        counters.set(key, count);
        return count <= limit;
      },
      peek: async (key: string) => {
        down();
        return { count: counters.get(key) ?? 0, ttlSeconds: counters.has(key) ? 600 : 0 };
      },
      reset: async (key: string) => {
        down();
        counters.delete(key);
      },
    },
    // Bản giả của PasswordHasher (AD-31 D6): bcryptjs ngay trên luồng test.
    passwordHasher: {
      hash: (password: string) => bcrypt.hash(password, 4),
      compare: (password: string, hash: string) => {
        compareCalls++;
        return bcrypt.compare(password, hash);
      },
    },
    emailSender: {},
    googleAuthClient: {},
    tokenBlacklist: {},
    sessionRevocationService: { revokeInTx: async () => 0, propagate: async () => {} },
    auditLogService: { record: async () => {} },
    logger: { error: (message: string) => errors.push(message), info: () => {} },
    config: { OTP_HARDCODE: true, OTP_HARDCODE_VALUE: "123456" },
  } as unknown as ConstructorParameters<typeof AuthService>[0]);

  return { service, counters, errors, findCalls: () => findCalls, compareCalls: () => compareCalls };
}

async function expectError(promise: Promise<unknown>, status: number, code?: string, data?: unknown) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AppError, String(error));
    assert.equal(error.statusCode, status);
    assert.equal(error.code, code);
    assert.deepEqual(error.data, data);
    return true;
  });
}

const wrong = (service: AuthService, email = EMAIL, ip = IP) => service.login(email, "sai-mat-khau", ip);

test("ngưỡng: 5 lần theo email + IP, 30 lần theo IP, 15 phút", () => {
  assert.deepEqual([LOGIN_LOCK_THRESHOLD, LOGIN_IP_THRESHOLD, LOGIN_LOCK_WINDOW_MINUTES], [5, 30, 15]);
});

test("sai 1–2 lần ⇒ 401 thường; lần 3–4 ⇒ 401 kèm attemptsLeft 2, 1; lần 5 ⇒ 429 LOGIN_LOCKED", async () => {
  const { service } = buildService();
  await expectError(wrong(service), 401);
  await expectError(wrong(service), 401);
  await expectError(wrong(service), 401, undefined, { attemptsLeft: 2 });
  await expectError(wrong(service), 401, undefined, { attemptsLeft: 1 });
  await expectError(wrong(service), 429, "LOGIN_LOCKED", { retryAfterSeconds: 600 });
});

test("đang bị chặn: đúng mật khẩu vẫn 429, không tìm user, không so mật khẩu", async () => {
  const { service, findCalls, compareCalls } = buildService();
  for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) await wrong(service).catch(() => {});
  const before = [findCalls(), compareCalls()];
  await expectError(service.login(EMAIL, PASSWORD, IP), 429, "LOGIN_LOCKED", { retryAfterSeconds: 600 });
  assert.deepEqual([findCalls(), compareCalls()], before);
});

test("cặp bị chặn: IP khác, hoặc email khác cùng IP, vẫn đăng nhập được", async () => {
  const { service } = buildService();
  for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) await wrong(service).catch(() => {});
  assert.deepEqual(await service.login(EMAIL, PASSWORD, "198.51.100.9"), { accessToken: "access", refreshToken: "refresh" });
  assert.deepEqual(await service.login("b@example.com", PASSWORD, IP), { accessToken: "access", refreshToken: "refresh" });
});

test("đăng nhập đúng xoá bộ đếm của cặp, không xoá bộ đếm theo IP", async () => {
  const { service, counters } = buildService();
  for (let i = 0; i < 4; i++) await wrong(service).catch(() => {});
  await service.login(EMAIL, PASSWORD, IP);
  assert.equal(counters.has(`login-lock:${EMAIL}:${IP}`), false);
  assert.equal(counters.get(`login-lock-ip:${IP}`), 4);
  await expectError(wrong(service), 401);
});

test("email không tồn tại cũng bị đếm và bị chặn như email có tài khoản (Q2)", async () => {
  const { service } = buildService();
  for (let i = 0; i < 2; i++) await expectError(wrong(service, "khong-co@example.com"), 401);
  await expectError(wrong(service, "khong-co@example.com"), 401, undefined, { attemptsLeft: 2 });
  await expectError(wrong(service, "khong-co@example.com"), 401, undefined, { attemptsLeft: 1 });
  await expectError(wrong(service, "khong-co@example.com"), 429, "LOGIN_LOCKED", { retryAfterSeconds: 600 });
});

test("email khác hoa / thường dùng chung một bộ đếm", async () => {
  const { service } = buildService();
  for (let i = 0; i < 4; i++) await wrong(service, i % 2 ? "A@Example.com" : EMAIL).catch(() => {});
  await expectError(wrong(service, " A@EXAMPLE.COM "), 429, "LOGIN_LOCKED", { retryAfterSeconds: 600 });
});

test("một IP sai 30 lần với nhiều email ⇒ chặn IP, kể cả email chưa sai lần nào", async () => {
  const { service } = buildService();
  for (let i = 0; i < LOGIN_IP_THRESHOLD - 1; i++) {
    await wrong(service, `do-${i}@example.com`).catch(() => {});
  }
  await expectError(wrong(service, "do-cuoi@example.com"), 429, "LOGIN_LOCKED", { retryAfterSeconds: 600 });
  await expectError(service.login("b@example.com", PASSWORD, IP), 429, "LOGIN_LOCKED", { retryAfterSeconds: 600 });
  assert.deepEqual(await service.login("b@example.com", PASSWORD, "198.51.100.9"), { accessToken: "access", refreshToken: "refresh" });
});

test("gần ngưỡng IP ⇒ attemptsLeft lấy theo khoá IP nếu nhỏ hơn", async () => {
  const { service } = buildService();
  for (let i = 0; i < LOGIN_IP_THRESHOLD - 3; i++) await wrong(service, `do-${i}@example.com`).catch(() => {});
  await expectError(wrong(service, "b@example.com"), 401, undefined, { attemptsLeft: 2 });
});

test("Redis lỗi ⇒ cho qua: đúng mật khẩu đăng nhập được, sai mật khẩu 401 thường, có log (Q3)", async () => {
  const { service, errors } = buildService({ redisDown: true });
  assert.deepEqual(await service.login(EMAIL, PASSWORD, IP), { accessToken: "access", refreshToken: "refresh" });
  for (let i = 0; i < 6; i++) await expectError(wrong(service), 401);
  assert.ok(errors.includes("Không đọc được bộ đếm chặn đăng nhập"));
  assert.ok(errors.includes("Không đếm được lần đăng nhập sai (chặn tạm thời)"));
});

test("đặt lại mật khẩu thành công ⇒ gỡ chặn cặp email + IP, đăng nhập bằng mật khẩu mới được ngay; khoá IP giữ nguyên", async () => {
  const { service, counters } = buildService();
  for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) await wrong(service).catch(() => {});
  await expectError(service.login(EMAIL, PASSWORD, IP), 429, "LOGIN_LOCKED", { retryAfterSeconds: 600 });
  await service.resetPassword(EMAIL, "123456", "mat-khau-moi", { ip: IP, via: "reset" });
  assert.equal(counters.has(`login-lock:${EMAIL}:${IP}`), false);
  assert.equal(counters.get(`login-lock-ip:${IP}`), LOGIN_LOCK_THRESHOLD);
  assert.deepEqual(await service.login(EMAIL, "mat-khau-moi", IP), { accessToken: "access", refreshToken: "refresh" });
});

test("đặt lại mật khẩu sai mã ⇒ vẫn bị chặn", async () => {
  const { service } = buildService();
  for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) await wrong(service).catch(() => {});
  await assert.rejects(service.resetPassword(EMAIL, "000000", "mat-khau-moi", { ip: IP, via: "reset" }));
  await expectError(service.login(EMAIL, PASSWORD, IP), 429, "LOGIN_LOCKED", { retryAfterSeconds: 600 });
});
