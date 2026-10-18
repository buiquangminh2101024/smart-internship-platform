// Chạy: node --import tsx --test tests/unit/auth-security-log.test.ts (từ apps/server)
// Nhật ký bảo mật (docs/06-backend/admin-audit-log/PLAN.md L3–L6, L30): đăng nhập sai lần thứ 5
// ghi đúng một dòng, email lạ không ghi, chỉ Admin đăng nhập đúng mới ghi, lỗi đếm không đổi
// kết quả đăng nhập; đặt lại mật khẩu và liên kết Google ghi cùng transaction.
// RateLimiter là bản giả trong bộ nhớ (cửa sổ cố định, không hết hạn trong test).
import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { AppError } from "../../src/shared/errors/AppError";
import { AuthService } from "../../src/modules/auth/auth.service";

const TX = { tx: true };
const PASSWORD = "dung-mat-khau";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

interface FakeUser {
  id: string;
  email: string;
  role: "ADMIN" | "EMPLOYER" | "CANDIDATE";
  status: "ACTIVE" | "PENDING_VERIFICATION" | "SUSPENDED";
  passwordHash: string | null;
}

function user(overrides: Partial<FakeUser> = {}): FakeUser {
  return { id: "user-1", email: "a@example.com", role: "CANDIDATE", status: "ACTIVE", passwordHash: PASSWORD_HASH, ...overrides };
}

function buildService(users: FakeUser[], options: { rateLimiterFails?: boolean } = {}) {
  const counters = new Map<string, number>();
  const records: Array<{ entry: { action: string; summary: string; metadata?: unknown; actorId: string | null }; tx: unknown }> = [];
  const errors: string[] = [];
  const byEmail = (email: string) => users.find((item) => item.email === email) ?? null;

  const service = new AuthService({
    prisma: { $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(TX) },
    userRepository: {
      findByEmail: async (email: string) => byEmail(email),
      findByGoogleId: async () => null,
      linkGoogleId: async (id: string, _googleId: string, tx: unknown) => {
        assert.equal(tx, TX);
        return users.find((item) => item.id === id);
      },
      linkGoogleToUnverified: async (id: string, _googleId: string, tx: unknown) => {
        assert.equal(tx, TX);
        const found = users.find((item) => item.id === id)!;
        return { ...found, status: "ACTIVE", passwordHash: null };
      },
      updatePassword: async () => {},
    },
    jwtService: { signAccessToken: () => ({ token: "access" }), signRefreshToken: () => ({ token: "refresh" }) },
    otpStore: { get: async () => "123456", delete: async () => {} },
    rateLimiter: {
      consume: async (key: string, limit: number) => {
        if (options.rateLimiterFails) throw new Error("redis down");
        const count = (counters.get(key) ?? 0) + 1;
        counters.set(key, count);
        return count <= limit;
      },
    },
    emailSender: { send: async () => {} },
    googleAuthClient: { verifyIdToken: async () => ({ googleId: "g-1", email: "a@example.com" }) },
    tokenBlacklist: {},
    sessionRevocationService: { revokeInTx: async () => 1, propagate: async () => {} },
    auditLogService: {
      record: async (entry: (typeof records)[number]["entry"], tx?: unknown) => {
        records.push({ entry, tx });
      },
    },
    logger: { error: (message: string) => errors.push(message), info: () => {} },
    config: { OTP_HARDCODE: true, OTP_HARDCODE_VALUE: "123456" },
  } as unknown as ConstructorParameters<typeof AuthService>[0]);

  return { service, records, errors, counters };
}

async function failLogin(service: AuthService, email: string): Promise<void> {
  await assert.rejects(
    service.login(email, "sai-mat-khau", "203.0.113.7"),
    (error: unknown) => error instanceof AppError && error.statusCode === 401,
  );
}

