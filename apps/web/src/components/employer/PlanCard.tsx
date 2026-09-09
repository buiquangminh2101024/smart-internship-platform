"use client";

import { useState } from "react";
import type { PaymentProvider, SubscriptionPlan } from "@sip/shared-types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const PROVIDERS: { value: PaymentProvider; label: string }[] = [
  { value: "VNPAY", label: "VNPay" },
  { value: "MOMO", label: "Momo" },
];

function formatVnd(amount: number): string {
  return amount.toLocaleString("vi-VN") + " đ";
}

interface PlanCardProps {
  plan: SubscriptionPlan;
  onCheckout: (planId: string, provider: PaymentProvider) => void;
  loading?: boolean;
}

export function PlanCard({ plan, onCheckout, loading = false }: PlanCardProps) {
  const [provider, setProvider] = useState<PaymentProvider>("VNPAY");

  return (
    <Card padding="lg" className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="text-lg font-semibold text-text-strong">{plan.name}</h3>
        {plan.description ? <p className="text-sm text-text-muted">{plan.description}</p> : null}
      </div>
      <div className="text-2xl font-bold text-pine-700">{formatVnd(plan.price)}</div>
      <ul className="grid gap-1 text-sm text-text-body">
        <li>Tối đa {plan.jobPostQuota} tin đăng</li>
        <li>Thời hạn {plan.durationDays} ngày</li>
      </ul>

      <div className="grid gap-2">
        <span className="text-sm font-medium text-text-strong">Cổng thanh toán</span>
        <div className="flex gap-3">
          {PROVIDERS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-text-body">
              <input
                type="radio"
                name={`provider-${plan.id}`}
                value={option.value}
                checked={provider === option.value}
                onChange={() => setProvider(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <Button type="button" fullWidth loading={loading} onClick={() => onCheckout(plan.id, provider)}>
        Thanh toán
      </Button>
    </Card>
  );
}
