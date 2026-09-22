import { Router } from "express";
import { asClass, asFunction, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";
import type { Logger } from "../../shared/logger";
import type { RequirementExtractor } from "../../shared/ports/RequirementExtractor";
import { GeminiRequirementExtractor } from "../../infrastructure/gemini-requirement-extractor";
import { OpenRouterRequirementExtractor } from "../../infrastructure/openrouter-requirement-extractor";
import {
  FallbackRequirementExtractor,
  type RequirementExtractorTier,
} from "../../infrastructure/fallback-requirement-extractor";
import type { Cradle } from "../../container";
import { JobPostRepository } from "./job-post.repository";
import { JobPostsController } from "./job-posts.controller";
import { JobPostsService } from "./job-posts.service";
import { JobPostRequirementsService } from "./job-post-requirements.service";
import { RequirementExtractionRateLimitService } from "./requirement-extraction-rate-limit.service";
import {
  confirmRequirementsSchema,
  createJobPostSchema,
  employerJobPostListQuerySchema,
  jobPostSearchQuerySchema,
  moderationQueueQuerySchema,
  rejectJobPostSchema,
  retractJobPostSchema,
  updateJobPostSchema,
} from "./job-posts.dto";

// Không có module `admin` riêng — hành động duyệt/từ chối/thu hồi nằm trong
// module sở hữu resource (JobPost), guard bằng authorize("ADMIN"), giống
// companies.routes.ts (xem PROJECT_STRUCTURE.md §5).
export function jobPostsRouter(container: AwilixContainer): Router {
  container.register({
    // Job Matcher GĐ3: Gemini chính → Gemini model khác (cùng key) → OpenRouter
    // free, cùng thứ tự tầng với cvExtractor (cv.routes.ts).
    geminiRequirementExtractor: asClass(GeminiRequirementExtractor).singleton(),
    openRouterRequirementExtractor: asClass(OpenRouterRequirementExtractor).singleton(),
    requirementExtractor: asFunction(
      ({
        geminiRequirementExtractor,
        openRouterRequirementExtractor,
        config,
        logger,
      }: {
        geminiRequirementExtractor: RequirementExtractor;
        openRouterRequirementExtractor: RequirementExtractor;
        config: Cradle["config"];
        logger: Logger;
      }) => {
        const tiers: RequirementExtractorTier[] = [
          { name: `gemini:${config.GEMINI_MODEL}`, extractor: geminiRequirementExtractor },
        ];
        if (config.GEMINI_FALLBACK_MODEL) {
          tiers.push({
            name: `gemini:${config.GEMINI_FALLBACK_MODEL}`,
            extractor: new GeminiRequirementExtractor({ config, logger }, config.GEMINI_FALLBACK_MODEL),
          });
        }
        tiers.push({ name: "openrouter", extractor: openRouterRequirementExtractor });
        return new FallbackRequirementExtractor({ tiers, logger });
      },
    ).singleton(),
    requirementExtractionRateLimitService: asClass(RequirementExtractionRateLimitService).singleton(),
    jobPostRequirementsService: asClass(JobPostRequirementsService).singleton(),
    jobPostRepository: asClass(JobPostRepository).singleton(),
    jobPostsService: asClass(JobPostsService).singleton(),
    jobPostsController: asClass(JobPostsController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<JobPostsController>("jobPostsController");
  const employerGuard = [authenticate(container), authorize("EMPLOYER")];
  const adminGuard = [authenticate(container), authorize("ADMIN")];

  // ─── Employer ──────────────────────────────────────────────────────────
  // Đặt trước nhóm public vì "/job-posts/:id" sẽ nuốt mọi path con nếu khai
  // báo sau (Express match theo thứ tự đăng ký).
  router.get(
    "/employer/job-posts",
    ...employerGuard,
    validate(employerJobPostListQuerySchema, "query"),
    (req, res, next) => {
      void resolveController().listOwn(req, res, next);
    },
  );
  router.get("/employer/job-posts/stats", ...employerGuard, (req, res, next) => {
    void resolveController().ownStats(req, res, next);
  });
  router.get("/employer/job-posts/:id", ...employerGuard, (req, res, next) => {
    void resolveController().ownDetail(req, res, next);
  });
  router.post("/employer/job-posts", ...employerGuard, validate(createJobPostSchema), (req, res, next) => {
    void resolveController().create(req, res, next);
  });
  router.patch("/employer/job-posts/:id", ...employerGuard, validate(updateJobPostSchema), (req, res, next) => {
    void resolveController().update(req, res, next);
  });
  router.delete("/employer/job-posts/:id", ...employerGuard, (req, res, next) => {
    void resolveController().remove(req, res, next);
  });
  router.post("/employer/job-posts/:id/submit", ...employerGuard, (req, res, next) => {
    void resolveController().submit(req, res, next);
  });
  router.post("/employer/job-posts/:id/close", ...employerGuard, (req, res, next) => {
    void resolveController().close(req, res, next);
  });
  // Job Matcher GĐ3 — gọi LLM đồng bộ, có thể lâu khi rơi xuống tầng dự phòng
  // (nginx nới timeout riêng cho route này).
  router.post("/employer/job-posts/:id/requirements/extract", ...employerGuard, (req, res, next) => {
    void resolveController().extractRequirements(req, res, next);
  });
  router.put(
    "/employer/job-posts/:id/requirements",
    ...employerGuard,
    validate(confirmRequirementsSchema),
    (req, res, next) => {
      void resolveController().confirmRequirements(req, res, next);
    },
  );

  // ─── Admin ─────────────────────────────────────────────────────────────
  router.get("/admin/job-posts", ...adminGuard, validate(moderationQueueQuerySchema, "query"), (req, res, next) => {
    void resolveController().listForModeration(req, res, next);
  });
  router.get("/admin/job-posts/stats", ...adminGuard, (req, res, next) => {
    void resolveController().moderationStats(req, res, next);
  });
  router.get("/admin/job-posts/:id", ...adminGuard, (req, res, next) => {
    void resolveController().moderationDetail(req, res, next);
  });
  router.post("/admin/job-posts/:id/approve", ...adminGuard, (req, res, next) => {
    void resolveController().approve(req, res, next);
  });
  router.post("/admin/job-posts/:id/reject", ...adminGuard, validate(rejectJobPostSchema), (req, res, next) => {
    void resolveController().reject(req, res, next);
  });
  router.post("/admin/job-posts/:id/retract", ...adminGuard, validate(retractJobPostSchema), (req, res, next) => {
    void resolveController().retract(req, res, next);
  });

  // ─── Public (Guest) ────────────────────────────────────────────────────
  // Không guard — tin đã PUBLISHED là nội dung công khai (API_CONVENTIONS.md §11).
  router.get("/job-posts", validate(jobPostSearchQuerySchema, "query"), (req, res, next) => {
    void resolveController().search(req, res, next);
  });
  router.get("/job-posts/:id", (req, res, next) => {
    void resolveController().publicDetail(req, res, next);
  });

  return router;
}
