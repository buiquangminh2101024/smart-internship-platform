"use client";

import { useState, type ReactNode } from "react";
import type { AuditActionGroup, AuditActivityStats, AuditActorRoleFilter } from "@sip/shared-types";
import {
  AUDIT_GROUPS,
  DOW_LABEL,
  GROUP_META,
  ROLE_FILTERS,
  ROLE_LABEL,
  type ActivityFilters,
} from "@/lib/audit-activity";
import { formatDayMonth, formatNumber, weekdayShort } from "@/lib/dashboard-format";
import { AdminPanel, AdminPanelHead } from "@/components/dashboard/admin/AdminPanel";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { DashButton } from "@/components/dashboard/DashButton";
import { ActivityBarList } from "./ActivityBarList";
import { ActivityDayChart, STACK_ORDER } from "./ActivityDayChart";
import { ChartTable } from "./ChartTable";
import { GroupSwatch, roleLabelOf } from "./ActivityMeta";
import { JobPostFlow, type FlowSelection } from "./JobPostFlow";
import { TopActorsList } from "./TopActorsList";
import { WeekHourHeatmap } from "./WeekHourHeatmap";

type Actor = AuditActivityStats["topActors"][number];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function percentOf(value: number, total: number): string {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : "0%";
}

/**
 * Một khối biểu đồ: tiêu đề, dòng phụ nói bấm vào thì lọc gì, nút "Xem dạng
 * bảng" bật/tắt bảng thay cho biểu đồ (màu không bao giờ là kênh duy nhất).
 */
function StatPanel({
  id,
  title,
  subtitle,
  className = "",
  chart,
  table,
}: {
  id: string;
  title: string;
  subtitle: string;
  className?: string;
  chart: ReactNode;
  table: () => ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <AdminPanel labelledBy={`${id}-title`} className={className}>
      <AdminPanelHead
        id={`${id}-title`}
        title={title}
        subtitle={subtitle}
        actions={
          <DashButton variant="ghost" size="sm" icon={asTable ? "chart-column" : "table-2"} onClick={() => setAsTable((value) => !value)}>
            {asTable ? "Xem biểu đồ" : "Xem dạng bảng"}
          </DashButton>
        }
      />
      <div className="px-4 pb-4 @xl:px-5 @xl:pb-5">{asTable ? table() : chart}</div>
    </AdminPanel>
  );
}

const PANEL_SPANS = {
  day: "lg:col-span-12 xl:col-span-8",
  groups: "lg:col-span-6 xl:col-span-4",
  roles: "lg:col-span-6 xl:col-span-3",
  actors: "lg:col-span-6 xl:col-span-3",
  heatmap: "lg:col-span-6 xl:col-span-6",
  flow: "lg:col-span-12",
} as const;

/**
 * Lưới thống kê của trang (hàng 1: theo ngày + tỉ lệ nhóm; hàng 2: vai trò, top
 * người làm, thứ × giờ; hàng 3: dòng chảy tin). Bấm vào biểu đồ thì đổi bộ lọc
 * qua `onChange`, nên URL luôn là nguồn sự thật.
 */
