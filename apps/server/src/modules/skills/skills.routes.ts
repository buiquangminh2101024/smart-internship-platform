import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { Role } from "@prisma/client";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";
import { SkillsController } from "./skills.controller";
import { SkillsService } from "./skills.service";
import { SkillsRepository } from "./skills.repository";
import { SkillAliasRepository } from "./skill-alias.repository";
import { SkillEmbeddingService } from "./skill-embedding.service";
import { SkillDedupeService } from "./skill-dedupe.service";
import { adminSkillListQuerySchema, mergeSkillSchema, suggestSkillSchema } from "./skills.dto";

// Không có module `admin` riêng — hành động chỉ-Admin nằm trong module sở hữu
// resource (giống companies.routes.ts, xem PROJECT_STRUCTURE.md §5).
export function skillsRouter(container: AwilixContainer): Router {
  container.register({
    skillAliasRepository: asClass(SkillAliasRepository).singleton(),
    skillsRepository: asClass(SkillsRepository).singleton(),
    // singleton quan trọng với embedding service: model chỉ được load một lần
    // cho cả process, không phải mỗi request.
    skillEmbeddingService: asClass(SkillEmbeddingService).singleton(),
    skillDedupeService: asClass(SkillDedupeService).singleton(),
    skillsService: asClass(SkillsService).singleton(),
    skillsController: asClass(SkillsController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<SkillsController>("skillsController");
  // Cả Candidate lẫn Employer dùng chung endpoint này (quyết định 2 trong PLAN).
  const userOnly = [authenticate(container), authorize(Role.CANDIDATE, Role.EMPLOYER)];
  const adminOnly = [authenticate(container), authorize(Role.ADMIN)];

  router.post("/skills/suggest", ...userOnly, validate(suggestSkillSchema), (req, res, next) => {
    void resolveController().suggest(req, res, next);
  });

  router.get("/admin/skills", ...adminOnly, validate(adminSkillListQuerySchema, "query"), (req, res, next) => {
    void resolveController().list(req, res, next);
  });
  router.post("/admin/skills/:id/approve", ...adminOnly, (req, res, next) => {
    void resolveController().approve(req, res, next);
  });
  router.post("/admin/skills/:id/reject", ...adminOnly, (req, res, next) => {
    void resolveController().reject(req, res, next);
  });
  router.post("/admin/skills/:id/merge", ...adminOnly, validate(mergeSkillSchema), (req, res, next) => {
    void resolveController().merge(req, res, next);
  });

  return router;
}
