import { formatNumber } from "@/lib/dashboard-format";

export interface ColumnChartColumn {
  label: string;
  /** Dòng phụ dưới nhãn trục, vd. "01 – 07/09". */
  sublabel?: string;
  value: number;
  /** Kỳ hiện tại — cột đậm hơn và nhãn đậm. */
  current?: boolean;
}

export interface ColumnChartProps {
  columns: ColumnChartColumn[];
  /** Định dạng số trên đầu cột (có thể rút gọn, vd. "8,2 tr"). */
  format?: (value: number) => string;
  /** Tóm tắt cho trình đọc màn hình (nên dùng số đầy đủ). */
  label: string;
  /** Câu hiện khi mọi cột bằng 0. */
  emptyText?: string;
  className?: string;
}

/** Chỗ dành cho số trên đầu cột cao nhất (px). */
const VALUE_ROOM_PX = 22;

/**
 * Cột theo kỳ (vd. doanh thu theo tuần, mẫu Admin bản D): số trên mỗi cột, kỳ
 * hiện tại đậm hơn, trục X có nhãn hai dòng. Vùng cột giãn theo chiều cao khối
 * chứa (tối thiểu 170px) để hai khối cạnh nhau cao bằng nhau.
 */
export function ColumnChart({ columns, format = formatNumber, label, emptyText, className = "" }: ColumnChartProps) {
  const max = Math.max(0, ...columns.map((c) => c.value));

  return (
    <figure className={["flex min-h-0 flex-1 flex-col", className].join(" ")}>
      <div className="relative flex min-h-[170px] flex-1 flex-col">
        <div
          role="img"
          aria-label={label}
          className="grid flex-1 grid-flow-col auto-cols-[minmax(0,1fr)] gap-3 px-5"
        >
          {columns.map((col) => {
            const percent = max > 0 ? (col.value / max) * 100 : 0;
            const barHeight = `max(${col.value > 0 ? 2 : 0}px, calc(${percent} * (100% - ${VALUE_ROOM_PX}px) / 100))`;
            return (
              <div key={col.label} className="relative h-full">
                <span
                  className="absolute inset-x-0 text-center font-num text-xs font-bold tabular-nums text-text-strong"
                  style={{ bottom: `calc(${barHeight} + 4px)` }}
                >
                  {format(col.value)}
                </span>
                <span
                  className={`absolute bottom-0 left-1/2 w-full max-w-14 -translate-x-1/2 rounded-[6px_6px_2px_2px] ${
                    col.current ? "bg-brand-600" : "bg-brand-200"
                  }`}
                  style={{ height: barHeight }}
                />
              </div>
            );
          })}
        </div>
        {max === 0 && emptyText ? (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-[13px] text-text-muted">
            <span className="rounded-md bg-surface-card px-2 py-1">{emptyText}</span>
          </p>
        ) : null}
      </div>
      <div
        aria-hidden
        className="grid grid-flow-col auto-cols-[minmax(0,1fr)] gap-3 border-t border-border-subtle px-5 pt-2 pb-4 text-center text-xs leading-[1.35] text-text-muted"
      >
        {columns.map((col) => (
          <span key={col.label}>
            <b className={`block ${col.current ? "text-brand-700" : "text-text-strong"}`}>{col.label}</b>
            {col.sublabel}
          </span>
        ))}
      </div>
    </figure>
  );
}
