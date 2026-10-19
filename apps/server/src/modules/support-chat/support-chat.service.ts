import type {
  SupportChatEvent,
  SupportChatHistoryItem,
  SupportChatSource,
  SupportChatSourceRef,
  SupportChatSuggestion,
} from "@sip/shared-types";
import type { Logger } from "../../shared/logger";
import type { EmbeddingProvider } from "../../shared/ports/EmbeddingProvider";
import type { SupportChatResponder } from "../../shared/ports/SupportChatResponder";
import { isAccentFree, type FaqKnowledgeBase, type FaqViewer } from "./faq-knowledge-base";
import type { FaqItem } from "./faq-markdown.util";
import type { SupportChatAnswerCache } from "./support-chat-answer-cache";
import type { SupportChatRateLimitService, SupportChatRequester } from "./support-chat-rate-limit.service";
import { smallTalkReplyOf } from "./support-chat-small-talk.util";
import {
  DIRECT_THRESHOLD,
  DIRECT_THRESHOLD_WITH_HISTORY,
  OUT_OF_SCOPE_THRESHOLD,
  RAG_TOP_K,
  SUGGESTED_FAQ_IDS,
} from "./support-chat.config";

export interface SupportChatTurn {
  message: string;
  history: SupportChatHistoryItem[];
  faqId?: string | undefined;
  viewer: FaqViewer;
  requester: SupportChatRequester;
}

const OUT_OF_SCOPE_REPLY =
  "Xin lỗi, mình chỉ hỗ trợ các câu hỏi về cách dùng InternHub (tài khoản, hồ sơ và CV, tìm việc, ứng tuyển, đăng tin, gói dịch vụ…). Nếu bạn cần hỗ trợ việc khác, hãy gửi yêu cầu ở trang /support nhé.";
const UNAVAILABLE_REPLY =
  "Trợ lý đang tạm thời không trả lời được câu này. Bạn thử lại sau ít phút, hoặc gửi yêu cầu ở trang /support để được hỗ trợ nhé.";
const INTERRUPTED_MESSAGE = "Câu trả lời bị gián đoạn. Bạn thử gửi lại câu hỏi nhé.";

/** Trang /support được nhắc tới ⇒ frontend hiện nút "Liên hệ hỗ trợ". */
const SUPPORT_PAGE_LINK = /(?:^|[^\w/])\/support(?![\w/-])/;
/**
 * LLM nói không trả lời được (quy tắc 2–3 của prompt) ⇒ không gắn nguồn, vì các mục đưa vào
 * prompt không trả lời câu này. Prompt dặn nhắc /support khi đó, nhưng model không phải lúc
 * nào cũng làm theo nên cụm này cũng bật nút "Liên hệ hỗ trợ".
 */
const CANNOT_ANSWER = /chưa có thông tin|chỉ hỗ trợ/i;

/** Ghi log cuối mỗi lượt — không ghi nội dung câu hỏi (PLAN mục "Ghi chú cho test tải"). */
interface TurnTrace {
  source: SupportChatSource | "aborted" | "interrupted";
  topScore?: number;
}

/**
 * Pipeline nhiều bậc (D5, PLAN mục "Pipeline xử lý một câu hỏi"). Trả chuỗi sự kiện SSE;
 * lỗi ném ra TRƯỚC sự kiện đầu tiên (vd. 429) được controller trả thành JSON thường.
 */
export class SupportChatService {
  private readonly faqKnowledgeBase: FaqKnowledgeBase;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly answerCache: SupportChatAnswerCache;
  private readonly rateLimit: SupportChatRateLimitService;
  private readonly responder: SupportChatResponder | null;
  private readonly logger: Logger;
  private readonly suggestionsByViewer = new Map<FaqViewer, SupportChatSuggestion[]>();

