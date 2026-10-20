"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import type { SupportChatSuggestion } from "@sip/shared-types";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Textarea } from "@/components/ui/Textarea";
import { SUPPORT_CHAT_MESSAGE_MAX_LENGTH, type UseSupportChat } from "@/hooks/useSupportChat";
import { SupportChatMessage } from "./SupportChatMessage";
import { SupportChatSuggestions } from "./SupportChatSuggestions";

/** Đếm ký tự khi câu hỏi dài hơn mức này. */
const COUNTER_FROM = 400;
/** Ô nhập giãn tối đa ~4 dòng. */
const INPUT_MAX_HEIGHT_PX = 112;
/** Cách đáy dưới mức này thì coi như đang đọc tin mới nhất ⇒ tự cuộn theo chữ mới. */
const STICK_TO_BOTTOM_PX = 48;

export interface SupportChatPanelProps {
  id: string;
  open: boolean;
  /** Mobile: toàn màn hình, modal. Desktop: khung nổi, không modal (vẫn dùng được trang phía sau). */
  modal: boolean;
  chat: UseSupportChat;
  suggestions: SupportChatSuggestion[];
  onClose: () => void;
}

function IconButton({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

function resizeInput(input: HTMLTextAreaElement | null): void {
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, INPUT_MAX_HEIGHT_PX)}px`;
}

/**
 * `<dialog>` gốc: mobile dùng `showModal()` (trình duyệt lo bẫy focus, lớp phủ), desktop dùng
 * `show()` (không modal). Render tại chỗ để giữ `data-role` của khu vực.
 */
function useDialog(ref: RefObject<HTMLDialogElement | null>, inputRef: RefObject<HTMLTextAreaElement | null>, open: boolean, modal: boolean) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (dialog.open && dialog.matches(":modal") !== modal) dialog.close();
    if (!dialog.open) {
      if (modal) dialog.showModal();
      else dialog.show();
    }
    inputRef.current?.focus();
    if (!modal) return;
    // Toàn màn hình: khoá cuộn trang phía sau.
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [ref, inputRef, open, modal]);
}

export function SupportChatPanel({ id, open, modal, chat, suggestions, onClose }: SupportChatPanelProps) {
  const titleId = useId();
  const counterId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [draft, setDraft] = useState("");

  useDialog(dialogRef, inputRef, open, modal);

  const { messages, status } = chat;
  const busy = status !== "idle";
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");

  // Chữ mới về ⇒ cuộn theo, trừ khi người dùng đang cuộn lên đọc tin cũ.
  useEffect(() => {
    const list = listRef.current;
    if (list && open && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || !draft.trim()) return;
    stickToBottom.current = true;
    chat.send(draft);
    setDraft("");
    requestAnimationFrame(() => resizeInput(inputRef.current));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter gửi, Shift+Enter xuống dòng. Bỏ qua khi bộ gõ còn đang ghép chữ.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const pickSuggestion = (suggestion: SupportChatSuggestion) => {
    stickToBottom.current = true;
    chat.send(suggestion.question, suggestion.faqId);
    // Chip biến mất sau khi gửi ⇒ đưa focus về ô nhập thay vì để rơi về body.
    inputRef.current?.focus();
  };

  const retry = () => {
    stickToBottom.current = true;
    chat.retry();
    inputRef.current?.focus();
  };

  return (
    <dialog
      ref={dialogRef}
      id={id}
      aria-labelledby={titleId}
      aria-modal={modal}
      onCancel={(event) => {
        // Esc ở chế độ modal: trạng thái mở do React giữ, nên chặn đóng mặc định rồi báo lên.
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        // Chế độ không modal không có sự kiện `cancel` ⇒ tự bắt Esc.
        if (event.key === "Escape" && !modal) {
          event.preventDefault();
          onClose();
        }
      }}
      className={[
        "z-40 m-0 max-h-none max-w-none overflow-hidden border-0 bg-surface-card p-0 text-text-body",
        "fixed inset-0 h-dvh w-full",
        "sm:inset-auto sm:right-6 sm:bottom-24 sm:h-[min(600px,calc(100dvh-120px))] sm:w-[380px] sm:rounded-xl sm:border sm:border-border-subtle sm:shadow-xl",
        "transition-[opacity,translate] duration-200 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none",
        "open:flex open:flex-col backdrop:bg-transparent",
      ].join(" ")}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle pr-2 pl-4">
        <Icon name="message-circle-question" size={20} className="shrink-0 text-brand-600" />
        <h2 id={titleId} className="flex-1 text-base font-semibold text-text-strong">
          Trợ lý InternHub
        </h2>
        <IconButton icon="rotate-ccw" label="Cuộc trò chuyện mới" onClick={chat.reset} disabled={messages.length === 0} />
        <IconButton icon="x" label="Đóng trợ lý" onClick={onClose} />
      </header>

      <div
        ref={listRef}
        onScroll={(event) => {
          const list = event.currentTarget;
          stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < STICK_TO_BOTTOM_PX;
        }}
        className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {messages.length === 0 ? (
          <SupportChatSuggestions suggestions={suggestions} disabled={busy} onPick={pickSuggestion} />
        ) : (
          messages.map((message, index) => (
            <SupportChatMessage
              key={message.id}
              message={message}
              canRetry={!busy && index > lastUserIndex}
              onRetry={retry}
            />
          ))
        )}
      </div>

      <form onSubmit={submit} className="shrink-0 space-y-2 border-t border-border-subtle px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={SUPPORT_CHAT_MESSAGE_MAX_LENGTH}
            placeholder="Nhập câu hỏi…"
            aria-label="Câu hỏi của bạn"
            aria-describedby={draft.length > COUNTER_FROM ? counterId : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              resizeInput(event.target);
            }}
            onKeyDown={onKeyDown}
            className="max-h-28 min-h-10 resize-none py-2 leading-normal"
          />
          {busy ? (
            <Button type="button" size="sm" variant="secondary" icon="square" onClick={chat.stop} className="h-10 shrink-0">
              Dừng
            </Button>
          ) : (
            <Button type="submit" size="sm" icon="send" disabled={!draft.trim()} className="h-10 shrink-0">
              Gửi
            </Button>
          )}
        </div>
        <div className="flex items-start justify-between gap-3 text-[13px] text-text-muted">
          <p>
            Trả lời dựa trên tài liệu hướng dẫn của InternHub. Cần người hỗ trợ?{" "}
            <Link href="/support" className="font-medium text-brand-700 hover:underline">
              Liên hệ hỗ trợ
            </Link>
          </p>
          {draft.length > COUNTER_FROM ? (
            <span id={counterId} className="shrink-0 font-num tabular-nums">
              {draft.length}/{SUPPORT_CHAT_MESSAGE_MAX_LENGTH}
            </span>
          ) : null}
        </div>
      </form>
    </dialog>
  );
}
