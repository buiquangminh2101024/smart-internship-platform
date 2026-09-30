import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import type { EmployerRepository } from "../employers/employer.repository";
import type { NotificationsService } from "../notifications/notifications.service";
import type { CompanySubscriptionRepository } from "./company-subscription.repository";

const NOTICE_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionExpiringNoticeDeps {
  companySubscriptionRepository: CompanySubscriptionRepository;
  employerRepository: EmployerRepository;
  notificationsService: NotificationsService;
  logger: Logger;
}

/**
 * AD-16 — báo company admin khi gói ACTIVE sẽ hết hạn trong 7 ngày tới
 * (SUBSCRIPTION_EXPIRING, có email qua outbox — D5). `dedupeKey` theo gói +
 * người nhận: mỗi người chỉ nhận một lần cho mỗi gói.
 */
export async function runSubscriptionExpiringNotice(deps: SubscriptionExpiringNoticeDeps): Promise<number> {
  const { companySubscriptionRepository, employerRepository, notificationsService, logger } = deps;
  const subscriptions = await companySubscriptionRepository.findActiveEndingBefore(
    new Date(Date.now() + NOTICE_WINDOW_DAYS * DAY_MS),
  );

  let created = 0;
  for (const subscription of subscriptions) {
    const admins = await employerRepository.findCompanyAdminsByCompanyId(subscription.companyId);
    for (const { userId } of admins) {
      const isNew = await notificationsService.notifyOnce(
        "SUBSCRIPTION_EXPIRING",
        userId,
        { subscriptionId: subscription.id, planName: subscription.plan.name, endDate: subscription.endDate },
        `SUBSCRIPTION_EXPIRING:${subscription.id}:${userId}`,
      );
      if (isNew) created += 1;
    }
  }

  if (created > 0) logger.info(`Subscription expiring notice: ${created} notification(s) created`);
  return created;
}

export function startSubscriptionExpiringNoticeJob(deps: SubscriptionExpiringNoticeDeps): void {
  cron.schedule(
    "0 8 * * *",
    () => {
      void runSubscriptionExpiringNotice(deps).catch((error: unknown) => {
        deps.logger.error("Subscription expiring notice failed", { error });
      });
    },
    { timezone: "Asia/Ho_Chi_Minh" },
  );
}
