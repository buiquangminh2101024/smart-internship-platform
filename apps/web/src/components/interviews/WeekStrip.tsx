"use client";

import type { EmployerInterview } from "@sip/shared-types";
import { formatDayMonth, formatNumber, weekdayShort } from "@/lib/dashboard-format";
import { addDaysIso, hhmm, vnDateAndMinutes, weekdayLong } from "@/lib/interview-format";

/** Số buổi hiện trong một ô ngày (màn rộng). */
const CELL_ENTRIES = 3;

/** Tên gọi ngắn trong ô ngày: "Nguyễn Văn An" → "An". */
function shortName(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return words.at(-1) ?? "Ứng viên";
}

/**
 * Dải 7 ngày của tuần. Bấm ngày hoặc "+n buổi" mở nhóm ngày đó; bấm tên mở nhóm
 * và chuyển tới dòng. Điện thoại (≤720px): mỗi ô chỉ còn thứ, ngày và số buổi.
 */
export function WeekStrip({
  monday,
  today,
  byDay,
  now,
  onOpenDay,
  onOpenInterview,
}: {
  monday: string;
  today: string;
  byDay: ReadonlyMap<string, EmployerInterview[]>;
  now: number;
  onOpenDay: (date: string) => void;
  onOpenInterview: (interview: EmployerInterview) => void;
}) {
  const dates = Array.from({ length: 7 }, (_, index) => addDaysIso(monday, index));

  return (
    <ol aria-label="Các ngày trong tuần" className="grid grid-cols-7 gap-2 max-[720px]:gap-1">
      {dates.map((date) => {
        const items = byDay.get(date) ?? [];
        const activeCount = items.filter((interview) => interview.status !== "CANCELLED").length;
        const isToday = date === today;
        const label = `${weekdayLong(date)} ${formatDayMonth(date)}${isToday ? " (hôm nay)" : ""}: ${
          activeCount > 0 ? `${activeCount} buổi` : items.length > 0 ? "chỉ có lịch đã huỷ" : "trống"
        }`;
        const head = (
          <>
            <span className="text-[13px] font-semibold text-text-muted">
              {weekdayShort(date)}
              {isToday ? <span className="text-brand-700 max-[720px]:hidden"> · Hôm nay</span> : null}
            </span>
            <span className="font-num text-lg leading-tight font-bold text-text-strong tabular-nums">
              {date.slice(8)}
            </span>
            <span className="text-[13px] text-text-muted">
              {items.length > 0 ? (
                <>
                  <span className="font-num font-bold tabular-nums text-text-body">{formatNumber(activeCount)}</span>
                  <span className="max-[720px]:hidden"> buổi</span>
                </>
              ) : (
                "Trống"
              )}
            </span>
          </>
        );

        return (
          <li
            key={date}
            className={`flex min-w-0 flex-col rounded-xl border ${
              isToday ? "border-brand-200 bg-brand-50" : "border-border-subtle bg-surface-card"
            }`}
          >
            {items.length > 0 ? (
              <button
                type="button"
                aria-label={label}
                onClick={() => onOpenDay(date)}
                className="flex cursor-pointer flex-col items-start rounded-xl px-2.5 pt-2 pb-1.5 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 max-[720px]:items-center max-[720px]:px-1"
              >
                {head}
              </button>
            ) : (
              <div className="flex flex-col items-start px-2.5 pt-2 pb-1.5 max-[720px]:items-center max-[720px]:px-1">
                <span className="sr-only">{label}</span>
                <span aria-hidden className="contents">
                  {head}
                </span>
              </div>
            )}
            {items.length > 0 ? (
              <ul className="flex flex-col gap-0.5 px-1.5 pb-2 max-[720px]:hidden">
                {items.slice(0, CELL_ENTRIES).map((interview) => {
                  const cancelled = interview.status === "CANCELLED";
                  const past = !cancelled && new Date(interview.scheduledAt).getTime() <= now;
                  const time = hhmm(vnDateAndMinutes(interview.scheduledAt).minutes);
                  return (
                    <li key={interview.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenInterview(interview)}
                        className={`flex w-full min-w-0 cursor-pointer items-baseline gap-1.5 rounded-md px-1 py-0.5 text-left text-[13px] hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand-500 ${
                          cancelled ? "text-text-subtle line-through" : past ? "text-text-subtle" : "text-text-body"
                        }`}
                      >
                        <span className="font-num font-semibold tabular-nums">{time}</span>
                        <span className="truncate">{shortName(interview.candidateName)}</span>
                        <span className="sr-only">
                          {` — ${interview.candidateName ?? "Ứng viên chưa đặt tên"}${cancelled ? ", đã huỷ" : past ? ", đã qua giờ" : ""}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {items.length > CELL_ENTRIES ? (
                  <li>
                    <button
                      type="button"
                      onClick={() => onOpenDay(date)}
                      className="w-full cursor-pointer rounded-md px-1 py-0.5 text-left text-[13px] font-semibold text-brand-700 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand-500"
                    >
                      +<span className="font-num tabular-nums">{formatNumber(items.length - CELL_ENTRIES)}</span> buổi
                      <span className="sr-only"> ngày {formatDayMonth(date)}</span>
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
