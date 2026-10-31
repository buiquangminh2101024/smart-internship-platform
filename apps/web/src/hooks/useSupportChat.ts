"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SupportChatHistoryItem, SupportChatSource, SupportChatSourceRef } from "@sip/shared-types";
import type { AuthArea } from "@/lib/auth-area";
import {
  loadSupportChatHistory,
  removeSupportChatHistory,
  saveSupportChatHistory,
  supportChatStorageKey,
  type StoredSupportChatMessage,
  type StoredSupportChatStatus,
} from "@/lib/support-chat-storage";
import { openSupportChatStream, SupportChatHttpError } from "@/lib/support-chat-stream";

// State hội thoại của widget trợ lý (docs/05-frontend/phases/support-chatbot/PLAN.md, mục
// "Hook useSupportChat"). State nằm trong một đối tượng ngoài React, sống cùng
// SupportChatRoot: đóng panel khi đang stream vẫn nhận nốt câu trả lời.

/** Khớp giới hạn backend (support-chat.config.ts) để không bị 400. */
export const SUPPORT_CHAT_MESSAGE_MAX_LENGTH = 500;
const HISTORY_MAX_MESSAGES = 10;
const HISTORY_MESSAGE_MAX_LENGTH = 1000;

export type SupportChatMessageStatus = "pending" | "streaming" | StoredSupportChatStatus;

export type SupportChatNotice = "rate_limited" | "disabled" | "network" | "failed" | "session_expired";

export interface SupportChatUiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  faqId?: string | undefined;
  source?: SupportChatSource | undefined;
  sources?: SupportChatSourceRef[] | undefined;
  suggestSupport?: boolean | undefined;
  /** Tin trợ lý: pending (chờ mẩu đầu) → streaming → done | stopped | interrupted. */
  status?: SupportChatMessageStatus | undefined;
  /** Tin hệ thống: loại thông báo. */
  notice?: SupportChatNotice | undefined;
}

export type SupportChatStatus = "idle" | "waiting" | "streaming";

export interface SupportChatSnapshot {
  messages: SupportChatUiMessage[];
  status: SupportChatStatus;
  /** Câu trả lời vừa xong — vùng aria-live đọc câu này, không đọc từng mẩu chữ. */
  announcement: string;
}

const NOTICE_TEXT: Record<SupportChatNotice, string> = {
  rate_limited: "Bạn gửi hơi nhanh. Thử lại sau ít phút.",
  disabled: "Trợ lý đang tạm tắt. Bạn có thể gửi yêu cầu ở trang hỗ trợ.",
  network: "Không kết nối được. Kiểm tra mạng rồi thử lại.",
  failed: "Đã có lỗi xảy ra. Bạn thử lại sau ít phút.",
  session_expired:
    "Phiên đăng nhập đã hết hạn. Câu trả lời dưới đây chỉ dựa trên tài liệu chung; đăng nhập lại để hỏi về dữ liệu của bạn.",
};

/** Thông báo có nút "Thử lại" (gửi lại câu hỏi cuối). */
export const RETRYABLE_NOTICES: ReadonlySet<SupportChatNotice> = new Set(["network", "failed"]);

const EMPTY_SNAPSHOT: SupportChatSnapshot = { messages: [], status: "idle", announcement: "" };

let nextId = 0;
function messageId(): string {
  nextId += 1;
  return `${Date.now().toString(36)}-${nextId}`;
}

function noticeOf(notice: SupportChatNotice): SupportChatUiMessage {
  return { id: messageId(), role: "system", text: NOTICE_TEXT[notice], notice };
}

function noticeForError(error: unknown): SupportChatNotice {
  if (error instanceof SupportChatHttpError) {
    if (error.status === 429) return "rate_limited";
    if (error.status === 503) return "disabled";
    return "failed";
  }
  // `fetch` ném TypeError khi mất mạng / không tới được server.
  return "network";
}

/**
 * Lịch sử gửi lên: các cặp hỏi–đáp đã xong (trợ lý `done`), 10 tin gần nhất, mỗi tin ≤ 1.000 ký
 * tự. Câu hỏi bị dừng/lỗi không gửi kèm để server không nhận hai tin người dùng liền nhau.
 */
