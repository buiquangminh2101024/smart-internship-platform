// Chạy: node --import tsx --test tests/unit/auth/auth-register-pending.test.ts (từ apps/server)
// AD-31 D5 (docs/06-backend/auth-hardening/PLAN.md bước 4): đăng ký lại email chờ xác thực
// ⇒ 409 EMAIL_PENDING_VERIFICATION, không ghi đè mật khẩu; email đã kích hoạt / bị khoá
// ⇒ 409 EMAIL_TAKEN; đăng nhập chưa xác thực ⇒ 403 EMAIL_NOT_VERIFIED.
// Thêm trong bước 4: chỉ tài khoản chờ xác thực mới xin / nhập được mã đăng ký, để tài
// khoản bị khoá không tự mở khoá qua verifyOtp (markVerified đặt ACTIVE).
import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { AppError } from "../../../src/shared/errors/AppError";
import { AuthService } from "../../../src/modules/auth/auth.service";

const PASSWORD = "mat-khau-cu";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const CODE = "123456";
type Status = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";

function buildService(status: Status | null) {
  const user = status
    ? { id: "user-1", email: "a@example.com", role: "CANDIDATE", status, passwordHash: PASSWORD_HASH }
    : null;
  const calls = { created: 0, otpSent: 0, verified: 0, passwordUpdated: 0 };
  const codes = new Map<string, string>([["register:a@example.com", CODE]]);

  const service = new AuthService({
    prisma: {},
    userRepository: {
      findByEmail: async (email: string) => (user && email === user.email ? user : null),
      createWithPassword: async (data: { email: string }) => {
        calls.created++;
        return { id: "user-new", email: data.email };
      },
      markVerified: async () => {
        calls.verified++;
        return { ...user, status: "ACTIVE" };
      },
      updatePassword: async () => {
        calls.passwordUpdated++;
      },
    },
    jwtService: { signAccessToken: () => ({ token: "access" }), signRefreshToken: () => ({ token: "refresh" }) },
    otpStore: {
      set: async (purpose: string, email: string, code: string) => {
        calls.otpSent++;
        codes.set(`${purpose}:${email}`, code);
      },
      get: async (purpose: string, email: string) => codes.get(`${purpose}:${email}`) ?? null,
      delete: async (purpose: string, email: string) => {
        codes.delete(`${purpose}:${email}`);
      },
      recordFailure: async () => 1,
    },
    rateLimiter: { consume: async () => true, peek: async () => ({ count: 0, ttlSeconds: 0 }), reset: async () => {} },
    // Bản giả của PasswordHasher (AD-31 D6): bcryptjs ngay trên luồng test.
    passwordHasher: { hash: (password: string) => bcrypt.hash(password, 4), compare: bcrypt.compare },
    emailSender: { send: async () => {} },
    googleAuthClient: {},
    tokenBlacklist: {},
    sessionRevocationService: {},
    auditLogService: { record: async () => {} },
    logger: { error: () => {}, info: () => {} },
    config: { OTP_HARDCODE: true, OTP_HARDCODE_VALUE: CODE },
  } as unknown as ConstructorParameters<typeof AuthService>[0]);

  return { service, calls, user };
}

async function expectError(promise: Promise<unknown>, status: number, code: string | undefined) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AppError, String(error));
    assert.equal(error.statusCode, status);
    assert.equal(error.code, code);
    return true;
  });
}

const register = (service: AuthService, role: "CANDIDATE" | "EMPLOYER" = "EMPLOYER") =>
  service.register({ email: "a@example.com", password: "mat-khau-moi", role, ip: "203.0.113.7" });

test("đăng ký email mới ⇒ tạo tài khoản và gửi mã như cũ", async () => {
  const { service, calls } = buildService(null);
  await register(service);
  assert.deepEqual([calls.created, calls.otpSent], [1, 1]);
});

test("đăng ký lại email chờ xác thực ⇒ 409 EMAIL_PENDING_VERIFICATION, không ghi đè gì, không tự gửi mã", async () => {
  const { service, calls, user } = buildService("PENDING_VERIFICATION");
  await expectError(register(service), 409, "EMAIL_PENDING_VERIFICATION");
  assert.deepEqual(calls, { created: 0, otpSent: 0, verified: 0, passwordUpdated: 0 });
  assert.equal(user?.passwordHash, PASSWORD_HASH);
  assert.equal(user?.role, "CANDIDATE");
});

test("đăng ký email đã kích hoạt hoặc bị khoá ⇒ 409 EMAIL_TAKEN", async () => {
  for (const status of ["ACTIVE", "SUSPENDED"] as const) {
    const { service, calls } = buildService(status);
    await expectError(register(service), 409, "EMAIL_TAKEN");
    assert.equal(calls.created, 0);
  }
});

test("đăng nhập đúng mật khẩu khi chưa xác thực ⇒ 403 EMAIL_NOT_VERIFIED", async () => {
  const { service } = buildService("PENDING_VERIFICATION");
  await expectError(service.login("a@example.com", PASSWORD, "203.0.113.7"), 403, "EMAIL_NOT_VERIFIED");
});

test("chờ xác thực: xin lại mã và nhập mã vẫn chạy như cũ", async () => {
  const { service, calls } = buildService("PENDING_VERIFICATION");
  await service.resendOtp("a@example.com", "203.0.113.7");
  assert.deepEqual(await service.verifyOtp("a@example.com", CODE), { accessToken: "access", refreshToken: "refresh" });
  assert.equal(calls.verified, 1);
});

test("tài khoản bị khoá: không xin được mã đăng ký, không tự mở khoá bằng verifyOtp", async () => {
  const { service, calls } = buildService("SUSPENDED");
  await expectError(service.resendOtp("a@example.com", "203.0.113.7"), 400, undefined);
  await expectError(service.verifyOtp("a@example.com", CODE), 400, "OTP_INVALID");
  assert.deepEqual([calls.otpSent, calls.verified], [0, 0]);
});

test("tài khoản đã kích hoạt: không xin lại mã, mã đăng ký còn sót cũng không cấp token", async () => {
  const { service, calls } = buildService("ACTIVE");
  await expectError(service.resendOtp("a@example.com", "203.0.113.7"), 400, undefined);
  await expectError(service.verifyOtp("a@example.com", CODE), 400, "OTP_INVALID");
  assert.equal(calls.verified, 0);
});