  constructor({
    faqKnowledgeBase,
    embeddingProvider,
    supportChatAnswerCache,
    supportChatRateLimitService,
    supportChatResponder,
    logger,
  }: {
    faqKnowledgeBase: FaqKnowledgeBase;
    embeddingProvider: EmbeddingProvider;
    supportChatAnswerCache: SupportChatAnswerCache;
    supportChatRateLimitService: SupportChatRateLimitService;
    /** null khi không tầng LLM nào có key — bậc 4 luôn trả câu mẫu (D13). */
    supportChatResponder: SupportChatResponder | null;
    logger: Logger;
  }) {
    this.faqKnowledgeBase = faqKnowledgeBase;
    this.embeddingProvider = embeddingProvider;
    this.answerCache = supportChatAnswerCache;
    this.rateLimit = supportChatRateLimitService;
    this.responder = supportChatResponder;
    this.logger = logger;
  }

  suggestions(viewer: FaqViewer): SupportChatSuggestion[] {
    let suggestions = this.suggestionsByViewer.get(viewer);
    if (!suggestions) {
      suggestions = SUGGESTED_FAQ_IDS[viewer].flatMap((faqId) => {
        const item = this.visibleItem(faqId, viewer);
        const question = item?.questions[0];
        if (!question) {
          this.logger.warn("Suggested FAQ is missing or hidden from viewer", { faqId, viewer });
          return [];
        }
        return [{ faqId, question }];
      });
      this.suggestionsByViewer.set(viewer, suggestions);
    }
    return suggestions;
  }

  async *chat(turn: SupportChatTurn, signal: AbortSignal): AsyncGenerator<SupportChatEvent> {
    // Bậc 0 (phần còn lại sau zod và cờ SUPPORT_CHAT_ENABLED ở route).
    await this.rateLimit.assertWithinMessageLimit(turn.requester);

    const startedAt = Date.now();
    const trace: TurnTrace = { source: "unavailable" };
    try {
      yield* this.answer(turn, signal, trace);
    } finally {
      this.logger.info("Support chat turn", {
        source: trace.source,
        viewer: turn.viewer,
        hasHistory: turn.history.length > 0,
        ...(trace.topScore === undefined ? {} : { topScore: Number(trace.topScore.toFixed(3)) }),
        durationMs: Date.now() - startedAt,
      });
    }
  }

