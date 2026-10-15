"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import type { EmployerInterview } from "@sip/shared-types";
import { formatDayMonth, formatNumber } from "@/lib/dashboard-format";
import { formatDuration, formatMonthLabel, hhmm, vnDateAndMinutes, weekdayLong } from "@/lib/interview-format";
import { Icon } from "@/components/ui/Icon";
import { DashButton } from "@/components/dashboard/DashButton";
import { TaskBadge } from "@/components/dashboard/TaskGroup";
import { InterviewAgendaRow, agendaRowId } from "./InterviewAgendaRow";

export interface DayGroup {
  /** YYYY-MM-DD theo giờ Việt Nam. */
  date: string;
  items: EmployerInterview[];
}

/** Gom lịch thành nhóm theo ngày giờ Việt Nam, sớm nhất trước (giờ rồi `id`, như API). */
export function groupByDay(interviews: EmployerInterview[]): DayGroup[] {
  const sorted = [...interviews].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id));
  const groups: DayGroup[] = [];
  for (const interview of sorted) {
    const { date } = vnDateAndMinutes(interview.scheduledAt);
    const last = groups.at(-1);
    if (last && last.date === date) last.items.push(interview);
    else groups.push({ date, items: [interview] });
  }
  return groups;
}

/** Ngày nào đang mở, do trang giữ (theo khoá ngày, giữ qua các tuần). */
export interface DayOpenState {
  overrides: Readonly<Record<string, boolean>>;
  setOpen: (date: string, open: boolean) => void;
  /** Bỏ lựa chọn của người dùng cho các ngày này (về mặc định). */
  reset: (dates: string[]) => void;
}

/** Trạng thái rỗng của tab "Lịch đã đặt", kèm lối sang tab "Chờ đặt lịch". */
export function BookedEmpty({ title, onOpenAwaiting }: { title: string; onOpenAwaiting: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border-subtle bg-surface-card px-4 py-8 text-center">
      <p className="font-semibold text-text-strong">{title}</p>
      <p className="text-text-muted">Đặt lịch cho hồ sơ đã lọt vào vòng trong ở tab Chờ đặt lịch.</p>
      <DashButton variant="secondary" size="sm" icon="calendar-plus" onClick={onOpenAwaiting}>
        Mở Chờ đặt lịch
      </DashButton>
    </div>
  );
}

export const dayHeaderId = (date: string) => `interview-day-${date}`;

/** Thời gian nhóm ngày trượt mở (khớp `duration-200` bên dưới). */
const EXPAND_MS = 220;
const HIGHLIGHT_MS = 2000;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Mở một ngày rồi chuyển tới đó: `focusDay` cuộn và focus tiêu đề ngày;
 * `focusInterview` cuộn tới dòng, làm nổi khoảng 2 giây và focus link tên. Không
 * tìm thấy đích (vd. buổi đã sang tuần khác) thì gọi `fallback`.
 */
export function useDayFocus(dayState: DayOpenState) {
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function scrollAndFocusDay(date: string): boolean {
    const heading = document.getElementById(dayHeaderId(date));
    const button = heading?.querySelector("button");
    if (!heading || !button) return false;
    heading.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    button.focus({ preventScroll: true });
    return true;
  }

  function focusDay(date: string, fallback?: () => void) {
    dayState.setOpen(date, true);
    later(() => {
      if (!scrollAndFocusDay(date)) fallback?.();
    }, 0);
  }

  function focusInterview(interviewId: string, date: string, fallback?: () => void) {
    dayState.setOpen(date, true);
    setHighlightId(interviewId);
    // Chờ nhóm trượt mở xong rồi mới cuộn, để dòng nằm đúng chỗ.
    later(
      () => {
        const row = document.getElementById(agendaRowId(interviewId));
        const link = row?.querySelector<HTMLElement>("[data-agenda-link]");
        if (row && link) {
          row.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
          link.focus({ preventScroll: true });
        } else if (!scrollAndFocusDay(date)) {
          fallback?.();
        }
      },
      reducedMotion() ? 0 : EXPAND_MS,
    );
    later(() => setHighlightId((current) => (current === interviewId ? null : current)), HIGHLIGHT_MS);
  }

  return { highlightId, focusDay, focusInterview };
}

export type DayFocus = ReturnType<typeof useDayFocus>;
const dayPanelId = (date: string) => `interview-day-panel-${date}`;

/** Số giờ hiện khi nhóm đang đóng. */
const CLOSED_TIMES = 4;

/**
 * Danh sách nhóm ngày đóng/mở (chung cho "Theo tuần" và "Sắp tới"). Ngày nào
 * mở do trang quyết định: `overrides` là lựa chọn của người dùng theo khoá ngày,
 * ngày không có trong đó theo `defaultOpen`.
 */
