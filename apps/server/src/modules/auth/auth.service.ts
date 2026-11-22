import { randomInt } from "node:crypto";
import type { PrismaClient, Role, User } from "@prisma/client";
import type { AuthTokensResponse } from "@sip/shared-types";
import { AppError, authStoreUnavailable } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { RateLimiter } from "../../shared/ports/RateLimiter";
import type { PasswordHasher } from "../../shared/ports/PasswordHasher";
import type { TokenBlacklist } from "../../shared/ports/TokenBlacklist";
import type { OtpStore, OtpPurpose } from "../../shared/ports/OtpStore";
import type { EmailSender } from "../../shared/ports/EmailSender";
import type { GoogleAuthClient } from "../../infrastructure/google-auth-client";
import type { AuditLogService } from "../audit-log/audit-log.service";
import type { UserRepository } from "../users/user.repository";
import type { JwtService } from "./jwt.service";
import { isIssuedBeforeRevocation, toRevokedAtSec, type SessionRevocationService } from "./session-revocation.service";

const SALT_ROUNDS = 12;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_PER_EMAIL_PER_HOUR = 20;
const OTP_MAX_PER_IP_PER_HOUR = 1000;
const ONE_HOUR_SECONDS = 60 * 60;
// AD-31 D3: mã OTP (6 số, sống 5 phút) bị huỷ sau 5 lần nhập sai, chống dò mã.
export const OTP_MAX_ATTEMPTS = 5;
// Nhật ký bảo mật (AD-20, docs/06-backend/admin-audit-log/PLAN.md L4): sai mật khẩu
// lần thứ 5 trong 15 phút với email có tài khoản ⇒ ghi một dòng. Khối "Điểm chính"
// của trang nhật ký đọc lại hai số này để ghi đúng ngưỡng.
export const LOGIN_FAIL_THRESHOLD = 5;
export const LOGIN_FAIL_WINDOW_MINUTES = 15;
// AD-31 D4: chặn đăng nhập tạm thời. Sai 5 lần / 15 phút với cùng email + IP ⇒ chặn
// cặp đó; một IP sai 30 lần / 15 phút (mọi email) ⇒ chặn IP đó. Chặn tới hết cửa sổ.
export const LOGIN_LOCK_THRESHOLD = 5;
export const LOGIN_IP_THRESHOLD = 30;
export const LOGIN_LOCK_WINDOW_MINUTES = 15;
/** Còn ≤ số lần này thì 401 kèm `attemptsLeft` để web cảnh báo trước khi bị chặn. */
const LOGIN_WARN_ATTEMPTS_LEFT = 2;

interface LoginLockKeys {
  pair: string;
  ip: string;
}

export type AuthTokens = AuthTokensResponse;

/** `change`: đổi mật khẩu ở trang Cài đặt; `reset`: trang quên mật khẩu. Cùng luồng OTP (E9). */
export type PasswordChangeVia = "reset" | "change";

interface OtpConfig {
  OTP_HARDCODE: boolean;
  OTP_HARDCODE_VALUE: string;
}

export class AuthService {
  private readonly prisma: PrismaClient;
  private readonly userRepository: UserRepository;
  private readonly jwtService: JwtService;
  private readonly otpStore: OtpStore;
  private readonly rateLimiter: RateLimiter;
  private readonly passwordHasher: PasswordHasher;
  private readonly emailSender: EmailSender;
  private readonly googleAuthClient: GoogleAuthClient;
  private readonly tokenBlacklist: TokenBlacklist;
  private readonly sessionRevocationService: SessionRevocationService;
  private readonly auditLogService: AuditLogService;
  private readonly logger: Logger;
  private readonly otpConfig: OtpConfig;

