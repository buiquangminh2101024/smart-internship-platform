"use client";

import { useState } from "react";
import type { DailyPoint, DashboardRange } from "@sip/shared-types";
import { useEmployerDashboardAnalytics } from "@/hooks/useEmployerDashboard";
import { formatDayMonth, formatNumber } from "@/lib/dashboard-format";
import { BlockError, BlockSkeleton } from "../BlockState";
import { Panel, PanelHead } from "../Panel";
import { ChipGroup, RangeChips } from "../RangeChips";
import { TrendChart } from "../TrendChart";

type Metric = "applications" | "views";

const METRIC_COPY: Record<Metric, { title: string; unit: string; empty: string }> = {
  applications: {
    title: "Hồ sơ ứng tuyển theo ngày",
    unit: "hồ sơ",
    empty: "Chưa có hồ sơ nào trong kỳ này. Đường sẽ hiện khi ứng viên nộp hồ sơ.",
  },
  views: {
    title: "Lượt xem tin theo ngày",
    unit: "lượt xem",
    empty: "Chưa có lượt xem nào trong kỳ này.",
  },
};

const PANEL_SKELETON_HEIGHT = 380;

/**
 * Biểu đồ đường của dashboard Employer (docs/05-frontend/phases/employer-dashboard-v2/PLAN.md, F2):
 * chuyển Hồ sơ / Lượt xem (E10) và kỳ 7/30/90 ngày. Không gồm phễu.
 */
export function ApplicationsTrendPanel() {
  const [range, setRange] = useState<DashboardRange>(30);
  const [metric, setMetric] = useState<Metric>("applications");
  const analytics = useEmployerDashboardAnalytics(range);
  const periodLabel = `${range} ngày qua`;

  if (analytics.isPending) return <BlockSkeleton height={PANEL_SKELETON_HEIGHT} />;
  if (analytics.isError) {
    return (
      <BlockError
        what="biểu đồ hồ sơ ứng tuyển"
        onRetry={() => void analytics.refetch()}
        retrying={analytics.isFetching}
        minHeight={120}
      />
    );
  }

  const points = metric === "applications" ? analytics.data.applicationsDaily : analytics.data.viewsDaily;

  return (
    <Panel
      labelledBy="employer-trend-title"
      className={`transition-opacity duration-200 motion-reduce:transition-none ${
        analytics.isPlaceholderData ? "opacity-60" : ""
      }`}
    >
      <PanelHead
        as="h2"
        id="employer-trend-title"
        title={METRIC_COPY[metric].title}
        subtitle={`${periodLabel}, tính theo giờ Việt Nam.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ChipGroup
              label="Số liệu của biểu đồ"
              value={metric}
              onChange={setMetric}
              options={[
                { value: "applications", label: "Hồ sơ" },
                { value: "views", label: "Lượt xem" },
              ]}
            />
            <RangeChips value={range} onChange={setRange} />
          </div>
        }
      />
      <div aria-busy={analytics.isPlaceholderData || undefined}>
        <TrendChart points={points} unit={METRIC_COPY[metric].unit} periodLabel={periodLabel} emptyText={METRIC_COPY[metric].empty} />
        <ChartNote points={points} unit={METRIC_COPY[metric].unit} range={range} />
      </div>
    </Panel>
  );
}

function ChartNote({ points, unit, range }: { points: DailyPoint[]; unit: string; range: DashboardRange }) {
  const total = points.reduce((sum, p) => sum + p.value, 0);
  if (total === 0) return null;
  const peak = points.reduce((best, p) => (p.value > best.value ? p : best), points[0]!);
  return (
    <p className="mt-3 text-text-muted">
      Tổng <b className="font-num tabular-nums text-text-strong">{formatNumber(total)}</b> {unit} trong {range} ngày, cao nhất{" "}
      <b className="font-num tabular-nums text-text-strong">{formatNumber(peak.value)}</b> {unit} vào {formatDayMonth(peak.date)}.
    </p>
  );
}
