"use client";

import type { ReactNode } from "react";
import type { AdminDashboardOverview } from "@sip/shared-types";
import { formatChange, formatNumber, formatVnd, formatVndShort, trendOf } from "@/lib/dashboard-format";
import { Icon } from "@/components/ui/Icon";
import { AdminPanel, AdminPanelHead, SplitBar } from "./AdminPanel";

/** Tháng hiện tại và tháng trước theo giờ Việt Nam, dạng `MM/YYYY`. */
function vnMonths(now: number): { current: string; previous: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" })
    .formatToParts(new Date(now))
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const year = Number(parts.year);
  const month = Number(parts.month);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return {
    current: `${String(month).padStart(2, "0")}/${year}`,
    previous: `${String(prevMonth).padStart(2, "0")}/${prevYear}`,
  };
}

function Delta({ current, previous, format, note }: { current: number; previous: number; format?: (n: number) => string; note?: string }) {
  const trend = trendOf(current, previous);
  return (
    <>
      <span
        className={`inline-flex h-[22px] items-center gap-[3px] rounded-full px-2 text-xs font-bold tabular-nums ${
          trend === "up" ? "bg-success-100 text-success-700" : "bg-surface-hover text-text-body"
        }`}
      >
        <Icon name={trend === "up" ? "arrow-up-right" : trend === "down" ? "arrow-down-right" : "minus"} size={12} />
        {formatChange(current, previous, format)}
      </span>
      {note ? <span className="text-xs text-text-muted">{note}</span> : null}
    </>
  );
}

function Compare({ rows }: { rows: Array<{ label: string; value: number; display: string; current: boolean }> }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 text-xs">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="whitespace-nowrap text-text-muted">{row.label}</dt>
          <span aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-hover">
            <span
              className={`block h-full rounded-full ${row.current ? "bg-brand-600" : "bg-brand-200"}`}
              style={{ width: max > 0 ? `${Math.max((row.value / max) * 100, row.value > 0 ? 2 : 0)}%` : "0%" }}
            />
          </span>
          <dd className="text-right font-bold text-text-strong tabular-nums">{row.display}</dd>
        </div>
      ))}
    </dl>
  );
}

function Metric({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-border-subtle px-4 pt-3.5 pb-4 first:border-t-0 @xl:px-5">
      <p className="flex items-center gap-2 text-[13px] font-bold text-text-muted">
        <Icon name={icon} size={16} className="text-brand-600" />
        {label}
      </p>
      {children}
    </div>
  );
}

function Value({ value, unit, children }: { value: string; unit: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="text-[26px] leading-[1.1] font-bold text-text-strong tabular-nums">{value}</span>
      <span className="text-[13px] text-text-muted">{unit}</span>
      {children}
    </div>
  );
}

/** "Nền tảng": người dùng mới 7 ngày, doanh thu tháng, gói đang hoạt động — mỗi mục có kỳ ghi ngay trong nhãn. */
export function PlatformMetrics({ overview, updatedAt }: { overview: AdminDashboardOverview; updatedAt: number }) {
  const { users, revenue, subscriptions } = overview;
  const months = vnMonths(updatedAt);
  const stillValid = Math.max(0, subscriptions.active - subscriptions.expiringIn7Days);
  const plans = subscriptions.byPlan
    .filter((p) => p.count > 0)
    .map((p) => `${p.planName} ${formatNumber(p.count)}`)
    .join(" · ");

  return (
    <AdminPanel labelledBy="admin-platform-title">
      <AdminPanelHead id="admin-platform-title" title="Nền tảng" subtitle="Kỳ cố định ghi trong từng mục." />
      <div className="flex flex-col">
        <Metric icon="users" label="Người dùng mới trong 7 ngày">
          <Value value={formatNumber(users.newLast7Days.current)} unit="người dùng">
            <Delta
              current={users.newLast7Days.current}
              previous={users.newLast7Days.previous}
              note="so với 7 ngày trước"
            />
          </Value>
          <Compare
            rows={[
              { label: "7 ngày qua", value: users.newLast7Days.current, display: formatNumber(users.newLast7Days.current), current: true },
              { label: "7 ngày trước", value: users.newLast7Days.previous, display: formatNumber(users.newLast7Days.previous), current: false },
            ]}
          />
        </Metric>

        <Metric icon="banknote" label={`Doanh thu tháng ${months.current}`}>
          <Value value={formatNumber(revenue.thisMonth.current)} unit="₫">
            <Delta current={revenue.thisMonth.current} previous={revenue.thisMonth.previous} format={formatVnd} />
          </Value>
          <Compare
            rows={[
              {
                label: `Tháng ${months.current.slice(0, 2)}`,
                value: revenue.thisMonth.current,
                display: formatVndShort(revenue.thisMonth.current),
                current: true,
              },
              {
                label: `Tháng ${months.previous.slice(0, 2)}`,
                value: revenue.thisMonth.previous,
                display: formatVndShort(revenue.thisMonth.previous),
                current: false,
              },
            ]}
          />
        </Metric>

        <Metric icon="package" label="Gói đang hoạt động">
          <Value value={formatNumber(subscriptions.active)} unit={plans ? `gói · ${plans}` : "gói"} />
          <SplitBar
            label="Gói đang hoạt động"
            segments={[
              { label: "Còn hạn trên 7 ngày", value: stillValid, color: "bg-brand-500" },
              { label: "Hết hạn trong 7 ngày", value: subscriptions.expiringIn7Days, color: "bg-marigold-500" },
            ]}
          />
        </Metric>
      </div>
    </AdminPanel>
  );
}
