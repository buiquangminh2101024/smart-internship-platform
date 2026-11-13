import { PrismaClient } from "@prisma/client";
import { JobAlertRepository } from "../src/modules/job-alerts/job-alert.repository";
import {
  JobAlertService,
  type DigestRunResult,
  type SkillsReminderResult,
} from "../src/modules/job-alerts/job-alert.service";
import { JOB_ALERT_DIGEST_MAX_JOBS } from "../src/modules/job-alerts/job-alerts.config";
import { NotificationsRepository } from "../src/modules/notifications/notifications.repository";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { OutboxRepository } from "../src/modules/notifications/outbox/outbox.repository";
import { config } from "../src/shared/config/env";
import { logger } from "../src/shared/logger";
import type { RealtimeNotifier } from "../src/shared/ports/RealtimeNotifier";

// Chạy tay job alert (0.5, AD-26 D7–D10) — docs/06-backend/job-discovery/PLAN.md bước 6.
// Gọi cùng hàm với cron 8h (email gộp, nhắc thêm kỹ năng) và với lối (a) sau khi tin được chấm
// (`--job`). Dùng để chạy lần đầu có kiểm soát và để demo "chạy ngay".
//
//   npm run job-alerts --workspace=apps/server -- [--dry-run] [--digest] [--reminders] [--job <id>]
//
// - Không có `--digest` / `--reminders` / `--job`: chạy email gộp và nhắc kỹ năng (như cron 8h).
// - `--job <id>`: báo cho tin này như lúc nó vừa được chấm ở lối (a) — đọc điểm đang lưu, không
//   chấm lại. Mỗi cặp (ứng viên, tin) chỉ báo một lần nên chạy lại không báo trùng.
// - `--dry-run`: chỉ đếm số người / số thư sẽ tạo; không ghi.
//
// Lượt thật GHI lên DB: `job_alerts`, thông báo và dòng outbox email (job outbox của server gửi
// email; đặt DEV_SKIP_EMAIL_SENDING=true ở server để chặn thư khi kiểm). Script chạy trong process
// riêng: khoá chống chạy chồng của service chỉ có tác dụng trong một process; chạy cùng lúc với
// cron thì câu nhận dòng có điều kiện `emailedAt IS NULL` chặn gửi trùng, `dedupeKey` chặn nhắc
// trùng. Thông báo tạo từ đây không đẩy realtime (người nhận thấy khi tải lại). Chỉ in số đếm và
// id, không in tên hay email.

const KNOWN_FLAGS = new Set(["--dry-run", "--digest", "--reminders", "--job"]);
const USAGE = "Dùng: --dry-run --digest --reminders --job <id>";

function parseArgs() {
  const args = process.argv.slice(2);
  let jobPostId: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    const [name, inline] = arg.split("=", 2) as [string, string | undefined];
    if (!KNOWN_FLAGS.has(name)) {
      console.error(`Không hiểu tham số "${arg}". ${USAGE}`);
      process.exit(1);
    }
    if (name === "--job") {
      const value = inline ?? args[i + 1];
      if (!value || value.startsWith("--")) {
        console.error("--job cần một id tin.");
        process.exit(1);
      }
      jobPostId = value;
      if (inline === undefined) i += 1;
    }
  }
  const pick = { digest: args.includes("--digest"), reminders: args.includes("--reminders") };
  const daily = !pick.digest && !pick.reminders && !jobPostId;
  return {
    dryRun: args.includes("--dry-run"),
    jobPostId,
    digest: daily || pick.digest,
    reminders: daily || pick.reminders,
  };
}

const options = parseArgs();
const prisma = new PrismaClient();

/** Script không có Socket.IO: thông báo vẫn lưu DB và outbox, chỉ bỏ bước đẩy realtime. */
const silentRealtimeNotifier: RealtimeNotifier = {
  pushToUser() {},
  pushMessageToUser() {},
  notifyConversationUnavailable() {},
  disconnectUser() {},
};

