"use client";

import { useState } from "react";
import type {
  DailyPoint,
  DashboardRange,
  EmployerDashboardAnalytics,
  FunnelStep,
} from "@sip/shared-types";
import { useEmployerDashboardAnalytics } from "@/hooks/useEmployerDashboard";
import {
  formatDayMonth,
  formatDecimal,
  formatNumber,
} from "@/lib/dashboard-format";
import { BlockError, BlockSkeleton } from "../BlockState";
import { BarList, type BarListItem } from "../BarList";
import { Panel, PanelHead } from "../Panel";
import { ChipGroup, RangeChips } from "../RangeChips";
import { TrendChart } from "../TrendChart";
import type { ChartTone } from "../chart-tones";

type Metric = "applications" | "views";

const METRIC_COPY: Record<
  Metric,
  { title: string; unit: string; empty: string }
> = {
  applications: {
    title: "Hồ sơ ứng tuyển theo ngày",
    unit: "hồ sơ",
    empty:
      "Chưa có hồ sơ nào trong kỳ này. Đường sẽ hiện khi ứng viên nộp hồ sơ.",
  },
  views: {
    title: "Lượt xem tin theo ngày",
    unit: "lượt xem",
    empty: "Chưa có lượt xem nào trong kỳ này.",
  },
};

// Nhãn và màu theo mẫu bản C: brand đậm dần qua từng bước, bước cuối màu thành công.
const FUNNEL_STEP: Record<FunnelStep, { label: string; tone: ChartTone }> = {
  APPLIED: { label: "Ứng tuyển", tone: "brand" },
  REVIEWING: { label: "Đang xem xét", tone: "brand-strong" },
  SHORTLISTED: { label: "Vào danh sách rút gọn", tone: "brand-darker" },
  INTERVIEWING: { label: "Mời phỏng vấn", tone: "brand-deep" },
  ACCEPTED: { label: "Được nhận", tone: "success" },
};

/** Khối "Phân tích": nút 7/30/90 ở dòng tiêu đề điều khiển cả biểu đồ đường lẫn phễu (D10). */
export function EmployerAnalytics() {
  const [range, setRange] = useState<DashboardRange>(30);
  const [metric, setMetric] = useState<Metric>("applications");
  const analytics = useEmployerDashboardAnalytics(range);
  const periodLabel = `${range} ngày qua`;

  return (
    <section
      aria-labelledby="employer-analytics-title"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="employer-analytics-title"
          className="text-xl font-bold text-text-strong"
        >
          Phân tích
        </h2>
        <RangeChips value={range} onChange={setRange} />
      </div>

      {analytics.isPending ? (
        <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <BlockSkeleton height={380} />
          <BlockSkeleton height={380} />
        </div>
      ) : analytics.isError ? (
        <BlockError
          what="số liệu phân tích"
          onRetry={() => void analytics.refetch()}
          retrying={analytics.isFetching}
          minHeight={120}
        />
      ) : (
        <div
          className={`grid grid-cols-1 items-start gap-6 transition-opacity duration-200 motion-reduce:transition-none @4xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] ${
            analytics.isPlaceholderData ? "opacity-60" : ""
          }`}
          aria-busy={analytics.isPlaceholderData || undefined}
        >
          <Panel labelledBy="employer-trend-title">
            <PanelHead
              id="employer-trend-title"
              title={METRIC_COPY[metric].title}
              subtitle={`${periodLabel}, tính theo giờ Việt Nam.`}
              actions={
                <ChipGroup
                  label="Số liệu của biểu đồ"
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { value: "applications", label: "Hồ sơ" },
                    { value: "views", label: "Lượt xem" },
                  ]}
                />
              }
            />
            <div>
              <TrendChart
                points={
                  metric === "applications"
                    ? analytics.data.applicationsDaily
                    : analytics.data.viewsDaily
                }
                unit={METRIC_COPY[metric].unit}
                periodLabel={periodLabel}
                emptyText={METRIC_COPY[metric].empty}
              />
              <ChartNote
                points={
                  metric === "applications"
                    ? analytics.data.applicationsDaily
                    : analytics.data.viewsDaily
                }
                unit={METRIC_COPY[metric].unit}
                range={range}
              />
              {metric === "applications" ? (
                <FirstResponseNote
                  firstResponse={analytics.data.firstResponse}
                />
              ) : null}
            </div>
          </Panel>

          <Panel labelledBy="employer-funnel-title">
            <PanelHead
              id="employer-funnel-title"
              title="Phễu tuyển dụng"
              subtitle={`Hồ sơ nộp trong ${periodLabel}.`}
            />
            <Funnel funnel={analytics.data.funnel} />
          </Panel>
        </div>
      )}
    </section>
  );
}

function ChartNote({
  points,
  unit,
  range,
}: {
  points: DailyPoint[];
  unit: string;
  range: DashboardRange;
}) {
  const total = points.reduce((sum, p) => sum + p.value, 0);
  if (total === 0) return null;
  const peak = points.reduce(
    (best, p) => (p.value > best.value ? p : best),
    points[0]!,
  );
  return (
    <p className="mt-3 text-text-muted">
      Tổng{" "}
      <b className="font-num tabular-nums text-text-strong">
        {formatNumber(total)}
      </b>{" "}
      {unit} trong {range} ngày, cao nhất{" "}
      <b className="font-num tabular-nums text-text-strong">
        {formatNumber(peak.value)}
      </b>{" "}
      {unit} vào {formatDayMonth(peak.date)}.
    </p>
  );
}

function FirstResponseNote({
  firstResponse,
}: {
  firstResponse: EmployerDashboardAnalytics["firstResponse"];
}) {
  if (firstResponse.averageHours === null) {
    return (
      <p className="mt-1 text-text-muted">
        Chưa có hồ sơ nào được phản hồi trong kỳ này.
      </p>
    );
  }
  return (
    <p className="mt-1 text-text-muted">
      Phản hồi hồ sơ lần đầu trung bình sau{" "}
      <b className="font-num tabular-nums text-text-strong">
        {formatDecimal(firstResponse.averageHours)}
      </b>{" "}
      giờ (tính trên {formatNumber(firstResponse.sampleSize)} hồ sơ).
    </p>
  );
}

function Funnel({ funnel }: { funnel: EmployerDashboardAnalytics["funnel"] }) {
  const items: BarListItem[] = funnel.steps.map((step, i) => {
    const previous = i > 0 ? funnel.steps[i - 1]!.count : null;
    return {
      label: FUNNEL_STEP[step.step].label,
      value: step.count,
      tone: FUNNEL_STEP[step.step].tone,
      note:
        previous === null
          ? "Toàn bộ hồ sơ nộp trong kỳ"
          : previous > 0
            ? `${Math.round((step.count / previous) * 100)}% từ bước trước`
            : "Bước trước chưa có hồ sơ",
    };
  });
  const applied = funnel.steps[0]?.count ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {applied === 0 ? (
        <p className="text-text-muted">
          Chưa có hồ sơ nào nộp trong kỳ này. Phễu sẽ hiện khi có hồ sơ.
        </p>
      ) : null}
      <BarList items={items} />
      {funnel.legacyRejected > 0 ? (
        <p className="text-text-muted">
          Ước lượng: {formatNumber(funnel.legacyRejected)} hồ sơ bị từ chối
          trước khi hệ thống ghi lịch sử chuyển trạng thái chỉ được tính ở bước
          Ứng tuyển.
        </p>
      ) : null}
    </div>
  );
}
