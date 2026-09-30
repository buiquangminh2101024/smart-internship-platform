import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export interface StatCardDelta {
  /** Ghi cả số tuyệt đối lẫn phần trăm, vd. "+17 (+29%)". */
  text: string;
  trend: "up" | "down" | "flat";
}

export interface StatCardProps {
  label: string;
  value: string | number;
  /** Đơn vị đi kèm, vd. "hồ sơ", "giờ". */
  unit?: string;
  icon?: string;
  className?: string;
  // ─── Bố cục KPI (dashboard) — bật khi có một trong các prop dưới ───
  /** Nhãn tăng giảm so với kỳ trước, đặt cạnh số. */
  delta?: StatCardDelta;
  /** Một dòng giải thích dưới số (vd. hồ sơ cũ nhất đã chờ bao lâu). */
  hint?: ReactNode;
  /** `attention` = việc đang chờ người xử lý: viền trái 3px marigold. */
  tone?: "default" | "attention";
  /** Phần minh hoạ có nhãn và số (SegmentBar, CompareBars...). */
  footer?: ReactNode;
  /** Trang chi tiết — nhãn thẻ thành liên kết. */
  href?: string;
}

const deltaIcon: Record<StatCardDelta["trend"], string> = {
  up: "trending-up",
  down: "trending-down",
  flat: "minus",
};

/**
 * Hai bố cục: ngang gọn (các trang `jobs`, `admin/jobs` — chỉ label/value/unit/icon)
 * và thẻ KPI của dashboard (số 36px, nhãn tăng giảm, minh hoạ) khi có
 * `delta`/`hint`/`tone`/`footer`/`href`.
 */
export function StatCard(props: StatCardProps) {
  const { label, value, unit, icon, className = "", delta, hint, tone, footer, href } = props;
  const isKpi = delta !== undefined || hint !== undefined || tone !== undefined || footer !== undefined || href !== undefined;

  if (!isKpi) {
    return (
      <div className={["flex items-center gap-4 rounded-xl border border-border-subtle bg-white p-4", className].join(" ")}>
        {icon ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Icon name={icon} size={20} />
          </span>
        ) : null}
        <div className="grid gap-0.5">
          <span className="text-2xl font-semibold text-text-strong">
            {value}
            {unit ? <span className="ml-1 text-sm font-normal text-text-muted">{unit}</span> : null}
          </span>
          <span className="text-sm text-text-muted">{label}</span>
        </div>
      </div>
    );
  }

  const attention = tone === "attention";

  // Kích thước theo mẫu bản C (docs/temp/ui-compare): ô icon 32px, nhãn đậm
  // màu muted, số 36px đậm, thẻ padding 16px, phần minh hoạ dính đáy thẻ.
  return (
    <article
      className={[
        "flex flex-col gap-2 rounded-xl border bg-surface-card p-4 text-sm",
        attention
          ? "border-marigold-300 shadow-[inset_3px_0_0_var(--color-marigold-500)]"
          : "border-border-subtle",
        className,
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        {icon ? (
          <span
            aria-hidden
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
              attention ? "bg-marigold-100 text-marigold-800" : "bg-brand-50 text-brand-600"
            }`}
          >
            <Icon name={icon} size={18} />
          </span>
        ) : null}
        <h3 className="font-semibold text-text-muted">
          {href ? (
            <Link href={href} className="transition-colors hover:text-brand-700 hover:underline">
              {label}
            </Link>
          ) : (
            label
          )}
        </h3>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-num text-[36px] leading-[1.1] font-bold tabular-nums text-text-strong">{value}</span>
        {unit ? <span className="text-text-muted">{unit}</span> : null}
      </div>

      {delta || hint ? (
        <div className="flex min-h-6 flex-wrap items-center gap-2 text-text-muted">
          {delta ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-px font-bold ${
                delta.trend === "up" ? "bg-success-100 text-success-700" : "bg-surface-hover text-text-body"
              }`}
            >
              {delta.trend === "up" ? null : <Icon name={deltaIcon[delta.trend]} size={14} />}
              {delta.text}
            </span>
          ) : null}
          {hint ? <span>{hint}</span> : null}
        </div>
      ) : null}

      {footer ? <div className="mt-auto flex flex-col gap-2 border-t border-border-subtle pt-3">{footer}</div> : null}
    </article>
  );
}
