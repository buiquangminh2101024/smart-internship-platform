import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";
import { validate } from "../../shared/middleware/validate";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { listCompaniesQuerySchema, rejectCompanySchema, setRequiresApprovalSchema } from "./companies.dto";

// Không có module `admin` riêng — hành động chỉ-Admin nằm trong module sở hữu
// resource (Company), guard bằng authorize("ADMIN") (xem PROJECT_STRUCTURE.md §5).
export function companiesRouter(container: AwilixContainer): Router {
  container.register({
    companiesService: asClass(CompaniesService).singleton(),
    companiesController: asClass(CompaniesController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<CompaniesController>("companiesController");
  const guard = [authenticate(container), authorize("ADMIN")];

  router.get("/companies", ...guard, validate(listCompaniesQuerySchema, "query"), (req, res, next) => {
    void resolveController().list(req, res, next);
  });
  router.get("/companies/public", (req, res, next) => {
    void resolveController().listPublic(req, res, next);
  });
  router.get("/companies/:id/public", (req, res, next) => {
    void resolveController().publicDetail(req, res, next);
  });
  router.get("/companies/:id", ...guard, (req, res, next) => {
    void resolveController().detail(req, res, next);
  });
  router.post("/companies/:id/verify", ...guard, (req, res, next) => {
    void resolveController().verify(req, res, next);
  });
  router.post("/companies/:id/reject", ...guard, validate(rejectCompanySchema), (req, res, next) => {
    void resolveController().reject(req, res, next);
  });
  router.patch("/companies/:id/requires-approval", ...guard, validate(setRequiresApprovalSchema), (req, res, next) => {
    void resolveController().setRequiresApproval(req, res, next);
  });

  return router;
}