  constructor({
    prisma,
    userRepository,
    jwtService,
    otpStore,
    rateLimiter,
    passwordHasher,
    emailSender,
    googleAuthClient,
    tokenBlacklist,
    sessionRevocationService,
    auditLogService,
    logger,
    config,
  }: {
    prisma: PrismaClient;
    userRepository: UserRepository;
    jwtService: JwtService;
    otpStore: OtpStore;
    rateLimiter: RateLimiter;
    passwordHasher: PasswordHasher;
    emailSender: EmailSender;
    googleAuthClient: GoogleAuthClient;
    tokenBlacklist: TokenBlacklist;
    sessionRevocationService: SessionRevocationService;
    auditLogService: AuditLogService;
    logger: Logger;
    config: OtpConfig;
  }) {
    this.prisma = prisma;
    this.userRepository = userRepository;
    this.jwtService = jwtService;
    this.otpStore = otpStore;
    this.rateLimiter = rateLimiter;
    this.passwordHasher = passwordHasher;
    this.emailSender = emailSender;
    this.googleAuthClient = googleAuthClient;
    this.tokenBlacklist = tokenBlacklist;
    this.sessionRevocationService = sessionRevocationService;
    this.auditLogService = auditLogService;
    this.logger = logger;
    this.otpConfig = config;
  }

  async register(params: { email: string; password: string; role: "CANDIDATE" | "EMPLOYER"; ip: string }): Promise<void> {
    const existing = await this.userRepository.findByEmail(params.email);
    if (existing) {
      // AD-31 D5: email chờ xác thực ⇒ mã riêng để web gửi lại mã và chuyển sang bước
      // nhập mã. Không ghi đè mật khẩu / vai trò cũ: kẻ xấu không đặt trước mật khẩu
      // được cho email của người khác. Đã kích hoạt hoặc bị khoá ⇒ EMAIL_TAKEN.
      if (existing.status === "PENDING_VERIFICATION") {
        throw new AppError(409, "Email already registered but not verified", "EMAIL_PENDING_VERIFICATION");
      }
      throw new AppError(409, "Email already registered", "EMAIL_TAKEN");
    }

    const passwordHash = await this.passwordHasher.hash(params.password, SALT_ROUNDS);
    const user = await this.userRepository.createWithPassword({
      email: params.email,
      passwordHash,
      role: params.role,
    });

    await this.sendOtp("register", user.email, params.ip);
  }

  async resendOtp(email: string, ip: string): Promise<void> {
    const user = await this.requireUserByEmail(email);
    // Chỉ tài khoản chờ xác thực. Trước đây chặn riêng ACTIVE nên tài khoản bị khoá
    // (SUSPENDED) xin được mã rồi verifyOtp đặt lại ACTIVE (tự mở khoá). Cùng message
    // cho mọi trạng thái khác để không lộ tài khoản đang bị khoá.
    if (user.status !== "PENDING_VERIFICATION") {
      throw new AppError(400, "Email already verified");
    }

    await this.sendOtp("register", user.email, ip);
  }

  async verifyOtp(email: string, otp: string): Promise<AuthTokens> {
    const user = await this.requireUserByEmail(email);
    // markVerified đặt ACTIVE ⇒ chỉ cho tài khoản chờ xác thực (xem resendOtp).
    if (user.status !== "PENDING_VERIFICATION") {
      throw new AppError(400, "Invalid or expired OTP", "OTP_INVALID");
    }
    await this.assertOtpMatches("register", user.email, otp);

    const verified = await this.userRepository.markVerified(user.id);
    return this.issueTokens(verified);
  }

