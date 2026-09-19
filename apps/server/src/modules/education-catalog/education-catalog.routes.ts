import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { Role } from "@prisma/client";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";
import { EducationCatalogController } from "./education-catalog.controller";
import { EducationCatalogService } from "./education-catalog.service";
import { UniversityRepository } from "./university.repository";
import { MajorRepository } from "./major.repository";
import { UniversityDedupeService } from "./university-dedupe.service";
import { MajorDedupeService } from "./major-dedupe.service";
import type { EducationCatalogDomain } from "./education-catalog.types";
import {
  adminCatalogListQuerySchema,
  mergeCatalogEntrySchema,
  renameApproveCatalogEntrySchema,
  suggestCatalogEntrySchema,
} from "./education-catalog.dto";

const PATHS: Record<EducationCatalogDomain, string> = {
  university: "universities",
  major: "majors",
};

// University + Major gộp chung một module (docs/06-backend/cv-ai-extraction-phase2/PLAN.md
// Quyết định #5). Hành động chỉ-Admin nằm ngay trong module sở hữu resource,
// giống skills.routes.ts.
export function educationCatalogRouter(container: AwilixContainer): Router {
  container.register({
    universityRepository: asClass(UniversityRepository).singleton(),
    majorRepository: asClass(MajorRepository).singleton(),
    universityDedupeService: asClass(UniversityDedupeService).singleton(),
    majorDedupeService: asClass(MajorDedupeService).singleton(),
    educationCatalogService: asClass(EducationCatalogService).singleton(),
    educationCatalogController: asClass(EducationCatalogController).singleton(),
  });

  const router = Router();
  const controller = () => container.resolve<EducationCatalogController>("educationCatalogController");
  // Chỉ Candidate có Education — Employer không cần đề xuất trường/ngành.
  const candidateOnly = [authenticate(container), authorize(Role.CANDIDATE)];
  const adminOnly = [authenticate(container), authorize(Role.ADMIN)];

  for (const [domain, path] of Object.entries(PATHS) as Array<[EducationCatalogDomain, string]>) {
    router.post(`/${path}/suggest`, ...candidateOnly, validate(suggestCatalogEntrySchema), (req, res, next) => {
      void controller().suggest(domain)(req, res, next);
    });

    router.get(`/admin/${path}`, ...adminOnly, validate(adminCatalogListQuerySchema, "query"), (req, res, next) => {
      void controller().list(domain)(req, res, next);
    });
    router.post(`/admin/${path}/:id/approve`, ...adminOnly, (req, res, next) => {
      void controller().approve(domain)(req, res, next);
    });
    router.post(
      `/admin/${path}/:id/rename-approve`,
      ...adminOnly,
      validate(renameApproveCatalogEntrySchema),
      (req, res, next) => {
        void controller().renameApprove(domain)(req, res, next);
      },
    );
    router.post(`/admin/${path}/:id/reject`, ...adminOnly, (req, res, next) => {
      void controller().reject(domain)(req, res, next);
    });
    router.post(`/admin/${path}/:id/merge`, ...adminOnly, validate(mergeCatalogEntrySchema), (req, res, next) => {
      void controller().merge(domain)(req, res, next);
    });
  }

  return router;
}
