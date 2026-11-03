import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { singleFileUpload } from "../../shared/middleware/upload";
import { validate } from "../../shared/middleware/validate";
import { JobReportRepository } from "./job-report.repository";
import { JobReportsController } from "./job-reports.controller";
import {
  adminJobReportListQuerySchema,
  createJobReportSchema,
  jobReportActionSchema,
} from "./job-reports.dto";
import { JobReportsService } from "./job-reports.service";

export function jobReportsRouter(container: AwilixContainer): Router {
  container.register({
    jobReportRepository: asClass(JobReportRepository).singleton(),
    jobReportsService: asClass(JobReportsService).singleton(),
    jobReportsController: asClass(JobReportsController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<JobReportsController>("jobReportsController");
  const candidateGuard = [authenticate(container), authorize("CANDIDATE")];
  const adminGuard = [authenticate(container), authorize("ADMIN")];

  const registerCandidateRoutes = (prefix: string) => {
    // Gửi báo cáo
    router.post(
      `${prefix}/jobs/:jobId/reports`,
      ...candidateGuard,
      validate(createJobReportSchema),
      (req, res, next) => {
        void resolveController().create(req, res, next);
      },
    );

    // Kiểm tra trạng thái báo cáo của user đối với tin này
    router.get(
      `${prefix}/jobs/:jobId/reports/check`,
      ...candidateGuard,
      (req, res, next) => {
        void resolveController().checkStatus(req, res, next);
      },
    );

    // Upload ảnh minh chứng
    router.post(
      `${prefix}/job-reports/upload-evidence`,
      ...candidateGuard,
      singleFileUpload("file", ["image/jpeg", "image/png", "image/webp"]),
      (req, res, next) => {
        void resolveController().uploadEvidence(req, res, next);
      },
    );
  };

  const registerAdminRoutes = (prefix: string) => {
    router.get(
      `${prefix}/admin/job-reports/stats`,
      ...adminGuard,
      (req, res, next) => {
        void resolveController().statsAdmin(req, res, next);
      },
    );

    router.get(
      `${prefix}/admin/job-reports`,
      ...adminGuard,
      validate(adminJobReportListQuerySchema, "query"),
      (req, res, next) => {
        void resolveController().listAdmin(req, res, next);
      },
    );

    router.get(
      `${prefix}/admin/job-reports/:id`,
      ...adminGuard,
      (req, res, next) => {
        void resolveController().detailAdmin(req, res, next);
      },
    );

    router.post(
      `${prefix}/admin/job-reports/:id/action`,
      ...adminGuard,
      validate(jobReportActionSchema),
      (req, res, next) => {
        void resolveController().actionAdmin(req, res, next);
      },
    );
  };

  // Hỗ trợ cả chuẩn không version (/api/...) và có version (/api/v1/...)
  registerCandidateRoutes("");
  registerCandidateRoutes("/v1");

  registerAdminRoutes("");
  registerAdminRoutes("/v1");

  return router;
}
