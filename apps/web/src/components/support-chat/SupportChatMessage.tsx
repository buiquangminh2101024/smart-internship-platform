"use client";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { RETRYABLE_NOTICES, type SupportChatUiMessage } from "@/hooks/useSupportChat";
import { formatSupportChatAnswer } from "@/lib/support-chat-format";

export interface SupportChatMessageProps {
  message: SupportChatUiMessage;
  /** Hiện nút "Thử lại" — chỉ ở lượt cuối và khi không có lượt nào đang chạy. */
  canRetry: boolean;
  onRetry: () => void;
}

function SupportLink() {
  return (
    <Button as="a" href="/support" variant="link" iconAfter="arrow-right" className="text-[13px]">
      Liên hệ hỗ trợ
    </Button>
  );
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button type="button" variant="link" icon="rotate-cw" onClick={onRetry} className="text-[13px]">
      Thử lại
    </Button>
  );
}

/** 3 chấm khi chờ mẩu chữ đầu. Chữ cho trình đọc màn hình nằm ở vùng live của SupportChatRoot. */
function TypingDots() {
  return (
    <span className="flex h-5 items-center gap-1" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-pulse rounded-full bg-text-muted motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

export function SupportChatMessage({ message, canRetry, onRetry }: SupportChatMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-xl rounded-br-sm bg-brand-50 px-3 py-2 text-[15px] break-words whitespace-pre-wrap text-text-body">
          {message.text}
        </p>
      </div>
    );
  }

  if (message.role === "system") {
    const retryable = message.notice ? RETRYABLE_NOTICES.has(message.notice) : false;
    return (
      <div className="flex gap-2 rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm text-text-body">
        <Icon
          name={message.notice === "session_expired" ? "info" : "circle-alert"}
          size={16}
          className="mt-0.5 shrink-0 text-text-muted"
        />
        <div className="space-y-1">
          <p>{message.text}</p>
          {retryable && canRetry ? <RetryButton onRetry={onRetry} /> : null}
          {message.notice === "disabled" ? <SupportLink /> : null}
        </div>
      </div>
    );
  }

  const { status, text } = message;
  const sources = message.sources ?? [];
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-2 rounded-xl rounded-bl-sm bg-surface-page px-3 py-2 text-[15px] break-words text-text-body">
        {status === "pending" ? <TypingDots /> : null}
        {/* Đang stream: text thô, tránh nhấp nháy `**` chưa đóng; xong mới định dạng. */}
        {status === "streaming" ? <p className="whitespace-pre-wrap">{text}</p> : null}
        {status !== "pending" && status !== "streaming" && text ? formatSupportChatAnswer(text) : null}

        {status === "done" && sources.length > 0 ? (
          <p className="text-[13px] text-text-muted">Nguồn: {sources.map((source) => source.title).join(" · ")}</p>
        ) : null}
        {status === "stopped" ? <p className="text-[13px] text-text-muted">Đã dừng</p> : null}
        {status === "interrupted" ? (
          <div className="space-y-1">
            <p className="text-[13px] text-text-muted">Câu trả lời bị gián đoạn.</p>
            {canRetry ? <RetryButton onRetry={onRetry} /> : null}
          </div>
        ) : null}
        {status === "done" && message.suggestSupport ? <SupportLink /> : null}
      </div>
    </div>
  );
}
