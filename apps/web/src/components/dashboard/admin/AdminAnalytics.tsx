"use client";

import type { AdminDashboardAnalytics, DashboardRange, Role } from "@sip/shared-types";
import { formatDayMonth, formatNumber, formatVnd, formatVndShort, vnTodayIso } from "@/lib/dashboard-format";
import { BlockError, BlockSkeleton } from "../BlockState";
import { ColumnChart } from "../ColumnChart";
import { TrendChart } from "../TrendChart";
import { AdminPanel, AdminPanelHead, SegmentedControl, type SegmentedOption } from "./AdminPanel";

const RANGE_OPTIONS: SegmentedOption<DashboardRange>[] = [
  { value: 7, label: "7 ngày" },
  { value: 30, label: "30 ngày" },
  { value: 90, label: "90 ngày" },
];

type AnalyticsQuery = {
  data: AdminDashboardAnalytics | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
};

/**
 * Hai khối cao bằng nhau: "Người dùng mới theo ngày" (nút 7/30/90 nằm trong
 * đầu khối — chỉ khối này đổi theo nút, D10) và "Doanh thu theo tuần" (tháng
 * hiện tại, không đổi theo nút).
 */
export function AdminTrendAndRevenue({
  analytics,
  range,
  onRangeChange,
}: {
  analytics: AnalyticsQuery;
  range: DashboardRange;
  onRangeChange: (range: DashboardRange) => void;
}) {
  if (analytics.isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 @[900px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <BlockSkeleton height={360} />
        <BlockSkeleton height={360} />
      </div>
    );
  }
  if (analytics.isError || !analytics.data) {
    return (
      <BlockError
        what="số liệu phân tích"
        onRetry={() => void analytics.refetch()}
        retrying={analytics.isFetching}
        minHeight={120}
      />
    );
  }

  const { newUsersDaily, revenueWeekly } = analytics.data;
  const values = newUsersDaily.map((p) => p.value);
  const total = values.reduce((sum, v) => sum + v, 0);
  const max = Math.max(0, ...values);
  const peak = max > 0 ? newUsersDaily[values.indexOf(max)] : undefined;

  const [year, month] = revenueWeekly.month.split("-");
  const monthLabel = month && year ? `${month}/${year}` : "";
  const today = vnTodayIso();
  const todayDay = today.startsWith(revenueWeekly.month) ? Number(today.slice(8, 10)) : -1;
  const revenueTotal = revenueWeekly.weeks.reduce((sum, w) => sum + w.amount, 0);
  const columns = revenueWeekly.weeks.map((week, i) => ({
    label: `Tuần ${i + 1}`,
    sublabel: `${String(week.fromDay).padStart(2, "0")} – ${String(week.toDay).padStart(2, "0")}/${month ?? ""}`,
    value: week.amount,
    current: todayDay >= week.fromDay && todayDay <= week.toDay,
  }));

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 @[900px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <AdminPanel labelledBy="admin-trend-title">
        <AdminPanelHead
          id="admin-trend-title"
          title="Người dùng mới theo ngày"
          subtitle={`${range} ngày qua, tính theo giờ Việt Nam.`}
          actions={
            <SegmentedControl
              options={RANGE_OPTIONS}
              value={range}
              onChange={onRangeChange}
              label="Khoảng thời gian của biểu đồ người dùng mới"
            />
          }
        />
        <div className="px-4 pb-4 @xl:px-5">
          <TrendChart
            points={newUsersDaily}
            unit="người dùng"
            periodLabel={`${range} ngày qua`}
            emptyText="Chưa có người dùng mới nào trong kỳ này."
          />
          <p className="mt-2 text-[13px] text-text-body">
            {peak ? (
              <>
                Tổng <b className="text-text-strong tabular-nums">{formatNumber(total)}</b> người dùng trong {range} ngày,
                cao nhất <b className="text-text-strong tabular-nums">{formatNumber(max)}</b> người dùng vào{" "}
                {formatDayMonth(peak.date)}.
              </>
            ) : (
              `Không có người dùng mới trong ${range} ngày qua.`
            )}
          </p>
        </div>
      </AdminPanel>

      <AdminPanel labelledBy="admin-revenue-title" className="flex flex-col">
        <AdminPanelHead
          id="admin-revenue-title"
          as="h3"
          title="Doanh thu theo tuần"
          subtitle={`Tháng ${monthLabel} · tổng ${formatVnd(revenueTotal)}`}
        />
        <ColumnChart
          columns={columns}
          format={formatVndShort}
          label={`Doanh thu theo tuần tháng ${monthLabel}: ${columns
            .map((c) => `${c.label} ${formatVnd(c.value)}`)
            .join(", ")}`}
          emptyText="Chưa có thanh toán nào trong tháng này."
        />
      </AdminPanel>
    </div>
  );
}

const ROLE_ROWS: Array<{ role: Role; label: string; color: string }> = [
  { role: "CANDIDATE", label: "Ứng viên", color: "bg-brand-500" },
  { role: "EMPLOYER", label: "Nhà tuyển dụng", color: "bg-brand-400" },
  { role: "ADMIN", label: "Quản trị viên", color: "bg-brand-300" },
];

/** "Người dùng theo vai trò" — số tại thời điểm xem, không đổi theo nút 7/30/90. */
export function UsersByRolePanel({ analytics }: { analytics: AnalyticsQuery }) {
  if (analytics.isPending) return <BlockSkeleton height={240} />;
  if (analytics.isError || !analytics.data) {
    return (
      <BlockError what="số người dùng" onRetry={() => void analytics.refetch()} retrying={analytics.isFetching} />
    );
  }

  const counts = analytics.data.usersByRole;
  const total = ROLE_ROWS.reduce((sum, r) => sum + counts[r.role], 0);

  return (
    <AdminPanel labelledBy="admin-roles-title">
      <AdminPanelHead
        id="admin-roles-title"
        as="h3"
        title="Người dùng theo vai trò"
        subtitle={`Tại thời điểm xem · ${formatNumber(total)} người dùng`}
      />
      <dl className="flex flex-col gap-3 px-4 pb-4 @xl:px-5">
        {ROLE_ROWS.map(({ role, label, color }) => {
          const value = counts[role];
          const percent = total > 0 ? (value / total) * 100 : 0;
          const rounded = Math.round(percent);
          return (
            <div key={role} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2 text-[13px]">
                <dt className="font-bold text-text-strong">{label}</dt>
                <dd className="font-bold text-text-strong tabular-nums">{formatNumber(value)}</dd>
              </div>
              <span aria-hidden className="h-2.5 overflow-hidden rounded-full bg-surface-hover">
                <span
                  className={`block h-full min-w-0 rounded-full ${color}`}
                  style={{ width: `${percent}%`, minWidth: value > 0 ? 4 : 0 }}
                />
              </span>
              <p className="text-xs text-text-muted">
                {total === 0
                  ? "Chưa có người dùng"
                  : value > 0 && rounded < 1
                    ? "Dưới 1% tổng số người dùng"
                    : `${rounded}% tổng số người dùng`}
              </p>
            </div>
          );
        })}
      </dl>
    </AdminPanel>
  );
}
