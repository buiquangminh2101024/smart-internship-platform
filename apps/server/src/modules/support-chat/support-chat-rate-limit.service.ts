import { AppError } from "../../shared/errors/AppError";
import type { RateLimiter } from "../../shared/ports/RateLimiter";
import {
  RATE_LIMIT_GUEST_PER_WINDOW,
  RATE_LIMIT_USER_PER_WINDOW,
  RATE_LIMIT_WINDOW_SECONDS,
} from "./support-chat.config";

const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;

export type SupportChatRequester = { kind: "user"; userId: string } | { kind: "guest"; ip: string };

/**
 * PLAN mục "Rate-limit và hạn mức": port RateLimiter (Redis) — chỉ là key đếm có TTL, không
 * phải lưu lịch sử nên không mâu thuẫn D2.
 */
export class SupportChatRateLimitService {
  private readonly rateLimiter: RateLimiter;
  private readonly dailyLlmLimit: number;

  constructor({
    rateLimiter,
    config,
  }: {
    rateLimiter: RateLimiter;
    config: { SUPPORT_CHAT_DAILY_LLM_LIMIT_GLOBAL: number };
  }) {
    this.rateLimiter = rateLimiter;
    this.dailyLlmLimit = config.SUPPORT_CHAT_DAILY_LLM_LIMIT_GLOBAL;
  }

  /** Mọi tin, kể cả tin được trả lời ở bậc 0–3. Vượt ⇒ 429 trước khi mở stream. */
  async assertWithinMessageLimit(requester: SupportChatRequester): Promise<void> {
    const allowed =
      requester.kind === "user"
        ? await this.rateLimiter.consume(
            `support-chat:user:${requester.userId}`,
            RATE_LIMIT_USER_PER_WINDOW,
            RATE_LIMIT_WINDOW_SECONDS,
          )
        : await this.rateLimiter.consume(`support-chat:ip:${requester.ip}`, RATE_LIMIT_GUEST_PER_WINDOW, RATE_LIMIT_WINDOW_SECONDS);
    if (!allowed) {
      throw new AppError(429, "Bạn gửi tin hơi nhanh. Vui lòng chờ vài phút rồi hỏi tiếp nhé.", "SUPPORT_CHAT_RATE_LIMITED");
    }
  }

  /**
   * Chiếm một lượt bậc 4 trong hạn mức chung của ngày (mọi tầng LLM cộng chung). false ⇒
   * hết hạn mức, bậc 4 trả câu mẫu "tạm không khả dụng".
   */
  async tryConsumeDailyLlmCall(): Promise<boolean> {
    // Khoá theo ngày UTC như các hạn mức LLM khác: reset lúc 7h sáng giờ Việt Nam.
    const day = new Date().toISOString().slice(0, 10);
    return this.rateLimiter.consume(`support-chat-llm:global:day:${day}`, this.dailyLlmLimit, DAY_TTL_SECONDS);
  }
}
