import { PrismaClient } from "@prisma/client";
import { ApplicationsRepository } from "../src/modules/applications/applications.repository";
import { ApplicationsService } from "../src/modules/applications/applications.service";
import { AUTOMATION_MAX_PER_RUN } from "../src/modules/application-automation/application-automation.config";
import { closeDecision, weeklyReminderDedupeKey } from "../src/modules/application-automation/application-automation.policy";
import { ApplicationAutomationRepository, type AutomationScope } from "../src/modules/application-automation/application-automation.repository";
import {
  ApplicationAutomationService,
  type AutoCloseResult,
  type AutomationPartResult,
  type WeeklyReminderResult,
} from "../src/modules/application-automation/application-automation.service";
import { EmployerIdentityCache } from "../src/modules/employers/employer-identity-cache";
import { EmployerRepository } from "../src/modules/employers/employer.repository";
import { InterviewsRepository } from "../src/modules/interviews/interviews.repository";
import { NotificationsRepository } from "../src/modules/notifications/notifications.repository";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { OutboxRepository } from "../src/modules/notifications/outbox/outbox.repository";
import { config } from "../src/shared/config/env";
import { logger } from "../src/shared/logger";
import type { RealtimeNotifier } from "../src/shared/ports/RealtimeNotifier";

// Chạy tay tự xử lý hồ sơ (0.4, AD-25) — docs/06-backend/application-automation/PLAN.md bước 7.
// Gọi cùng hàm với cron 8h30 (tự chuyển, tự đóng) và cron thứ Hai 8h (nhắc tuần). Dùng để chạy
// lần đầu có kiểm soát và để demo "chạy ngay".
//
//   npm run process-applications --workspace=apps/server -- [--dry-run] [--review] [--close] [--remind] [--company <id>]
//
// - Không có `--review` / `--close` / `--remind`: chạy cả ba phần.
// - `--dry-run`: chỉ đếm số hồ sơ sẽ chuyển, sẽ đóng theo nhóm và số thông báo nhắc sẽ tạo; không ghi.
//   Số đếm không bị giới hạn mỗi lượt; lượt thật xử lý tối đa AUTOMATION_MAX_PER_RUN hồ sơ mỗi loại.
// - `--company <id>`: chỉ xét hồ sơ ở tin của công ty đó.
//
// Lượt thật GHI lên DB: đổi trạng thái hồ sơ, tạo thông báo và dòng outbox email (job outbox của
// server gửi email). Script chạy trong process riêng: khoá chống chạy chồng của service chỉ có tác
// dụng trong một process; chạy cùng lúc với cron của server thì câu UPDATE có điều kiện chặn đổi
// trùng, `dedupeKey` chặn nhắc trùng. Thông báo tạo từ đây không đẩy realtime (người nhận thấy khi
// tải lại). Chỉ in số đếm và id, không in tên hay email.

const KNOWN_FLAGS = new Set(["--dry-run", "--review", "--close", "--remind", "--company"]);
/** Giới hạn của câu đếm ở `--dry-run` — đủ lớn để đếm hết dữ liệu hiện có. */
const DRY_RUN_LIMIT = 1_000_000;

function parseArgs() {
  const args = process.argv.slice(2);
  let companyId: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    const [name, inline] = arg.split("=", 2) as [string, string | undefined];
    if (!KNOWN_FLAGS.has(name)) {
      console.error(`Không hiểu tham số "${arg}". Dùng: --dry-run --review --close --remind --company <id>`);
      process.exit(1);
    }
    if (name === "--company") {
      const value = inline ?? args[i + 1];
      if (!value || value.startsWith("--")) {
        console.error("--company cần một id.");
        process.exit(1);
      }
      companyId = value;
      if (inline === undefined) i += 1;
    }
  }
  const pick = { review: args.includes("--review"), close: args.includes("--close"), remind: args.includes("--remind") };
  const all = !pick.review && !pick.close && !pick.remind;
  return {
    dryRun: args.includes("--dry-run"),
    companyId,
    review: all || pick.review,
    close: all || pick.close,
    remind: all || pick.remind,
  };
}

const options = parseArgs();
const scope: Pick<AutomationScope, "companyId"> = options.companyId ? { companyId: options.companyId } : {};

const prisma = new PrismaClient();
const automationRepository = new ApplicationAutomationRepository({ prisma });
const employerRepository = new EmployerRepository({ prisma });
const notificationsRepository = new NotificationsRepository({ prisma });

/** Script không có Socket.IO: thông báo vẫn lưu DB và outbox, chỉ bỏ bước đẩy realtime. */
const silentRealtimeNotifier: RealtimeNotifier = {
  pushToUser() {},
  pushMessageToUser() {},
  notifyConversationUnavailable() {},
  disconnectUser() {},
};