function historyOf(messages: SupportChatUiMessage[]): SupportChatHistoryItem[] {
  const history: SupportChatHistoryItem[] = [];
  let question: SupportChatUiMessage | null = null;
  for (const message of messages) {
    if (message.role === "user") question = message;
    else if (message.role === "assistant" && question && message.status === "done") {
      history.push(
        { role: "user", text: question.text.slice(0, HISTORY_MESSAGE_MAX_LENGTH) },
        { role: "model", text: message.text.slice(0, HISTORY_MESSAGE_MAX_LENGTH) },
      );
      question = null;
    }
  }
  return history.slice(-HISTORY_MAX_MESSAGES);
}

/**
 * Chỉ lưu các lượt có tin trợ lý đã kết thúc. Lượt hỏng trước mẩu chữ đầu (mất mạng, 429…) chỉ
 * còn câu hỏi + thông báo hệ thống không lưu ⇒ bỏ cả câu hỏi, để F5 không hiện câu hỏi trơ trọi.
 */
function storedOf(messages: SupportChatUiMessage[]): StoredSupportChatMessage[] {
  const stored: StoredSupportChatMessage[] = [];
  let question: SupportChatUiMessage | null = null;
  for (const message of messages) {
    if (message.role === "user") question = message;
    else if (
      message.role === "assistant" &&
      question &&
      (message.status === "done" || message.status === "stopped" || message.status === "interrupted")
    ) {
      stored.push(
        { id: question.id, role: "user", text: question.text, faqId: question.faqId },
        {
          id: message.id,
          role: "assistant",
          text: message.text,
          source: message.source,
          sources: message.sources,
          suggestSupport: message.suggestSupport,
          status: message.status,
        },
      );
      question = null;
    }
  }
  return stored;
}

export class SupportChatSession {
  private snapshot: SupportChatSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private area: AuthArea | null = null;
  private userId: string | null = null;
  /** Tăng mỗi lượt mới / đổi hội thoại — lượt cũ còn chạy thì bỏ kết quả của nó. */
  private turn = 0;
  private abortController: AbortController | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SupportChatSnapshot => this.snapshot;

  private get key(): string | null {
    return this.area ? supportChatStorageKey(this.area, this.userId) : null;
  }

