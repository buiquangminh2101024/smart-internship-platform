import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { SavedJobsController } from "./saved-jobs.controller";
import { SavedJobsService } from "./saved-jobs.service";

export function savedJobsRouter(container: AwilixContainer): Router {
  container.register({
    savedJobsService: asClass(SavedJobsService).singleton(),
    savedJobsController: asClass(SavedJobsController).singleton(),
  });

  const router = Router();
  const controller = () => container.resolve<SavedJobsController>("savedJobsController");
  const candidateGuard = [authenticate(container), authorize("CANDIDATE")];

  router.get("/candidates/me/saved-jobs", ...candidateGuard, (req, res, next) => {
    void controller().list(req, res, next);
  });

  router.get("/candidates/me/saved-jobs/:jobPostId", ...candidateGuard, (req, res, next) => {
    void controller().check(req, res, next);
  });

  router.post("/candidates/me/saved-jobs/:jobPostId", ...candidateGuard, (req, res, next) => {
    void controller().save(req, res, next);
  });

  router.delete("/candidates/me/saved-jobs/:jobPostId", ...candidateGuard, (req, res, next) => {
    void controller().unsave(req, res, next);
  });

  return router;
}
