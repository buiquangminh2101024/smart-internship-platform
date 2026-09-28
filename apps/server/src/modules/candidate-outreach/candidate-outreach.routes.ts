import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";
import { CandidateOutreachController } from "./candidate-outreach.controller";
import { respondOutreachInvitationSchema, updateOutreachSettingsSchema } from "./candidate-outreach.dto";
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
  });

  const router = Router();
  const resolveController = () => container.resolve<CandidateOutreachController>("candidateOutreachController");
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
