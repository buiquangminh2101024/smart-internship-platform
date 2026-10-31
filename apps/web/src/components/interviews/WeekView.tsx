"use client";

import type { EmployerInterview } from "@sip/shared-types";
import { useEmployerInterviews, type InterviewListFilter } from "@/hooks/useInterviews";
import { addDaysIso, formatWeekRange, vnDateAndMinutes, vnIso } from "@/lib/interview-format";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { BookedEmpty, DayGroupList, groupByDay, type DayFocus, type DayOpenState } from "./DayGroupList";
import { WeekStrip } from "./WeekStrip";

/**
 * Chế độ "Theo tuần" (D11): dải 7 ngày và danh sách nhóm ngày của tuần
 * `monday`. Mặc định mở ngày gần nhất còn lịch (hôm nay, hoặc ngày đầu tiên sau
 * hôm nay có lịch); tuần đã qua hết thì không mở sẵn ngày nào.
 */
export function WeekView({
  monday,
  isCurrentWeek,
  today,
  now,
  filter,
  dayState,
  dayFocus,
  onReschedule,
  onCancel,
  onOpenAwaiting,
}: {
  monday: string;
  isCurrentWeek: boolean;
  today: string;
  now: number;
  filter: InterviewListFilter;
  dayState: DayOpenState;
  dayFocus: DayFocus;
  onReschedule: (interview: EmployerInterview) => void;
  onCancel: (interview: EmployerInterview) => void;
  onOpenAwaiting: () => void;
}) {
  const range = { from: vnIso(monday, "00:00"), to: vnIso(addDaysIso(monday, 7), "00:00") };
  const query = useEmployerInterviews(range, filter);
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <BlockSkeleton height={120} />
        <BlockSkeleton height={240} />
      </div>
    );
  }
  if (query.isError) {
    return <BlockError what="lịch của tuần này" onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }

  const days = groupByDay(query.data);
  const byDay = new Map(days.map((day) => [day.date, day.items]));
  const defaultOpen = days.find((day) => day.date >= today)?.date ?? null;
  return (
    <div className="flex flex-col gap-4">
      <WeekStrip
        monday={monday}
        today={today}
        byDay={byDay}
        now={now}
        onOpenDay={(date) => dayFocus.focusDay(date)}
        onOpenInterview={(interview) =>
          dayFocus.focusInterview(interview.id, vnDateAndMinutes(interview.scheduledAt).date)
        }
      />
      {days.length === 0 ? (
        <BookedEmpty
          title={
            isCurrentWeek
              ? "Tuần này chưa có buổi phỏng vấn nào"
              : `Tuần ${formatWeekRange(monday)} chưa có buổi phỏng vấn nào`
          }
          onOpenAwaiting={onOpenAwaiting}
        />
      ) : (
        <DayGroupList
          days={days}
          today={today}
          defaultOpen={defaultOpen}
          overrides={dayState.overrides}
          onToggle={dayState.setOpen}
          onReset={() => dayState.reset(days.map((day) => day.date))}
          now={now}
          highlightId={dayFocus.highlightId}
          onReschedule={onReschedule}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
