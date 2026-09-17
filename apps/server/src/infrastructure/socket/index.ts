import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import type { AwilixContainer } from "awilix";
import jwt from "jsonwebtoken";
import { config } from "../../shared/config/env";
import { logger } from "../../shared/logger";
import type { MessagingService } from "../../modules/messaging/messaging.service";
import type { TokenBlacklist } from "../../shared/ports/TokenBlacklist";

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

      const tokenBlacklist = container.resolve<TokenBlacklist>("tokenBlacklist");
      const isBlacklisted = await tokenBlacklist.isRevoked(jti);
      
      if (isBlacklisted) {
        return next(new Error("Authentication error: Token revoked"));
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
