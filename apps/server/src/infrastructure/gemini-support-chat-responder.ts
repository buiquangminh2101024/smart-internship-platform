import type { Content, FunctionCall, Part } from "@google/genai";
import type { Logger } from "../shared/logger";
import {
  PartialStreamError,
  type SupportChatResponder,
  type SupportChatResponderInput,
  type SupportChatToolbox,
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
/** Có tool: tới mẩu chữ đầu có thể phải qua vài vòng gọi model + truy vấn DB. */
const FIRST_CHUNK_TIMEOUT_WITH_TOOLS_MS = 25_000;
/** D12 — tối đa 3 vòng gọi tool; vòng sau đó model buộc phải trả lời bằng chữ. */
const MAX_TOOL_ROUNDS = 3;
/** Một vòng model có thể đòi nhiều tool song song; chỉ có vài tool nên quá mức này là bất thường. */
const MAX_CALLS_PER_ROUND = 5;

/**
 * Cùng khuôn GeminiProfileInsightGenerator, khác ở chỗ stream (generateContentStream).
 * Một instance cho mỗi model — chuỗi tầng dựng trong support-chat.routes.ts.
 *
 * GĐ2: có `input.tools` ⇒ mỗi vòng vẫn gọi stream. Vòng model đòi tool thì chạy tool rồi gửi
 * kết quả lại; vòng trả lời bằng chữ thì chữ được stream ngay, không tốn thêm một lượt gọi.
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

    const { FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel } = await import("@google/genai");
    const client = new GoogleGenAI({ apiKey: this.geminiConfig.GEMINI_API_KEY });
    const { tools } = input;
    const deadline = createStreamDeadline(signal, tools ? FIRST_CHUNK_TIMEOUT_WITH_TOOLS_MS : FIRST_CHUNK_TIMEOUT_MS);
    const contents: Content[] = buildSupportChatTurns(input).map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }));
    const toolDeclarations = tools
      ? [
          {
            functionDeclarations: tools.declarations.map((declaration) => ({
              name: declaration.name,
              description: declaration.description,
              ...(declaration.parameters ? { parametersJsonSchema: declaration.parameters } : {}),
            })),
          },
        ]
      : undefined;
    let chunks = 0;
    let toolRounds = 0;
    try {
      for (;;) {
        const allowToolCalls = toolRounds < MAX_TOOL_ROUNDS;
        const response = await client.models.generateContentStream({
          model: this.model,
          contents,
          config: {
            systemInstruction: buildSupportChatSystemPrompt(input),
            temperature: SUPPORT_CHAT_TEMPERATURE,
            maxOutputTokens: SUPPORT_CHAT_MAX_OUTPUT_TOKENS,
            // Token "suy nghĩ" tính vào maxOutputTokens: mặc định gemini-3.6-flash nghĩ ~570 token
            // và câu trả lời bị cắt (MAX_TOKENS). Hỏi đáp theo tài liệu không cần suy luận dài.
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            ...(toolDeclarations
              ? {
                  tools: toolDeclarations,
                  // Hết số vòng ⇒ vẫn khai báo tool (lịch sử đã có lượt gọi tool) nhưng cấm gọi thêm.
                  toolConfig: {
                    functionCallingConfig: {
                      mode: allowToolCalls ? FunctionCallingConfigMode.AUTO : FunctionCallingConfigMode.NONE,
                    },
                  },
                }
              : {}),
            // Huỷ request khi người dùng đóng widget hoặc quá hạn — không tốn quota cho câu không ai đọc.
            abortSignal: deadline.signal,
          },
        });

        // Giữ nguyên mọi part của lượt model (kể cả thoughtSignature) để gửi lại ở vòng sau —
        // Gemini 3 từ chối lượt gọi tool thiếu chữ ký suy nghĩ.
        const modelParts: Part[] = [];
        const calls: FunctionCall[] = [];
        // Model có thể viết vài câu rồi mới gọi tool; chữ đó đã tới người dùng nên vòng sau viết tiếp
        // thành đoạn mới thay vì dính liền vào câu trước.
        let paragraphBreak = chunks > 0;
        for await (const chunk of response) {
          for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
            modelParts.push(part);
            if (part.functionCall) {
              calls.push(part.functionCall);
            } else if (part.text && !part.thought) {
              deadline.markFirstChunk();
              chunks++;
              yield paragraphBreak ? `\n\n${part.text.trimStart()}` : part.text;
              paragraphBreak = false;
            }
          }
        }

        if (calls.length === 0 || !tools || !allowToolCalls) break;
        contents.push({ role: "model", parts: modelParts });
        contents.push({ role: "user", parts: await runToolCalls(tools, calls) });
        toolRounds++;
      }
    } catch (error) {
      const cause = abortReasonOr(deadline, error);
      if (chunks > 0) throw new PartialStreamError(`Gemini stream interrupted: ${describeError(cause)}`, { cause });
      throw cause;
    } finally {
      deadline.dispose();
    }
    if (chunks === 0) throw new Error("Gemini returned an empty response");
    this.logger.info("Gemini support chat completed", { model: this.model, chunks, toolRounds });
  }
}

/** Mỗi lượt gọi phải có đúng một phản hồi cùng `id`, kể cả lượt bị từ chối vì quá số lượng. */
async function runToolCalls(tools: SupportChatToolbox, calls: FunctionCall[]): Promise<Part[]> {
  return Promise.all(
    calls.map(
      async (call, index): Promise<Part> => ({
        functionResponse: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name ?? "",
          response:
            index < MAX_CALLS_PER_ROUND
              ? await tools.execute(call.name ?? "", call.args ?? {})
              : { error: "Quá nhiều lượt tra cứu trong một lần." },
        },
      }),
    ),
  );
}
