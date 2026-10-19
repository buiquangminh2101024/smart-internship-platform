import { setTimeout as sleep } from "node:timers/promises";
import {
  PartialStreamError,
  type SupportChatResponder,
  type SupportChatResponderInput,
} from "../shared/ports/SupportChatResponder";

// Mã đặt trong câu hỏi để thử đường lỗi mà không cần làm hỏng Gemini thật. Adapter giả
// bị cấm ở production (env.ts), nên hai mã này không có tác dụng ngoài dev/test tải.
const FAIL_BEFORE_FIRST_CHUNK = "#fake-fail-before";
const FAIL_AFTER_FIRST_CHUNK = "#fake-fail-after";

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
    const words = `Đây là câu trả lời giả để kiểm thử. Mục FAQ liên quan: ${titles}.`.split(" ");
    for (const [index, word] of words.entries()) {
      await sleep(this.delayMs, undefined, { signal });
      if (index === 2 && input.question.includes(FAIL_AFTER_FIRST_CHUNK)) {
        throw new PartialStreamError("Fake responder failed after first chunk");
      }
      yield index === 0 ? word : ` ${word}`;
    }
  }
}
