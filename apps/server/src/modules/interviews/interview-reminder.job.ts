import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import type { NotificationsService } from "../notifications/notifications.service";
import type { InterviewsRepository } from "./interviews.repository";
import { interviewDetails, vnDayStart } from "./interviews.service";

export interface InterviewReminderDeps {
  interviewsRepository: InterviewsRepository;
  notificationsService: NotificationsService;
  logger: Logger;
}

/**
 * AD-16 D9 — nhắc lịch phỏng vấn của NGÀY MAI (giờ Việt Nam) cho ứng viên (có
 * email) và employer đặt lịch (chỉ trong app). `dedupeKey` kèm giờ hẹn: job chạy
 * lại không báo trùng, nhưng lịch bị dời sang ngày khác sau khi đã nhắc thì vẫn
 * được nhắc cho giờ mới.
 */
export async function runInterviewReminder(deps: InterviewReminderDeps, now: Date = new Date()): Promise<number> {
  const { interviewsRepository, notificationsService, logger } = deps;
  const interviews = await interviewsRepository.listScheduledBetween(vnDayStart(now, 1), vnDayStart(now, 2));

  let created = 0;
  for (const interview of interviews) {
    const details = interviewDetails(interview);
    const candidateName = interview.application.candidate.fullName;
    const stamp = interview.scheduledAt.getTime();
    const recipients = [
      { userId: interview.application.candidate.userId, recipientRole: "CANDIDATE" as const },
      { userId: interview.createdById, recipientRole: "EMPLOYER" as const },
    ];
    for (const { userId, recipientRole } of recipients) {
      const isNew = await notificationsService.notifyOnce(
        "INTERVIEW_REMINDER",
        userId,
        { ...details, recipientRole, candidateName },
        `INTERVIEW_REMINDER:${interview.id}:${userId}:${stamp}`,
      );
      if (isNew) created += 1;
    }
  }

  if (created > 0) logger.info(`Interview reminder: ${created} notification(s) created`);
  return created;
}

export function startInterviewReminderJob(deps: InterviewReminderDeps): void {
  cron.schedule(
    "0 8 * * *",
    () => {
      void runInterviewReminder(deps).catch((error: unknown) => {
        deps.logger.error("Interview reminder failed", { error });
      });
    },
    { timezone: "Asia/Ho_Chi_Minh" },
  );
}
