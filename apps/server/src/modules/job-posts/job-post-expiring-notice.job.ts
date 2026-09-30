import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import type { EmployerRepository } from "../employers/employer.repository";
import type { NotificationsService } from "../notifications/notifications.service";
import type { JobPostRepository } from "./job-post.repository";

const NOTICE_WINDOW_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface JobPostExpiringNoticeDeps {
  jobPostRepository: JobPostRepository;
  employerRepository: EmployerRepository;
  notificationsService: NotificationsService;
  logger: Logger;
}

/**
 * AD-16 — báo mọi employer của công ty khi tin PUBLISHED sẽ hết hạn trong 3 ngày
 * tới (JOB_POST_EXPIRING, chỉ trong app). `dedupeKey` theo tin + người nhận nên
 * mỗi người chỉ được báo một lần cho mỗi tin, dù job chạy lại.
 */
export async function runJobPostExpiringNotice(deps: JobPostExpiringNoticeDeps): Promise<number> {
  const { jobPostRepository, employerRepository, notificationsService, logger } = deps;
  const jobPosts = await jobPostRepository.findPublishedExpiringBefore(new Date(Date.now() + NOTICE_WINDOW_DAYS * DAY_MS));

  let created = 0;
  for (const jobPost of jobPosts) {
    if (!jobPost.expiresAt) continue;
    const employers = await employerRepository.findManyByCompanyId(jobPost.companyId);
    for (const { userId } of employers) {
      const isNew = await notificationsService.notifyOnce(
        "JOB_POST_EXPIRING",
        userId,
        { jobPostId: jobPost.id, jobPostTitle: jobPost.title, expiresAt: jobPost.expiresAt },
        `JOB_POST_EXPIRING:${jobPost.id}:${userId}`,
      );
      if (isNew) created += 1;
    }
  }

  if (created > 0) logger.info(`Job post expiring notice: ${created} notification(s) created`);
  return created;
}

export function startJobPostExpiringNoticeJob(deps: JobPostExpiringNoticeDeps): void {
  cron.schedule(
    "0 8 * * *",
    () => {
      void runJobPostExpiringNotice(deps).catch((error: unknown) => {
        deps.logger.error("Job post expiring notice failed", { error });
      });
    },
    { timezone: "Asia/Ho_Chi_Minh" },
  );
}
