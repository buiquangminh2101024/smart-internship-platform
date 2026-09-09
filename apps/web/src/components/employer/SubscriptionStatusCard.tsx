"use client";

import { useEmployerMe } from "@/hooks/useEmployerMe";
import { useCompanySubscription } from "@/hooks/useSubscription";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN");
}

interface SubscriptionStatusCardProps {
  /** "compact": dùng ở /employer/profile (không có nút hành động — link "Xem gói dịch vụ" đặt riêng bên ngoài card). */
  variant?: "compact" | "full";
}

// Dùng chung ở /employer/profile (bản rút gọn) và /employer/subscription (bản
// đầy đủ) — tự fetch trạng thái subscription/employer, không nhận qua props.
export function SubscriptionStatusCard({ variant = "full" }: SubscriptionStatusCardProps) {
  const { data: employerMe } = useEmployerMe();
  const { data: access, isLoading } = useCompanySubscription();

  if (isLoading || !access) {
    return (
      <Card padding="lg" className="grid gap-2">
        <h2 className="text-base font-semibold text-text-strong">Gói dịch vụ</h2>
        <p className="text-sm text-text-muted">Đang tải...</p>
      </Card>
    );
  }

  const isCompanyAdmin = employerMe?.employer?.isCompanyAdmin ?? false;

  let badge: { tone: "success" | "warning" | "danger"; label: string };
  let message: string;
  let actionLabel: string | null = null;

  if (access.mode === "SUBSCRIBED") {
    badge = { tone: "success", label: "Đang hoạt động" };
    const planName = access.subscription?.plan.name ?? "Gói dịch vụ";
    const endDate = access.subscription ? formatDate(access.subscription.endDate) : "—";
    message = `${planName} — còn ${access.publishRemaining ?? 0} tin đăng, hết hạn ngày ${endDate}`;
    actionLabel = "Nâng cấp gói";
  } else if (access.mode === "TRIAL") {
    badge = { tone: "success", label: "Đang dùng thử" };
    const trialEndDate = access.trialEndsAt ? formatDate(access.trialEndsAt) : "—";
    message = `Còn ${access.publishRemaining ?? 0}/2 tin đăng công khai, ${access.draftRemaining ?? 0}/10 tin nháp — hết hạn dùng thử ngày ${trialEndDate}`;
    actionLabel = "Mua gói ngay";
  } else {
    badge = { tone: "danger", label: "Cần mua gói" };
    message = access.subscription
      ? `Gói ${access.subscription.plan.name} đã hết hạn ngày ${formatDate(access.subscription.endDate)}. Mua gói mới để tiếp tục đăng tin.`
      : "Đã hết thời gian dùng thử. Mua gói để tiếp tục đăng tin tuyển dụng.";
    actionLabel = "Mua gói ngay";
  }

  return (
    <Card padding={variant === "compact" ? "md" : "lg"} className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-strong">Gói dịch vụ</h2>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <p className="text-sm text-text-muted">{message}</p>
      {variant === "full" && isCompanyAdmin && actionLabel ? (
        <Button as="a" href="/employer/subscription" variant="secondary" size="sm" className="w-fit">
          {actionLabel}
        </Button>
      ) : null}
    </Card>
  );
}
