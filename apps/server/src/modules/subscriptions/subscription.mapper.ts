import type { CompanySubscription as PrismaCompanySubscription, SubscriptionPlan as PrismaSubscriptionPlan } from "@prisma/client";
import type { CompanySubscriptionSummary, SubscriptionPlan as SubscriptionPlanDto } from "@sip/shared-types";

export function toSubscriptionPlanDto(plan: PrismaSubscriptionPlan): SubscriptionPlanDto {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    jobPostQuota: plan.jobPostQuota,
    durationDays: plan.durationDays,
    price: plan.price,
    isActive: plan.isActive,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function toCompanySubscriptionSummary(
  sub: PrismaCompanySubscription & { plan: PrismaSubscriptionPlan },
): CompanySubscriptionSummary {
  return {
    id: sub.id,
    planId: sub.planId,
    plan: toSubscriptionPlanDto(sub.plan),
    startDate: sub.startDate.toISOString(),
    endDate: sub.endDate.toISOString(),
    status: sub.status,
    createdAt: sub.createdAt.toISOString(),
  };
}
