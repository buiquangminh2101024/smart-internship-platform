import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import type { Role, User } from "@prisma/client";
import type { AuthTokensResponse } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { RateLimiter } from "../../shared/ports/RateLimiter";
import type { TokenBlacklist } from "../../shared/ports/TokenBlacklist";
import type { OtpStore, OtpPurpose } from "../../shared/ports/OtpStore";
import type { EmailSender } from "../../shared/ports/EmailSender";
import type { GoogleAuthClient } from "../../infrastructure/google-auth-client";
import type { UserRepository } from "../users/user.repository";
import type { JwtService } from "./jwt.service";

const SALT_ROUNDS = 12;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_PER_EMAIL_PER_HOUR = 20;
const OTP_MAX_PER_IP_PER_HOUR = 1000;
const ONE_HOUR_SECONDS = 60 * 60;

export type AuthTokens = AuthTokensResponse;

interface OtpConfig {
  OTP_HARDCODE: boolean;
  OTP_HARDCODE_VALUE: string;
}

export class AuthService {
  private readonly userRepository: UserRepository;
  private readonly jwtService: JwtService;
  private readonly otpStore: OtpStore;
  private readonly rateLimiter: RateLimiter;
  private readonly emailSender: EmailSender;
  private readonly googleAuthClient: GoogleAuthClient;
  private readonly tokenBlacklist: TokenBlacklist;
  private readonly logger: Logger;
  private readonly otpConfig: OtpConfig;

  constructor({
    userRepository,
    jwtService,
    otpStore,
    rateLimiter,
    emailSender,
    googleAuthClient,
    tokenBlacklist,
    logger,
    config,
  }: {
    userRepository: UserRepository;
    jwtService: JwtService;
    otpStore: OtpStore;
    rateLimiter: RateLimiter;
    emailSender: EmailSender;
    googleAuthClient: GoogleAuthClient;
    tokenBlacklist: TokenBlacklist;
    logger: Logger;
    config: OtpConfig;
  }) {
    this.userRepository = userRepository;
    this.jwtService = jwtService;
    this.otpStore = otpStore;
    this.rateLimiter = rateLimiter;
    this.emailSender = emailSender;
    this.googleAuthClient = googleAuthClient;
    this.tokenBlacklist = tokenBlacklist;
    this.logger = logger;
    this.otpConfig = config;
  }

  async register(params: { email: string; password: string; role: "CANDIDATE" | "EMPLOYER"; ip: string }): Promise<void> {
    const existing = await this.userRepository.findByEmail(params.email);
    if (existing) {
      throw new AppError(409, "Email already registered");
    }

    const passwordHash = await bcrypt.hash(params.password, SALT_ROUNDS);
    const user = await this.userRepository.createWithPassword({
      email: params.email,
      passwordHash,
      role: params.role,
    });

    await this.sendOtp("register", user.email, params.ip);
  }

  async resendOtp(email: string, ip: string): Promise<void> {
    const user = await this.requireUserByEmail(email);
    if (user.status === "ACTIVE") {
      throw new AppError(400, "Email already verified");
    }

    await this.sendOtp("register", user.email, ip);
  }

  async verifyOtp(email: string, otp: string): Promise<AuthTokens> {
    const user = await this.requireUserByEmail(email);
    await this.assertOtpMatches("register", user.email, otp);

    const verified = await this.userRepository.markVerified(user.id);
    return this.issueTokens(verified);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.userRepository.findByEmail(email);
    if (!user?.passwordHash) {
      throw new AppError(401, "Invalid email or password");
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new AppError(401, "Invalid email or password");
    }

    if (user.status === "PENDING_VERIFICATION") {
      throw new AppError(403, "Email not verified — please verify the OTP sent at registration");
    }
    if (user.status === "SUSPENDED") {
      throw new AppError(403, "Account is suspended");
    }

    return this.issueTokens(user);
  }

  async loginOrRegisterWithGoogle(idToken: string, role: "CANDIDATE" | "EMPLOYER"): Promise<AuthTokens> {
    const profile = await this.googleAuthClient.verifyIdToken(idToken);

    let user = await this.userRepository.findByGoogleId(profile.googleId);

    if (!user) {
      const existingByEmail = await this.userRepository.findByEmail(profile.email);

      if (existingByEmail) {
        if (existingByEmail.role === "ADMIN") {
          throw new AppError(403, "Google sign-in is not available for this account");
        }
        user = await this.userRepository.linkGoogleId(existingByEmail.id, profile.googleId);
      } else {
        user = await this.userRepository.createWithGoogle({
          email: profile.email,
          googleId: profile.googleId,
          role,
        });
      }
    }

    if (user.status === "SUSPENDED") {
      throw new AppError(403, "Account is suspended");
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

  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    const user = await this.requireUserByEmail(email);
    await this.assertOtpMatches("reset-password", user.email, otp);

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.userRepository.updatePassword(user.id, passwordHash);
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    const payload = this.jwtService.verifyRefreshToken(refreshToken);

    if (await this.tokenBlacklist.isRevoked(payload.jti)) {
      throw new AppError(401, "Refresh token has been revoked");
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user || user.status !== "ACTIVE") {
      throw new AppError(401, "Account is not active");
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
    if (!stored || stored !== otp) {
      throw new AppError(400, "Invalid or expired OTP");
    }
    await this.otpStore.delete(purpose, email);
  }
}
