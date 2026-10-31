import { stripVietnameseMarks } from "../applications/applications.repository";

// Bậc 1 của pipeline (PLAN mục "Pipeline xử lý một câu hỏi"): tin chỉ gồm câu xã giao thì
// trả câu mẫu, không embed, không gọi LLM. Chỉ khớp khi CẢ tin là xã giao — "chào bạn, cho
// mình hỏi cách đăng tin" vẫn đi tiếp xuống bậc 2.

type SmallTalkIntent = "bye" | "thanks" | "greeting" | "ack";

// So trên bản bỏ dấu, chữ thường: người dùng gõ "cam on" hay "cảm ơn" đều khớp.
const INTENT_PHRASES: Record<SmallTalkIntent, string[]> = {
  bye: ["tam biet", "bye", "bye bye", "goodbye", "hen gap lai"],
  thanks: ["cam on", "cmon", "thanks", "thank you", "thank", "tks", "thx"],
  greeting: ["xin chao", "chao", "hello", "helo", "hi", "hey", "alo", "good morning"],
  ack: ["ok", "oke", "okay", "okie", "vang", "da", "u", "uh", "uhm", "duoc roi", "hieu roi", "da hieu", "ro roi", "tot qua"],
};

/** Từ đệm đi kèm câu xã giao, tự nó không phải xã giao ("bạn ơi" một mình vẫn xuống bậc 2). */
const FILLER_PHRASES = ["ban", "ban oi", "nhe", "nha", "a", "nhieu", "rat nhieu", "nhe ban", "bot", "tro ly", "ad", "admin", "minh", "oi", "nhi", "nhe a"];

const REPLIES: Record<SmallTalkIntent, string> = {
  greeting:
    "Chào bạn! Mình là trợ lý hỗ trợ của InternHub. Bạn cần hỏi gì về tài khoản, tìm việc, ứng tuyển hay đăng tin tuyển dụng?",
  thanks: "Không có gì! Bạn cần hỏi thêm gì cứ nhắn mình nhé.",
  ack: "Bạn cần hỏi thêm gì cứ nhắn mình nhé.",
  bye: "Tạm biệt bạn! Khi cần hỗ trợ, bạn cứ mở lại khung chat này nhé.",
};

// Ưu tiên khi một tin có nhiều ý ("ok cảm ơn" ⇒ cảm ơn).
const PRIORITY: SmallTalkIntent[] = ["bye", "thanks", "greeting", "ack"];

const PHRASES = [
  ...Object.entries(INTENT_PHRASES).flatMap(([intent, phrases]) =>
    phrases.map((phrase) => ({ words: phrase.split(" "), intent: intent as SmallTalkIntent })),
  ),
  ...FILLER_PHRASES.map((phrase) => ({ words: phrase.split(" "), intent: null })),
].sort((a, b) => b.words.length - a.words.length);

/** Câu trả lời mẫu nếu cả tin chỉ là xã giao, ngược lại null. */
export function smallTalkReplyOf(message: string): string | null {
  const words = stripVietnameseMarks(message.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 8) return null;

  const intents = new Set<SmallTalkIntent>();
  let index = 0;
  while (index < words.length) {
    // Cụm dài trước: "bye bye" trước "bye", "da hieu" trước "da".
    const match = PHRASES.find((phrase) => phrase.words.every((word, offset) => words[index + offset] === word));
    if (!match) return null;
    if (match.intent) intents.add(match.intent);
    index += match.words.length;
  }
  const intent = PRIORITY.find((candidate) => intents.has(candidate));
  return intent ? REPLIES[intent] : null;
}
