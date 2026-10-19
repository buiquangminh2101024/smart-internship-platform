import type { Logger } from "../shared/logger";
import {
  PartialStreamError,
  type SupportChatResponder,
  type SupportChatResponderInput,
} from "../shared/ports/SupportChatResponder";
import {
  abortReasonOr,
  buildSupportChatSystemPrompt,
  buildSupportChatTurns,
  createStreamDeadline,
  describeError,
  SUPPORT_CHAT_MAX_OUTPUT_TOKENS,
  SUPPORT_CHAT_TEMPERATURE,
} from "./support-chat-prompt";

interface GeminiConfig {
  GEMINI_API_KEY?: string | undefined;
}

const FIRST_CHUNK_TIMEOUT_MS = 15_000;

/**
 * Cùng khuôn GeminiProfileInsightGenerator, khác ở chỗ stream (generateContentStream).
 * Một instance cho mỗi model — chuỗi tầng dựng trong support-chat.routes.ts.
 */
export class GeminiSupportChatResponder implements SupportChatResponder {
  private readonly geminiConfig: GeminiConfig;
  private readonly logger: Logger;
  private readonly model: string;

  constructor({ config, logger }: { config: GeminiConfig; logger: Logger }, model: string) {
    this.geminiConfig = config;
    this.logger = logger;
    this.model = model;
  }

  async *stream(input: SupportChatResponderInput, signal: AbortSignal): AsyncIterable<string> {
    if (!this.geminiConfig.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const { GoogleGenAI, ThinkingLevel } = await import("@google/genai");
    const client = new GoogleGenAI({ apiKey: this.geminiConfig.GEMINI_API_KEY });
    const deadline = createStreamDeadline(signal, FIRST_CHUNK_TIMEOUT_MS);
    let chunks = 0;
    try {
      const response = await client.models.generateContentStream({
        model: this.model,
        contents: buildSupportChatTurns(input).map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
        config: {
          systemInstruction: buildSupportChatSystemPrompt(input),
          temperature: SUPPORT_CHAT_TEMPERATURE,
          maxOutputTokens: SUPPORT_CHAT_MAX_OUTPUT_TOKENS,
          // Token "suy nghĩ" tính vào maxOutputTokens: mặc định gemini-3.6-flash nghĩ ~570 token
          // và câu trả lời bị cắt (MAX_TOKENS). Hỏi đáp theo tài liệu không cần suy luận dài.
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          // Huỷ request khi người dùng đóng widget hoặc quá hạn — không tốn quota cho câu không ai đọc.
          abortSignal: deadline.signal,
        },
      });
      for await (const chunk of response) {
        const text = chunk.text;
        if (!text) continue;
        deadline.markFirstChunk();
        chunks++;
        yield text;
      }
    } catch (error) {
      const cause = abortReasonOr(deadline, error);
      if (chunks > 0) throw new PartialStreamError(`Gemini stream interrupted: ${describeError(cause)}`, { cause });
      throw cause;
    } finally {
      deadline.dispose();
    }
    if (chunks === 0) throw new Error("Gemini returned an empty response");
    this.logger.info("Gemini support chat completed", { model: this.model, chunks });
  }
}
