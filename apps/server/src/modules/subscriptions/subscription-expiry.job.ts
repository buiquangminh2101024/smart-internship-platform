import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import type { CompanySubscriptionRepository } from "./company-subscription.repository";

// node-cron (quyết định trực tiếp của chủ dự án, xem ARCHITECTURE_DECISIONS.md
// AD-6 mục 3) — chạy mỗi giờ, chỉ đổi CompanySubscription.status, KHÔNG đụng
// JobPost (đóng tin PUBLISHED tương ứng là deliverable Phase 6).
export function startSubscriptionExpiryJob(
  companySubscriptionRepository: CompanySubscriptionRepository,
  logger: Logger,
): void {
  cron.schedule("0 * * * *", () => {
    void (async () => {
      try {
        const count = await companySubscriptionRepository.expireOverdue();
        if (count > 0) {
          logger.info(`Subscription expiry sweep: ${count} company subscription(s) marked EXPIRED`);
        }
      } catch (error) {
        logger.error("Subscription expiry sweep failed", { error });
      }
    })();
  });
}
