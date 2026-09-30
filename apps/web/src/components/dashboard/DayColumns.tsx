import type { DailyPoint } from "@sip/shared-types";
import { formatDayMonth, formatNumber, weekdayShort } from "@/lib/dashboard-format";

export interface DayColumnsProps {
  days: DailyPoint[];
  /** Ngày được tô đậm (hôm nay), dạng YYYY-MM-DD. */
  highlightDate?: string;
  /** Đơn vị cho trình đọc màn hình, vd. "buổi phỏng vấn". */
  unit: string;
  /** Dòng chú thích dưới các cột, vd. "7 ngày tới". */
  caption?: string;
  className?: string;
}

/** Bảy cột nhỏ cao 24px: số ở trên, nhãn thứ ở dưới, hôm nay tô màu brand. */
export function DayColumns({ days, highlightDate, unit, caption, className = "" }: DayColumnsProps) {
  const max = Math.max(0, ...days.map((d) => d.value));

  return (
    <figure className={["flex flex-col gap-2", className].join(" ")}>
      <ol className="grid grid-flow-col auto-cols-[minmax(0,1fr)] gap-2">
        {days.map((day) => {
          const isHighlight = day.date === highlightDate;
          return (
            <li key={day.date} className="flex flex-col items-center gap-1">
              <span className="sr-only">
                {weekdayShort(day.date)} {formatDayMonth(day.date)}: {formatNumber(day.value)} {unit}
              </span>
              <span
                aria-hidden
                className={`font-num text-[13px] tabular-nums ${
                  day.value > 0 ? "font-bold text-text-strong" : "text-text-subtle"
                }`}
              >
                {formatNumber(day.value)}
              </span>
              <span aria-hidden className="flex h-6 w-full items-end border-b border-border-default">
                <span
                  className="mx-auto block w-full max-w-7 rounded-t-[3px] bg-brand-500"
                  style={{ height: max > 0 ? `${(day.value / max) * 100}%` : 0 }}
                />
              </span>
              <span
                aria-hidden
                title={formatDayMonth(day.date)}
                className={`text-[13px] ${isHighlight ? "font-bold text-brand-700" : "text-text-muted"}`}
              >
                {weekdayShort(day.date)}
              </span>
            </li>
          );
        })}
      </ol>
      {caption ? <figcaption className="text-text-muted">{caption}</figcaption> : null}
    </figure>
  );
}
