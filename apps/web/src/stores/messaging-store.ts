import { create } from "zustand";
import type { Conversation, DeleteConversationResponse, Message } from "@sip/shared-types";
import { apiFetch } from "../lib/api-client";

interface MessagingState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>; // conversationId -> messages
  isLoadingConversations: boolean;
  isLoadingMessages: Record<string, boolean>;
  // Lịch sử đã fetch cho conversation này chưa — tách riêng khỏi `messages` vì
  // socket "new_message" có thể tạo `messages[id]` (chỉ 1 tin) trước khi lịch
  // sử từng được tải, khiến UI tưởng nhầm là đã có đủ dữ liệu.
  hasFetchedMessages: Record<string, boolean>;

  fetchConversations: (area: "candidate" | "employer") => Promise<void>;
  fetchMessages: (area: "candidate" | "employer", conversationId: string) => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
  appendMessage: (conversationId: string, message: Message) => void;
  markAsRead: (area: "candidate" | "employer", conversationId: string) => Promise<void>;
  deleteConversation: (area: "candidate" | "employer", conversationId: string) => Promise<DeleteConversationResponse>;
  /** Phía kia đã xoá hội thoại (socket `conversation:unavailable` / lỗi gửi tin) — khoá gửi tin. */
  markConversationUnavailable: (area: "candidate" | "employer", conversationId: string) => void;
}

export const useMessagingStore = create<MessagingState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  isLoadingConversations: false,
  isLoadingMessages: {},
  hasFetchedMessages: {},

  fetchConversations: async (area) => {
    set({ isLoadingConversations: true });
    try {
      const res = await apiFetch<Conversation[]>(
        area,
        "/conversations"
      );
      set({ conversations: res });
    } finally {
      set({ isLoadingConversations: false });
    }
  },

  fetchMessages: async (area, conversationId) => {
    set((state) => ({
      isLoadingMessages: { ...state.isLoadingMessages, [conversationId]: true },
    }));
    try {
      const res = await apiFetch<{ items: Message[]; hasMore: boolean }>(
        area,
        `/conversations/${conversationId}/messages`
      );
      // Items are returned desc, we want to display them chronologically
      const fetched = res.items.slice().reverse();
      set((state) => {
        // Gộp với message đã có (từ socket) thay vì ghi đè — tránh mất tin nhắn
        // đến đúng lúc request lịch sử đang bay.
        const existing = state.messages[conversationId] || [];
        const byId = new Map(fetched.map((m) => [m.id, m]));
        for (const m of existing) byId.set(m.id, m);
        const merged = Array.from(byId.values()).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        return {
          messages: { ...state.messages, [conversationId]: merged },
          hasFetchedMessages: { ...state.hasFetchedMessages, [conversationId]: true },
        };
      });
    } finally {
      set((state) => ({
        isLoadingMessages: { ...state.isLoadingMessages, [conversationId]: false },
      }));
    }
  },

  setActiveConversationId: (id) => {
    set({ activeConversationId: id });
  },

  appendMessage: (conversationId, message) => {
    set((state) => {
      const convMsgs = state.messages[conversationId] || [];
      // Prevent duplicates
      if (convMsgs.find((m) => m.id === message.id)) return state;
      
      const newMessages = [...convMsgs, message];
      
      // Update latestMessage in conversations list
      const conversations = state.conversations.map((c) =>
        c.id === conversationId ? { ...c, latestMessage: message } : c
      );
      
      // Move conversation to top
      const targetConv = conversations.find((c) => c.id === conversationId);
      const filteredConvs = conversations.filter((c) => c.id !== conversationId);
      const newConversations = targetConv ? [targetConv, ...filteredConvs] : conversations;

      return {
        messages: { ...state.messages, [conversationId]: newMessages },
        conversations: newConversations,
      };
    });
  },

  markAsRead: async (area, conversationId) => {
    await apiFetch(area, `/conversations/${conversationId}/read`, {
      method: "PUT",
    });
    // Update local state if needed (e.g. read timestamps)
    set((state) => {
      const now = new Date().toISOString();
      const conversations = state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        if (area === "candidate") return { ...c, candidateLastReadAt: now };
        return { ...c, employerLastReadAt: now };
      });
      return { conversations };
    });
  },

  deleteConversation: async (area, conversationId) => {
    const result = await apiFetch<DeleteConversationResponse>(area, `/conversations/${conversationId}`, {
      method: "DELETE",
    });
    // Phía mình đã xoá → hội thoại biến mất khỏi danh sách của mình (dù có xoá cứng hay không).
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== conversationId),
      activeConversationId: state.activeConversationId === conversationId ? null : state.activeConversationId,
    }));
    return result;
  },

  markConversationUnavailable: (area, conversationId) => {
    const now = new Date().toISOString();
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.id !== conversationId || c.candidateDeletedAt || c.employerDeletedAt) return c;
        // Người nhận sự kiện là phía chưa xoá → cờ xoá thuộc về phía đối diện.
        return area === "candidate" ? { ...c, employerDeletedAt: now } : { ...c, candidateDeletedAt: now };
      }),
    }));
  },
}));
