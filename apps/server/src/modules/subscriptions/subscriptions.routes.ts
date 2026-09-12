import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { authenticate } from "../../shared/middleware/authenticate";
import { authorize } from "../../shared/middleware/authorize";
import { validate } from "../../shared/middleware/validate";
import { CompanySubscriptionRepository } from "./company-subscription.repository";
import { SubscriptionPlanRepository } from "./subscription-plan.repository";
import { SubscriptionsController } from "./subscriptions.controller";
import {
  checkoutSchema,
  createSubscriptionPlanSchema,
  historyQuerySchema,
  updateSubscriptionPlanSchema,
} from "./subscriptions.dto";
import { SubscriptionsService } from "./subscriptions.service";

export function subscriptionsRouter(container: AwilixContainer): Router {
  container.register({
    subscriptionPlanRepository: asClass(SubscriptionPlanRepository).singleton(),
    companySubscriptionRepository: asClass(CompanySubscriptionRepository).singleton(),
    subscriptionsService: asClass(SubscriptionsService).singleton(),
    subscriptionsController: asClass(SubscriptionsController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<SubscriptionsController>("subscriptionsController");
  const employerGuard = [authenticate(container), authorize("EMPLOYER")];
  const adminGuard = [authenticate(container), authorize("ADMIN")];

  // Catalog gói — public, không cần auth (giống các catalog khác, API_CONVENTIONS.md §11).
  router.get("/subscription-plans", (req, res, next) => {
    void resolveController().listPlans(req, res, next);
  });
  router.post("/subscription-plans", ...adminGuard, validate(createSubscriptionPlanSchema), (req, res, next) => {
    void resolveController().createPlan(req, res, next);
  });
  router.patch("/subscription-plans/:id", ...adminGuard, validate(updateSubscriptionPlanSchema), (req, res, next) => {
    void resolveController().updatePlan(req, res, next);
  });

  router.get("/employers/company/subscription", ...employerGuard, (req, res, next) => {
    void resolveController().getMyCompanyAccess(req, res, next);
  });
  router.get("/subscriptions/history", ...employerGuard, validate(historyQuerySchema, "query"), (req, res, next) => {
    void resolveController().history(req, res, next);
  });
  // isCompanyAdmin được kiểm tra trong SubscriptionsService (giống POST /employers/invite-code ở Phase 4).
  router.post("/subscriptions/checkout", ...employerGuard, validate(checkoutSchema), (req, res, next) => {
    void resolveController().checkout(req, res, next);
  });
  router.get("/subscriptions/payments/by-order-code/:orderCode", ...employerGuard, (req, res, next) => {
    void resolveController().paymentStatusByOrderCode(req, res, next);
  });
  router.post("/subscriptions/payments/by-order-code/:orderCode/cancel", ...employerGuard, (req, res, next) => {
    void resolveController().reportPaymentCancellation(req, res, next);
  });

  return router;
}
