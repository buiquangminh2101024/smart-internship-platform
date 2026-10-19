import { Router, type RequestHandler } from "express";
import { asClass, asFunction, type AwilixContainer } from "awilix";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import { optionalAuthenticate } from "../../shared/middleware/optional-authenticate";
import { validate } from "../../shared/middleware/validate";
import type { SupportChatResponder } from "../../shared/ports/SupportChatResponder";
import { FakeSupportChatResponder } from "../../infrastructure/fake-support-chat-responder";
import {
  FallbackSupportChatResponder,
  type SupportChatResponderTier,
} from "../../infrastructure/fallback-support-chat-responder";
import { GeminiSupportChatResponder } from "../../infrastructure/gemini-support-chat-responder";
import { OpenRouterSupportChatResponder } from "../../infrastructure/openrouter-support-chat-responder";
import type { Cradle } from "../../container";
import { FaqKnowledgeBase } from "./faq-knowledge-base";
import { SupportChatAnswerCache } from "./support-chat-answer-cache";
import { SupportChatRateLimitService } from "./support-chat-rate-limit.service";
import { SupportChatController } from "./support-chat.controller";
import { supportChatRequestSchema } from "./support-chat.dto";
import { SupportChatService } from "./support-chat.service";

// Chatbot hỗ trợ (AD-21, docs/06-backend/support-chatbot/PLAN.md). Module riêng, không đụng
// module `support` (/support/contact).
export function supportChatRouter(container: AwilixContainer): Router {
  container.register({
    // embeddingProvider do jobMatchingRouter đăng ký (mount trước router này trong main.ts) —
    // cùng instance model với Job Matcher, không nạp model lần hai (D7).
    faqKnowledgeBase: asClass(FaqKnowledgeBase).singleton(),
    supportChatAnswerCache: asClass(SupportChatAnswerCache).singleton(),
    supportChatRateLimitService: asClass(SupportChatRateLimitService).singleton(),
    supportChatResponder: asFunction(
      ({ config, logger }: { config: Cradle["config"]; logger: Logger }): SupportChatResponder | null => {
        if (config.SUPPORT_CHAT_LLM_PROVIDER === "fake") {
          logger.warn("Support chat uses the FAKE LLM responder (SUPPORT_CHAT_LLM_PROVIDER=fake)");
          return new FakeSupportChatResponder({ config });
        }
        // SUPPORT_CHAT_MODEL (mặc định bản flash-lite) → GEMINI_MODEL → OpenRouter. Thiếu key
        // của tầng nào thì bỏ tầng đó, như chuỗi tầng của candidate-insights.
        const tiers: SupportChatResponderTier[] = [];
        const primaryModel = config.SUPPORT_CHAT_MODEL || config.GEMINI_FALLBACK_MODEL || config.GEMINI_MODEL;
        if (config.GEMINI_API_KEY) {
          tiers.push({ name: "gemini-primary", responder: new GeminiSupportChatResponder({ config, logger }, primaryModel) });
          if (config.GEMINI_MODEL !== primaryModel) {
            tiers.push({
              name: "gemini-secondary",
              responder: new GeminiSupportChatResponder({ config, logger }, config.GEMINI_MODEL),
            });
          }
        }
        if (config.OPENROUTER_API_KEY) {
          tiers.push({ name: "openrouter", responder: new OpenRouterSupportChatResponder({ config, logger }) });
        }
        if (tiers.length === 0) {
          logger.warn("Support chat has no LLM tier configured — tier 4 will always answer with the fallback message");
          return null;
        }
        logger.info("Support chat LLM tiers", { tiers: tiers.map((tier) => tier.name), primaryModel });
        return new FallbackSupportChatResponder({ tiers, logger });
      },
    ).singleton(),
    supportChatService: asClass(SupportChatService).singleton(),
    supportChatController: asClass(SupportChatController).singleton(),
  });

  const config = container.resolve<Cradle["config"]>("config");
  // Dựng service ngay lúc mount: file FAQ sai định dạng phải làm hỏng khởi động, và log chuỗi
  // tầng LLM hiện ra từ đầu. Vector FAQ và model embedding thì vẫn nạp lười.
  if (config.SUPPORT_CHAT_ENABLED) container.resolve<SupportChatService>("supportChatService");

  const router = Router();
  const resolveController = () => container.resolve<SupportChatController>("supportChatController");
  // Đặt trước optionalAuthenticate: tắt cờ thì trả 503 ngay, không tốn lượt kiểm token.
  const enabled: RequestHandler = (_req, _res, next) => {
    next(config.SUPPORT_CHAT_ENABLED ? undefined : new AppError(503, "Trợ lý hỗ trợ đang tạm tắt.", "SUPPORT_CHAT_DISABLED"));
  };

  router.get("/support/chat/suggestions", enabled, optionalAuthenticate(container), (req, res) => {
    resolveController().suggestions(req, res);
  });

  router.post("/support/chat", enabled, optionalAuthenticate(container), validate(supportChatRequestSchema), (req, res, next) => {
    void resolveController().chat(req, res, next);
  });

  return router;
}
