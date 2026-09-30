"use client";

import { useCallback, useState } from "react";
import { useEmployerDashboardOverview } from "@/hooks/useEmployerDashboard";
import { useEmployerMe } from "@/hooks/useEmployerMe";
import { formatVnDate, formatVnTime } from "@/lib/dashboard-format";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { DashButton } from "@/components/dashboard/DashButton";
import { PanelHead } from "@/components/dashboard/Panel";
import { BannerNumber, SummaryBanner } from "@/components/dashboard/SummaryBanner";
import { EmployerKpiGrid, PENDING_TASKS_ANCHOR } from "@/components/dashboard/employer/EmployerKpiGrid";
import { EmployerTaskBoard } from "@/components/dashboard/employer/EmployerTaskBoard";
import { EmployerAnalytics } from "@/components/dashboard/employer/EmployerAnalytics";
import { NotificationCenter } from "@/components/dashboard/NotificationCenter";

let toastIdCounter = 0;

function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const push = useCallback((tone: ToastData["tone"], message: string) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, tone, message }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  return { toasts, push, dismiss };
}

/**
 * Tổng quan của Employer (AD-16, plan FE bản C): banner → 6 KPI → việc cần
 * làm → phân tích → trung tâm thông báo. Mỗi khối tải và báo lỗi độc lập.
 */
export default function EmployerDashboardPage() {
  const overview = useEmployerDashboardOverview();
  const { data: me } = useEmployerMe();
  const { toasts, push, dismiss } = useToast();

  const companyName = overview.data?.company.name ?? me?.company?.name;
  const notVerified = overview.data !== undefined && overview.data.company.verificationStatus !== "VERIFIED";

  return (
    <div className="@container mx-auto grid w-full max-w-[1240px] grid-cols-1 content-start gap-6 p-4 text-sm text-text-body sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-[1.3] font-bold text-text-strong">Tổng quan</h1>
          <p className="mt-1 text-text-muted">
            {companyName ?? "Công ty của bạn"}
            {overview.data ? (
              <>
                {" "}
                · cập nhật lúc{" "}
                {formatVnTime(overview.dataUpdatedAt)} ngày {formatVnDate(overview.dataUpdatedAt)}
              </>
            ) : null}
          </p>
        </div>
        <DashButton href="/employer/jobs/new" icon="plus">
          Đăng tin mới
        </DashButton>
      </header>

      {overview.isPending ? (
        <>
          <BlockSkeleton height={188} />
          <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <BlockSkeleton key={i} height={236} />
            ))}
          </div>
        </>
      ) : overview.isError ? (
        <BlockError what="số liệu tổng quan" onRetry={() => void overview.refetch()} retrying={overview.isFetching} minHeight={120} />
      ) : notVerified ? (
        <Card tone="warning" padding="md" className="flex flex-wrap items-center justify-between gap-4">
          <p className="inline-flex items-start gap-2 text-sm text-marigold-800">
            <Icon name="triangle-alert" size={18} className="mt-0.5 shrink-0" />
            Công ty của bạn chưa được xác minh. Hoàn tất hồ sơ công ty để đăng tin và nhận hồ sơ.
          </p>
          <Button as="a" href="/employer/profile" variant="secondary" size="sm">
            Xem hồ sơ công ty
          </Button>
        </Card>
      ) : (
        <>
          <SummaryBanner
            eyebrow={`Hôm nay, ${formatVnDate(overview.dataUpdatedAt)}`}
            title={
              overview.data.applications.pendingCount > 0 ? (
                <>
                  Bạn có <BannerNumber value={overview.data.applications.pendingCount} /> hồ sơ cần xử lý
                </>
              ) : (
                "Không có hồ sơ nào đang chờ xử lý"
              )
            }
            subtitle={`${overview.data.jobs.expiringIn7Days} tin sắp hết hạn, ${overview.data.interviews.upcomingCount} lịch phỏng vấn sắp tới và ${overview.data.messages.unreadConversations} tin nhắn chưa đọc.`}
            action={
              overview.data.applications.pendingCount > 0 ? (
                <DashButton href={`#${PENDING_TASKS_ANCHOR}`} variant="light">
                  Xử lý hồ sơ chờ
                </DashButton>
              ) : undefined
            }
            stats={[
              { label: "Hồ sơ chờ", value: overview.data.applications.pendingCount },
              { label: "Tin sắp hết hạn", value: overview.data.jobs.expiringIn7Days },
              { label: "Phỏng vấn sắp tới", value: overview.data.interviews.upcomingCount },
            ]}
          />
          <EmployerKpiGrid overview={overview.data} />
        </>
      )}

      {notVerified ? null : (
        <>
          <section aria-labelledby="employer-tasks-title" className="flex flex-col gap-3">
            <PanelHead
              as="h2"
              id="employer-tasks-title"
              title="Việc cần làm"
              subtitle="Xử lý ngay tại đây, không cần chuyển trang."
            />
            <EmployerTaskBoard notify={push} />
          </section>

          <EmployerAnalytics />
        </>
      )}

      <NotificationCenter area="employer" notify={push} />

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
