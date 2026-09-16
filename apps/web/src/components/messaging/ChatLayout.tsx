"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useMessagingStore } from "@/stores/messaging-store";
import { useSocket } from "@/components/realtime/SocketProvider";
import { useCurrentUser } from "@/stores/auth-store";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import {
  conversationExternalLink,
  isConversationUnread,
  unreadSummaryQueryKey,
  type MessagingArea,
} from "@/lib/messaging";

interface ChatLayoutProps {
  area: MessagingArea;
}

export function ChatLayout({ area }: ChatLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const initialConversationId = searchParams.get("conversationId");
  // `?filter=unread` — đích của dòng ghim "N tin nhắn mới" ở NotificationBell.
  const unreadOnly = searchParams.get("filter") === "unread";

  const {
    conversations,
    activeConversationId,
    messages,
    isLoadingConversations,
    isLoadingMessages,
    fetchConversations,
    fetchMessages,
    setActiveConversationId,
    markAsRead,
  } = useMessagingStore();

  const user = useCurrentUser(area);
  const socket = useSocket();
  // Trạng thái kết nối giữ ở SocketProvider suốt lúc chuyển trang, nên vào
  // trang chat là thấy ngay nếu socket đã lỗi từ trước.
  const isConnected = socket?.status === "connected";
  const isDisconnected = !socket || socket.status === "disconnected";
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations(area).then(() => {
      if (initialConversationId) {
        setActiveConversationId(initialConversationId);
      }
    });
  }, [area, fetchConversations, initialConversationId, setActiveConversationId]);

  useEffect(() => {
    if (activeConversationId && !messages[activeConversationId]) {
      fetchMessages(area, activeConversationId);
    }
    if (activeConversationId) {
      markAsRead(area, activeConversationId).then(() =>
        queryClient.invalidateQueries({ queryKey: unreadSummaryQueryKey(area) }),
      );
    }
  }, [activeConversationId, area, fetchMessages, markAsRead, messages, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeConversationId]);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const currentMessages = activeConversationId ? messages[activeConversationId] || [] : [];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConversationId) return;

    // Gửi không được (mất kết nối) thì giữ nguyên nội dung để người dùng gửi lại.
    if (socket?.sendMessage(activeConversationId, inputText)) setInputText("");
  };

  function setUnreadOnly(next: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("filter", "unread");
    else params.delete("filter");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  // Hội thoại đang mở vẫn hiển thị ở khung chat dù đã rời khỏi danh sách lọc
  // (mở ra là đã đọc) — activeConversation lấy từ danh sách đầy đủ.
  const visibleConversations = unreadOnly
    ? conversations.filter((c) => isConversationUnread(c, area, user?.id))
    : conversations;

  if (isLoadingConversations) {
    return <div className="flex h-full items-center justify-center p-8 text-text-muted">Đang tải...</div>;
  }

  if (conversations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Icon name="messages-square" size={48} className="mb-4 text-border-strong" />
        <p className="text-text-muted">Bạn chưa có hội thoại nào.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Sidebar (List) */}
      <div className="w-80 flex-shrink-0 border-r border-border-subtle bg-surface-page flex flex-col">
        <div className="flex gap-1 border-b border-border-subtle p-2">
          {[
            { label: "Tất cả", value: false },
            { label: "Chưa đọc", value: true },
          ].map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => setUnreadOnly(tab.value)}
              aria-pressed={unreadOnly === tab.value}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                unreadOnly === tab.value
                  ? "bg-brand-50 font-medium text-brand-700"
                  : "text-text-muted hover:bg-surface-hover"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {visibleConversations.length === 0 ? (
            <p className="p-4 text-center text-sm text-text-muted">Không có hội thoại nào có tin nhắn chưa đọc.</p>
          ) : null}
          {visibleConversations.map((conv) => {
            const partner = area === "candidate" ? conv.employer : conv.candidate;
            const hasUnread = isConversationUnread(conv, area, user?.id);
            const externalLink = unreadOnly ? conversationExternalLink(conv, area) : null;

            return (
              <div key={conv.id} className="border-b border-border-subtle">
                <button
                  onClick={() => setActiveConversationId(conv.id)}
                  className={`w-full flex items-start gap-3 p-4 text-left hover:bg-surface-hover transition-colors ${
                    activeConversationId === conv.id ? "bg-surface-active" : ""
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-border-subtle flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {partner.avatarUrl ? (
                      <img src={partner.avatarUrl} alt={partner.name} className="w-full h-full object-cover" />
                    ) : (
                      <Icon name="user" className="text-text-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <div className={`text-sm truncate ${hasUnread ? "font-bold text-text-strong" : "font-medium text-text-strong"}`}>
                        {partner.name || partner.id}
                      </div>
                    </div>
                    <div className="text-xs text-text-muted truncate">
                      {conv.jobPost.title}
                    </div>
                    {conv.latestMessage && (
                      <div className={`text-sm truncate mt-1 ${hasUnread ? "font-bold text-text-strong" : "text-text-muted"}`}>
                        {conv.latestMessage.senderId === user?.id ? "Bạn: " : ""}
                        {conv.latestMessage.content}
                      </div>
                    )}
                  </div>
                </button>
                {externalLink ? (
                  <Link
                    href={externalLink.href}
                    className="-mt-2 flex items-center gap-1 px-4 pb-3 pl-[68px] text-xs text-brand-700 hover:underline"
                  >
                    <Icon name="external-link" size={12} />
                    {externalLink.label}
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main content (Chat) */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeConversation ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-border-subtle bg-white flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-text-strong truncate">
                  {area === "candidate" ? activeConversation.employer.name : activeConversation.candidate.name}
                </h3>
                <p className="text-sm text-text-muted truncate">
                  {activeConversation.jobPost.title} • {activeConversation.jobPost.companyName}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-surface-page">
              {isLoadingMessages[activeConversation.id] ? (
                <div className="text-center text-text-muted py-4">Đang tải tin nhắn...</div>
              ) : (
                currentMessages.map((msg) => {
                  const isMe = msg.senderId === user?.id;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                          isMe
                            ? "bg-brand-600 text-white rounded-tr-none"
                            : "bg-white border border-border-subtle text-text-strong rounded-tl-none"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        <div className={`text-[10px] mt-1 ${isMe ? "text-brand-200" : "text-text-disabled"}`}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <form onSubmit={handleSend} className="p-4 bg-white border-t border-border-subtle">
              {isDisconnected ? (
                <p role="status" className="mb-2 flex items-center gap-2 rounded-lg bg-marigold-100 px-3 py-2 text-xs text-text-strong">
                  <Icon name="wifi-off" size={14} className="shrink-0" />
                  Mất kết nối, tin nhắn chưa gửi được. Đang thử kết nối lại…
                </p>
              ) : null}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Nhập tin nhắn..."
                  className="flex-1 rounded-lg border border-border-strong px-4 py-2 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <Button type="submit" disabled={!inputText.trim() || !isConnected} icon="send">
                  Gửi
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted">
            Chọn một hội thoại để bắt đầu nhắn tin
          </div>
        )}
      </div>
    </div>
  );
}
