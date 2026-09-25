import { Router } from "express";
import { asClass, asFunction, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { singleFileUpload } from "../../shared/middleware/upload";
import type { Logger } from "../../shared/logger";
import type { CvExtractor } from "../../shared/ports/CvExtractor";
import { GeminiCvExtractor } from "../../infrastructure/gemini-cv-extractor";
import { OpenRouterCvExtractor } from "../../infrastructure/openrouter-cv-extractor";
import { FallbackCvExtractor, type CvExtractorTier } from "../../infrastructure/fallback-cv-extractor";
import type { Cradle } from "../../container";
import { CvController } from "./cv.controller";
import { ALLOWED_CV_MIME_TYPES, CvService } from "./cv.service";
import { CvExtractionPipelineService } from "./cv-extraction-pipeline.service";
import { CvExtractionRateLimitService } from "./cv-extraction-rate-limit.service";

export function cvRouter(container: AwilixContainer): Router {
  container.register({
    // Thứ tự tầng: Gemini chính → Gemini model khác (cùng key) → OpenRouter
    // free. Đổi thứ tự/thêm tầng chỉ cần sửa ở đây
    // (docs/06-backend/cv-ai-extraction-phase1/PLAN.md Phần 2).
    geminiCvExtractor: asClass(GeminiCvExtractor).singleton(),
    openRouterCvExtractor: asClass(OpenRouterCvExtractor).singleton(),
    cvExtractor: asFunction(
      ({
        geminiCvExtractor,
        openRouterCvExtractor,
        config,
        logger,
      }: {
        geminiCvExtractor: CvExtractor;
        openRouterCvExtractor: CvExtractor;
        config: Cradle["config"];
        logger: Logger;
      }) => {
        const tiers: CvExtractorTier[] = [{ name: `gemini:${config.GEMINI_MODEL}`, extractor: geminiCvExtractor }];
        // Để trống GEMINI_FALLBACK_MODEL trong .env thì bỏ tầng này.
        if (config.GEMINI_FALLBACK_MODEL) {
          tiers.push({
            name: `gemini:${config.GEMINI_FALLBACK_MODEL}`,
            extractor: new GeminiCvExtractor({ config, logger }, config.GEMINI_FALLBACK_MODEL),
          });
        }
        tiers.push({ name: "openrouter", extractor: openRouterCvExtractor });
        return new FallbackCvExtractor({ tiers, logger });
      },
    ).singleton(),
    cvExtractionRateLimitService: asClass(CvExtractionRateLimitService).singleton(),
    cvExtractionPipelineService: asClass(CvExtractionPipelineService).singleton(),
    cvService: asClass(CvService).singleton(),
    cvController: asClass(CvController).singleton(),
  });

  const router = Router();
  const controller = () => container.resolve<CvController>("cvController");
  const candidateGuard = [authenticate(container), authorize("CANDIDATE")];

  router.get("/candidates/me/cvs", ...candidateGuard, (req, res, next) => {
    void controller().list(req, res, next);
  });

  router.get("/candidates/me/cvs/:id", ...candidateGuard, (req, res, next) => {
    void controller().getOne(req, res, next);
  });

  router.post("/candidates/me/cvs", ...candidateGuard, singleFileUpload("file", ALLOWED_CV_MIME_TYPES), (req, res, next) => {
    void controller().upload(req, res, next);
  });

  router.post("/candidates/me/cvs/builder", ...candidateGuard, singleFileUpload("file", ALLOWED_CV_MIME_TYPES), (req, res, next) => {
    void controller().saveBuilderCv(req, res, next);
  });

  router.post("/candidates/me/cvs/:id/extract", ...candidateGuard, (req, res, next) => {
    void controller().extract(req, res, next);
  });

  router.patch("/candidates/me/cvs/:id/default", ...candidateGuard, (req, res, next) => {
    void controller().setDefault(req, res, next);
  });

  router.delete("/candidates/me/cvs/:id", ...candidateGuard, (req, res, next) => {
    void controller().remove(req, res, next);
  });

  return router;
}
