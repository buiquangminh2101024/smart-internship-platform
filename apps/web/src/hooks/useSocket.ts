import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { Message, MessageNotificationEvent, NotificationEvent } from "@sip/shared-types";
import { useMessagingStore } from "../stores/messaging-store";
import { authStoreForArea } from "../stores/auth-store";
import type { MessagingArea } from "../lib/messaging";
import { refreshAccessTokenShared } from "../lib/api-client";

export type SocketStatus = "idle" | "connecting" | "connected" | "disconnected";

export interface SocketHandlers {
  /** `notification:new` — thông báo nghiệp vụ Phase 10 (NotificationBell). */
  onNotification?: (event: NotificationEvent) => void;
  /** `notification:new_message` — dòng ghim tin nhắn + browser notification. */
  onMessageNotification?: (event: MessageNotificationEvent) => void;
}

/**
 * Mở đúng 1 kết nối Socket.IO cho một area. Chỉ SocketProvider gọi hook này —
 * nơi khác lấy kết nối qua `useSocket()` (components/realtime/SocketProvider).
 */
export function useSocketConnection(area: MessagingArea, handlers: SocketHandlers, enabled = true) {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  // Chỉ set trong callback của socket; null = đang kết nối lần đầu.
  const [connState, setConnState] = useState<"connected" | "disconnected" | null>(null);
  const appendMessage = useMessagingStore((s) => s.appendMessage);
  const hasToken = authStoreForArea(area)((s) => Boolean(s.accessToken));
  const shouldConnect = enabled && hasToken;
  const status: SocketStatus = !shouldConnect ? "idle" : (connState ?? "connecting");

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!shouldConnect) return;

    // Connect to the backend server origin
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";
    const origin = new URL(apiUrl).origin;

    const socket = io(origin, {
      path: "/api/socket.io",
      // Đọc token mỗi lần (re)connect — access token có thể đã được refresh.
      auth: (cb) => cb({ token: authStoreForArea(area).getState().accessToken }),
      transports: ["websocket"],
    });

    // Middleware auth của server từ chối (token hết hạn — thường gặp khi mở lại
    // trang sau >15 phút) thì socket.io KHÔNG tự thử lại. Refresh token 1 lần
    // cho mỗi đợt lỗi; token mới vào store sẽ kích hoạt kết nối lại bên dưới.
    let refreshAttempted = false;

    socket.on("connect", () => {
      refreshAttempted = false;
      setConnState("connected");
    });

    socket.on("new_message", (message: Message) => {
      appendMessage(message.conversationId, message);
    });

    socket.on("notification:new", (event: NotificationEvent) => {
      handlersRef.current.onNotification?.(event);
    });

    socket.on("notification:new_message", (event: MessageNotificationEvent) => {
      handlersRef.current.onMessageNotification?.(event);
    });

    socket.on("connect_error", (err) => {
      // warn thay vì error: lỗi đã được xử lý (UI báo ở trang chat), không cần
      // bật overlay lỗi của Next dev.
      console.warn("Socket connect_error", err.message);
      setConnState("disconnected");
      if (socket.active || refreshAttempted) return; // lỗi mạng: socket.io tự thử lại
      refreshAttempted = true;
      void refreshAccessTokenShared(area);
    });

    // Token đổi (refresh từ đây hoặc từ apiFetch) mà socket đang không kết nối
    // → kết nối lại; `auth` callback ở trên sẽ đọc token mới.
    const unsubscribe = authStoreForArea(area).subscribe((state, prev) => {
      if (state.accessToken && state.accessToken !== prev.accessToken && !socket.connected) {
        socket.connect();
      }
    });

    socket.on("disconnect", (reason) => {
      // Chủ động ngắt (unmount/đăng xuất) thì không coi là mất kết nối.
      if (reason !== "io client disconnect") setConnState("disconnected");
    });

    socketRef.current = socket;

    return () => {
      unsubscribe();
      socketRef.current = null;
      socket.disconnect();
      setConnState(null);
    };
  }, [shouldConnect, appendMessage, area]);

  /** false = chưa gửi được (mất kết nối) — nơi gọi giữ lại nội dung để gửi lại. */
  const sendMessage = useCallback((conversationId: string, content: string): boolean => {
    if (!socketRef.current?.connected) return false;
    socketRef.current.emit("send_message", { conversationId, content });
    return true;
  }, []);

  return { status, sendMessage };
}
