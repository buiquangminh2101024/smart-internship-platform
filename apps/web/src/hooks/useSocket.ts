import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useMessagingStore } from "../stores/messaging-store";
import { authStoreForArea } from "../stores/auth-store";

export function useSocket(area: "candidate" | "employer") {
  const socketRef = useRef<Socket | null>(null);
  const { appendMessage } = useMessagingStore();
  const token = authStoreForArea(area).getState().accessToken;

  useEffect(() => {
    if (!token) return;

    // Connect to the backend server origin
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";
    const origin = new URL(apiUrl).origin; // e.g., http://localhost:4000
    
    const socket = io(origin, {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      console.log("Socket connected");
    });

    socket.on("new_message", (message: any) => {
      appendMessage(message.conversationId, message);
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connect_error", err.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [token, appendMessage, area]);

  const sendMessage = (conversationId: string, content: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("send_message", { conversationId, content });
    } else {
      console.error("Socket not connected");
    }
  };

  return { sendMessage };
}
