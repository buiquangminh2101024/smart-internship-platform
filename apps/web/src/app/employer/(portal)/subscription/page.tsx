"use client";

import { useState } from "react";
import type { PaymentProvider, SubscriptionStatus } from "@sip/shared-types";
import { useSubscriptionHistory, useCheckout } from "@/hooks/useSubscription";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { PlanList } from "@/components/employer/PlanList";
import { SubscriptionStatusCard } from "@/components/employer/SubscriptionStatusCard";

let nextToastId = 0;

const STATUS_LABEL: Record<SubscriptionStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  ACTIVE: { label: "Đang hoạt động", tone: "success" },
  PENDING: { label: "Đang chờ thanh toán", tone: "warning" },
  EXPIRED: { label: "Đã hết hạn", tone: "neutral" },
  CANCELLED: { label: "Đã huỷ", tone: "danger" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN");
}

function formatVnd(amount: number): string {
  return amount.toLocaleString("vi-VN") + " đ";
}

export default function EmployerSubscriptionPage() {
  const checkout = useCheckout();
  const { data: history } = useSubscriptionHistory();
  const [checkingOutPlanId, setCheckingOutPlanId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  async function handleCheckout(planId: string, provider: PaymentProvider) {
    setCheckingOutPlanId(planId);
    try {
      const result = await checkout.mutateAsync({ planId, provider });
      // Phòng khi return URL của cổng thanh toán không giữ nguyên toàn bộ
      // query string — trang return đọc lại orderCode từ đây trước tiên.
      window.sessionStorage.setItem("sip_pending_order_code", result.orderCode);
      window.location.href = result.paymentUrl;
    } catch (err) {
      // Không hiển thị message chi tiết (lỗi cổng thanh toán, cấu hình, v.v.)
      // cho khách hàng — chỉ log ra console để dev tự tra, còn UI luôn chung
      // chung để không lộ nội bộ hệ thống (xem momo-gateway-adapter.ts).
      console.error("Checkout failed", err);
      setToasts((prev) => [
        ...prev,
        { id: nextToastId++, tone: "danger", message: "Đã có lỗi xảy ra, vui lòng thử lại sau." },
      ]);
      setCheckingOutPlanId(null);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-8 px-6 py-12">
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />

      <div className="grid gap-1">
        <Button as="a" href="/employer/profile" variant="link" className="w-fit">
          ← Quay lại hồ sơ
        </Button>
        <h1 className="text-2xl font-semibold text-text-strong">Gói dịch vụ</h1>
        <p className="text-sm text-text-muted">Mua hoặc nâng cấp gói đăng tin tuyển dụng.</p>
      </div>

      <SubscriptionStatusCard variant="full" />

      <div className="grid gap-3">
        <h2 className="text-lg font-semibold text-text-strong">Chọn gói</h2>
        <PlanList onCheckout={handleCheckout} checkingOutPlanId={checkingOutPlanId} />
      </div>

      {history && history.items.length > 0 ? (
        <div className="grid gap-3">
          <h2 className="text-lg font-semibold text-text-strong">Lịch sử mua gói</h2>
          <Card padding="none" className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-page text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Gói</th>
                  <th className="px-4 py-3 font-medium">Giá</th>
                  <th className="px-4 py-3 font-medium">Thời hạn</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {history.items.map((item) => (
                  <tr key={item.id} className="border-t border-border-subtle">
                    <td className="px-4 py-3 text-text-strong">{item.plan.name}</td>
                    <td className="px-4 py-3">{formatVnd(item.plan.price)}</td>
                    <td className="px-4 py-3">
                      {formatDate(item.startDate)} — {formatDate(item.endDate)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_LABEL[item.status].tone}>{STATUS_LABEL[item.status].label}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