  async login(email: string, password: string, ip: string): Promise<AuthTokens> {
    const lockKeys = loginLockKeys(email, ip);
    // Đang bị chặn ⇒ trả 429 ngay, không tìm user, không so mật khẩu.
    await this.assertLoginNotLocked(lockKeys);

    const user = await this.userRepository.findByEmail(email);
    const matches = user?.passwordHash ? await this.passwordHasher.compare(password, user.passwordHash) : false;
    if (!user?.passwordHash || !matches) {
      // Nhật ký L4 chỉ cho tài khoản có mật khẩu (như cũ). Bộ đếm chặn thì đếm cả
      // email không tồn tại, để phản hồi giống nhau, không lộ email nào có tài khoản (Q2).
      if (user?.passwordHash) await this.trackFailedLogin(user, ip);
      await this.recordLoginFailure(lockKeys);
      throw new AppError(401, "Invalid email or password");
    }

    await this.clearLoginFailures(lockKeys);

    if (user.status === "PENDING_VERIFICATION") {
      throw new AppError(403, "Email not verified — please verify the OTP sent at registration", "EMAIL_NOT_VERIFIED");
    }
    if (user.status === "SUSPENDED") {
      throw new AppError(403, "Account is suspended", "ACCOUNT_SUSPENDED");
    }

    // L3: chỉ ghi đăng nhập của Admin. Không có tx ⇒ lỗi ghi chỉ được log, không chặn đăng nhập.
    if (user.role === "ADMIN") {
      await this.auditLogService.record({
        actorId: user.id,
        actorRole: user.role,
        action: "AUTH_LOGIN_SUCCEEDED",
        entityType: "User",
        entityId: user.id,
        summary: `${user.email} đăng nhập`,
        metadata: { ip },
      });
    }

    return this.issueTokens(user);
  }

  async loginOrRegisterWithGoogle(idToken: string, role: "CANDIDATE" | "EMPLOYER", ip: string): Promise<AuthTokens> {
    const profile = await this.googleAuthClient.verifyIdToken(idToken);

    let user = await this.userRepository.findByGoogleId(profile.googleId);

    if (!user) {
      const existingByEmail = await this.userRepository.findByEmail(profile.email);

      if (existingByEmail) {
        if (existingByEmail.role === "ADMIN") {
          throw new AppError(403, "Google sign-in is not available for this account");
        }
        // G1 (AD-17): Google đã xác thực email ⇒ tài khoản chờ xác thực được kích hoạt
        // (kèm xoá mật khẩu chưa xác thực). SUSPENDED chỉ liên kết, vẫn bị chặn bên dưới.
        // Nhật ký AUTH_GOOGLE_LINKED ghi cùng transaction (L5).
        const pending = existingByEmail.status === "PENDING_VERIFICATION";
        user = await this.prisma.$transaction(async (tx) => {
          const linked = pending
            ? await this.userRepository.linkGoogleToUnverified(existingByEmail.id, profile.googleId, tx)
            : await this.userRepository.linkGoogleId(existingByEmail.id, profile.googleId, tx);
          const activated = pending && linked.status === "ACTIVE";
          await this.auditLogService.record(
            {
              actorId: linked.id,
              actorRole: linked.role,
              action: "AUTH_GOOGLE_LINKED",
              entityType: "User",
              entityId: linked.id,
              summary: `${linked.email} liên kết tài khoản Google${activated ? " và kích hoạt tài khoản" : ""}`,
              metadata: activated ? { ip, activated: true } : { ip },
            },
            tx,
          );
          return linked;
        });
      } else {
        user = await this.userRepository.createWithGoogle({
          email: profile.email,
          googleId: profile.googleId,
          role,
        });
      }
    }

    if (user.status === "SUSPENDED") {
      throw new AppError(403, "Account is suspended", "ACCOUNT_SUSPENDED");
    }

    return this.issueTokens(user);
  }

  async forgotPassword(email: string, ip: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user || !user.passwordHash) {
      // Không tiết lộ email có tồn tại hay có đăng nhập bằng password hay không.
      return;
    }

