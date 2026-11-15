"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DashboardRange } from "@sip/shared-types";
import {
  ADMIN_DASHBOARD_KEY,
  useAdminDashboardAnalytics,
  useAdminDashboardOverview,
} from "@/hooks/useAdminDashboard";
import { formatNumber, formatVnDate, formatVnTime } from "@/lib/dashboard-format";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { DashButton } from "@/components/dashboard/DashButton";
import { NotificationCenter } from "@/components/dashboard/NotificationCenter";
import { ActivityTimeline } from "@/components/dashboard/admin/ActivityTimeline";
import { AdminTrendAndRevenue, UsersByRolePanel } from "@/components/dashboard/admin/AdminAnalytics";
import { AdminQueues } from "@/components/dashboard/admin/AdminQueues";
import { AutomationStatusPanel } from "@/components/dashboard/admin/AutomationStatusPanel";
import { PlatformMetrics } from "@/components/dashboard/admin/PlatformMetrics";

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
 * Tổng quan của Admin — bản D2 (docs/05-frontend/phases/dashboard-v2/PLAN.md): hàng chờ (thẻ dẫn
 * sang trang quản lý, không duyệt tại chỗ) → nền tảng → hệ thống tự động (0.6 F5), mỗi khối một
 * hàng → người dùng mới + doanh thu → thông báo + hoạt động + vai trò.
 * Mỗi khối tải và báo lỗi độc lập. Số dùng font chữ thường kèm `tabular-nums`
 * (khác Employer bản C dùng mono), nên trang đè `--font-num` về font sans.
 */
export default function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const overview = useAdminDashboardOverview();
  const [range, setRange] = useState<DashboardRange>(30);
  const analytics = useAdminDashboardAnalytics(range);
  const [refreshing, setRefreshing] = useState(false);
  const { toasts, push, dismiss } = useToast();

  const queues = overview.data?.queues;
  const pendingTotal = queues ? queues.jobPosts.total + queues.companies.total + queues.catalog.total : 0;

  async function refreshAll() {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_DASHBOARD_KEY }),
        queryClient.invalidateQueries({ queryKey: ["notifications", "admin"] }),
      ]);
      push("success", `Đã cập nhật số liệu lúc ${formatVnTime(Date.now())}.`);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="@container mx-auto grid w-full max-w-[1360px] grid-cols-1 content-start gap-6 p-4 text-sm text-text-body [--font-num:var(--font-sans)] sm:p-6">
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-60 flex-1">
          <h1 className="text-2xl leading-[1.25] font-bold text-text-strong">Tổng quan</h1>
          <p className="mt-1 text-text-muted">
            {overview.data ? (
              <>
                <b className="text-text-strong tabular-nums">{formatNumber(pendingTotal)}</b> mục chờ duyệt · cập nhật lúc{" "}
                {formatVnTime(overview.dataUpdatedAt)} ngày {formatVnDate(overview.dataUpdatedAt)}
              </>
            ) : (
              "Hàng chờ kiểm duyệt và số liệu nền tảng"
            )}
          </p>
        </div>
        <DashButton variant="secondary" icon="refresh-cw" loading={refreshing} onClick={() => void refreshAll()}>
          {refreshing ? "Đang làm mới" : "Làm mới"}
        </DashButton>
      </header>

      {overview.isPending ? (
        <div className="grid grid-cols-1 gap-4 @[900px]:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <BlockSkeleton key={i} height={168} />
          ))}
        </div>
      ) : overview.isError ? (
        <BlockError what="hàng chờ" onRetry={() => void overview.refetch()} retrying={overview.isFetching} minHeight={120} />
      ) : (
        <AdminQueues queues={overview.data.queues} />
      )}

      {overview.isPending ? (
        <BlockSkeleton height={220} />
      ) : overview.isError ? (
        <BlockError
          what="số liệu nền tảng"
          onRetry={() => void overview.refetch()}
          retrying={overview.isFetching}
          minHeight={120}
        />
      ) : (
        <PlatformMetrics overview={overview.data} updatedAt={overview.dataUpdatedAt} />
      )}

      <AutomationStatusPanel />

      <AdminTrendAndRevenue analytics={analytics} range={range} onRangeChange={setRange} />

      <div className="grid grid-cols-1 items-start gap-4 @[900px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <NotificationCenter area="admin" notify={push} />
        <div className="flex min-w-0 flex-col gap-4">
          <ActivityTimeline />
          <UsersByRolePanel analytics={analytics} />
        </div>
      </div>

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
