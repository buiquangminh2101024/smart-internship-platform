"use client";

import type { ReactNode } from "react";
import type { AdminAutomationStatus } from "@sip/shared-types";
import { useAutomationStatus } from "@/hooks/useAdminDashboard";
import {
  formatDecimal,
  formatNumber,
  formatVnDate,
  formatVnDayMonth,
  formatVnTime,
  formatWaited,
} from "@/lib/dashboard-format";
import { Icon } from "@/components/ui/Icon";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { AdminPanel, AdminPanelHead } from "./AdminPanel";

/*
 * Thẻ "Hệ thống tự động" của dashboard Admin (0.6, plan frontend F5, AD-27). Chỉ để xem, không
 * có thao tác. Theo bản D: marigold chỉ cho thời gian chờ ("lâu nhất X phút").
 */

const TITLE_ID = "admin-automation-title";

/** "14:30", hoặc "14:30 ngày 13/11" khi không phải hôm nay (giờ Việt Nam). */
function formatAt(iso: string, now: number): string {
  const time = formatVnTime(iso);
  return formatVnDate(iso) === formatVnDate(now) ? time : `${time} ngày ${formatVnDayMonth(iso)}`;
}

/** Dưới 10 giây ghi một chữ số thập phân (`4,2`), còn lại làm tròn. */
function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  return seconds < 10 ? formatDecimal(seconds) : formatNumber(Math.round(seconds));
}

function Section({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle px-4 pt-3.5 pb-4 first:border-t-0 @xl:px-5">
      <p className="flex items-center gap-2 text-[13px] font-bold text-text-muted">
        <Icon name={icon} size={16} className="text-brand-600" />
        {label}
      </p>
      {children}
    </div>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <b className="font-bold text-text-strong tabular-nums">{children}</b>;
}

function AutomationStatusBody({ data, now }: { data: AdminAutomationStatus; now: number }) {
  const { rescore, today, nightly } = data;
  const lastRun = rescore.lastRun;

  return (
    <div className="flex flex-col">
      <Section icon="hourglass" label="Đang chờ chấm lại">
        {rescore.pending > 0 ? (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[26px] leading-[1.1] font-bold text-text-strong tabular-nums">
              {formatNumber(rescore.pending)}
            </span>
            <span className="text-[13px] text-text-muted">ứng viên</span>
            {rescore.oldestRequestedAt ? (
              <span className="inline-flex h-[22px] items-center rounded-full bg-marigold-100 px-2 text-xs font-bold text-marigold-800 tabular-nums">
                lâu nhất {formatWaited(rescore.oldestRequestedAt, now)}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-text-body">
            <Icon name="check" size={14} className="text-success-700" />
            Không có ứng viên nào đang chờ.
          </p>
        )}
      </Section>

      <Section icon="history" label="Lượt chấm gần nhất">
        {lastRun ? (
          <p className="text-text-body">
            <Strong>{formatAt(lastRun.at, now)}</Strong>, chấm <Strong>{formatNumber(lastRun.candidates)}</Strong> người
            trong <Strong>{formatSeconds(lastRun.durationMs)}</Strong> giây
            {lastRun.remaining > 0 ? (
              <>
                {" "}
                · còn <Strong>{formatNumber(lastRun.remaining)}</Strong> người
                {lastRun.timedOut ? " (hết giờ, lượt sau chấm tiếp)" : ""}
              </>
            ) : null}
            .
          </p>
        ) : (
          <p className="text-text-muted">Chưa có lượt nào trong 7 ngày qua.</p>
        )}
      </Section>

      <Section icon="calendar-check" label="Hôm nay">
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5">
          {[
            { label: "Lời mời tự động", value: today.autoInvitations },
            { label: "Tin đã báo cho ứng viên", value: today.jobAlerts },
            { label: "Hồ sơ tự chuyển Đang xem xét", value: today.autoReviewed },
          ].map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-text-body">{row.label}</dt>
              <dd className="text-right">
                <Strong>{formatNumber(row.value)}</Strong>
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section icon="moon" label="Chấm đêm gần nhất">
        {nightly ? (
          <p className="text-text-body">
            <Strong>
              {formatVnTime(nightly.lastRunAt)} {formatVnDayMonth(nightly.lastRunAt)}
            </Strong>
            , chấm <Strong>{formatNumber(nightly.jobsScored)}</Strong> tin
            {nightly.jobsDeferred > 0 ? (
              <>
                {" "}
                · <Strong>{formatNumber(nightly.jobsDeferred)}</Strong> tin để đêm sau
              </>
            ) : null}
            .
          </p>
        ) : (
          <p className="text-text-muted">Chưa ghi nhận lượt nào trong 7 ngày qua.</p>
        )}
      </Section>
    </div>
  );
}

/** Tự tải và tự báo lỗi, như các khối khác của dashboard bản D. */
export function AutomationStatusPanel() {
  const status = useAutomationStatus();
  const head = (
    <AdminPanelHead
      id={TITLE_ID}
      title="Hệ thống tự động"
      subtitle={
        status.data
          ? `Chấm lại điểm phù hợp và việc hệ thống tự làm · cập nhật lúc ${formatVnTime(status.dataUpdatedAt)}`
          : "Chấm lại điểm phù hợp và việc hệ thống tự làm"
      }
    />
  );

  if (status.isPending) return <BlockSkeleton height={360} />;
  if (status.isError) {
    return (
      <BlockError
        what="trạng thái hệ thống tự động"
        onRetry={() => void status.refetch()}
        retrying={status.isFetching}
        minHeight={120}
      />
    );
  }

  return (
    <AdminPanel labelledBy={TITLE_ID}>
      {head}
      <AutomationStatusBody data={status.data} now={status.dataUpdatedAt} />
    </AdminPanel>
  );
}
