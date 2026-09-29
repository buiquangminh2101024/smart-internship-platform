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
import { jobMatchingRouter } from "./modules/job-matching/job-matching.routes";
import { candidateInsightsRouter } from "./modules/candidate-insights/candidate-insights.routes";
import { candidateOutreachRouter } from "./modules/candidate-outreach/candidate-outreach.routes";
import { startCandidateOutreachExpiryJob } from "./modules/candidate-outreach/candidate-outreach-expiry.job";
import type { CandidateOutreachRepository } from "./modules/candidate-outreach/candidate-outreach.repository";

import { messagingRoutes } from "./modules/messaging/messaging.routes";

import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { startOutboxJob } from "./modules/notifications/outbox/outbox.job";
import type { OutboxRepository } from "./modules/notifications/outbox/outbox.repository";
import type { NotificationsService } from "./modules/notifications/notifications.service";
import type { EmailSender } from "./shared/ports/EmailSender";
import { auditLogRouter } from "./modules/audit-log/audit-log.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { startJobPostExpiringNoticeJob } from "./modules/job-posts/job-post-expiring-notice.job";
import { startSubscriptionExpiringNoticeJob } from "./modules/subscriptions/subscription-expiring-notice.job";
import type { EmployerRepository } from "./modules/employers/employer.repository";
import { interviewsRouter } from "./modules/interviews/interviews.routes";
import { startInterviewReminderJob } from "./modules/interviews/interview-reminder.job";
import type { InterviewsRepository } from "./modules/interviews/interviews.repository";

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
// Lịch phỏng vấn (AD-16 M2). Đăng ký interviewsRepository/interviewsService mà
// applicationsService và dashboard dùng — cả hai resolve lúc có request.
app.use("/api", interviewsRouter(container));
// Sau skillsRouter: Job Matcher GĐ2 dùng skillEmbeddingService do router đó đăng ký.
app.use("/api", jobMatchingRouter(container));
// Sau jobMatchingRouter: dùng jobRecommendationService/candidateMatchProfileLoader do router đó đăng ký.
app.use("/api", candidateInsightsRouter(container));
// Sau jobMatchingRouter: dùng ruleJobMatcher/hybridJobMatcher/matchEmbeddingService/loader do router đó đăng ký.
app.use("/api", candidateOutreachRouter(container));

app.use("/api/conversations", messagingRoutes(container));

// Mount trước khi start outbox job bên dưới: notificationsRouter là nơi đăng ký
// notificationsService/outboxRepository vào container.
app.use("/api", notificationsRouter(container));
// auditLogService dùng chéo (AD-16) + GET /admin/activity — resolve lúc có
// request nên thứ tự mount không ảnh hưởng các module gọi nó.
app.use("/api", auditLogRouter(container));
// Chỉ đọc (AD-16); các service nó gọi resolve lúc có request.
app.use("/api", dashboardRouter(container));

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
// Hạ lời mời ứng tuyển quá hạn / của tin không còn PUBLISHED (B3, AD-15).
startCandidateOutreachExpiryJob(
  container.resolve<CandidateOutreachRepository>("candidateOutreachRepository"),
  logger,
);
// Báo tin sắp hết hạn (3 ngày) và gói sắp hết hạn (7 ngày) — 08:00 giờ Việt
// Nam hằng ngày, mỗi đối tượng chỉ báo một lần nhờ Notification.dedupeKey (AD-16).
startJobPostExpiringNoticeJob({
  jobPostRepository: container.resolve<JobPostRepository>("jobPostRepository"),
  employerRepository: container.resolve<EmployerRepository>("employerRepository"),
  notificationsService: container.resolve<NotificationsService>("notificationsService"),
  logger,
});
startSubscriptionExpiringNoticeJob({
  companySubscriptionRepository: container.resolve<CompanySubscriptionRepository>("companySubscriptionRepository"),
  employerRepository: container.resolve<EmployerRepository>("employerRepository"),
  notificationsService: container.resolve<NotificationsService>("notificationsService"),
  logger,
});
// Nhắc lịch phỏng vấn ngày mai — 08:00 giờ Việt Nam (AD-16 D9).
startInterviewReminderJob({
  interviewsRepository: container.resolve<InterviewsRepository>("interviewsRepository"),
  notificationsService: container.resolve<NotificationsService>("notificationsService"),
  logger,
});
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
