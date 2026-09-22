import { Router } from "express";
import { asClass, asValue, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { SkillEmbeddingProvider } from "../../infrastructure/skill-embedding-provider";
import { CandidateMatchProfileLoader } from "./candidate-match-profile.loader";
import { JobMatchProfileLoader } from "./job-match-profile.loader";
import { HYBRID_WEIGHTS_V2, RULE_WEIGHTS_V1 } from "./job-matching.config";
import { JobMatchingController } from "./job-matching.controller";
import { JobMatchingService } from "./job-matching.service";
import { MatchEmbeddingRepository } from "./match-embedding.repository";
import { MatchEmbeddingService } from "./match-embedding.service";
import { ScoringJobMatcher } from "./scoring-job-matcher";

export function jobMatchingRouter(container: AwilixContainer): Router {
  container.register({
    // Service giữ cả hai và chọn theo JOB_MATCHER_MODE + việc có cosine hay không.
    ruleJobMatcher: asValue(new ScoringJobMatcher(RULE_WEIGHTS_V1)),
    hybridJobMatcher: asValue(new ScoringJobMatcher(HYBRID_WEIGHTS_V2)),
    // skillEmbeddingService do skillsRouter đăng ký (mount trước router này trong main.ts).
    embeddingProvider: asClass(SkillEmbeddingProvider).singleton(),
    matchEmbeddingRepository: asClass(MatchEmbeddingRepository).singleton(),
    matchEmbeddingService: asClass(MatchEmbeddingService).singleton(),
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