test("sai mật khẩu: lần 1–4 không ghi, lần 5 ghi một dòng, lần 6 không ghi", async () => {
  const { service, records } = buildService([user()]);
  for (let attempt = 1; attempt <= 4; attempt += 1) await failLogin(service, "a@example.com");
  assert.equal(records.length, 0);

  await failLogin(service, "a@example.com");
  assert.equal(records.length, 1);
  assert.deepEqual(records[0]?.entry, {
    actorId: null,
    actorRole: null,
    action: "AUTH_LOGIN_FAILED_REPEATED",
    entityType: "User",
    entityId: "user-1",
    summary: "Đăng nhập sai 5 lần trong 15 phút vào tài khoản a@example.com",
    metadata: { attempts: 5, windowMinutes: 15, ip: "203.0.113.7" },
  });

  await failLogin(service, "a@example.com");
  assert.equal(records.length, 1);
});

test("email không có tài khoản: không đếm, không ghi", async () => {
  const { service, records, counters } = buildService([user()]);
  for (let attempt = 1; attempt <= 6; attempt += 1) await failLogin(service, "la@example.com");
  assert.equal(records.length, 0);
  assert.equal(counters.size, 0);
});

test("RateLimiter lỗi: vẫn trả 401, chỉ log", async () => {
  const { service, records, errors } = buildService([user()], { rateLimiterFails: true });
  await failLogin(service, "a@example.com");
  assert.equal(records.length, 0);
  assert.equal(errors.length, 1);
});

test("đăng nhập đúng: Admin ghi AUTH_LOGIN_SUCCEEDED, ứng viên không ghi", async () => {
  const admin = user({ id: "admin-1", email: "admin@example.com", role: "ADMIN" });
  const { service, records } = buildService([admin, user()]);

  await service.login("a@example.com", PASSWORD, "203.0.113.7");
  assert.equal(records.length, 0);

  await service.login("admin@example.com", PASSWORD, "203.0.113.8");
  assert.equal(records.length, 1);
  assert.equal(records[0]?.entry.action, "AUTH_LOGIN_SUCCEEDED");
  assert.equal(records[0]?.entry.summary, "admin@example.com đăng nhập");
  assert.deepEqual(records[0]?.entry.metadata, { ip: "203.0.113.8" });
  assert.equal(records[0]?.tx, undefined, "không tx ⇒ lỗi ghi chỉ được log");
});

test("đặt lại / đổi mật khẩu: ghi cùng transaction, câu theo `via`", async () => {
  const { service, records } = buildService([user()]);
  await service.resetPassword("a@example.com", "123456", "mat-khau-moi", { ip: "203.0.113.7", via: "reset" });
  await service.resetPassword("a@example.com", "123456", "mat-khau-moi", { ip: "203.0.113.7", via: "change" });
  assert.deepEqual(
    records.map((record) => [record.entry.action, record.entry.summary, record.entry.metadata, record.tx]),
    [
      ["AUTH_PASSWORD_RESET", "a@example.com đặt lại mật khẩu", { ip: "203.0.113.7", via: "reset" }, TX],
      ["AUTH_PASSWORD_RESET", "a@example.com đổi mật khẩu", { ip: "203.0.113.7", via: "change" }, TX],
    ],
  );
});

test("liên kết Google: tài khoản chờ xác thực ghi thêm `activated`", async () => {
  const { service, records } = buildService([user({ status: "PENDING_VERIFICATION" })]);
  await service.loginOrRegisterWithGoogle("id-token", "CANDIDATE", "203.0.113.7");
  assert.equal(records.length, 1);
  assert.equal(records[0]?.tx, TX);
  assert.equal(records[0]?.entry.summary, "a@example.com liên kết tài khoản Google và kích hoạt tài khoản");
  assert.deepEqual(records[0]?.entry.metadata, { ip: "203.0.113.7", activated: true });
});

test("liên kết Google: tài khoản đã kích hoạt không có `activated`", async () => {
  const { service, records } = buildService([user()]);
  await service.loginOrRegisterWithGoogle("id-token", "CANDIDATE", "203.0.113.7");
  assert.equal(records[0]?.entry.summary, "a@example.com liên kết tài khoản Google");
  assert.deepEqual(records[0]?.entry.metadata, { ip: "203.0.113.7" });
});