function buildService(): JobAlertService {
  const outboxRepository = new OutboxRepository({ prisma });
  const notificationsService = new NotificationsService({
    prisma,
    notificationsRepository: new NotificationsRepository({ prisma }),
    outboxRepository,
    realtimeNotifier: silentRealtimeNotifier,
    logger,
    config,
  });
  return new JobAlertService({
    jobAlertRepository: new JobAlertRepository({ prisma }),
    notificationsService,
    outboxRepository,
    logger,
    config,
  });
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} giây`;

function printDigest(result: DigestRunResult, ms: number): void {
  console.log(
    `Email gộp: ${result.candidates} ứng viên có tin chưa gửi; xếp ${result.emailsQueued} email` +
      ` (${result.jobsInEmails} tin, mỗi email liệt kê tối đa ${JOB_ALERT_DIGEST_MAX_JOBS});` +
      ` không còn tin để gửi ${result.nothingToSend}; lượt khác đã nhận ${result.raced};` +
      ` tắt email / không gửi được ${result.notSendable} (đánh dấu ${result.rowsMarkedWithoutSending} dòng);` +
      ` lỗi ${result.failed} (${seconds(ms)})`,
  );
}

function printReminders(result: SkillsReminderResult, ms: number): void {
  console.log(
    `Nhắc thêm kỹ năng: ${result.targets} ứng viên; tạo ${result.created} thông báo (kèm email),` +
      ` trùng ${result.duplicates}, lỗi ${result.failed} (${seconds(ms)})`,
  );
}

async function checkJob(jobPostId: string): Promise<boolean> {
  const job = await prisma.jobPost.findUnique({
    where: { id: jobPostId },
    select: { status: true, expiresAt: true, matchScoresAt: true },
  });
  if (!job) {
    console.error(`Không có tin ${jobPostId}.`);
    return false;
  }
  if (job.status !== "PUBLISHED" || (job.expiresAt && job.expiresAt <= new Date())) {
    console.error(`Tin ${jobPostId} không đang hiển thị (${job.status}) — không báo.`);
    return false;
  }
  if (!job.matchScoresAt) {
    console.log(`Tin ${jobPostId} chưa được chấm: chạy "npm run rescore-match-scores -- --job ${jobPostId}" trước.`);
  }
  return true;
}

async function main(): Promise<void> {
  const parts = [options.jobPostId && `báo tin ${options.jobPostId}`, options.digest && "email gộp", options.reminders && "nhắc kỹ năng"].filter(Boolean);
  console.log(`Phần: ${parts.join(", ")}${options.dryRun ? " — chỉ đếm, không ghi" : ""}`);
  const service = buildService();
  const now = new Date();

  if (options.jobPostId) {
    if (!(await checkJob(options.jobPostId))) {
      process.exitCode = 1;
      return;
    }
    if (options.dryRun) {
      const { eligible, alreadyAlerted } = await service.countTargetsForJob(options.jobPostId);
      console.log(`Báo tin: ${eligible} ứng viên đạt điều kiện, ${alreadyAlerted} đã được báo tin này ⇒ sẽ báo ${eligible - alreadyAlerted}`);
    } else {
      const startedAt = Date.now();
      const result = await service.onJobScored(options.jobPostId, now);
      console.log(
        `Báo tin: ghi ${result.alerted} ứng viên; thông báo mới ${result.created}, cập nhật thông báo trong ngày` +
          ` ${result.updated}, lỗi ${result.failed} (${seconds(Date.now() - startedAt)})`,
      );
    }
  }

  if (options.digest) {
    if (options.dryRun) {
      const preview = await service.previewDailyDigests(now);
      console.log(
        `Email gộp: ${preview.candidates} ứng viên có tin chưa gửi; sẽ xếp ${preview.wouldEmail} email` +
          ` (${preview.jobsInEmails} tin); không còn tin để gửi ${preview.nothingToSend};` +
          ` tắt email / không gửi được ${preview.notSendable} (sẽ đánh dấu ${preview.rowsMarkedWithoutSending} dòng)`,
      );
    } else {
      const startedAt = Date.now();
      printDigest(await service.sendDailyDigests(now), Date.now() - startedAt);
    }
  }

  if (options.reminders) {
    if (options.dryRun) {
      const targets = await service.findSkillsReminderTargets(now);
      console.log(`Nhắc thêm kỹ năng: sẽ tạo ${targets.length} thông báo (kèm email)`);
    } else {
      const startedAt = Date.now();
      printReminders(await service.sendSkillsReminders(now), Date.now() - startedAt);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
