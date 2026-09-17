import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { EmployersController } from "./employers.controller";
import { EmployersService } from "./employers.service";
import { CompanyVerificationService } from "./company-verification.service";
import { validate } from "../../shared/middleware/validate";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { multiFileUpload } from "../../shared/middleware/upload";
import {
  createCompanySchema,
  joinCompanySchema,
  updateEmployerProfileSchema,
  verificationCheckSchema,
} from "./employers.dto";

const COMPANY_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

// employerRepository đăng ký tập trung ở container.ts (dùng chéo bởi
// subscriptions từ Phase 5 — xem employer.repository.ts), không đăng ký lại ở đây.
export function employersRouter(container: AwilixContainer): Router {
  container.register({
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
  // Multipart — tính bắt buộc của từng file (license chỉ khi cần manual
  // review, logo/banner khi công ty chưa có ảnh) kiểm tra trong EmployersService.
  router.post(
    "/employers/company",
    ...guard,
    multiFileUpload({
      businessLicense: ["image/jpeg", "image/png", "application/pdf"],
      logo: COMPANY_IMAGE_MIME_TYPES,
      banner: COMPANY_IMAGE_MIME_TYPES,
    }),
    validate(createCompanySchema),
    (req, res, next) => {
      void resolveController().createCompany(req, res, next);
    },
  );
  // Chỉ isCompanyAdmin được đổi ảnh — kiểm tra trong EmployersService.
  router.patch(
    "/employers/company/branding",
    ...guard,
    multiFileUpload({ logo: COMPANY_IMAGE_MIME_TYPES, banner: COMPANY_IMAGE_MIME_TYPES }),
    (req, res, next) => {
      void resolveController().updateBranding(req, res, next);
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
