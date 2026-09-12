import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import type { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { JobPostRepository } from "./job-post.repository";

/**
 * Quét mỗi giờ (cùng lịch với subscription-expiry.job.ts, xem
 * ARCHITECTURE_DECISIONS.md AD-6 mục 3), 2 bước:
 *  (a) tin PUBLISHED đã quá expiresAt → EXPIRED;
 *  (b) company không còn quyền đăng tin (hết gói VÀ hết trial) → đóng toàn bộ
 *      tin PUBLISHED của company đó — phần "auto-close khi hết gói" được dời
 *      từ Phase 5 sang Phase 6 theo AD-6.
 */
export async function runJobPostExpirySweep(
  jobPostRepository: JobPostRepository,
  subscriptionsService: SubscriptionsService,
  logger: Logger,
): Promise<{ overdue: number; blocked: number }> {
  const overdue = await jobPostRepository.expireOverdue();

  let blocked = 0;
  const companies = await jobPostRepository.findCompaniesWithPublishedPosts();
  for (const company of companies) {
    const access = await subscriptionsService.getCompanySubscriptionAccess(company);
    // BLOCKED vẫn KÈM publishRemaining nghĩa là company đang trong cửa sổ
    // trial, chỉ chạm hạn mức đăng thêm — tin đang hiển thị vẫn còn hiệu lực
    // tới hạn riêng của nó. Chỉ đóng khi hết hẳn quyền (hết hạn trial, hết gói,
    // chưa xác minh) — lúc đó access không còn số dư nào.
    if (access.mode !== "BLOCKED" || access.publishRemaining !== undefined) continue;
    blocked += await jobPostRepository.expirePublishedByCompany(company.id);
  }

  if (overdue > 0 || blocked > 0) {
    logger.info(`Job post expiry sweep: ${overdue} past deadline, ${blocked} closed for lapsed subscription`);
  }
  return { overdue, blocked };
}

export function startJobPostExpiryJob(
  jobPostRepository: JobPostRepository,
  subscriptionsService: SubscriptionsService,
  logger: Logger,
): void {
  cron.schedule("0 * * * *", () => {
    void runJobPostExpirySweep(jobPostRepository, subscriptionsService, logger).catch((error: unknown) => {
      logger.error("Job post expiry sweep failed", { error });
    });
  });
}