export function DayGroupList({
  days,
  today,
  defaultOpen,
  overrides,
  onToggle,
  onReset,
  now,
  highlightId,
  monthDividers = false,
  summaryPrefix,
  onReschedule,
  onCancel,
}: {
  days: DayGroup[];
  today: string;
  defaultOpen: string | null;
  overrides: Readonly<Record<string, boolean>>;
  onToggle: (date: string, open: boolean) => void;
  /** Bỏ lựa chọn của người dùng cho các ngày đang hiện. */
  onReset: () => void;
  now: number;
  highlightId?: string | null | undefined;
  /** Chế độ "Sắp tới": dòng phân cách tháng (`h2`), tiêu đề ngày thành `h3`. */
  monthDividers?: boolean;
  summaryPrefix?: ReactNode;
  onReschedule: (interview: EmployerInterview) => void;
  onCancel: (interview: EmployerInterview) => void;
}) {
  const isOpen = (date: string) => overrides[date] ?? date === defaultOpen;
  const openCount = days.filter((day) => isOpen(day.date)).length;
  const atDefault = days.every((day) => isOpen(day.date) === (day.date === defaultOpen));
  const Heading = monthDividers ? "h3" : "h2";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-text-muted">
        <p>
          {summaryPrefix}
          Đang mở{" "}
          <span className="font-num tabular-nums">
            {formatNumber(openCount)}/{formatNumber(days.length)}
          </span>{" "}
          ngày
        </p>
        <DashButton variant="ghost" size="sm" icon="rotate-ccw" disabled={atDefault} onClick={onReset}>
          Về mặc định
        </DashButton>
      </div>

      {days.map((day, index) => {
        const open = isOpen(day.date);
        const active = day.items.filter((interview) => interview.status !== "CANCELLED");
        const cancelledCount = day.items.length - active.length;
        const totalMinutes = active.reduce((sum, interview) => sum + interview.durationMinutes, 0);
        const times = active.map((interview) => hhmm(vnDateAndMinutes(interview.scheduledAt).minutes));
        const month = day.date.slice(0, 7);
        const newMonth = monthDividers && (index === 0 || days[index - 1]!.date.slice(0, 7) !== month);
        const [year] = day.date.split("-");

        return (
          <Fragment key={day.date}>
            {newMonth ? (
              <h2 className="mt-2 flex items-center gap-3 text-[13px] font-semibold text-text-muted first:mt-0">
                {formatMonthLabel(day.date)}
                <span aria-hidden className="h-px flex-1 bg-border-default" />
              </h2>
            ) : null}
            <div className="rounded-xl border border-border-subtle bg-surface-card">
              <Heading className="scroll-mt-28" id={dayHeaderId(day.date)}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={dayPanelId(day.date)}
                  onClick={() => onToggle(day.date, !open)}
                  className="flex min-h-12 w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2.5 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon
                      name="chevron-right"
                      size={16}
                      className={`shrink-0 text-text-muted transition-transform duration-200 motion-reduce:transition-none ${
                        open ? "rotate-90" : ""
                      }`}
                    />
                    <span className="font-bold text-text-strong">
                      {weekdayLong(day.date)}, <span className="font-num tabular-nums">{formatDayMonth(day.date)}</span>
                      <span className="font-num tabular-nums max-[720px]:hidden">/{year}</span>
                    </span>
                    {day.date === today ? <TaskBadge tone="brand">Hôm nay</TaskBadge> : null}
                  </span>
                  <span className="text-[13px] text-text-muted">
                    <span className="font-num font-bold tabular-nums text-text-body">{formatNumber(active.length)}</span> buổi
                    {cancelledCount > 0 ? (
                      <>
                        {" "}
                        · <span className="font-num tabular-nums">{formatNumber(cancelledCount)}</span> đã huỷ
                      </>
                    ) : null}
                  </span>
                  <span className="ml-auto font-num text-[13px] text-text-muted tabular-nums max-[720px]:ml-6 max-[720px]:basis-full">
                    {open ? (
                      totalMinutes > 0 ? (
                        <>Tổng {formatDuration(totalMinutes)}</>
                      ) : null
                    ) : (
                      <>
                        {times.slice(0, CLOSED_TIMES).join(" · ")}
                        {times.length > CLOSED_TIMES ? ` +${times.length - CLOSED_TIMES}` : ""}
                      </>
                    )}
                  </span>
                </button>
              </Heading>
              <div
                id={dayPanelId(day.date)}
                inert={!open}
                className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <ul className="flex flex-col gap-2 px-3 pt-1 pb-3">
                    {day.items.map((interview) => (
                      <InterviewAgendaRow
                        key={interview.id}
                        interview={interview}
                        now={now}
                        highlighted={interview.id === highlightId}
                        onReschedule={() => onReschedule(interview)}
                        onCancel={() => onCancel(interview)}
                      />
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
