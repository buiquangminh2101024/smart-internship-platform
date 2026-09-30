"use client";

import type { ReactNode } from "react";
import { formatNumber } from "@/lib/dashboard-format";

/*
 * Khối dựng của dashboard Admin bản D (plan FE, mục "Admin — bản D"): thẻ nền
 * trắng bo 14px, bóng rất nhẹ, không viền trên marigold hay vạch brand ở tiêu
 * đề; nút chọn kỳ và bộ lọc là nút gộp nền xám. Khác `Panel` bản C của Employer.
 */

export const ADMIN_PANEL_CLASS =
  "min-w-0 rounded-[14px] border border-border-subtle bg-surface-card shadow-[0_1px_2px_rgba(11,31,27,0.05)]";

export function AdminPanel({
  id,
  labelledBy,
  className = "",
  children,
}: {
  id?: string;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={`@container ${ADMIN_PANEL_CLASS} ${className}`}>
      {children}
    </section>
  );
}

export function AdminPanelHead({
  id,
  title,
  subtitle,
  actions,
  as: Heading = "h2",
}: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <header className="flex flex-wrap items-start gap-3 px-4 pt-3.5 pb-2.5 @xl:px-5 @xl:pt-4 @xl:pb-3">
      <div className="min-w-[180px] flex-1">
        <Heading id={id} className="text-base leading-[1.35] font-bold text-text-strong">
          {title}
        </Heading>
        {subtitle ? <p className="mt-0.5 text-[13px] text-text-muted">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}

export function AdminPanelFoot({ children }: { children: ReactNode }) {
  return <div className="flex justify-end border-t border-border-subtle px-5 py-2.5">{children}</div>;
}

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

/** Nút gộp nền xám (chọn kỳ 7/30/90, lọc hoạt động); trạng thái qua `aria-pressed`. */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-[10px] bg-surface-hover p-[3px]">
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(option.value)}
            className={`h-7 cursor-pointer rounded-[7px] px-2.5 text-xs font-bold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
              pressed ? "bg-surface-card text-brand-700 shadow-[0_1px_2px_rgba(11,31,27,0.12)]" : "text-text-muted hover:text-text-strong"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface SplitSegment {
  label: string;
  value: number;
  /** Class nền đầy đủ (vd. "bg-marigold-300") để Tailwind quét được. */
  color: string;
}

/**
 * Thanh chia nhóm 8px + chú giải (ô màu, nhãn, số đậm). Chú giải luôn ghi đủ số,
 * kể cả 0, nên màu không phải kênh duy nhất.
 */
export function SplitBar({ segments, label }: { segments: SplitSegment[]; label: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const summary = `${label}: ${segments.map((s) => `${s.label} ${formatNumber(s.value)}`).join(", ")}`;
  return (
    <span className="flex flex-col gap-3">
      <span role="img" aria-label={summary} className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-hover">
        {total > 0
          ? segments
              .filter((s) => s.value > 0)
              .map((s) => <span key={s.label} className={`block h-full min-w-1 ${s.color}`} style={{ flex: s.value }} />)
          : null}
      </span>
      <span aria-hidden className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-text-body">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <i className={`inline-block h-[9px] w-[9px] rounded-[3px] ${s.color}`} />
            {s.label}
            <b className="text-text-strong tabular-nums">{formatNumber(s.value)}</b>
          </span>
        ))}
      </span>
    </span>
  );
}
