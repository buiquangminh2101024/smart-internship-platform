import { Router } from "express";
import { asClass, asValue, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { CandidateMatchProfileLoader } from "./candidate-match-profile.loader";
import { JobMatchProfileLoader } from "./job-match-profile.loader";
import { RULE_WEIGHTS_V1 } from "./job-matching.config";
import { JobMatchingController } from "./job-matching.controller";
import { JobMatchingService } from "./job-matching.service";
import { ScoringJobMatcher } from "./scoring-job-matcher";

export function jobMatchingRouter(container: AwilixContainer): Router {
  container.register({
    // GĐ1 chỉ có cấu hình rule; GĐ2 chọn cấu hình theo JOB_MATCHER_MODE.
    jobMatcher: asValue(new ScoringJobMatcher(RULE_WEIGHTS_V1)),
    candidateMatchProfileLoader: asClass(CandidateMatchProfileLoader).singleton(),
    jobMatchProfileLoader: asClass(JobMatchProfileLoader).singleton(),
    jobMatchingService: asClass(JobMatchingService).singleton(),
    jobMatchingController: asClass(JobMatchingController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<JobMatchingController>("jobMatchingController");
  const candidateGuard = [authenticate(container), authorize("CANDIDATE")];
  const employerGuard = [authenticate(container), authorize("EMPLOYER")];

  // --- Candidate ---
  router.get("/candidate/job-posts/:id/match", ...candidateGuard, (req, res, next) => {
    void resolveController().matchForCandidate(req, res, next);
  });

  // --- Employer ---
  router.get("/employer/job-posts/:jobId/application-matches", ...employerGuard, (req, res, next) => {
    void resolveController().listApplicationMatches(req, res, next);
  });

  router.get("/employer/applications/:id/match", ...employerGuard, (req, res, next) => {
    void resolveController().matchForApplication(req, res, next);
  });

  return router;
}
