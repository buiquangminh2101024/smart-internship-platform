import { asClass, asValue, createContainer, type AwilixContainer } from "awilix";
import type { Redis } from "ioredis";
import { prisma } from "./infrastructure/prisma";
import { redis } from "./infrastructure/redis";
import { RedisRateLimiter } from "./infrastructure/redis-rate-limiter";
import { RedisTokenBlacklist } from "./infrastructure/redis-token-blacklist";
import { RedisOtpStore } from "./infrastructure/redis-otp-store";
import { ResendEmailSender } from "./infrastructure/resend-email-sender";
import { GoogleAuthClient } from "./infrastructure/google-auth-client";
import { RedisCompanyInviteCodeStore } from "./infrastructure/redis-company-invite-code-store";
import { CloudinaryMediaStorage } from "./infrastructure/cloudinary-media-storage";
import { UserRepository } from "./modules/users/user.repository";
import { CompanyRepository } from "./modules/companies/company.repository";
import { logger, type Logger } from "./shared/logger";
import { config } from "./shared/config/env";
import type { RateLimiter } from "./shared/ports/RateLimiter";
import type { TokenBlacklist } from "./shared/ports/TokenBlacklist";
import type { OtpStore } from "./shared/ports/OtpStore";
import type { EmailSender } from "./shared/ports/EmailSender";
import type { CompanyInviteCodeStore } from "./shared/ports/CompanyInviteCodeStore";
import type { MediaStorage } from "./shared/ports/MediaStorage";
import type { PrismaClient } from "@prisma/client";

// Cradle gốc — mỗi module nghiệp vụ mở rộng type này khi đăng ký thêm
// controller/service/repository của mình (asClass), theo pattern demo ở
// modules/health. Infra dùng chung nhiều module (Redis, email, OAuth,
// UserRepository, CompanyRepository — dùng chéo employers/companies, xem
// PROJECT_STRUCTURE.md §5) đăng ký tập trung ở đây thay vì trong từng *.routes.ts.
export interface Cradle {
  prisma: PrismaClient;
  logger: Logger;
  config: typeof config;
  redis: Redis;
  rateLimiter: RateLimiter;
  tokenBlacklist: TokenBlacklist;
  otpStore: OtpStore;
  emailSender: EmailSender;
  googleAuthClient: GoogleAuthClient;
  companyInviteCodeStore: CompanyInviteCodeStore;
  mediaStorage: MediaStorage;
  userRepository: UserRepository;
  companyRepository: CompanyRepository;
}

export function buildContainer(): AwilixContainer<Cradle> {
  const container = createContainer<Cradle>();

  container.register({
    prisma: asValue(prisma),
    logger: asValue(logger),
    config: asValue(config),
    redis: asValue(redis),
    rateLimiter: asClass(RedisRateLimiter).singleton(),
    tokenBlacklist: asClass(RedisTokenBlacklist).singleton(),
    otpStore: asClass(RedisOtpStore).singleton(),
    emailSender: asClass(ResendEmailSender).singleton(),
    googleAuthClient: asClass(GoogleAuthClient).singleton(),
    companyInviteCodeStore: asClass(RedisCompanyInviteCodeStore).singleton(),
    mediaStorage: asClass(CloudinaryMediaStorage).singleton(),
    userRepository: asClass(UserRepository).singleton(),
    companyRepository: asClass(CompanyRepository).singleton(),
  });

  return container;
}
