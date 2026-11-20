import { Router } from "express";
import { asClass, asFunction, asValue, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { optionalAuthenticate } from "../../shared/middleware/optional-authenticate";
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
import { BulkModerationBatches } from "./bulk-moderation-batches";
import { JobPostRepository } from "./job-post.repository";
import { JobPostsController } from "./job-posts.controller";
import { JobPostsService } from "./job-posts.service";
import { JobPostRequirementsService } from "./job-post-requirements.service";
import { JobQualityInputLoader } from "./job-quality-input.loader";
import { JobQualityService, type JobQualityCompanyTrigger } from "./job-quality.service";
import { PublishFollowUpService } from "./publish-follow-up.service";
import { RequirementExtractionRateLimitService } from "./requirement-extraction-rate-limit.service";
import type { AutoOutreachTrigger } from "../candidate-outreach/auto-outreach.service";
import type { JobScoredListener, MatchScoreService } from "../match-scores/match-score.service";
import {
  bulkApproveSchema,
  bulkRejectSchema,
  confirmRequirementsSchema,
  createJobPostSchema,
  employerJobPostListQuerySchema,
  jobPostSearchQuerySchema,
  moderationIdsQuerySchema,
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
    // AD-29 — chấm điểm chất lượng tin.
    jobQualityInputLoader: asClass(JobQualityInputLoader).singleton(),
    // Singleton bắt buộc: Map công ty đang chấm lại phải dùng chung cho mọi lối gọi.
    jobQualityService: asClass(JobQualityService).singleton(),
    // Q4 — job-reports (báo cáo mới, xử lý báo cáo) và retract gọi sau commit. Resolve service
    // lúc gọi ⇒ job-reports không phụ thuộc ngược vào job-posts khi dựng service.
    jobQualityCompanyTrigger: asValue<JobQualityCompanyTrigger>((companyId) => {
      void container.resolve<JobQualityService>("jobQualityService").triggerCompany(companyId);
    }),
    // AD-29 bước 7 — kết quả lô hàng loạt giữ trong bộ nhớ: singleton bắt buộc. asFunction vì
    // constructor nhận tuỳ chọn, không nhận cradle.
    bulkModerationBatches: asFunction(() => new BulkModerationBatches()).singleton(),
    // AD-29 bước 8 — hàng đợi việc sau lô duyệt: singleton bắt buộc (một lượt tại một thời điểm).
    // Các phụ thuộc resolve lúc gọi ⇒ không tạo vòng DI với match-scores / candidate-outreach /
    // job-alerts (các module đó đăng ký sau trong main.ts).
    publishFollowUpService: asFunction(
      ({ logger }: { logger: Logger }) =>
        new PublishFollowUpService({
          rescoreJob: (jobPostId, cache) =>
            container.resolve<MatchScoreService>("matchScoreService").rescoreJob(jobPostId, cache),
          createProfileCache: () => container.resolve<MatchScoreService>("matchScoreService").createCache(),
          jobScoredListener: (jobPostId) => container.resolve<JobScoredListener>("jobScoredListener")(jobPostId),
          autoOutreachTrigger: (companyId) => container.resolve<AutoOutreachTrigger>("autoOutreachTrigger")(companyId),
          logger,
        }),
    ).singleton(),
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
  // AD-29 bước 6 — id khớp bộ lọc (tối đa một lô) cho "Chọn tất cả tin trong vùng".
  // Khai báo trước `/admin/job-posts/:id` để "ids" không bị hiểu là id tin.
  router.get("/admin/job-posts/ids", ...adminGuard, validate(moderationIdsQuerySchema, "query"), (req, res, next) => {
    void resolveController().moderationIds(req, res, next);
  });
  // AD-29 bước 7 — duyệt / từ chối hàng loạt (1–50 tin) và kết quả lô (khi lô chạy quá thời gian chờ).
  router.post("/admin/job-posts/bulk-approve", ...adminGuard, validate(bulkApproveSchema), (req, res, next) => {
    void resolveController().bulkApprove(req, res, next);
  });
  router.post("/admin/job-posts/bulk-reject", ...adminGuard, validate(bulkRejectSchema), (req, res, next) => {
    void resolveController().bulkReject(req, res, next);
  });
  router.get("/admin/job-posts/bulk/:batchId", ...adminGuard, (req, res, next) => {
    void resolveController().bulkResult(req, res, next);
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
  // AD-29 — chấm lại điểm chất lượng một tin (mọi trạng thái); không đổi trạng thái tin.
  router.post("/admin/job-posts/:id/quality/rescore", ...adminGuard, (req, res, next) => {
    void resolveController().rescoreQuality(req, res, next);
  });

  // ─── Public (Guest) ────────────────────────────────────────────────────
  // Không guard — tin đã PUBLISHED là nội dung công khai (API_CONVENTIONS.md §11).
  // AD-26 (D5): đọc token nếu có — ứng viên nhận thêm điểm / đã lưu / đã ứng tuyển và
  // được sắp theo điểm; không token thì như khách. Token sai ⇒ 401 (optionalAuthenticate).
  router.get(
    "/job-posts",
    optionalAuthenticate(container),
    validate(jobPostSearchQuerySchema, "query"),
    (req, res, next) => {
      void resolveController().search(req, res, next);
    },
  );
  router.get("/job-posts/:id", (req, res, next) => {
    void resolveController().publicDetail(req, res, next);
  });

  return router;
}