function buildService(): ApplicationAutomationService {
  const employerIdentityCache = new EmployerIdentityCache({ employerRepository, logger });
  const notificationsService = new NotificationsService({
    prisma,
    notificationsRepository,
    outboxRepository: new OutboxRepository({ prisma }),
    realtimeNotifier: silentRealtimeNotifier,
    logger,
    config,
  });
  const applicationsService = new ApplicationsService({
    prisma,
    applicationsRepository: new ApplicationsRepository({ prisma }),
    employerRepository,
    employerIdentityCache,
    notificationsService,
    interviewsRepository: new InterviewsRepository({ prisma }),
    // Script không tạo hồ sơ mới nên không có lối 2 của bước 4b.
    autoReviewTrigger: () => {},
  });
  return new ApplicationAutomationService({
    applicationAutomationRepository: automationRepository,
    applicationsService,
    employerRepository,
    employerIdentityCache,
    notificationsService,
    logger,
  });
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} giây`;

// ─── --dry-run ──────────────────────────────────────────────────────────────

async function dryRunReview(): Promise<void> {
  const targets = await automationRepository.findAutoReviewTargets(scope, DRY_RUN_LIMIT);
  const jobs = new Set(targets.map((t) => t.jobPostId)).size;
  console.log(`Tự chuyển "Đang xem xét": ${targets.length} hồ sơ ở ${jobs} tin${capNote(targets.length)}`);
}

async function dryRunClose(now: Date): Promise<void> {
  const rows = await automationRepository.findCloseTargets(scope, DRY_RUN_LIMIT);
  const byGroup = { G1: 0, G2: 0, G4: 0 };
  let notDue = 0;
  for (const row of rows) {
    const decision = closeDecision(row);
    if (!decision?.dueAt || decision.dueAt > now || decision.group === "G3") notDue += 1;
    else byGroup[decision.group] += 1;
  }
  const due = byGroup.G1 + byGroup.G2 + byGroup.G4;
  console.log(
    `Tự đóng "Tin đã đóng": ${due} hồ sơ (G1 Chờ duyệt ${byGroup.G1}, G2 chưa phỏng vấn ${byGroup.G2},` +
      ` G4 đã phỏng vấn ${byGroup.G4})${capNote(due)}`,
  );
  if (notDue > 0) console.log(`  ${notDue} hồ sơ SQL chọn nhưng chưa tới hạn theo closeDecision (để lượt sau)`);
}

async function dryRunRemind(now: Date): Promise<void> {
  const rows = await automationRepository.backlogByCompany(scope);
  let willCreate = 0;
  let alreadySent = 0;
  for (const row of rows) {
    for (const { userId } of await employerRepository.findManyByCompanyId(row.companyId)) {
      if (await notificationsRepository.existsByDedupeKey(weeklyReminderDedupeKey(row.companyId, userId, now))) alreadySent += 1;
      else willCreate += 1;
    }
  }
  console.log(
    `Nhắc tuần: ${rows.length} công ty có hồ sơ tồn, sẽ tạo ${willCreate} thông báo (kèm email),` +
      ` ${alreadySent} người đã được nhắc trong tuần này`,
  );
}

function capNote(count: number): string {
  return count > AUTOMATION_MAX_PER_RUN ? ` — lượt thật xử lý ${AUTOMATION_MAX_PER_RUN}, còn lại để lượt sau` : "";
}

// ─── Lượt thật ──────────────────────────────────────────────────────────────

function printPart(label: string, part: AutomationPartResult): void {
  console.log(
    `${label}: đã đổi ${part.changed} / chọn ${part.selected} (trạng thái vừa bị đổi ${part.raced}, lỗi ${part.failed})` +
      (part.limited ? ` — chạm giới hạn ${AUTOMATION_MAX_PER_RUN}, có thể còn hồ sơ cho lượt sau` : ""),
  );
}

function printClose(close: AutoCloseResult): void {
  printPart(`Tự đóng "Tin đã đóng"`, close);
  const { G1, G2, G4 } = close.closedByGroup;
  console.log(`  theo nhóm: G1 ${G1}, G2 ${G2}, G4 ${G4}; chưa tới hạn ${close.notDue}`);
}

function printRemind(result: WeeklyReminderResult): void {
  if (result.status === "LOCKED") {
    console.log("Nhắc tuần: đang có lượt khác trong process này — bỏ qua.");
    return;
  }
  console.log(
    `Nhắc tuần: ${result.companies} công ty, tạo ${result.created} thông báo, trùng tuần này ${result.duplicates},` +
      ` lỗi ${result.failed} (${seconds(result.durationMs)})`,
  );
}

async function main(): Promise<void> {
  if (options.companyId && !(await prisma.company.findUnique({ where: { id: options.companyId }, select: { id: true } }))) {
    console.error(`Không có công ty ${options.companyId}.`);
    process.exitCode = 1;
    return;
  }
  const parts = [options.review && "tự chuyển", options.close && "tự đóng", options.remind && "nhắc tuần"].filter(Boolean);
  console.log(
    `Phạm vi: ${options.companyId ? `công ty ${options.companyId}` : "toàn hệ thống"}; phần: ${parts.join(", ")}` +
      (options.dryRun ? " — chỉ đếm, không ghi" : ""),
  );

  const now = new Date();
  if (options.dryRun) {
    if (options.review) await dryRunReview();
    if (options.close) await dryRunClose(now);
    if (options.remind) await dryRunRemind(now);
    return;
  }

  const service = buildService();
  if (options.review && options.close) {
    // Cùng hàm với cron 8h30.
    const result = await service.runDaily(scope);
    if (result.status === "LOCKED") console.log("Tự chuyển / tự đóng: đang có lượt khác trong process này — bỏ qua.");
    else {
      printPart(`Tự chuyển "Đang xem xét"`, result.review);
      printClose(result.close);
      console.log(`  thời gian: ${seconds(result.durationMs)}`);
    }
  } else if (options.review) {
    printPart(`Tự chuyển "Đang xem xét"`, await service.autoReview(scope));
  } else if (options.close) {
    printClose(await service.autoClose(scope));
  }
  if (options.remind) printRemind(await service.runWeeklyReminder(scope, now));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
