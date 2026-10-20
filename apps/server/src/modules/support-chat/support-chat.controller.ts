import type { NextFunction, Request, Response } from "express";
import type { ApiResponse, SupportChatEvent, SupportChatSuggestion } from "@sip/shared-types";
import type { Logger } from "../../shared/logger";
import type { FaqViewer } from "./faq-knowledge-base";
import type { SupportChatRequestInput } from "./support-chat.dto";
import type { SupportChatService } from "./support-chat.service";

export class SupportChatController {
  private readonly supportChatService: SupportChatService;
  private readonly logger: Logger;

  constructor({ supportChatService, logger }: { supportChatService: SupportChatService; logger: Logger }) {
    this.supportChatService = supportChatService;
    this.logger = logger;
  }

  suggestions = (req: Request, res: Response): void => {
    const body: ApiResponse<SupportChatSuggestion[]> = {
      success: true,
      data: this.supportChatService.suggestions(viewerOf(req)),
    };
    res.json(body);
  };

  /**
   * SSE trên POST (PLAN mục "Response SSE"). Chỉ mở stream khi service trả sự kiện đầu tiên —
   * lỗi trước đó (429, …) đi qua errorHandler thành JSON thường.
   */
  chat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const input = req.body as SupportChatRequestInput;
    // `res` chứ không phải `req`: req phát "close" ngay khi express.json đọc xong body.
    const abort = new AbortController();
    const onClose = () => {
      if (!res.writableFinished) abort.abort(new Error("Client disconnected"));
    };
    res.on("close", onClose);

    let opened = false;
    try {
      const events = this.supportChatService.chat(
        {
          message: input.message,
          history: input.history,
          faqId: input.faqId,
          viewer: viewerOf(req),
          requester: req.user ? { kind: "user", userId: req.user.id } : { kind: "guest", ip: req.ip ?? "unknown" },
        },
        abort.signal,
      );
      for await (const event of events) {
        // Thoát vòng ⇒ generator chạy finally ⇒ request LLM bị huỷ theo abort.signal.
        if (abort.signal.aborted) break;
        if (!opened) {
          openEventStream(res);
          opened = true;
        }
        writeEvent(res, event);
      }
      res.end();
    } catch (error) {
      if (!opened) {
        next(error);
        return;
      }
      this.logger.error("Support chat failed after stream opened", {
        error: error instanceof Error ? error.message : String(error),
      });
      writeEvent(res, { type: "error", code: "LLM_INTERRUPTED", message: "Đã có lỗi xảy ra. Bạn thử gửi lại câu hỏi nhé." });
      res.end();
    } finally {
      res.off("close", onClose);
    }
  };
}

/** Admin được xử lý như khách — chỉ FAQ (PLAN mục "Xác thực tuỳ chọn"). */
function viewerOf(req: Request): FaqViewer {
  if (req.user?.role === "CANDIDATE") return "candidate";
  if (req.user?.role === "EMPLOYER") return "employer";
  return "guest";
}

function openEventStream(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  // Nginx không gom response (đã có proxy_buffering off cho route này, header này phòng khi thiếu).
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.socket?.setNoDelay(true);
}

function writeEvent(res: Response, event: SupportChatEvent): void {
  const { type, ...data } = event;
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}
