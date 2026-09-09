import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { CatalogRepository } from "./catalog.repository";

// Dữ liệu tham chiếu công khai (không nhạy cảm) — không mount `authenticate`,
// theo API_CONVENTIONS.md §11 ("frontend tự build dropdown/filter, không
// hardcode"). Chỉ Industry/CompanyType/City (cần cho form công ty, Phase 4).
export function catalogRouter(container: AwilixContainer): Router {
  container.register({
    catalogRepository: asClass(CatalogRepository).singleton(),
    catalogService: asClass(CatalogService).singleton(),
    catalogController: asClass(CatalogController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<CatalogController>("catalogController");

  router.get("/industries", (req, res, next) => void resolveController().industries(req, res, next));
  router.get("/company-types", (req, res, next) => void resolveController().companyTypes(req, res, next));
  router.get("/cities", (req, res, next) => void resolveController().cities(req, res, next));

  return router;
}
