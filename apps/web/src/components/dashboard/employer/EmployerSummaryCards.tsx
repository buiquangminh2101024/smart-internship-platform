import type { ReactNode } from "react";
import type { EmployerDashboardOverview } from "@sip/shared-types";
import { StatCard, type StatCardDelta } from "@/components/ui/StatCard";
import { MESSAGES_HREF } from "@/lib/messaging";
import {
  formatChange,
  formatNumber,
  formatRelativePast,
  formatVnDayMonth,
  formatVnTime,
  formatWaited,
  trendOf,
  vnTodayIso,
  weekdayShort,
} from "@/lib/dashboard-format";
import { BlockSkeleton } from "../BlockState";

/** Lưới 4 thẻ: 1 cột → 2 × 2 → 4 trên một hàng (theo bề rộng vùng nội dung, `@container` của trang). */
const GRID_CLASS = "grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-4";

/** Chiều cao khung xám khi đang tải, xấp xỉ chiều cao một thẻ. */
const CARD_SKELETON_HEIGHT = 232;

/**
 * Bốn thẻ chính của dashboard Employer (docs/05-frontend/phases/employer-dashboard-v2/PLAN.md, E2):
 * mỗi thẻ là một link sang trang quản lý tương ứng. Thẻ là **việc đang chờ**, không thao tác tại chỗ.
 */
export function EmployerSummaryCards({ overview }: { overview: EmployerDashboardOverview }) {
  const { applications, interviews, jobs, messages } = overview;
  const pending = applications.pendingCount;
  const newApps = applications.newLast7Days;
  const attention = jobs.attention;
  const latestMessage = messages.recent[0];

  return (
    <section aria-label="Việc đang chờ" className={GRID_CLASS}>
      <StatCard
        label="Hồ sơ chờ xử lý"
        icon="clock"
        tone={pending > 0 ? "attention" : "default"}
        href="/employer/applications?status=PENDING"
        cta="Xem hồ sơ chờ"
        value={formatNumber(pending)}
        unit="hồ sơ"
        delta={compare(newApps.current, newApps.previous, "Hồ sơ mới bằng 7 ngày trước")}
        hint={newApps.current === newApps.previous ? undefined : "hồ sơ mới so với 7 ngày trước"}
        footer={
          <Detail>
            {applications.oldestPendingSince
              ? `Cũ nhất: đã chờ ${formatWaited(applications.oldestPendingSince)}`
              : "Không có hồ sơ nào đang chờ"}
          </Detail>
        }
      />

      <StatCard
        label="Phỏng vấn 7 ngày tới"
        icon="calendar"
        href="/employer/interviews?view=upcoming"
        cta="Xem lịch phỏng vấn"
        value={formatNumber(interviews.upcomingCount)}
        unit="buổi"
        delta={compare(interviews.upcomingCount, interviews.last7Days, "Bằng 7 ngày qua")}
        hint={interviews.upcomingCount === interviews.last7Days ? undefined : "so với 7 ngày qua"}
        footer={
          <Detail>
            {interviews.next ? (
              <>
                Gần nhất: <Num>{interviewTime(interviews.next.scheduledAt)}</Num>
                {interviews.next.candidateName ? ` · ${interviews.next.candidateName}` : null}
              </>
            ) : (
              "Chưa có lịch phỏng vấn nào sắp tới"
            )}
          </Detail>
        }
      />

      <StatCard
        label="Tin cần chú ý"
        icon="triangle-alert"
        tone={attention.total > 0 ? "attention" : "default"}
        href="/employer/jobs?attention=1"
        cta="Xem tin cần chú ý"
        value={formatNumber(attention.total)}
        unit="tin"
        hint={attention.total > 0 ? undefined : "Không có tin nào cần chú ý"}
        footer={
          <>
            <Detail>
              <Num>{formatNumber(attention.rejected)}</Num> bị từ chối, cần sửa và gửi lại
            </Detail>
            <Detail>
              <Num>{formatNumber(attention.expiringIn7Days)}</Num> hết hạn trong 7 ngày, trên{" "}
              <Num>{formatNumber(jobs.published)}</Num> tin đang hiển thị
            </Detail>
          </>
        }
      />

      <StatCard
        label="Tin nhắn chưa đọc"
        icon="message-square"
        href={MESSAGES_HREF.employer}
        cta="Mở tin nhắn"
        value={formatNumber(messages.unreadConversations)}
        unit="cuộc trò chuyện"
        hint={
          messages.unreadCandidates > 0 ? `Từ ${formatNumber(messages.unreadCandidates)} ứng viên` : "Bạn đã đọc hết tin nhắn"
        }
        footer={
          <Detail>
            {latestMessage
              ? `Mới nhất: ${latestMessage.candidateName} · ${formatRelativePast(latestMessage.lastMessageAt)}`
              : "Không có tin nhắn chưa đọc"}
          </Detail>
        }
      />
    </section>
  );
}

export function EmployerSummaryCardsSkeleton() {
  return (
    <div className={GRID_CLASS}>
      {Array.from({ length: 4 }, (_, i) => (
        <BlockSkeleton key={i} height={CARD_SKELETON_HEIGHT} />
      ))}
    </div>
  );
}

/** Nhãn tăng giảm: `+2 (+50%)` kèm dấu và icon (không dùng màu làm kênh duy nhất); bằng nhau thì ghi rõ bằng chữ. */
function compare(current: number, previous: number, sameText: string): StatCardDelta {
  const trend = trendOf(current, previous);
  return { text: trend === "flat" ? sameText : formatChange(current, previous), trend };
}

/** `T5 06/11, 14:00` theo giờ Việt Nam. */
function interviewTime(iso: string): string {
  return `${weekdayShort(vnTodayIso(new Date(iso)))} ${formatVnDayMonth(iso)}, ${formatVnTime(iso)}`;
}

function Detail({ children }: { children: ReactNode }) {
  return <p className="text-text-muted">{children}</p>;
}

function Num({ children }: { children: ReactNode }) {
  return <b className="font-num font-bold tabular-nums text-text-strong">{children}</b>;
}
