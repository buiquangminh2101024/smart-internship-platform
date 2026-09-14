import { asClass, asFunction, asValue, createContainer, type AwilixContainer } from "awilix";
import type { Redis } from "ioredis";
import { prisma } from "./infrastructure/prisma";
import { redis } from "./infrastructure/redis";
import { RedisRateLimiter } from "./infrastructure/redis-rate-limiter";
import { RedisTokenBlacklist } from "./infrastructure/redis-token-blacklist";
import { RedisOtpStore } from "./infrastructure/redis-otp-store";
import { ResendEmailSender } from "./infrastructure/resend-email-sender";
import { NoopRealtimeNotifier } from "./infrastructure/noop-realtime-notifier";
import { GoogleAuthClient } from "./infrastructure/google-auth-client";
import { RedisCompanyInviteCodeStore } from "./infrastructure/redis-company-invite-code-store";
import { CloudinaryMediaStorage } from "./infrastructure/cloudinary-media-storage";
import { VnpayGatewayAdapter } from "./infrastructure/vnpay-gateway-adapter";
import { MomoGatewayAdapter } from "./infrastructure/momo-gateway-adapter";
import { UserRepository } from "./modules/users/user.repository";
import { CompanyRepository } from "./modules/companies/company.repository";
import { EmployerRepository } from "./modules/employers/employer.repository";
import { logger, type Logger } from "./shared/logger";
import { config } from "./shared/config/env";
import type { RateLimiter } from "./shared/ports/RateLimiter";
import type { TokenBlacklist } from "./shared/ports/TokenBlacklist";
import type { OtpStore } from "./shared/ports/OtpStore";
import type { EmailSender } from "./shared/ports/EmailSender";
import type { RealtimeNotifier } from "./shared/ports/RealtimeNotifier";
import type { CompanyInviteCodeStore } from "./shared/ports/CompanyInviteCodeStore";
import type { MediaStorage } from "./shared/ports/MediaStorage";
import type { PaymentGatewayAdapter } from "./shared/ports/PaymentGatewayAdapter";
import type { PaymentProvider, PrismaClient } from "@prisma/client";

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
  // Phase 10: bản no-op. Khi Phase 9 xong, đổi registration sang implementation
  // dùng Socket.IO — NotificationsService không phải sửa gì.
  realtimeNotifier: RealtimeNotifier;
  googleAuthClient: GoogleAuthClient;
  companyInviteCodeStore: CompanyInviteCodeStore;
  mediaStorage: MediaStorage;
  userRepository: UserRepository;
  companyRepository: CompanyRepository;
  // Dùng chéo bởi employers (chủ sở hữu) và subscriptions (đọc companyId/
  // isCompanyAdmin lúc checkout, xem employer.repository.ts) — cùng lý do
  // CompanyRepository đã được đăng ký tập trung ở đây từ Phase 4.
  employerRepository: EmployerRepository;
  vnpayGatewayAdapter: PaymentGatewayAdapter;
  momoGatewayAdapter: PaymentGatewayAdapter;
  paymentGatewayAdapters: Record<PaymentProvider, PaymentGatewayAdapter>;
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
    realtimeNotifier: asClass(NoopRealtimeNotifier).singleton(),
    googleAuthClient: asClass(GoogleAuthClient).singleton(),
    companyInviteCodeStore: asClass(RedisCompanyInviteCodeStore).singleton(),
    mediaStorage: asClass(CloudinaryMediaStorage).singleton(),
    userRepository: asClass(UserRepository).singleton(),
    companyRepository: asClass(CompanyRepository).singleton(),
    employerRepository: asClass(EmployerRepository).singleton(),
    vnpayGatewayAdapter: asClass(VnpayGatewayAdapter).singleton(),
    momoGatewayAdapter: asClass(MomoGatewayAdapter).singleton(),
    paymentGatewayAdapters: asFunction(
      (cradle: Cradle): Record<PaymentProvider, PaymentGatewayAdapter> => ({
        VNPAY: cradle.vnpayGatewayAdapter,
        MOMO: cradle.momoGatewayAdapter,
      }),
    ).singleton(),
  });

  return container;
}