export function ActivityStatsGrid({
  filters,
  status,
  stats,
  retrying,
  onRetry,
  pendingJobPosts,
  onChange,
  onOpenActorJourney,
}: {
  filters: ActivityFilters;
  status: "pending" | "error" | "success";
  stats: AuditActivityStats | undefined;
  retrying: boolean;
  onRetry: () => void;
  pendingJobPosts: number | undefined;
  onChange: (next: ActivityFilters) => void;
  onOpenActorJourney: (actor: Actor) => void;
}) {
  if (filters.archived) {
    return (
      <p className="rounded-[14px] border border-border-subtle bg-surface-card px-4 py-3 text-sm text-text-muted">
        Thống kê không áp dụng cho nhật ký đã lưu trữ.
      </p>
    );
  }

  if (status === "error" && !stats) {
    return <BlockError what="thống kê" onRetry={onRetry} retrying={retrying} />;
  }

  if (!stats) {
    return (
      <div aria-busy className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <BlockSkeleton height={320} className={PANEL_SPANS.day} />
        <BlockSkeleton height={320} className={PANEL_SPANS.groups} />
        <BlockSkeleton height={300} className={PANEL_SPANS.roles} />
        <BlockSkeleton height={300} className={PANEL_SPANS.actors} />
        <BlockSkeleton height={300} className={PANEL_SPANS.heatmap} />
        <BlockSkeleton height={240} className={PANEL_SPANS.flow} />
      </div>
    );
  }

  const groupItems = AUDIT_GROUPS.map((group) => ({
    key: group,
    label: GROUP_META[group].label,
    value: stats.byGroup.find((item) => item.group === group)?.count ?? 0,
    barClass: GROUP_META[group].swatch,
    lead: <GroupSwatch group={group} size={18} />,
  }));
  const otherCount = stats.byGroup.find((item) => item.group === "OTHER")?.count ?? 0;
  const groupTotal = stats.byGroup.reduce((sum, item) => sum + item.count, 0);

  const roleItems = ROLE_FILTERS.map((role) => ({
    key: role,
    label: ROLE_LABEL[role],
    value: stats.byRole.find((item) => item.role === role)?.count ?? 0,
    barClass: "bg-brand-500",
  }));
  const roleTotal = roleItems.reduce((sum, item) => sum + item.value, 0);

  const flowSelected: FlowSelection | null =
    filters.actions.length === 1 ? { action: filters.actions[0]!, resubmit: filters.resubmit } : null;

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <StatPanel
          id="stat-day"
          title="Theo ngày"
          subtitle="Kéo trên biểu đồ (hoặc dùng mũi tên rồi Enter) để lọc theo khoảng ngày."
          className={PANEL_SPANS.day}
          chart={
            <ActivityDayChart
              days={stats.byDay}
              onSelectRange={(from, to) => onChange({ ...filters, from, to, since: null, until: null })}
            />
          }
          table={() => (
            <ChartTable
              caption="Số sự kiện theo ngày và nhóm"
              headers={["Ngày", "Tổng", ...STACK_ORDER.map((group) => GROUP_META[group].label)]}
              numeric={Array.from({ length: STACK_ORDER.length + 1 }, (_, index) => index + 1)}
              rows={stats.byDay.map((day) => [
                `${weekdayShort(day.date)} ${formatDayMonth(day.date)}`,
                formatNumber(day.total),
                ...STACK_ORDER.map((group) => formatNumber(day.counts[group] ?? 0)),
              ])}
            />
          )}
        />

        <StatPanel
          id="stat-group"
          title="Tỉ lệ theo nhóm"
          subtitle="Bấm một nhóm để lọc; bấm lại để bỏ."
          className={PANEL_SPANS.groups}
          chart={
            <div className="grid gap-2">
              <ActivityBarList<AuditActionGroup>
                items={groupItems}
                selected={filters.groups}
                onToggle={(group) => onChange({ ...filters, groups: toggle(filters.groups, group) })}
                label="Lọc theo nhóm"
              />
              {otherCount > 0 ? (
                <p className="px-2.5 text-[13px] text-text-muted">
                  Khác (hành động cũ chưa xếp nhóm): <span className="tabular-nums">{formatNumber(otherCount)}</span>
                </p>
              ) : null}
            </div>
          }
          table={() => (
            <ChartTable
              caption="Số sự kiện theo nhóm"
              headers={["Nhóm", "Số sự kiện", "Tỉ lệ"]}
              numeric={[1, 2]}
              rows={stats.byGroup.map((item) => [
                GROUP_META[item.group].label,
                formatNumber(item.count),
                percentOf(item.count, groupTotal),
              ])}
            />
          )}
        />

        <StatPanel
          id="stat-role"
          title="Vai trò người làm"
          subtitle="Bấm một vai trò để lọc."
          className={PANEL_SPANS.roles}
          chart={
            <ActivityBarList<AuditActorRoleFilter>
              items={roleItems}
              selected={filters.roles}
              onToggle={(role) => onChange({ ...filters, roles: toggle(filters.roles, role) })}
              label="Lọc theo vai trò"
            />
          }
          table={() => (
            <ChartTable
              caption="Số sự kiện theo vai trò người làm"
              headers={["Vai trò", "Số sự kiện", "Tỉ lệ"]}
              numeric={[1, 2]}
              rows={roleItems.map((item) => [item.label, formatNumber(item.value), percentOf(item.value, roleTotal)])}
            />
          )}
        />

        <StatPanel
          id="stat-actor"
          title="Top 5 người làm"
          subtitle="Bấm email để lọc theo người đó."
          className={PANEL_SPANS.actors}
          chart={
            <TopActorsList
              actors={stats.topActors}
              selectedQ={filters.q}
              onFilterEmail={(email) => onChange({ ...filters, q: filters.q === email ? null : email })}
              onOpenJourney={onOpenActorJourney}
            />
          }
          table={() => (
            <ChartTable
              caption="Năm người làm nhiều nhất"
              headers={["Email", "Vai trò", "Số sự kiện"]}
              numeric={[2]}
              rows={stats.topActors.map((actor) => [
                actor.email ?? "Tài khoản đã xoá",
                roleLabelOf(actor.actorRole),
                formatNumber(actor.count),
              ])}
            />
          )}
        />

        <StatPanel
          id="stat-heatmap"
          title="Thứ × giờ"
          subtitle="Bấm một ô để lọc theo khung giờ đó (giờ Việt Nam)."
          className={PANEL_SPANS.heatmap}
          chart={
            <WeekHourHeatmap
              heatmap={stats.heatmap}
              selected={filters.slot}
              onSelect={(slot) => onChange({ ...filters, slot })}
            />
          }
          table={() => (
            <ChartTable
              caption="Số sự kiện theo thứ và giờ"
              headers={["Thứ", ...Array.from({ length: 24 }, (_, hour) => `${hour}h`)]}
              numeric={Array.from({ length: 24 }, (_, index) => index + 1)}
              rows={stats.heatmap.map((counts, row) => [DOW_LABEL[row]!, ...counts.map((value) => formatNumber(value))])}
            />
          )}
        />

        <StatPanel
          id="stat-flow"
          title="Dòng chảy tin tuyển dụng"
          subtitle="Bấm một nhánh để xem đúng các dòng đó."
          className={PANEL_SPANS.flow}
          chart={
            <JobPostFlow
              flow={stats.jobPostFlow}
              pending={pendingJobPosts}
              selected={flowSelected}
              onSelect={(selection) =>
                onChange({
                  ...filters,
                  actions: selection ? [selection.action] : [],
                  resubmit: selection?.resubmit ?? null,
                })
              }
            />
          }
          table={() => (
            <ChartTable
              caption="Dòng chảy tin tuyển dụng"
              headers={["Nhánh", "Số lượt"]}
              numeric={[1]}
              rows={[
                ["Gửi duyệt lần đầu", formatNumber(stats.jobPostFlow.submittedFirst)],
                ["Gửi lại sau từ chối", formatNumber(stats.jobPostFlow.submittedResubmit)],
                ["Tự đăng", formatNumber(stats.jobPostFlow.autoPublished)],
                ["Duyệt", formatNumber(stats.jobPostFlow.approved)],
                ["Từ chối", formatNumber(stats.jobPostFlow.rejected)],
                ["Đã hạ (gỡ tin)", formatNumber(stats.jobPostFlow.retracted)],
                ["Còn chờ duyệt lúc này", pendingJobPosts === undefined ? "–" : formatNumber(pendingJobPosts)],
              ]}
            />
          )}
        />
      </div>

      {filters.q ? (
        <p className="text-[13px] text-text-muted">
          Biểu đồ tính theo người làm: khi lọc bằng email, biểu đồ chỉ đếm thao tác do tài khoản khớp email làm, còn
          danh sách tính cả dòng tác động tới tài khoản đó.
        </p>
      ) : null}
    </div>
  );
}
