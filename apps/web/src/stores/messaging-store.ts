import { create } from "zustand";
import type { Conversation, Message } from "@sip/shared-types";
import { apiFetch } from "../lib/api-client";

interface MessagingState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>; // conversationId -> messages
  isLoadingConversations: boolean;
  isLoadingMessages: Record<string, boolean>;

  fetchConversations: (area: "candidate" | "employer") => Promise<void>;
  fetchMessages: (area: "candidate" | "employer", conversationId: string) => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
  appendMessage: (conversationId: string, message: Message) => void;
  markAsRead: (area: "candidate" | "employer", conversationId: string) => Promise<void>;
}

export const useMessagingStore = create<MessagingState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  isLoadingConversations: false,
  isLoadingMessages: {},

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
      const reversed = res.items.slice().reverse();
      set((state) => ({
        messages: { ...state.messages, [conversationId]: reversed },
      }));
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
}));
