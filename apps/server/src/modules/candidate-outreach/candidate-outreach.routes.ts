import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";
import { AutoOutreachController } from "./auto-outreach.controller";
import { AutoOutreachRepository } from "./auto-outreach.repository";
import { AutoOutreachService } from "./auto-outreach.service";
import { CandidateOutreachController } from "./candidate-outreach.controller";
import {
  bulkInviteSchema,
  listCompanyInvitationsQuerySchema,
  respondOutreachInvitationSchema,
  updateCompanyOutreachSettingsSchema,
  updateJobAutoOutreachSchema,
  updateOutreachSettingsSchema,
} from "./candidate-outreach.dto";
import { CandidateOutreachRateLimitService } from "./candidate-outreach-rate-limit.service";
import { CandidateOutreachRepository } from "./candidate-outreach.repository";
import { CandidateOutreachService } from "./candidate-outreach.service";

/**
 * Tìm & mời ứng viên (B3, AD-15). Mount sau jobMatchingRouter trong main.ts:
 * service cần ruleJobMatcher/hybridJobMatcher/matchEmbeddingService/loader do
 * router đó đăng ký; subscriptionsService/messagingService/notificationsService
 * resolve lúc request nên không phụ thuộc thứ tự mount.
 */
export function candidateOutreachRouter(container: AwilixContainer): Router {
  container.register({
    candidateOutreachRepository: asClass(CandidateOutreachRepository).singleton(),
    candidateOutreachRateLimitService: asClass(CandidateOutreachRateLimitService).singleton(),
    candidateOutreachService: asClass(CandidateOutreachService).singleton(),
    candidateOutreachController: asClass(CandidateOutreachController).singleton(),
    // AD-23 — tự động mời theo tin (phụ thuộc candidateOutreachService, không ngược lại).
    autoOutreachRepository: asClass(AutoOutreachRepository).singleton(),
    autoOutreachService: asClass(AutoOutreachService).singleton(),
    autoOutreachController: asClass(AutoOutreachController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<CandidateOutreachController>("candidateOutreachController");
  const resolveAutoController = () => container.resolve<AutoOutreachController>("autoOutreachController");
  const candidateGuard = [authenticate(container), authorize("CANDIDATE")];
  const employerGuard = [authenticate(container), authorize("EMPLOYER")];

  // --- Employer (chủ tin) ---
  router.get("/employer/job-posts/:jobId/candidate-search", ...employerGuard, (req, res, next) => {
    void resolveController().searchCandidates(req, res, next);
  });

  router.get("/employer/job-posts/:jobId/invitations", ...employerGuard, (req, res, next) => {
    void resolveController().listSentInvitations(req, res, next);
  });

  router.post("/employer/job-posts/:jobId/candidates/:candidateId/invitations", ...employerGuard, (req, res, next) => {
    void resolveController().invite(req, res, next);
  });

  // AD-23 — "Mời tất cả gợi ý".
  router.post("/employer/job-posts/:jobId/invitations/bulk", ...employerGuard, validate(bulkInviteSchema), (req, res, next) => {
    void resolveController().bulkInvite(req, res, next);
  });

  // AD-23 — cài đặt tự động mời của tin (chỉ người đăng tin).
  router.get("/employer/job-posts/:jobId/auto-outreach", ...employerGuard, (req, res, next) => {
    void resolveAutoController().getJobSettings(req, res, next);
  });

  router.patch(
    "/employer/job-posts/:jobId/auto-outreach",
    ...employerGuard,
    validate(updateJobAutoOutreachSchema),
    (req, res, next) => {
      void resolveAutoController().updateJobSettings(req, res, next);
    },
  );

  // AD-23 mục 5 — tỉ lệ hạn mức dành cho tự động mời (chỉ quản trị viên công ty được sửa).
  router.get("/employer/outreach/settings", ...employerGuard, (req, res, next) => {
    void resolveAutoController().getCompanySettings(req, res, next);
  });

  router.patch(
    "/employer/outreach/settings",
    ...employerGuard,
    validate(updateCompanyOutreachSettingsSchema),
    (req, res, next) => {
      void resolveAutoController().updateCompanySettings(req, res, next);
    },
  );

  // --- Employer — trang "Lời mời" cấp công ty (docs/06-backend/outreach-hub/PLAN.md) ---
  router.get("/employer/outreach/summary", ...employerGuard, (req, res, next) => {
    void resolveController().getCompanySummary(req, res, next);
  });

  router.get(
    "/employer/outreach/invitations",
    ...employerGuard,
    validate(listCompanyInvitationsQuerySchema, "query"),
    (req, res, next) => {
      void resolveController().listCompanyInvitations(req, res, next);
    },
  );

  // --- Candidate ---
  router.get("/candidate/outreach-invitations", ...candidateGuard, (req, res, next) => {
    void resolveController().listForCandidate(req, res, next);
  });

  router.post(
    "/candidate/outreach-invitations/:id/respond",
    ...candidateGuard,
    validate(respondOutreachInvitationSchema),
    (req, res, next) => {
      void resolveController().respond(req, res, next);
    },
  );

  router.patch("/candidate/outreach-settings", ...candidateGuard, validate(updateOutreachSettingsSchema), (req, res, next) => {
    void resolveController().updateSettings(req, res, next);
  });

  return router;
}
