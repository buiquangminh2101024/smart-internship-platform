import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";
import { ApplicationsRepository } from "./applications.repository";
import { ApplicationsService } from "./applications.service";
import { ApplicationsController } from "./applications.controller";
import {
  createApplicationSchema,
  updateApplicationEvaluationSchema,
  updateApplicationStatusSchema,
} from "./applications.dto";

export function applicationsRouter(container: AwilixContainer): Router {
  container.register({
    applicationsRepository: asClass(ApplicationsRepository).singleton(),
    applicationsService: asClass(ApplicationsService).singleton(),
    applicationsController: asClass(ApplicationsController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<ApplicationsController>("applicationsController");
  const candidateGuard = [authenticate(container), authorize("CANDIDATE")];
  const employerGuard = [authenticate(container), authorize("EMPLOYER")];

  // --- Candidate ---
  router.post("/candidate/applications", ...candidateGuard, validate(createApplicationSchema), (req, res, next) => {
    void resolveController().create(req, res, next);
  });
  
  router.get("/candidate/applications", ...candidateGuard, (req, res, next) => {
    void resolveController().listCandidate(req, res, next);
  });

  router.get("/candidate/applications/:id", ...candidateGuard, (req, res, next) => {
    void resolveController().getCandidateDetail(req, res, next);
  });

  router.patch("/candidate/applications/:id/cancel", ...candidateGuard, (req, res, next) => {
    void resolveController().cancel(req, res, next);
  });

  // --- Employer ---
  router.get("/employer/job-posts/:jobId/applications", ...employerGuard, (req, res, next) => {
    void resolveController().listEmployer(req, res, next);
  });

  router.get("/employer/applications/:id", ...employerGuard, (req, res, next) => {
    void resolveController().getEmployerDetail(req, res, next);
  });

  router.patch("/employer/applications/:id/status", ...employerGuard, validate(updateApplicationStatusSchema), (req, res, next) => {
    void resolveController().updateStatus(req, res, next);
  });

  router.patch("/employer/applications/:id/evaluation", ...employerGuard, validate(updateApplicationEvaluationSchema), (req, res, next) => {
    void resolveController().updateEvaluation(req, res, next);
  });

  return router;
}
