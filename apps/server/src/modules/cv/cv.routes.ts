import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { singleFileUpload } from "../../shared/middleware/upload";
import { CvController } from "./cv.controller";
import { CvService } from "./cv.service";

export function cvRouter(container: AwilixContainer): Router {
  container.register({
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

  router.post(
    "/candidates/me/cvs",
    ...candidateGuard,
    singleFileUpload("file", ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
    (req, res, next) => {
      void controller().upload(req, res, next);
    },
  );

  router.patch("/candidates/me/cvs/:id/default", ...candidateGuard, (req, res, next) => {
    void controller().setDefault(req, res, next);
  });

  router.delete("/candidates/me/cvs/:id", ...candidateGuard, (req, res, next) => {
    void controller().remove(req, res, next);
  });

  return router;
}
