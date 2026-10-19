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
    let lastError: unknown;
    for (const tier of this.tiers) {
      let started = false;
      try {
        for await (const text of tier.responder.stream(input, signal)) {
          if (!started) {
            started = true;
            this.logger.info("Support chat answered by LLM tier", { tier: tier.name });
          }
          yield text;
        }
        return;
      } catch (error) {
        if (started || error instanceof PartialStreamError || signal.aborted) throw error;
        lastError = error;
        this.logger.warn(`Support chat responder tier "${tier.name}" failed`, { error: describeError(error) });
      }
    }
    this.logger.error("All support chat responder tiers failed");
    throw lastError;
  }
}
