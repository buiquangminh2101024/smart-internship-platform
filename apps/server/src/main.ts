import { config } from "./shared/config/env";
import express from "express";
import cors from "cors";
import { buildContainer } from "./container";
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
import { errorHandler } from "./shared/middleware/errorHandler";
import { logger } from "./shared/logger";

const container = buildContainer();

const app = express();

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

app.use(errorHandler);

// Chạy chung process với Express (giống Socket.IO) — đúng nguyên tắc modular
// monolith, xem ARCHITECTURE_DECISIONS.md AD-6 mục 3.
startSubscriptionExpiryJob(container.resolve<CompanySubscriptionRepository>("companySubscriptionRepository"), logger);

app.listen(config.PORT, () => {
  logger.info(`Server listening on port ${config.PORT}`);
});
