import { Router } from "express";
import { asClass, asFunction, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import type { Logger } from "../../shared/logger";
import type { ProfileInsightGenerator } from "../../shared/ports/ProfileInsightGenerator";
import { GeminiProfileInsightGenerator } from "../../infrastructure/gemini-profile-insight-generator";
import { OpenRouterProfileInsightGenerator } from "../../infrastructure/openrouter-profile-insight-generator";
import {
  FallbackProfileInsightGenerator,
  type ProfileInsightGeneratorTier,
} from "../../infrastructure/fallback-profile-insight-generator";
import type { Cradle } from "../../container";
import { CandidateInsightRateLimitService } from "./candidate-insight-rate-limit.service";
import { CandidateInsightsController } from "./candidate-insights.controller";
import { CandidateInsightsRepository } from "./candidate-insights.repository";
import { CandidateInsightsService } from "./candidate-insights.service";

export function candidateInsightsRouter(container: AwilixContainer): Router {
  container.register({
    // Cùng thứ tự tầng với cvExtractor/requirementExtractor: Gemini chính →
    // Gemini model khác (cùng key) → OpenRouter free.
    geminiProfileInsightGenerator: asClass(GeminiProfileInsightGenerator).singleton(),
    openRouterProfileInsightGenerator: asClass(OpenRouterProfileInsightGenerator).singleton(),
    profileInsightGenerator: asFunction(
      ({
        geminiProfileInsightGenerator,
        openRouterProfileInsightGenerator,
        config,
        logger,
      }: {
        geminiProfileInsightGenerator: ProfileInsightGenerator;
        openRouterProfileInsightGenerator: ProfileInsightGenerator;
        config: Cradle["config"];
        logger: Logger;
      }) => {
        const tiers: ProfileInsightGeneratorTier[] = [
          { name: `gemini:${config.GEMINI_MODEL}`, generator: geminiProfileInsightGenerator },
        ];
        // Để trống GEMINI_FALLBACK_MODEL trong .env thì bỏ tầng này.
        if (config.GEMINI_FALLBACK_MODEL) {
          tiers.push({
            name: `gemini:${config.GEMINI_FALLBACK_MODEL}`,
            generator: new GeminiProfileInsightGenerator({ config, logger }, config.GEMINI_FALLBACK_MODEL),
          });
        }
        tiers.push({ name: "openrouter", generator: openRouterProfileInsightGenerator });
        return new FallbackProfileInsightGenerator({ tiers, logger });
      },
    ).singleton(),
    candidateInsightRateLimitService: asClass(CandidateInsightRateLimitService).singleton(),
    candidateInsightsRepository: asClass(CandidateInsightsRepository).singleton(),
    // jobRecommendationService/candidateMatchProfileLoader do jobMatchingRouter đăng ký
    // (mount trước router này trong main.ts).
    candidateInsightsService: asClass(CandidateInsightsService).singleton(),
    candidateInsightsController: asClass(CandidateInsightsController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<CandidateInsightsController>("candidateInsightsController");
  const candidateGuard = [authenticate(container), authorize("CANDIDATE")];

  router.get("/candidate/profile/insights", ...candidateGuard, (req, res, next) => {
    void resolveController().getInsight(req, res, next);
  });

  router.post("/candidate/profile/insights", ...candidateGuard, (req, res, next) => {
    void resolveController().generateInsight(req, res, next);
  });

  return router;
}