    await this.sendOtp("reset-password", user.email, ip);
  }

  async resetPassword(
    email: string,
    otp: string,
    newPassword: string,
    context: { ip: string; via: PasswordChangeVia },
  ): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      // P2 (AD-18): trả lỗi giống sai mã thay vì 404, để trang /forgot-password
      // công khai không cho dò email nào có tài khoản (forgotPassword cũng không tiết lộ).
      throw new AppError(400, "Invalid or expired OTP", "OTP_INVALID");
    }
    await this.assertOtpMatches("reset-password", user.email, otp);

    const passwordHash = await this.passwordHasher.hash(newPassword, SALT_ROUNDS);
    // Đổi mật khẩu ⇒ đăng xuất mọi thiết bị (AD-18): nếu mật khẩu cũ bị lộ thì
    // phiên của kẻ gian cũng mất. Mật khẩu và mốc thu hồi ghi cùng transaction.
    const revokedAtSec = await this.prisma.$transaction(async (tx) => {
      await this.userRepository.updatePassword(user.id, passwordHash, tx);
      await this.auditLogService.record(
        {
          actorId: user.id,
          actorRole: user.role,
          action: "AUTH_PASSWORD_RESET",
          entityType: "User",
          entityId: user.id,
          summary: `${user.email} ${context.via === "change" ? "đổi mật khẩu" : "đặt lại mật khẩu"}`,
          metadata: { ip: context.ip, via: context.via },
        },
        tx,
      );
      return this.sessionRevocationService.revokeInTx(user.id, tx);
    });
    await this.sessionRevocationService.propagate(user.id, revokedAtSec);
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    const payload = this.jwtService.verifyRefreshToken(refreshToken);

    // AD-31 D1: Redis / DB lỗi ⇒ 503 (web giữ phiên). Chỉ token sai, bị thu
    // hồi, tài khoản không hoạt động mới là 401 (web xoá phiên).
    const [revoked, user] = await this.readRefreshState(payload.jti, payload.sub);
    if (revoked) {
      throw new AppError(401, "Refresh token has been revoked");
    }

    if (!user || user.status !== "ACTIVE") {
      throw new AppError(401, "Account is not active");
    }

    // Refresh token cấp trước mốc "đăng xuất mọi thiết bị" ⇒ từ chối (AD-18).
    // Đọc từ cột DB (nguồn sự thật) trong cùng truy vấn findById ở trên, vì
    // refresh token sống 7 ngày, lâu hơn nhiều so với bản sao Redis.
    if (isIssuedBeforeRevocation(payload.iat, toRevokedAtSec(user.sessionsRevokedAt))) {
      throw new AppError(401, "Session has been revoked", "SESSION_REVOKED");
    }

    const access = this.jwtService.signAccessToken({ sub: user.id, role: user.role });
    return { accessToken: access.token };
  }

  async logout(current: { jti: string; exp: number }, refreshToken?: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.tokenBlacklist.revoke(current.jti, current.exp - now);

    if (!refreshToken) return;

    try {
      const payload = this.jwtService.verifyRefreshToken(refreshToken);
      await this.tokenBlacklist.revoke(payload.jti, payload.exp - now);
    } catch {
      // Refresh token không hợp lệ/đã hết hạn — không cần blacklist thêm.
    }
  }

  /**
   * L4: đếm lần sai mật khẩu theo tài khoản (cửa sổ cố định 15 phút). Lần thứ 5
   * ghi một dòng `AUTH_LOGIN_FAILED_REPEATED`; khoá `alerted` giữ cho các lần sau
   * trong 15 phút kế tiếp không ghi thêm. Mọi lỗi ở đây chỉ được log: người dùng
   * vẫn phải nhận 401 như bình thường.
   */
  /**
   * AD-31 D4: khoá nào đạt ngưỡng ⇒ 429 LOGIN_LOCKED kèm số giây còn lại (lấy khoá
   * lâu hơn). Redis lỗi ⇒ log và cho qua (Q3): không chặn mọi người vì Redis hỏng.
   */
  private async assertLoginNotLocked(keys: LoginLockKeys): Promise<void> {
    let state: Awaited<ReturnType<AuthService["readLoginLock"]>>;
    try {
      state = await this.readLoginLock(keys);
    } catch (error) {
      this.logger.error("Không đọc được bộ đếm chặn đăng nhập", { message: errorMessage(error) });
      return;
    }
    if (state.retryAfterSeconds !== null) throw loginLocked(state.retryAfterSeconds);
  }

  /**
   * Ghi một lần sai vào cả hai khoá. Lần sai này làm đạt ngưỡng ⇒ 429 ngay (Q1);
   * chưa đạt mà còn ≤ 2 lần ⇒ 401 kèm `attemptsLeft`. Redis lỗi ⇒ log, để 401 thường.
   */
  private async recordLoginFailure(keys: LoginLockKeys): Promise<void> {
    const windowSeconds = LOGIN_LOCK_WINDOW_MINUTES * 60;
    let state: Awaited<ReturnType<AuthService["readLoginLock"]>>;
    try {
      await Promise.all([
        this.rateLimiter.consume(keys.pair, LOGIN_LOCK_THRESHOLD, windowSeconds),
        this.rateLimiter.consume(keys.ip, LOGIN_IP_THRESHOLD, windowSeconds),
      ]);
      state = await this.readLoginLock(keys);
    } catch (error) {
      this.logger.error("Không đếm được lần đăng nhập sai (chặn tạm thời)", { message: errorMessage(error) });
      return;
    }
    if (state.retryAfterSeconds !== null) throw loginLocked(state.retryAfterSeconds);
    if (state.attemptsLeft <= LOGIN_WARN_ATTEMPTS_LEFT) {
      throw new AppError(401, "Invalid email or password", undefined, { attemptsLeft: state.attemptsLeft });
    }
  }

  /** Đăng nhập đúng ⇒ xoá bộ đếm của cặp email + IP. Khoá theo IP để tự hết hạn. */
  private async clearLoginFailures(keys: LoginLockKeys): Promise<void> {
    try {
      await this.rateLimiter.reset(keys.pair);
    } catch (error) {
      this.logger.error("Không xoá được bộ đếm đăng nhập sai", { message: errorMessage(error) });
    }
  }

  private async readLoginLock(keys: LoginLockKeys): Promise<{ retryAfterSeconds: number | null; attemptsLeft: number }> {
    const windowSeconds = LOGIN_LOCK_WINDOW_MINUTES * 60;
    const [pair, ip] = await Promise.all([this.rateLimiter.peek(keys.pair), this.rateLimiter.peek(keys.ip)]);
    // TTL -1 (khoá chưa kịp đặt hạn) ⇒ coi như còn nguyên cửa sổ.
    const remaining = (ttl: number) => (ttl > 0 ? ttl : windowSeconds);
    const locked = [
      pair.count >= LOGIN_LOCK_THRESHOLD ? remaining(pair.ttlSeconds) : null,
      ip.count >= LOGIN_IP_THRESHOLD ? remaining(ip.ttlSeconds) : null,
    ].filter((value): value is number => value !== null);
    return {
      retryAfterSeconds: locked.length > 0 ? Math.max(...locked) : null,
      attemptsLeft: Math.min(LOGIN_LOCK_THRESHOLD - pair.count, LOGIN_IP_THRESHOLD - ip.count),
    };
  }

  /** Đọc blacklist (Redis) và user (DB) cho refresh; lỗi hạ tầng ⇒ 503 (AD-31 D1). */
  private async readRefreshState(jti: string, userId: string): Promise<[boolean, User | null]> {
    try {
      return await Promise.all([this.tokenBlacklist.isRevoked(jti), this.userRepository.findById(userId)]);
    } catch (error) {
      this.logger.error("refresh: không đọc được trạng thái phiên", {
        message: error instanceof Error ? error.message : String(error),
      });
      throw authStoreUnavailable();
    }
  }

  private async trackFailedLogin(user: User, ip: string): Promise<void> {
    const windowSeconds = LOGIN_FAIL_WINDOW_MINUTES * 60;
    try {
      const belowThreshold = await this.rateLimiter.consume(`login-fail:${user.id}`, LOGIN_FAIL_THRESHOLD - 1, windowSeconds);
      if (belowThreshold) return;
      const firstAlert = await this.rateLimiter.consume(`login-fail:alerted:${user.id}`, 1, windowSeconds);
      if (!firstAlert) return;
      // Q10: người gõ sai có thể là kẻ dò mật khẩu ⇒ người làm là hệ thống (null),
      // tài khoản bị dò chỉ là đối tượng, không hiện trong top người làm.
      await this.auditLogService.record({
        actorId: null,
        actorRole: null,
        action: "AUTH_LOGIN_FAILED_REPEATED",
        entityType: "User",
        entityId: user.id,
        summary: `Đăng nhập sai ${LOGIN_FAIL_THRESHOLD} lần trong ${LOGIN_FAIL_WINDOW_MINUTES} phút vào tài khoản ${user.email}`,
        metadata: { attempts: LOGIN_FAIL_THRESHOLD, windowMinutes: LOGIN_FAIL_WINDOW_MINUTES, ip },
      });
    } catch (error) {
      this.logger.error("Không đếm được lần đăng nhập sai", { error, userId: user.id });
    }
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const access = this.jwtService.signAccessToken({ sub: user.id, role: user.role as Role });
    const refresh = this.jwtService.signRefreshToken({ sub: user.id, role: user.role as Role });
    return { accessToken: access.token, refreshToken: refresh.token };
  }

  private async requireUserByEmail(email: string): Promise<User> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new AppError(404, "User not found");
    }
    return user;
  }

  private async sendOtp(purpose: OtpPurpose, email: string, ip: string): Promise<void> {
    await this.assertOtpRateLimit(email, ip);

    const code = this.otpConfig.OTP_HARDCODE ? this.otpConfig.OTP_HARDCODE_VALUE : randomInt(100000, 1000000).toString();
    await this.otpStore.set(purpose, email, code);

    if (this.otpConfig.OTP_HARDCODE) {
      this.logger.info(`OTP (hardcode) issued`, { purpose, email });
      return;
    }

    await this.emailSender.send({
      to: email,
      subject: purpose === "register" ? "Xác thực email — Smart Internship Platform" : "Đặt lại mật khẩu — Smart Internship Platform",
      html: `<p>Mã OTP của bạn là <strong>${code}</strong>. Mã có hiệu lực trong 5 phút.</p>`,
    });
  }

  private async assertOtpRateLimit(email: string, ip: string): Promise<void> {
    const cooldownOk = await this.rateLimiter.consume(`otp:cooldown:${email}`, 1, OTP_RESEND_COOLDOWN_SECONDS);
    if (!cooldownOk) {
      throw new AppError(429, "Please wait before requesting another OTP");
    }

    const emailHourlyOk = await this.rateLimiter.consume(`otp:hourly:email:${email}`, OTP_MAX_PER_EMAIL_PER_HOUR, ONE_HOUR_SECONDS);
    if (!emailHourlyOk) {
      throw new AppError(429, "Too many OTP requests for this email — please try again later");
    }

    const ipHourlyOk = await this.rateLimiter.consume(`otp:hourly:ip:${ip}`, OTP_MAX_PER_IP_PER_HOUR, ONE_HOUR_SECONDS);
    if (!ipHourlyOk) {
      throw new AppError(429, "Too many OTP requests from this network — please try again later");
    }
  }

  private async assertOtpMatches(purpose: OtpPurpose, email: string, otp: string): Promise<void> {
    const stored = await this.otpStore.get(purpose, email);
    // Không có mã (hết hạn, đã dùng, đã bị huỷ) ⇒ không đếm, không có attemptsLeft.
    if (!stored) {
      throw new AppError(400, "Invalid or expired OTP", "OTP_INVALID");
    }
    if (stored !== otp) {
      const failures = await this.otpStore.recordFailure(purpose, email);
      if (failures >= OTP_MAX_ATTEMPTS) {
        await this.otpStore.delete(purpose, email);
        throw new AppError(400, "Too many incorrect OTP attempts — please request a new code", "OTP_ATTEMPTS_EXCEEDED");
      }
      throw new AppError(400, "Invalid or expired OTP", "OTP_INVALID", { attemptsLeft: OTP_MAX_ATTEMPTS - failures });
    }
    await this.otpStore.delete(purpose, email);
  }
}

function loginLockKeys(email: string, ip: string): LoginLockKeys {
  const normalized = email.trim().toLowerCase();
  return { pair: `login-lock:${normalized}:${ip}`, ip: `login-lock-ip:${ip}` };
}

function loginLocked(retryAfterSeconds: number): AppError {
  return new AppError(429, "Too many failed login attempts — please try again later", "LOGIN_LOCKED", {
    retryAfterSeconds,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
