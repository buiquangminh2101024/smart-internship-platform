import { stripVietnameseMarks } from "../applications/applications.repository";

// Hàm thuần — nhận ra câu hỏi về dữ liệu của chính người hỏi (GĐ2, PLAN mục "Định tuyến câu
// hỏi về dữ liệu cá nhân"). So trên bản bỏ dấu nên câu gõ không dấu cũng nhận ra được.

/** Người hỏi tự nhắc tới mình. */
const FIRST_PERSON = /\b(?:toi|minh|em)\b/;
/**
 * Hỏi cách làm, ý nghĩa, khả năng, ý định ⇒ câu hướng dẫn, FAQ trả lời được ("Xem đơn của
 * tôi ở đâu?", "Tôi có thể huỷ đơn không?", "Tôi muốn sửa hồ sơ").
 */
const HOW_TO = /\b(?:o dau|lam sao|lam the nao|the nao de|bang cach nao|cach|huong dan|nghia la gi|co the|muon|nen)\b/;

/**
 * Có ngôi thứ nhất + chủ đề dữ liệu của vai trò (`topics`, viết không dấu) và không phải câu
 * hướng dẫn. Đúng ⇒ bỏ qua trả thẳng FAQ, chặn ngoài phạm vi và cache, đi thẳng tới LLM có tool.
 * Nhận nhầm chỉ tốn một lượt LLM (model vẫn có đoạn FAQ để trả lời câu hướng dẫn).
 */
export function asksAboutOwnData(message: string, topics: RegExp): boolean {
  const text = stripVietnameseMarks(message.toLowerCase()).replace(/\s+/g, " ");
  return FIRST_PERSON.test(text) && topics.test(text) && !HOW_TO.test(text);
}
