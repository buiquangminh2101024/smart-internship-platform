import { setTimeout as sleep } from "node:timers/promises";
import {
  PartialStreamError,
  type SupportChatResponder,
  type SupportChatResponderInput,
} from "../shared/ports/SupportChatResponder";

// Mã đặt trong câu hỏi để thử đường lỗi mà không cần làm hỏng Gemini thật. Adapter giả
// bị cấm ở production (env.ts), nên các mã này không có tác dụng ngoài dev/test tải.
const FAIL_BEFORE_FIRST_CHUNK = "#fake-fail-before";
const FAIL_AFTER_FIRST_CHUNK = "#fake-fail-after";
/** `#fake-tool:getMyApplications {"status":"PENDING"}` ⇒ gọi tool đó (tham số JSON tuỳ chọn) rồi stream kết quả. */
const CALL_TOOL = /#fake-tool:(\w+)(?:\s+(\{.*\}))?/;

/**
 * Adapter giả cho test tải (D9, `SUPPORT_CHAT_LLM_PROVIDER=fake`): stream một câu cố định
 * từng từ, cách nhau `SUPPORT_CHAT_FAKE_DELAY_MS` — không gọi mạng, không tốn quota.
 */
export class FakeSupportChatResponder implements SupportChatResponder {
  private readonly delayMs: number;

  constructor({ config }: { config: { SUPPORT_CHAT_FAKE_DELAY_MS: number } }) {
    this.delayMs = config.SUPPORT_CHAT_FAKE_DELAY_MS;
  }

  async *stream(input: SupportChatResponderInput, signal: AbortSignal): AsyncIterable<string> {
    if (input.question.includes(FAIL_BEFORE_FIRST_CHUNK)) throw new Error("Fake responder failed before first chunk");

    const titles = input.contextChunks.map((chunk) => chunk.title).join("; ") || "(không có)";
    const toolCall = input.tools ? CALL_TOOL.exec(input.question) : null;
    const toolResult = toolCall && input.tools ? await input.tools.execute(toolCall[1] ?? "", parseArgs(toolCall[2])) : null;
    const words = (
      toolResult
        ? `Kết quả tool ${toolCall?.[1]}: ${JSON.stringify(toolResult)}`
        : `Đây là câu trả lời giả để kiểm thử. Mục FAQ liên quan: ${titles}.`
    ).split(" ");
    for (const [index, word] of words.entries()) {
      await sleep(this.delayMs, undefined, { signal });
      if (index === 2 && input.question.includes(FAIL_AFTER_FIRST_CHUNK)) {
        throw new PartialStreamError("Fake responder failed after first chunk");
      }
      yield index === 0 ? word : ` ${word}`;
    }
  }
}

function parseArgs(json: string | undefined): unknown {
  try {
    return json ? JSON.parse(json) : {};
  } catch {
    return json;
  }
}
