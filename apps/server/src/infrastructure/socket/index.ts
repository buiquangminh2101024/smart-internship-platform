import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import type { AwilixContainer } from "awilix";
import jwt from "jsonwebtoken";
import { config } from "../../shared/config/env";
import { logger } from "../../shared/logger";
import type { MessagingService } from "../../modules/messaging/messaging.service";
import type { TokenBlacklist } from "../../shared/ports/TokenBlacklist";
import type { AccountSuspensionStore } from "../../shared/ports/AccountSuspensionStore";
import type { SessionRevocationStore } from "../../shared/ports/SessionRevocationStore";
import { checkAccessTokenState } from "../../modules/auth/session-revocation.service";

export function setupSocketIo(httpServer: HttpServer, container: AwilixContainer) {
  const io = new SocketIOServer(httpServer, {
    path: "/api/socket.io",
    cors: { origin: config.CORS_ORIGIN },
  });

  // Lỗi tầng engine (handshake/transport) chỉ log, không để lan ra process.
  io.engine.on("connection_error", (err: { code: number; message: string }) => {
    logger.warn("Socket.IO connection_error", { code: err.code, message: err.message });
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const tokenString = token.startsWith("Bearer ") ? token.slice(7) : token;
      
      const decoded = jwt.verify(tokenString, config.JWT_ACCESS_SECRET) as any;
      const jti = decoded.jti;

      // Token bị thu hồi, tài khoản bị khoá (AD-17), token cấp trước mốc "đăng
      // xuất mọi thiết bị" (AD-18) đều không được mở kết nối mới. Cùng hàm với
      // authenticate: 3 khoá hỏi cùng lúc, xét theo đúng thứ tự cũ.
      const rejection = await checkAccessTokenState(
        {
          tokenBlacklist: container.resolve<TokenBlacklist>("tokenBlacklist"),
          accountSuspensionStore: container.resolve<AccountSuspensionStore>("accountSuspensionStore"),
          sessionRevocationStore: container.resolve<SessionRevocationStore>("sessionRevocationStore"),
        },
        { jti, sub: decoded.sub, iat: decoded.iat ?? 0 },
      );
      if (rejection === "TOKEN_REVOKED") {
        return next(new Error("Authentication error: Token revoked"));
      }
      if (rejection === "ACCOUNT_SUSPENDED") {
        return next(new Error("Authentication error: Account suspended"));
      }
      if (rejection === "SESSION_REVOKED") {
        return next(new Error("Authentication error: Session revoked"));
      }

      socket.data.user = {
        id: decoded.sub,
        role: decoded.role,
        jti,
        exp: decoded.exp,
      };
      
      next();
    } catch (error) {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    const userId = user.id;

    socket.join(`user:${userId}`);
    logger.info(`Socket connected for user ${userId}`);

    socket.on("send_message", async (payload: { conversationId: string; content: string }) => {
      try {
        const messagingService = container.resolve<MessagingService>("messagingService");
        const { message, conversation } = await messagingService.saveMessage(userId, user.role, payload.conversationId, payload.content);
        
        const candidateUserId = conversation.candidate.userId;
        const employerUserId = conversation.employer.userId;

        io.to(`user:${candidateUserId}`).to(`user:${employerUserId}`).emit("new_message", message);
        await messagingService.notifyRecipient(conversation, userId, message);
      } catch (error: any) {
        logger.error(`Socket message error: ${error.message}`);
        // `conversationId` + `code` để frontend khoá đúng hội thoại khi bị chặn gửi.
        socket.emit("error", { message: error.message, code: error.code, conversationId: payload?.conversationId });
      }
    });

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected for user ${userId}`);
    });
  });

  return io;
}
