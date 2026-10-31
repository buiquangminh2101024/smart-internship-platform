import type { SupportChatSourceRef } from "@sip/shared-types";
import type { FaqViewer } from "./faq-knowledge-base";
import { ANSWER_CACHE_MAX_ENTRIES, ANSWER_CACHE_TTL_MS } from "./support-chat.config";

export interface CachedAnswer {
  text: string;
  sources: SupportChatSourceRef[];
  suggestSupport: boolean;
}

interface Entry extends CachedAnswer {
  expiresAt: number;
}

/**
 * Bậc 3 (D8): cache câu trả lời LLM trong bộ nhớ process, LRU — cùng lập luận AD-19, không
 * dùng Redis. Chỉ cache câu hỏi độc lập (chưa có lịch sử). Key gồm phiên bản FAQ (sửa FAQ là
 * cache cũ tự hết hiệu lực) và người hỏi (mỗi vai trò thấy một tập mục FAQ khác nhau).
 * Map giữ thứ tự chèn: đọc trúng thì chèn lại ở cuối, đầy thì bỏ phần tử đầu (cũ nhất).
 */
export class SupportChatAnswerCache {
  private readonly entries = new Map<string, Entry>();

  get(faqVersion: string, viewer: FaqViewer, question: string): CachedAnswer | null {
    const key = cacheKey(faqVersion, viewer, question);
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    if (entry.expiresAt <= Date.now()) return null;
    this.entries.set(key, entry);
    return { text: entry.text, sources: entry.sources, suggestSupport: entry.suggestSupport };
  }

  set(faqVersion: string, viewer: FaqViewer, question: string, answer: CachedAnswer): void {
    const key = cacheKey(faqVersion, viewer, question);
    this.entries.delete(key);
    this.entries.set(key, { ...answer, expiresAt: Date.now() + ANSWER_CACHE_TTL_MS });
    while (this.entries.size > ANSWER_CACHE_MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}

/**
 * Chuẩn hoá nhẹ: chữ thường, gộp khoảng trắng, bỏ dấu câu ở cuối. Giữ dấu tiếng Việt — câu
 * có dấu và không dấu đi hai đường khác nhau ở bậc 2 và 4.
 */
export function normalizeQuestion(question: string): string {
  return question
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s?!.,;:…]+$/u, "")
    .trim();
}

function cacheKey(faqVersion: string, viewer: FaqViewer, question: string): string {
  return `${faqVersion}:${viewer}:${normalizeQuestion(question)}`;
}