  private set(patch: Partial<SupportChatSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private patchMessage(id: string, patch: Partial<SupportChatUiMessage>): void {
    this.set({ messages: this.snapshot.messages.map((message) => (message.id === id ? { ...message, ...patch } : message)) });
  }

  private save(): void {
    const key = this.key;
    if (key) saveSupportChatHistory(key, storedOf(this.snapshot.messages));
  }

  /** Gắn với hội thoại của (area, user). Đổi sang hội thoại khác ⇒ huỷ lượt đang chạy, nạp lại. */
  bind(area: AuthArea, userId: string | null): void {
    if (this.area === area && this.userId === userId) return;
    this.cancelTurn();
    this.area = area;
    this.userId = userId;
    this.set({ messages: this.key ? loadSupportChatHistory(this.key) : [], status: "idle", announcement: "" });
  }

  /** SupportChatRoot bị gỡ (hoặc StrictMode chạy lại effect). */
  unbind(): void {
    this.cancelTurn();
    this.area = null;
    this.userId = null;
  }

  private cancelTurn(): void {
    this.turn += 1;
    this.abortController?.abort();
    this.abortController = null;
  }

  send(text: string, faqId?: string): void {
    const message = text.trim().slice(0, SUPPORT_CHAT_MESSAGE_MAX_LENGTH);
    if (!message || !this.area || this.snapshot.status !== "idle") return;
    const history = historyOf(this.snapshot.messages);
    const question: SupportChatUiMessage = { id: messageId(), role: "user", text: message, faqId };
    const answer: SupportChatUiMessage = { id: messageId(), role: "assistant", text: "", status: "pending" };
    this.set({ messages: [...this.snapshot.messages, question, answer], status: "waiting", announcement: "" });
    void this.run(this.area, { message, history, ...(faqId ? { faqId } : {}) }, answer.id);
  }

  stop(): void {
    this.abortController?.abort();
  }

  /** Gửi lại câu hỏi cuối: bỏ lượt hỏng (câu hỏi, phần trả lời dở, thông báo lỗi) rồi gửi lại. */
  retry(): void {
    if (this.snapshot.status !== "idle") return;
    const messages = this.snapshot.messages;
    const index = messages.findLastIndex((message) => message.role === "user");
    const question = messages[index];
    if (!question) return;
    this.set({ messages: messages.slice(0, index) });
    this.send(question.text, question.faqId);
  }

  /** "Cuộc trò chuyện mới". */
  reset(): void {
    this.cancelTurn();
    const key = this.key;
    if (key) removeSupportChatHistory(key);
    this.set({ messages: [], status: "idle", announcement: "" });
  }

  private async run(
    area: AuthArea,
    request: { message: string; history: SupportChatHistoryItem[]; faqId?: string },
    answerId: string,
  ): Promise<void> {
    this.turn += 1;
    const turn = this.turn;
    const abortController = new AbortController();
    this.abortController = abortController;
    const isCurrent = () => turn === this.turn;
    let finished = false;

    try {
      const events = await openSupportChatStream(area, request, abortController.signal, {
        onSessionExpired: () => {
          if (!isCurrent()) return;
          // Hội thoại đang hiển thị đi tiếp dưới key khách: đổi key ngay, trước khi store auth
          // bị xoá, để bind() sau đó thấy trùng và không nạp lại (giữ câu đang hỏi).
          this.userId = null;
          const messages = this.snapshot.messages;
          const at = messages.findIndex((message) => message.id === answerId);
          this.set({ messages: [...messages.slice(0, at), noticeOf("session_expired"), ...messages.slice(at)] });
        },
      });
      for await (const event of events) {
        if (!isCurrent()) return;
        if (event.type === "meta") {
          this.patchMessage(answerId, { source: event.source });
        } else if (event.type === "delta") {
          this.patchMessage(answerId, { text: answerText(this.snapshot.messages, answerId) + event.text, status: "streaming" });
          if (this.snapshot.status !== "streaming") this.set({ status: "streaming" });
        } else if (event.type === "done") {
          this.patchMessage(answerId, {
            source: event.source,
            sources: event.sources,
            suggestSupport: event.suggestSupport,
            status: "done",
          });
          this.set({ announcement: answerText(this.snapshot.messages, answerId) });
          finished = true;
        } else {
          this.patchMessage(answerId, { status: "interrupted" });
          finished = true;
        }
      }
      // Stream đóng mà chưa có `done`/`error` (vd. mất kết nối tới server).
      if (!finished && isCurrent()) this.fail(answerId, "network");
    } catch (error) {
      if (!isCurrent()) return;
      if (abortController.signal.aborted) this.patchMessage(answerId, { status: "stopped" });
      else this.fail(answerId, noticeForError(error));
    } finally {
      if (isCurrent()) {
        this.abortController = null;
        this.set({ status: "idle" });
        this.save();
      }
    }
  }

  /** Đã có chữ ⇒ giữ phần đã nhận, đánh dấu gián đoạn. Chưa có ⇒ thay bằng thông báo lỗi. */
  private fail(answerId: string, notice: SupportChatNotice): void {
    if (answerText(this.snapshot.messages, answerId)) {
      this.patchMessage(answerId, { status: "interrupted" });
      return;
    }
    this.set({
      messages: this.snapshot.messages.flatMap((message) => (message.id === answerId ? [noticeOf(notice)] : [message])),
    });
  }
}

function answerText(messages: SupportChatUiMessage[], answerId: string): string {
  return messages.find((message) => message.id === answerId)?.text ?? "";
}

export interface UseSupportChat extends SupportChatSnapshot {
  send(text: string, faqId?: string): void;
  stop(): void;
  retry(): void;
  reset(): void;
}

/**
 * Hội thoại của `area` + `userId` (khách = null). `enabled = false` (store auth chưa đọc xong
 * localStorage) thì chưa nạp lịch sử, tránh nạp nhầm hội thoại khách rồi đổi ngay.
 */
export function useSupportChat(area: AuthArea, userId: string | null, enabled: boolean): UseSupportChat {
  const [session] = useState(() => new SupportChatSession());
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, () => EMPTY_SNAPSHOT);

  useEffect(() => {
    if (enabled) session.bind(area, userId);
  }, [session, area, userId, enabled]);

  useEffect(() => () => session.unbind(), [session]);

  return {
    ...snapshot,
    send: (text, faqId) => session.send(text, faqId),
    stop: () => session.stop(),
    retry: () => session.retry(),
    reset: () => session.reset(),
  };
}
