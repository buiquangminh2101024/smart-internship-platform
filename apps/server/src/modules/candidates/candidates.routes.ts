import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { CandidateController } from "./candidate.controller";
import { CandidateService } from "./candidate.service";
import { CandidateRepository } from "./candidate.repository";
import { CandidateCvImportService } from "./candidate-cv-import.service";
import { Role } from "@prisma/client";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { singleFileUpload } from "../../shared/middleware/upload";
import { validate } from "../../shared/middleware/validate";
import {
  awardSchema,
  awardPatchSchema,
  candidateProfilePatchSchema,
  certificateSchema,
  certificatePatchSchema,
  educationSchema,
  educationPatchSchema,
  importFromCvSchema,
  projectSchema,
  projectPatchSchema,
  skillSchema,
  workExperienceSchema,
  workExperiencePatchSchema,
} from "./candidates.dto";

export function candidatesRouter(container: AwilixContainer): Router {
  container.register({
    candidateRepository: asClass(CandidateRepository).singleton(),
    candidateService: asClass(CandidateService).singleton(),
    // Phụ thuộc skillDedupeService/universityDedupeService/majorDedupeService
    // đăng ký ở skillsRouter/educationCatalogRouter — awilix resolve lười lúc
    // có request nên thứ tự mount router trong main.ts không ảnh hưởng.
    candidateCvImportService: asClass(CandidateCvImportService).singleton(),
    candidateController: asClass(CandidateController).singleton(),
  });

  const router = Router();
  const controller = () => container.resolve<CandidateController>("candidateController");
  const candidateOnly = [authenticate(container), authorize(Role.CANDIDATE)];
  const employerOnly = [authenticate(container), authorize(Role.EMPLOYER)];

  router.get("/employer/candidates/:id", ...employerOnly, (req, res, next) => {
    void controller().getPublicProfile(req, res, next);
  });

  router.get("/candidates/me", ...candidateOnly, (req, res, next) => {
    void controller().me(req, res, next);
  });

  router.patch("/candidates/me", ...candidateOnly, validate(candidateProfilePatchSchema), (req, res, next) => {
    void controller().updateMe(req, res, next);
  });

  router.patch("/candidates/me/avatar", ...candidateOnly, singleFileUpload("avatar", ["image/jpeg", "image/png", "image/webp"]), (req, res, next) => {
    void controller().uploadAvatar(req, res, next);
  });

  // docs/06-backend/cv-ai-extraction-phase2/PLAN.md — "Lưu vào hồ sơ" từ kết quả đọc CV.
  router.post("/candidates/me/profile/import-from-cv", ...candidateOnly, validate(importFromCvSchema), (req, res, next) => {
    void controller().importFromCv(req, res, next);
  });

  router.post("/candidates/me/education", ...candidateOnly, validate(educationSchema), (req, res, next) => {
    void controller().createEducation(req, res, next);
  });

  router.patch("/candidates/me/education/:id", ...candidateOnly, validate(educationPatchSchema), (req, res, next) => {
    void controller().updateEducation(req, res, next);
  });

  router.delete("/candidates/me/education/:id", ...candidateOnly, (req, res, next) => {
    void controller().deleteEducation(req, res, next);
  });

  router.get("/candidates/me/skills", ...candidateOnly, (req, res, next) => {
    void controller().listSkills(req, res, next);
  });

  router.post("/candidates/me/skills", ...candidateOnly, validate(skillSchema), (req, res, next) => {
    void controller().upsertSkill(req, res, next);
  });

  router.delete("/candidates/me/skills/:skillId", ...candidateOnly, (req, res, next) => {
    void controller().removeSkill(req, res, next);
  });

  router.post("/candidates/me/work-experiences", ...candidateOnly, validate(workExperienceSchema), (req, res, next) => {
    void controller().createWorkExperience(req, res, next);
  });

  router.patch("/candidates/me/work-experiences/:id", ...candidateOnly, validate(workExperiencePatchSchema), (req, res, next) => {
    void controller().updateWorkExperience(req, res, next);
  });

  router.delete("/candidates/me/work-experiences/:id", ...candidateOnly, (req, res, next) => {
    void controller().deleteWorkExperience(req, res, next);
  });

  router.post("/candidates/me/projects", ...candidateOnly, validate(projectSchema), (req, res, next) => {
    void controller().createProject(req, res, next);
  });

  router.patch("/candidates/me/projects/:id", ...candidateOnly, validate(projectPatchSchema), (req, res, next) => {
    void controller().updateProject(req, res, next);
  });

  router.delete("/candidates/me/projects/:id", ...candidateOnly, (req, res, next) => {
    void controller().deleteProject(req, res, next);
  });

  router.post("/candidates/me/certificates", ...candidateOnly, validate(certificateSchema), (req, res, next) => {
    void controller().createCertificate(req, res, next);
  });

  router.patch("/candidates/me/certificates/:id", ...candidateOnly, validate(certificatePatchSchema), (req, res, next) => {
    void controller().updateCertificate(req, res, next);
  });

  router.delete("/candidates/me/certificates/:id", ...candidateOnly, (req, res, next) => {
    void controller().deleteCertificate(req, res, next);
  });

  router.post("/candidates/me/awards", ...candidateOnly, validate(awardSchema), (req, res, next) => {
    void controller().createAward(req, res, next);
  });

  router.patch("/candidates/me/awards/:id", ...candidateOnly, validate(awardPatchSchema), (req, res, next) => {
    void controller().updateAward(req, res, next);
  });

  router.delete("/candidates/me/awards/:id", ...candidateOnly, (req, res, next) => {
    void controller().deleteAward(req, res, next);
  });

  return router;
}
