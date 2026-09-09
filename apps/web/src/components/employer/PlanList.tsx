"use client";

import type { PaymentProvider } from "@sip/shared-types";
import { useSubscriptionPlans } from "@/hooks/useSubscription";
import { PlanCard } from "./PlanCard";

interface PlanListProps {
  onCheckout: (planId: string, provider: PaymentProvider) => void;
  checkingOutPlanId?: string | null;
}

export function PlanList({ onCheckout, checkingOutPlanId = null }: PlanListProps) {
  const { data: plans, isLoading } = useSubscriptionPlans();

  if (isLoading) {
    return <p className="text-sm text-text-muted">Đang tải danh sách gói...</p>;
  }

  if (!plans || plans.length === 0) {
    return <p className="text-sm text-text-muted">Hiện chưa có gói dịch vụ nào được mở bán.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} onCheckout={onCheckout} loading={checkingOutPlanId === plan.id} />
      ))}
    </div>
  );
}
