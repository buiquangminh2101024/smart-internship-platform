import type { ReactNode } from "react";
import { formatNumber } from "@/lib/dashboard-format";
import { CHART_TONE_BG, type ChartTone } from "./chart-tones";

export interface BarListItem {
  label: string;
  value: number;
  tone?: ChartTone;
  /** Ghi chú dưới thanh, vd. "62% từ bước trước". */
  note?: ReactNode;
}

export interface BarListProps {
  items: BarListItem[];
  format?: (value: number) => string;
  className?: string;
}

/**
 * Thanh ngang 12px, nhãn và số ở trên, ghi chú ở dưới. Độ dài tỉ lệ với giá
 * trị lớn nhất trong danh sách. Dùng cho phễu tuyển dụng và người dùng theo vai trò.
 */
export function BarList({ items, format = formatNumber, className = "" }: BarListProps) {
  const max = Math.max(0, ...items.map((i) => i.value));

  return (
    <dl className={["flex flex-col gap-4", className].join(" ")}>
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex items-baseline justify-between gap-3 font-semibold text-text-strong">
            <dt>{item.label}</dt>
            <dd className="font-num text-base font-bold tabular-nums">{format(item.value)}</dd>
          </div>
          <span aria-hidden className="mt-1.5 mb-1 block h-3 overflow-hidden rounded-full bg-surface-hover">
            <span
              className={`block h-full rounded-full ${CHART_TONE_BG[item.tone ?? "brand-strong"]}`}
              style={{ width: max > 0 ? `${Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0)}%` : "0%" }}
            />
          </span>
          {item.note ? <p className="text-text-muted">{item.note}</p> : null}
        </div>
      ))}
    </dl>
  );
}
