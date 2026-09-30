import Link from "next/link";
import type { EmployerDashboardOverview } from "@sip/shared-types";
import { StatCard } from "@/components/ui/StatCard";
import { MESSAGES_HREF } from "@/lib/messaging";
import {
  formatChange,
  formatNumber,
  formatVnDayMonth,
  formatVnTime,
  formatWaited,
  initialsOf,
  trendOf,
  vnTodayIso,
} from "@/lib/dashboard-format";
import { SegmentBar } from "../SegmentBar";
import { CompareBars } from "../CompareBars";
import { DayColumns } from "../DayColumns";
import { QuotaBar } from "../QuotaBar";
import { DashButton } from "../DashButton";

export const PENDING_TASKS_ANCHOR = "viec-ho-so-cho";

/** Sáu thẻ KPI của Employer (plan FE, mục "Employer"; hình theo mẫu bản C). */
export function EmployerKpiGrid({ overview }: { overview: EmployerDashboardOverview }) {
  const { jobs, applications, messages, outreach, interviews } = overview;
  const newApps = applications.newLast7Days;
  const next = interviews.next;
  const today = vnTodayIso();

  return (
    <section aria-label="Thông số chính" className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
      <StatCard
        label="Tin đang hiển thị"
        icon="briefcase"
        href="/employer/jobs"
        value={formatNumber(jobs.published)}
        unit="tin"
        hint={
          jobs.topJob
            ? `Nhiều hồ sơ nhất: ${jobs.topJob.title} (${formatNumber(jobs.topJob.applicationCount)})`
            : "Chưa có tin nào đang hiển thị"
        }
        footer={
          <SegmentBar
            label="Hạn của tin đang hiển thị"
            segments={[
              { label: "Còn hạn trên 7 ngày", value: Math.max(0, jobs.published - jobs.expiringIn7Days), tone: "brand" },
              { label: "Hết hạn trong 7 ngày", value: jobs.expiringIn7Days, tone: "wait-mid" },
            ]}
          />
        }
      />

      <StatCard
        label="Hồ sơ mới trong 7 ngày"
        icon="inbox"
        value={formatNumber(newApps.current)}
        unit="hồ sơ"
        delta={{ text: formatChange(newApps.current, newApps.previous), trend: trendOf(newApps.current, newApps.previous) }}
        hint="so với 7 ngày trước"
        footer={
          <CompareBars
            current={{ label: "7 ngày qua", value: newApps.current }}
            previous={{ label: "7 ngày trước", value: newApps.previous }}
          />
        }
      />

      <StatCard
        label="Hồ sơ chờ xử lý"
        icon="clock"
        tone="attention"
        href={`#${PENDING_TASKS_ANCHOR}`}
        value={formatNumber(applications.pendingCount)}
        unit="hồ sơ"
        hint={
          applications.oldestPendingSince
            ? `Hồ sơ cũ nhất đã chờ ${formatWaited(applications.oldestPendingSince)}`
            : "Không có hồ sơ nào đang chờ"
        }
        footer={
          <SegmentBar
            label="Thời gian chờ của hồ sơ"
            segments={[
              { label: "Dưới 24 giờ", value: applications.pendingWait.under24h, tone: "wait-short" },
              { label: "1 – 2 ngày", value: applications.pendingWait.oneToTwoDays, tone: "wait-mid" },
              { label: "Trên 2 ngày", value: applications.pendingWait.over2Days, tone: "wait-long" },
            ]}
          />
        }
      />

      <StatCard
        label="Lịch phỏng vấn sắp tới"
        icon="calendar"
        value={formatNumber(interviews.upcomingCount)}
        unit="lịch"
        hint={
          next
            ? `Gần nhất: ${dayLabel(next.scheduledAt, today)}, ${formatVnTime(next.scheduledAt)}`
            : "Chưa có lịch phỏng vấn nào sắp tới"
        }
        footer={<DayColumns days={interviews.next7Days} highlightDate={today} unit="lịch phỏng vấn" caption="7 ngày tới" />}
      />

      <StatCard
        label="Tin nhắn chưa đọc"
        icon="message-square"
        href={MESSAGES_HREF.employer}
        value={formatNumber(messages.unreadConversations)}
        unit="cuộc trò chuyện"
        hint={
          messages.unreadCandidates > 0
            ? `Từ ${formatNumber(messages.unreadCandidates)} ứng viên`
            : "Bạn đã đọc hết tin nhắn"
        }
        footer={
          messages.recent.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {messages.recent.map((m) => (
                <li key={m.conversationId} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-[13px] font-bold text-brand-700"
                  >
                    {initialsOf(m.candidateName)}
                  </span>
                  <Link
                    href={`${MESSAGES_HREF.employer}?conversationId=${encodeURIComponent(m.conversationId)}`}
                    className="min-w-0 flex-1 truncate font-semibold text-text-strong hover:text-brand-700 hover:underline"
                  >
                    {m.candidateName}
                  </Link>
                  <span className="shrink-0 text-text-muted">{formatWaited(m.lastMessageAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">Không có tin nhắn chưa đọc.</p>
          )
        }
      />

      <OutreachKpi outreach={outreach} />
    </section>
  );
}

function OutreachKpi({ outreach }: { outreach: EmployerDashboardOverview["outreach"] }) {
  const { quota, last30Days } = outreach;

  if (quota.mode === "BLOCKED") {
    return (
      <StatCard
        label="Lời mời còn lại hôm nay"
        icon="send"
        value="—"
        hint="Cần gói còn hiệu lực để gửi lời mời"
        footer={
          <DashButton href="/employer/subscription" variant="secondary" size="sm" iconAfter="arrow-right" className="self-start">
            Xem gói dịch vụ
          </DashButton>
        }
      />
    );
  }

  const acceptance =
    last30Days.sent > 0
      ? {
          label: "Chấp nhận trong 30 ngày",
          value: `${formatNumber(last30Days.accepted)} / ${formatNumber(last30Days.sent)} (${Math.round(
            (last30Days.accepted / last30Days.sent) * 100,
          )}%)`,
        }
      : { label: "Chưa gửi lời mời nào trong 30 ngày qua." };

  return (
    <StatCard
      label="Lời mời còn lại hôm nay"
      icon="send"
      value={formatNumber(quota.remainingToday)}
      unit={`/ ${formatNumber(quota.dailyQuota)} lời mời`}
      hint={quota.mode === "TRIAL" ? "Đang dùng thử, đặt lại lúc 07:00 mỗi ngày" : "Đặt lại lúc 07:00 mỗi ngày"}
      footer={<QuotaBar used={quota.usedToday} total={quota.dailyQuota} extra={acceptance} />}
    />
  );
}

/** "hôm nay" / "ngày mai" / "DD/MM" theo giờ Việt Nam. */
function dayLabel(iso: string, todayIso: string): string {
  const [y, m, d] = todayIso.split("-").map(Number);
  const tomorrowIso = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
  const day = vnTodayIso(new Date(iso));
  if (day === todayIso) return "hôm nay";
  if (day === tomorrowIso) return "ngày mai";
  return formatVnDayMonth(iso);
}
