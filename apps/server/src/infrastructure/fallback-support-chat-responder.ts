import type { Logger } from "../shared/logger";
import {
  PartialStreamError,
  type SupportChatResponder,
  type SupportChatResponderInput,
} from "../shared/ports/SupportChatResponder";
import { describeError } from "./support-chat-prompt";

export interface SupportChatResponderTier {
  // Chỉ để log — biết tỷ lệ rơi xuống tầng dự phòng ("gemini-primary" | "gemini-secondary" | "openrouter").
  name: string;
  responder: SupportChatResponder;
  /**
   * GĐ2 — chỉ 2 tầng Gemini gọi tool. Tầng còn lại (OpenRouter) không nhận tool, và bị bỏ qua
   * nếu câu hỏi cần dữ liệu của người hỏi: không gửi dữ liệu cá nhân qua model free (PLAN
   * mục "Tầng OpenRouter"), cũng không trả lời chung chung cho câu hỏi về dữ liệu.
   */
  supportsTools: boolean;
}

/**
 * Cùng khuôn FallbackProfileInsightGenerator, nhưng CHỈ chuyển tầng khi tầng trước lỗi
 * trước mẩu chữ đầu tiên — người dùng đã thấy chữ thì không ghép câu trả lời của model
 * khác vào được. Người dùng huỷ thì dừng luôn, không thử tầng sau.
 */
export class FallbackSupportChatResponder implements SupportChatResponder {
  private readonly tiers: SupportChatResponderTier[];
  private readonly logger: Logger;

  constructor({ tiers, logger }: { tiers: SupportChatResponderTier[]; logger: Logger }) {
    if (tiers.length === 0) throw new Error("FallbackSupportChatResponder needs at least one tier");
    this.tiers = tiers;
    this.logger = logger;
  }

  async *stream(input: SupportChatResponderInput, signal: AbortSignal): AsyncIterable<string> {
    let lastError: unknown = new Error("No support chat responder tier can answer without tools");
    for (const tier of this.tiers) {
      if (input.tools?.required && !tier.supportsTools) continue;
      const tierInput = tier.supportsTools ? input : { ...input, tools: undefined };
      let started = false;
      try {
        for await (const text of tier.responder.stream(tierInput, signal)) {
          if (!started) {
            started = true;
            this.logger.info("Support chat answered by LLM tier", { tier: tier.name });
          }
          yield text;
        }
        return;
      } catch (error) {
        // Tầng Gemini đã chạy tool rồi lỗi trước mẩu chữ đầu ⇒ tầng sau làm lại từ đầu; kết quả
        // tool của tầng trước chỉ nằm trong adapter đó, không chuyển sang tầng khác.
        if (started || error instanceof PartialStreamError || signal.aborted) throw error;
        lastError = error;
        this.logger.warn(`Support chat responder tier "${tier.name}" failed`, { error: describeError(error) });
      }
    }
    this.logger.error("All support chat responder tiers failed");
    throw lastError;
  }
}
