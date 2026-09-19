import { asClass, asFunction, asValue, createContainer, type AwilixContainer } from "awilix";
import type { Redis } from "ioredis";
import type { Server as SocketIOServer } from "socket.io";
import { prisma } from "./infrastructure/prisma";
import { redis } from "./infrastructure/redis";
import { RedisRateLimiter } from "./infrastructure/redis-rate-limiter";
import { RedisTokenBlacklist } from "./infrastructure/redis-token-blacklist";
import { RedisOtpStore } from "./infrastructure/redis-otp-store";
import { ResendEmailSender } from "./infrastructure/resend-email-sender";
import { ConsoleEmailSender } from "./infrastructure/console-email-sender";
import { NoopRealtimeNotifier } from "./infrastructure/noop-realtime-notifier";
import { SocketIoRealtimeNotifier } from "./infrastructure/socket-realtime-notifier";
import { GoogleAuthClient } from "./infrastructure/google-auth-client";
import { RedisCompanyInviteCodeStore } from "./infrastructure/redis-company-invite-code-store";
import { CloudinaryMediaStorage } from "./infrastructure/cloudinary-media-storage";
import { VnpayGatewayAdapter } from "./infrastructure/vnpay-gateway-adapter";
import { MomoGatewayAdapter } from "./infrastructure/momo-gateway-adapter";
import { GeminiCatalogMatchVerifier } from "./infrastructure/gemini-catalog-match-verifier";
import { UserRepository } from "./modules/users/user.repository";
import { CompanyRepository } from "./modules/companies/company.repository";
import { EmployerRepository } from "./modules/employers/employer.repository";
import { CatalogRateLimitService } from "./modules/shared/catalog-rate-limit.service";
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
import type { CatalogMatchVerifier } from "./shared/ports/CatalogMatchVerifier";
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
  // Bản Socket.IO khi gateway khởi tạo được, fallback no-op nếu lỗi —
  // NotificationsService/messaging chỉ phụ thuộc interface.
  socketIoServer?: SocketIOServer;
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
  // Dùng chung bởi skills và education-catalog (Skill/University/Major cùng cơ
  // chế PENDING — docs/06-backend/cv-ai-extraction-phase2/PLAN.md Quyết định #3/#4).
  catalogRateLimitService: CatalogRateLimitService;
  catalogMatchVerifier: CatalogMatchVerifier;
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
    emailSender: config.DEV_SKIP_EMAIL_SENDING
      ? asClass(ConsoleEmailSender).singleton()
      : asClass(ResendEmailSender).singleton(),
    // realtimeNotifier KHÔNG đăng ký ở đây: phụ thuộc instance Socket.IO tạo
    // lúc runtime — xem registerRealtime() bên dưới, gọi từ main.ts.
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
    catalogRateLimitService: asClass(CatalogRateLimitService).singleton(),
    catalogMatchVerifier: asClass(GeminiCatalogMatchVerifier).singleton(),
  });

  return container;
}

/**
 * Đăng ký realtimeNotifier theo kết quả khởi tạo Socket.IO. `io` = null nghĩa
 * là gateway lỗi → dùng bản no-op để REST API vẫn chạy (chỉ mất realtime).
 */
export function registerRealtime(container: AwilixContainer<Cradle>, io: SocketIOServer | null): void {
  if (io) {
    container.register({
      socketIoServer: asValue(io),
      realtimeNotifier: asClass(SocketIoRealtimeNotifier).singleton(),
    });
  } else {
    container.register({ realtimeNotifier: asClass(NoopRealtimeNotifier).singleton() });
  }
}
