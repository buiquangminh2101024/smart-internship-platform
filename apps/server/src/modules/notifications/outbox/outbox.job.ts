import cron from "node-cron";
import type { OutboxEvent } from "@prisma/client";
import type { Logger } from "../../../shared/logger";
import type { EmailSender } from "../../../shared/ports/EmailSender";
import { OUTBOX_EVENT_NOTIFICATION_EMAIL, type NotificationEmailPayload } from "../notification.types";
import type { OutboxRepository } from "./outbox.repository";

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;
// Giãn dần theo số lần đã thử: lần 1 lỗi → thử lại sau 1 phút, ... lần 4 → 30 phút.
const BACKOFF_MINUTES = [1, 5, 15, 30];
const MINUTE_MS = 60 * 1000;

function isNotificationEmailPayload(payload: unknown): payload is NotificationEmailPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const value = payload as Record<string, unknown>;
  return typeof value.to === "string" && typeof value.subject === "string" && typeof value.html === "string";
}

function nextAvailableAt(attempts: number): Date {
  const minutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 1;
  return new Date(Date.now() + minutes * MINUTE_MS);
}

async function processEvent(
  event: OutboxEvent,
  outboxRepository: OutboxRepository,
  emailSender: EmailSender,
  logger: Logger,
): Promise<"sent" | "retried" | "failed"> {
  const attempts = event.attempts + 1;

  if (event.eventType !== OUTBOX_EVENT_NOTIFICATION_EMAIL || !isNotificationEmailPayload(event.payload)) {
    // Payload hỏng thì retry bao nhiêu lần cũng hỏng — cho FAILED ngay.
    await outboxRepository.markFailed(event.id, attempts, `Unsupported or malformed payload for ${event.eventType}`);
    logger.error("Outbox event có payload không hợp lệ", { outboxEventId: event.id, eventType: event.eventType });
    return "failed";
  }

  try {
    await emailSender.send({ to: event.payload.to, subject: event.payload.subject, html: event.payload.html });
    await outboxRepository.markCompleted(event.id);
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (attempts >= MAX_ATTEMPTS) {
      await outboxRepository.markFailed(event.id, attempts, message);
      logger.error("Outbox event thất bại vĩnh viễn sau khi hết lượt thử", {
        outboxEventId: event.id,
        attempts,
        error: message,
      });
      return "failed";
    }
    await outboxRepository.markRetry(event.id, attempts, nextAvailableAt(attempts), message);
    logger.warn("Gửi email từ outbox thất bại, sẽ thử lại", { outboxEventId: event.id, attempts, error: message });
    return "retried";
  }
}

/**
 * Worker của Transactional Outbox (AD-8): đọc các event PENDING đã tới hạn rồi
 * mới gọi Resend. Xử lý tuần tự từng event — quy mô đồ án không cần song song,
 * và giữ tuần tự thì rate limit của Resend cũng dễ đoán hơn.
 */
export async function runOutboxSweep(
  outboxRepository: OutboxRepository,
  emailSender: EmailSender,
  logger: Logger,
): Promise<{ sent: number; retried: number; failed: number }> {
  const events = await outboxRepository.claimPendingBatch(BATCH_SIZE);
  const result = { sent: 0, retried: 0, failed: 0 };

  for (const event of events) {
    const outcome = await processEvent(event, outboxRepository, emailSender, logger);
    result[outcome] += 1;
  }

  if (events.length > 0) {
    logger.info(`Outbox sweep: ${result.sent} đã gửi, ${result.retried} sẽ thử lại, ${result.failed} thất bại`);
  }
  return result;
}

export function startOutboxJob(outboxRepository: OutboxRepository, emailSender: EmailSender, logger: Logger): void {
  cron.schedule("* * * * *", () => {
    void runOutboxSweep(outboxRepository, emailSender, logger).catch((error: unknown) => {
      logger.error("Outbox sweep failed", { error });
    });
  });
}