  private async *answer(turn: SupportChatTurn, signal: AbortSignal, trace: TurnTrace): AsyncGenerator<SupportChatEvent> {
    const hasHistory = turn.history.length > 0;

    // Bậc 0b — bấm câu gợi ý. faqId lạ hoặc của vai trò khác thì bỏ qua, xử lý như câu thường.
    const suggested = turn.faqId ? this.visibleItem(turn.faqId, turn.viewer) : undefined;
    if (suggested) {
      trace.source = "faq";
      yield* fixedAnswer("faq", suggested.answer, [sourceRefOf(suggested)], false);
      return;
    }

    // Bậc 1 — xã giao.
    const smallTalk = smallTalkReplyOf(turn.message);
    if (smallTalk) {
      trace.source = "smalltalk";
      yield* fixedAnswer("smalltalk", smallTalk, [], false);
      return;
    }

    // Bậc 2 — so với câu hỏi mẫu. Model embedding hỏng ⇒ không có vector, bỏ qua bậc này.
    const accentFree = isAccentFree(turn.message);
    const vector = await this.embeddingProvider.embed(turn.message);
    const top = vector ? (await this.faqKnowledgeBase.score(vector, turn.viewer, { accentFree }))?.[0] : undefined;
    if (top) trace.topScore = top.questionScore;
    // Câu gõ không dấu: không trả thẳng, không chặn (PLAN, quyết định sau đợt B).
    if (top && !accentFree) {
      const direct = hasHistory ? DIRECT_THRESHOLD_WITH_HISTORY : DIRECT_THRESHOLD;
      const item = top.questionScore >= direct ? this.faqKnowledgeBase.getById(top.faqId) : undefined;
      if (item) {
        trace.source = "faq";
        yield* fixedAnswer("faq", item.answer, [sourceRefOf(item)], false);
        return;
      }
      if (!hasHistory && top.questionScore < OUT_OF_SCOPE_THRESHOLD) {
        trace.source = "out_of_scope";
        yield* fixedAnswer("out_of_scope", OUT_OF_SCOPE_REPLY, [], true);
        return;
      }
    }

    // Bậc 3 — cache, chỉ câu hỏi độc lập.
    const faqVersion = this.faqKnowledgeBase.version;
    const cached = hasHistory ? null : this.answerCache.get(faqVersion, turn.viewer, turn.message);
    if (cached) {
      trace.source = "cache";
      yield* fixedAnswer("cache", cached.text, cached.sources, cached.suggestSupport);
      return;
    }

    // Bậc 4 — LLM (RAG).
    const contextChunks = await this.contextFor(turn, vector);
    if (!this.responder || !contextChunks) {
      yield* fixedAnswer("unavailable", UNAVAILABLE_REPLY, [], true);
      return;
    }
    if (!(await this.rateLimit.tryConsumeDailyLlmCall())) {
      this.logger.warn("Support chat daily LLM limit reached");
      yield* fixedAnswer("unavailable", UNAVAILABLE_REPLY, [], true);
      return;
    }

    let text = "";
    try {
      const chunks = this.responder.stream(
        {
          viewer: turn.viewer,
          question: turn.message,
          history: turn.history,
          contextChunks: contextChunks.map((item) => ({ faqId: item.id, title: item.title, content: item.answer })),
        },
        signal,
      );
      for await (const chunk of chunks) {
        if (!text) yield { type: "meta", source: "llm" };
        text += chunk;
        yield { type: "delta", text: chunk };
      }
    } catch (error) {
      if (signal.aborted) {
        trace.source = "aborted";
        return;
      }
      if (text) {
        trace.source = "interrupted";
        this.logger.warn("Support chat LLM stream interrupted", { error: error instanceof Error ? error.message : String(error) });
        yield { type: "error", code: "LLM_INTERRUPTED", message: INTERRUPTED_MESSAGE };
        return;
      }
      // Mọi tầng đều lỗi trước mẩu chữ đầu — Fallback đã log từng tầng.
      yield* fixedAnswer("unavailable", UNAVAILABLE_REPLY, [], true);
      return;
    }
    if (!text) {
      yield* fixedAnswer("unavailable", UNAVAILABLE_REPLY, [], true);
      return;
    }

    trace.source = "llm";
    const cannotAnswer = CANNOT_ANSWER.test(text);
    const suggestSupport = cannotAnswer || SUPPORT_PAGE_LINK.test(text);
    const sources = cannotAnswer ? [] : contextChunks.map(sourceRefOf);
    yield { type: "done", source: "llm", sources, suggestSupport };
    if (!hasHistory) this.answerCache.set(faqVersion, turn.viewer, turn.message, { text, sources, suggestSupport });
  }

  /**
   * Đoạn FAQ cho prompt bậc 4. Câu nối tiếp: embed tin user gần nhất + câu hỏi ("vậy nó giá
   * bao nhiêu?" đứng một mình không đủ nghĩa — đợt B: 6/6 so với 4/6). null khi không có vector.
   */
  private async contextFor(turn: SupportChatTurn, questionVector: number[] | null): Promise<FaqItem[] | null> {
    const previousUserText = turn.history.findLast((item) => item.role === "user")?.text;
    const contextText = previousUserText ? `${previousUserText}\n${turn.message}` : turn.message;
    const vector = previousUserText ? await this.embeddingProvider.embed(contextText) : questionVector;
    if (!vector) return null;
    return this.faqKnowledgeBase.topContext(vector, turn.viewer, RAG_TOP_K, { accentFree: isAccentFree(contextText) });
  }

  private visibleItem(faqId: string, viewer: FaqViewer): FaqItem | undefined {
    return this.faqKnowledgeBase.listVisible(viewer).find((item) => item.id === faqId);
  }
}

/** Câu trả lời có sẵn (FAQ, xã giao, câu mẫu, cache) cũng đi qua SSE để frontend chỉ có một đường xử lý. */
function* fixedAnswer(
  source: SupportChatSource,
  text: string,
  sources: SupportChatSourceRef[],
  suggestSupport: boolean,
): Generator<SupportChatEvent> {
  yield { type: "meta", source };
  yield { type: "delta", text };
  yield { type: "done", source, sources, suggestSupport };
}

function sourceRefOf(item: FaqItem): SupportChatSourceRef {
  return { faqId: item.id, title: item.title };
}
