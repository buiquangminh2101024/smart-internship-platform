// Ranh giới LLM của chatbot hỗ trợ (AD-21, docs/06-backend/support-chatbot/PLAN.md mục
// "Gọi LLM"). Service chỉ biết interface này; Gemini/OpenRouter/giả là adapter.

export interface SupportChatContextChunk {
  faqId: string;
  title: string;
  content: string;
}

export interface SupportChatResponderInput {
  /** Người hỏi — Admin được xử lý như khách. */
  viewer: "guest" | "candidate" | "employer";
  question: string;
  /** Đã qua zod (D3) — vẫn là dữ liệu client gửi, không tin cậy. */
  history: Array<{ role: "user" | "model"; text: string }>;
  /** Top-RAG_TOP_K mục FAQ — LLM chỉ được trả lời dựa trên phần này. */
  contextChunks: SupportChatContextChunk[];
  // GĐ2: tools?: SupportChatTool[]; toolExecutor?: (...) => Promise<unknown>
}

export interface SupportChatResponder {
  /**
   * Trả từng mẩu chữ. Ném lỗi TRƯỚC mẩu đầu tiên ⇒ lớp Fallback được chuyển tầng.
   * Lỗi SAU khi đã có chữ ⇒ ném `PartialStreamError` để service gửi sự kiện `error`.
   */
  stream(input: SupportChatResponderInput, signal: AbortSignal): AsyncIterable<string>;
}

/** Stream đứt sau khi người dùng đã nhận chữ — không chuyển tầng được nữa. */
export class PartialStreamError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PartialStreamError";
  }
}
