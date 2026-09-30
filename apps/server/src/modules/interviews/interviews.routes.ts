import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";
import { InterviewsController } from "./interviews.controller";
import {
  batchScheduleInterviewsSchema,
  cancelInterviewSchema,
  listAwaitingScheduleQuerySchema,
  listEmployerInterviewsQuerySchema,
  rescheduleInterviewSchema,
  scheduleInterviewSchema,
} from "./interviews.dto";
import { InterviewsRepository } from "./interviews.repository";
import { InterviewsService } from "./interviews.service";

/**
 * Lịch phỏng vấn (AD-16 M2, D12). interviewsRepository được ApplicationsService
 * dùng (huỷ lịch khi hồ sơ có kết quả) và interviewsService được dashboard dùng —
 * cả hai resolve lúc có request nên thứ tự mount không ảnh hưởng.
 */
export function interviewsRouter(container: AwilixContainer): Router {
  container.register({
    interviewsRepository: asClass(InterviewsRepository).singleton(),
    interviewsService: asClass(InterviewsService).singleton(),
    interviewsController: asClass(InterviewsController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<InterviewsController>("interviewsController");
  const candidateGuard = [authenticate(container), authorize("CANDIDATE")];
  const employerGuard = [authenticate(container), authorize("EMPLOYER")];

  // --- Employer ---
  router.post(
    "/employer/applications/:id/interviews",
    ...employerGuard,
    validate(scheduleInterviewSchema),
    (req, res, next) => {
      void resolveController().schedule(req, res, next);
    },
  );

  // Đăng ký trước "/employer/interviews/:id" để "batch"/"awaiting" không bị hiểu là id.
  router.post("/employer/interviews/batch", ...employerGuard, validate(batchScheduleInterviewsSchema), (req, res, next) => {
    void resolveController().scheduleBatch(req, res, next);
  });

  router.get(
    "/employer/interviews/awaiting",
    ...employerGuard,
    validate(listAwaitingScheduleQuerySchema, "query"),
    (req, res, next) => {
      void resolveController().listAwaiting(req, res, next);
    },
  );

  router.get("/employer/interviews", ...employerGuard, validate(listEmployerInterviewsQuerySchema, "query"), (req, res, next) => {
    void resolveController().listEmployer(req, res, next);
  });

  router.patch("/employer/interviews/:id", ...employerGuard, validate(rescheduleInterviewSchema), (req, res, next) => {
    void resolveController().reschedule(req, res, next);
  });

  router.post("/employer/interviews/:id/cancel", ...employerGuard, validate(cancelInterviewSchema), (req, res, next) => {
    void resolveController().cancel(req, res, next);
  });

  // --- Candidate ---
  router.get("/candidate/interviews", ...candidateGuard, (req, res, next) => {
    void resolveController().listCandidate(req, res, next);
  });

  return router;
}
