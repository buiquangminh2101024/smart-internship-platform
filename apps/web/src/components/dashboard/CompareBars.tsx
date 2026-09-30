import { formatNumber } from "@/lib/dashboard-format";

export interface CompareBarsProps {
  current: { label: string; value: number };
  previous: { label: string; value: number };
  /** Mặc định định dạng số nguyên có chấm ngăn nghìn; tiền dùng `formatVnd`. */
  format?: (value: number) => string;
  className?: string;
}

/** Hai thanh "kỳ này" / "kỳ trước", số ở cuối mỗi thanh. Kỳ này đậm hơn. */
export function CompareBars({ current, previous, format = formatNumber, className = "" }: CompareBarsProps) {
  const max = Math.max(current.value, previous.value);
  const rows = [
    { ...current, barClass: "bg-brand-600" },
    { ...previous, barClass: "bg-brand-200" },
  ];

  return (
    <dl className={["flex flex-col gap-2", className].join(" ")}>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-2 text-text-muted">
          <dt className="truncate">{row.label}</dt>
          <span aria-hidden className="h-2.5 overflow-hidden rounded-full bg-surface-hover">
            <span
              className={`block h-full rounded-full ${row.barClass}`}
              style={{ width: max > 0 ? `${Math.max((row.value / max) * 100, row.value > 0 ? 2 : 0)}%` : "0%" }}
            />
          </span>
          <dd className="min-w-5 text-right font-num font-bold tabular-nums text-text-strong">{format(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
