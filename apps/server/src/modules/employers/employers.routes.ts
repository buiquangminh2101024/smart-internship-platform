import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { EmployersController } from "./employers.controller";
import { EmployersService } from "./employers.service";
import { EmployerRepository } from "./employer.repository";
import { CompanyVerificationService } from "./company-verification.service";
import { validate } from "../../shared/middleware/validate";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { singleFileUpload } from "../../shared/middleware/upload";
import {
  createCompanySchema,
  joinCompanySchema,
  updateEmployerProfileSchema,
  verificationCheckSchema,
} from "./employers.dto";

export function employersRouter(container: AwilixContainer): Router {
  container.register({
    employerRepository: asClass(EmployerRepository).singleton(),
    companyVerificationService: asClass(CompanyVerificationService).singleton(),
    employersService: asClass(EmployersService).singleton(),
    employersController: asClass(EmployersController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<EmployersController>("employersController");
  const guard = [authenticate(container), authorize("EMPLOYER")];

  router.get("/employers/me", ...guard, (req, res, next) => {
    void resolveController().me(req, res, next);
  });
  router.patch("/employers/me", ...guard, validate(updateEmployerProfileSchema), (req, res, next) => {
    void resolveController().updateMe(req, res, next);
  });
  router.post(
    "/employers/company/verification-check",
    ...guard,
    validate(verificationCheckSchema),
    (req, res, next) => {
      void resolveController().checkVerification(req, res, next);
    },
  );
  // Multipart — businessLicense là optional (chỉ bắt buộc khi cần manual
  // review, kiểm tra trong EmployersService, không phải ở tầng route).
  router.post(
    "/employers/company",
    ...guard,
    singleFileUpload("businessLicense"),
    validate(createCompanySchema),
    (req, res, next) => {
      void resolveController().createCompany(req, res, next);
    },
  );
  router.post("/employers/company/join", ...guard, validate(joinCompanySchema), (req, res, next) => {
    void resolveController().joinCompany(req, res, next);
  });
  router.post("/employers/invite-code", ...guard, (req, res, next) => {
    void resolveController().issueInviteCode(req, res, next);
  });

  return router;
}
