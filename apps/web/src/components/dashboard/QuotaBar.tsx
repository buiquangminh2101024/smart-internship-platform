import type { ReactNode } from "react";
import { formatNumber } from "@/lib/dashboard-format";

export interface QuotaBarProps {
  used: number;
  total: number;
  /** Dòng phụ dưới nét đứt, vd. tỉ lệ chấp nhận lời mời 30 ngày. */
  extra?: { label: ReactNode; value?: ReactNode };
  className?: string;
}

/** Thanh hạn mức "Đã dùng / Còn" (nền brand-200, phần đã dùng brand-600). */
export function QuotaBar({ used, total, extra, className = "" }: QuotaBarProps) {
  const remaining = Math.max(0, total - used);
  const ratio = total > 0 ? Math.min(used / total, 1) : 0;

  return (
    <div className={["flex flex-col gap-2", className].join(" ")}>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(used, total)}
        aria-label={`Đã dùng ${formatNumber(used)} trên ${formatNumber(total)}`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-brand-200"
      >
        <span className="block h-full bg-brand-600" style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 text-text-muted">
        <span>
          Đã dùng <span className="font-num font-bold tabular-nums text-text-strong">{formatNumber(used)}</span>
        </span>
        <span>
          Còn <span className="font-num font-bold tabular-nums text-text-strong">{formatNumber(remaining)}</span>
        </span>
      </div>
      {extra ? (
        <div className="flex flex-wrap justify-between gap-x-4 border-t border-dashed border-border-subtle pt-1.5 text-text-muted">
          <span>{extra.label}</span>
          {extra.value !== undefined ? (
            <span className="font-num font-bold tabular-nums text-text-strong">{extra.value}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
