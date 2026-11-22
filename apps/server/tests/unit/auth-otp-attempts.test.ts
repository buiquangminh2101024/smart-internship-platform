// Chạy: node --import tsx --test tests/unit/auth-otp-attempts.test.ts (từ apps/server)
// AD-31 D3 (docs/06-backend/auth-hardening/PLAN.md bước 2): nhập sai OTP 5 lần thì mã bị
// huỷ. Lần 1–4 trả OTP_INVALID kèm attemptsLeft 4 → 1; lần 5 trả OTP_ATTEMPTS_EXCEEDED.
// Xin mã mới thì đếm lại từ 0. Áp cho cả xác thực đăng ký và đặt lại mật khẩu.
// OtpStore là bản giả trong bộ nhớ, cùng hành vi với RedisOtpStore (set xoá bộ đếm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../../src/shared/errors/AppError";
import { errorHandler } from "../../src/shared/middleware/errorHandler";
import { AuthService, OTP_MAX_ATTEMPTS } from "../../src/modules/auth/auth.service";
import type { Request, Response } from "express";

const EMAIL = "a@example.com";
const CODE = "123456";

function buildService(status: "PENDING_VERIFICATION" | "ACTIVE") {
  const codes = new Map<string, string>();
  const failures = new Map<string, number>();
  const key = (purpose: string, email: string) => `${purpose}:${email}`;
  const otpStore = {
    set: async (purpose: string, email: string, code: string) => {
      codes.set(key(purpose, email), code);
      failures.delete(key(purpose, email));
    },
    get: async (purpose: string, email: string) => codes.get(key(purpose, email)) ?? null,
    delete: async (purpose: string, email: string) => {
      codes.delete(key(purpose, email));
      failures.delete(key(purpose, email));
    },
    recordFailure: async (purpose: string, email: string) => {
      const count = (failures.get(key(purpose, email)) ?? 0) + 1;
      failures.set(key(purpose, email), count);
      return count;
    },
  };
  const user = { id: "user-1", email: EMAIL, role: "CANDIDATE", status, passwordHash: "hash", googleId: null };
  let passwordUpdated = 0;

  const service = new AuthService({
    prisma: { $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({}) },
    userRepository: {
      findByEmail: async (email: string) => (email === EMAIL ? user : null),
      markVerified: async () => ({ ...user, status: "ACTIVE" }),
      updatePassword: async () => {
        passwordUpdated++;
      },
    },
    jwtService: { signAccessToken: () => ({ token: "access" }), signRefreshToken: () => ({ token: "refresh" }) },
    otpStore,
    rateLimiter: { consume: async () => true },
    emailSender: { send: async () => {} },
    googleAuthClient: {},
    tokenBlacklist: {},
    sessionRevocationService: { revokeInTx: async () => 1, propagate: async () => {} },
    auditLogService: { record: async () => {} },
    logger: { error: () => {}, info: () => {} },
    config: { OTP_HARDCODE: true, OTP_HARDCODE_VALUE: CODE },
  } as unknown as ConstructorParameters<typeof AuthService>[0]);

  return { service, otpStore, codes, failures, passwordUpdated: () => passwordUpdated };
}

async function expectOtpError(promise: Promise<unknown>, code: string, attemptsLeft?: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AppError, String(error));
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, code);
    assert.deepEqual(error.data, attemptsLeft === undefined ? undefined : { attemptsLeft });
    return true;
  });
}

test("ngưỡng là 5 lần", () => {
  assert.equal(OTP_MAX_ATTEMPTS, 5);
});

test("đăng ký: sai 1–4 lần ⇒ attemptsLeft 4 → 1, lần 5 ⇒ mã bị huỷ, nhập đúng sau đó vẫn lỗi", async () => {
  const { service, otpStore, codes } = buildService("PENDING_VERIFICATION");
  await otpStore.set("register", EMAIL, CODE);
  for (const left of [4, 3, 2, 1]) {
    await expectOtpError(service.verifyOtp(EMAIL, "000000"), "OTP_INVALID", left);
  }
  await expectOtpError(service.verifyOtp(EMAIL, "000000"), "OTP_ATTEMPTS_EXCEEDED");
  assert.equal(codes.size, 0);
  await expectOtpError(service.verifyOtp(EMAIL, CODE), "OTP_INVALID");
});

test("đăng ký: sai vài lần rồi đúng ⇒ xác thực được, mã và bộ đếm bị xoá", async () => {
  const { service, otpStore, codes, failures } = buildService("PENDING_VERIFICATION");
  await otpStore.set("register", EMAIL, CODE);
  await expectOtpError(service.verifyOtp(EMAIL, "000000"), "OTP_INVALID", 4);
  await expectOtpError(service.verifyOtp(EMAIL, "111111"), "OTP_INVALID", 3);
  assert.deepEqual(await service.verifyOtp(EMAIL, CODE), { accessToken: "access", refreshToken: "refresh" });
  assert.equal(codes.size, 0);
  assert.equal(failures.size, 0);
});

test("đăng ký: xin mã mới ⇒ đếm lại từ 0", async () => {
  const { service, otpStore } = buildService("PENDING_VERIFICATION");
  await otpStore.set("register", EMAIL, CODE);
  for (const left of [4, 3, 2]) {
    await expectOtpError(service.verifyOtp(EMAIL, "000000"), "OTP_INVALID", left);
  }
  await service.resendOtp(EMAIL, "203.0.113.7");
  await expectOtpError(service.verifyOtp(EMAIL, "000000"), "OTP_INVALID", 4);
});

test("không có mã (hết hạn / chưa xin) ⇒ OTP_INVALID, không có attemptsLeft, không đếm", async () => {
  const { service, failures } = buildService("PENDING_VERIFICATION");
  await expectOtpError(service.verifyOtp(EMAIL, "000000"), "OTP_INVALID");
  assert.equal(failures.size, 0);
});

test("đặt lại mật khẩu: cùng hành vi, lần 5 huỷ mã và không đổi mật khẩu", async () => {
  const { service, otpStore, passwordUpdated } = buildService("ACTIVE");
  const context = { ip: "203.0.113.7", via: "reset" as const };
  await otpStore.set("reset-password", EMAIL, CODE);
  for (const left of [4, 3, 2, 1]) {
    await expectOtpError(service.resetPassword(EMAIL, "000000", "mat-khau-moi-123", context), "OTP_INVALID", left);
  }
  await expectOtpError(service.resetPassword(EMAIL, "000000", "mat-khau-moi-123", context), "OTP_ATTEMPTS_EXCEEDED");
  await expectOtpError(service.resetPassword(EMAIL, CODE, "mat-khau-moi-123", context), "OTP_INVALID");
  assert.equal(passwordUpdated(), 0);
});

test("đặt lại mật khẩu: email không tồn tại ⇒ giống sai mã, không đếm (P2 của AD-18)", async () => {
  const { service, failures } = buildService("ACTIVE");
  await expectOtpError(
    service.resetPassword("khong-co@example.com", "000000", "mat-khau-moi-123", { ip: "1.1.1.1", via: "reset" }),
    "OTP_INVALID",
  );
  assert.equal(failures.size, 0);
});

test("errorHandler trả code và data của AppError", () => {
  let status = 0;
  let body: unknown;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
    },
  } as unknown as Response;
  errorHandler(new AppError(400, "Invalid or expired OTP", "OTP_INVALID", { attemptsLeft: 2 }), {} as Request, res, () => {});
  assert.equal(status, 400);
  assert.deepEqual(body, { success: false, error: "Invalid or expired OTP", code: "OTP_INVALID", data: { attemptsLeft: 2 } });
});
