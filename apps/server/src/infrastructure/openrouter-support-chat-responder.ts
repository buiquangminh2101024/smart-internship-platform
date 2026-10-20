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

interface OpenRouterConfig {
  OPENROUTER_API_KEY?: string | undefined;
  OPENROUTER_MODEL: string;
}

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
// Model free chậm hơn Gemini (và có model "nghĩ" trước khi viết) — chờ mẩu đầu lâu hơn.
const FIRST_CHUNK_TIMEOUT_MS = 20_000;

export type OpenRouterStreamLine =
  | { kind: "text"; text: string }
  | { kind: "done" }
  | { kind: "error"; message: string }
  | null;

/**
 * Một dòng SSE của OpenRouter. null = bỏ qua: dòng trống, comment giữ kết nối
 * (": OPENROUTER PROCESSING"), mẩu không có chữ (vd. chỉ có `reasoning`), JSON hỏng.
 */
export function parseOpenRouterStreamLine(line: string): OpenRouterStreamLine {
  if (!line.startsWith("data:")) return null;
  const data = line.slice(5).trim();
  if (data === "[DONE]") return { kind: "done" };
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }
  const record = payload as {
    error?: { message?: unknown };
    choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>;
  };
  if (record.error) {
    return { kind: "error", message: typeof record.error.message === "string" ? record.error.message : "unknown error" };
  }
  const choice = record.choices?.[0];
  if (choice?.finish_reason === "error") return { kind: "error", message: "finish_reason=error" };
  const content = choice?.delta?.content;
  return typeof content === "string" && content !== "" ? { kind: "text", text: content } : null;
}

/**
 * Tầng dự phòng cuối, cùng khuôn OpenRouterProfileInsightGenerator (fetch thẳng, không
 * thêm SDK) nhưng `stream: true` và tự parse SSE. Chỉ dùng cho câu trả lời dựa trên FAQ —
 * không gửi dữ liệu cá nhân (kết quả tool GĐ2) qua tầng này (PLAN mục "Tầng OpenRouter").
 */
export class OpenRouterSupportChatResponder implements SupportChatResponder {
  private readonly openRouterConfig: OpenRouterConfig;
  private readonly logger: Logger;

  constructor({ config, logger }: { config: OpenRouterConfig; logger: Logger }) {
    this.openRouterConfig = config;
    this.logger = logger;
  }

  async *stream(input: SupportChatResponderInput, signal: AbortSignal): AsyncIterable<string> {
    if (!this.openRouterConfig.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const deadline = createStreamDeadline(signal, FIRST_CHUNK_TIMEOUT_MS);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let chunks = 0;
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.openRouterConfig.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...this.modelSelection(),
          stream: true,
          temperature: SUPPORT_CHAT_TEMPERATURE,
          max_tokens: SUPPORT_CHAT_MAX_OUTPUT_TOKENS,
          // Model free "suy nghĩ" trước (delta.reasoning) dùng hết max_tokens, không còn chữ nào
          // cho câu trả lời — tắt hẳn, như thinkingLevel MINIMAL ở adapter Gemini.
          reasoning: { enabled: false },
          messages: [
            { role: "system", content: buildSupportChatSystemPrompt(input) },
            // OpenRouter (chuẩn OpenAI) gọi vai trò trả lời là "assistant", Gemini gọi "model".
            ...buildSupportChatTurns(input).map((turn) => ({
              role: turn.role === "model" ? "assistant" : "user",
              content: turn.text,
            })),
          ],
        }),
        signal: deadline.signal,
      });
      // 429 (hết quota model free), 402, 5xx — chưa có chữ nên Fallback xử lý tiếp.
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`OpenRouter request failed with ${response.status}: ${detail.slice(0, 300)}`);
      }
      if (!response.body) throw new Error("OpenRouter response has no body");

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while (!finished && (newline = buffer.indexOf("\n")) >= 0) {
          const line = parseOpenRouterStreamLine(buffer.slice(0, newline).trim());
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          if (line.kind === "done") finished = true;
          else if (line.kind === "error") throw new Error(`OpenRouter stream error: ${line.message}`);
          else {
            deadline.markFirstChunk();
            chunks++;
            yield line.text;
          }
        }
      }
    } catch (error) {
      const cause = abortReasonOr(deadline, error);
      if (chunks > 0) throw new PartialStreamError(`OpenRouter stream interrupted: ${describeError(cause)}`, { cause });
      throw cause;
    } finally {
      deadline.dispose();
      // Người đọc dừng giữa chừng (vd. service bỏ ngang) thì đóng luôn kết nối tới OpenRouter.
      void reader?.cancel().catch(() => undefined);
    }
    if (chunks === 0) throw new Error("OpenRouter returned an empty response");
    this.logger.info("OpenRouter support chat completed", { chunks });
  }

  // Danh sách model phân tách bằng dấu phẩy → gửi `models`, OpenRouter tự thử lần lượt.
  private modelSelection(): { model: string; models?: string[] } {
    const models = this.openRouterConfig.OPENROUTER_MODEL.split(",")
      .map((model) => model.trim())
      .filter(Boolean);
    return models.length > 1 ? { model: models[0]!, models } : { model: models[0] ?? "" };
  }
}
