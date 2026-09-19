import { config } from "./shared/config/env";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import type { Server as SocketIOServer } from "socket.io";
import { setupSocketIo } from "./infrastructure/socket";
import { buildContainer, registerRealtime } from "./container";
import { healthRouter } from "./modules/health/health.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { employersRouter } from "./modules/employers/employers.routes";
import { companiesRouter } from "./modules/companies/companies.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { paymentsRouter } from "./modules/payments/payments.routes";
import { subscriptionsRouter } from "./modules/subscriptions/subscriptions.routes";
import { startSubscriptionExpiryJob } from "./modules/subscriptions/subscription-expiry.job";
import type { CompanySubscriptionRepository } from "./modules/subscriptions/company-subscription.repository";
import type { SubscriptionsService } from "./modules/subscriptions/subscriptions.service";
import { jobPostsRouter } from "./modules/job-posts/job-posts.routes";
import { startJobPostExpiryJob } from "./modules/job-posts/job-post-expiry.job";
import type { JobPostRepository } from "./modules/job-posts/job-post.repository";
import { candidatesRouter } from "./modules/candidates/candidates.routes";
import { skillsRouter } from "./modules/skills/skills.routes";
import { educationCatalogRouter } from "./modules/education-catalog/education-catalog.routes";
import { startCatalogSuggestionQueueJob } from "./modules/shared/catalog-suggestion-queue.job";
import type { SkillsRepository } from "./modules/skills/skills.repository";
import type { SkillEmbeddingService } from "./modules/skills/skill-embedding.service";
import type { UniversityRepository } from "./modules/education-catalog/university.repository";
import type { MajorRepository } from "./modules/education-catalog/major.repository";
import type { CatalogMatchVerifier } from "./shared/ports/CatalogMatchVerifier";
import { cvRouter } from "./modules/cv/cv.routes";
import { savedJobsRouter } from "./modules/saved-jobs/saved-jobs.routes";
import { applicationsRouter } from "./modules/applications/applications.routes";

import { messagingRoutes } from "./modules/messaging/messaging.routes";

import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { startOutboxJob } from "./modules/notifications/outbox/outbox.job";
import type { OutboxRepository } from "./modules/notifications/outbox/outbox.repository";
import type { EmailSender } from "./shared/ports/EmailSender";

import { errorHandler } from "./shared/middleware/errorHandler";
import { logger } from "./shared/logger";

const container = buildContainer();

const app = express();

// Tạo httpServer + Socket.IO trước khi mount router để realtimeNotifier có mặt
// trong container ngay từ đầu (route vẫn thêm được vào `app` sau đó). Socket.IO
// lỗi thì chỉ mất realtime, không được kéo sập REST API.
const server = createServer(app);
let io: SocketIOServer | null = null;
try {
  io = setupSocketIo(server, container);
} catch (error) {
  logger.error("Socket.IO khởi tạo thất bại, notification/chat realtime sẽ không hoạt động", { error });
}
registerRealtime(container, io);

app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json());

app.use("/api", healthRouter(container));
app.use("/api", authRouter(container));
app.use("/api", usersRouter(container));
app.use("/api", employersRouter(container));
app.use("/api", companiesRouter(container));
app.use("/api", catalogRouter(container));
app.use("/api", paymentsRouter(container));
app.use("/api", subscriptionsRouter(container));
app.use("/api", jobPostsRouter(container));
app.use("/api", candidatesRouter(container));
// Mount trước cron bên dưới: skillsRouter/educationCatalogRouter là nơi đăng ký
// skillsRepository/skillEmbeddingService/universityRepository/majorRepository
// vào container (giống notificationsRouter).
app.use("/api", skillsRouter(container));
app.use("/api", educationCatalogRouter(container));
app.use("/api", cvRouter(container));
app.use("/api", savedJobsRouter(container));
app.use("/api", applicationsRouter(container));

app.use("/api/conversations", messagingRoutes(container));

// Mount trước khi start outbox job bên dưới: notificationsRouter là nơi đăng ký
// notificationsService/outboxRepository vào container.
app.use("/api", notificationsRouter(container));

app.use(errorHandler);

// Chạy chung process với Express (giống Socket.IO) — đúng nguyên tắc modular
// monolith, xem ARCHITECTURE_DECISIONS.md AD-6 mục 3.
startSubscriptionExpiryJob(container.resolve<CompanySubscriptionRepository>("companySubscriptionRepository"), logger);
// Hạ tin hết hạn + đóng tin của company đã hết quyền đăng (AD-6 mục 3, phần
// "auto-close khi hết gói" dời từ Phase 5 sang Phase 6).
startJobPostExpiryJob(
  container.resolve<JobPostRepository>("jobPostRepository"),
  container.resolve<SubscriptionsService>("subscriptionsService"),
  logger,
);
// Transactional Outbox cho email notification — quét mỗi phút (AD-8).
startOutboxJob(
  container.resolve<OutboxRepository>("outboxRepository"),
  container.resolve<EmailSender>("emailSender"),
  logger,
);

// Xác nhận bằng Gemini cho skill/trường/ngành "vùng xám" + backfill embedding
// skill — chạy lệch khỏi request để người dùng không phải chờ LLM.
startCatalogSuggestionQueueJob({
  skillsRepository: container.resolve<SkillsRepository>("skillsRepository"),
  skillEmbeddingService: container.resolve<SkillEmbeddingService>("skillEmbeddingService"),
  universityRepository: container.resolve<UniversityRepository>("universityRepository"),
  majorRepository: container.resolve<MajorRepository>("majorRepository"),
  catalogMatchVerifier: container.resolve<CatalogMatchVerifier>("catalogMatchVerifier"),
  logger,
});

server.listen(config.PORT, () => {
  logger.info(`Server listening on port ${config.PORT}`);
});
