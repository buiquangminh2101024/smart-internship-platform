import type { ReactNode } from "react";
import { formatNumber } from "@/lib/dashboard-format";

export interface SummaryBannerStat {
  label: string;
  value: number;
}

export interface SummaryBannerProps {
  /** "Hôm nay, DD/MM/YYYY". */
  eyebrow: string;
  /** Tiêu đề nêu số cụ thể; bọc số trong `<BannerNumber>` để số to hơn chữ. */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Một nút chính — `DashButton variant="light"` để nổi trên khối tối. */
  action?: ReactNode;
  /** Ba ô số bên phải. */
  stats: SummaryBannerStat[];
}

/** Số trong tiêu đề banner: mono 34px (chữ quanh nó 28px). */
export function BannerNumber({ value }: { value: number }) {
  return <span className="font-num text-[30px] tabular-nums @xl:text-[34px]">{formatNumber(value)}</span>;
}

/** Khối tâm điểm đầu dashboard (bản C). Mỗi màn hình chỉ một khối tối. */
export function SummaryBanner({ eyebrow, title, subtitle, action, stats }: SummaryBannerProps) {
  return (
    <section
      aria-label="Tóm tắt hôm nay"
      className="flex flex-wrap items-center justify-between gap-6 rounded-xl bg-brand-800 p-5 text-sm text-white @xl:px-7 @xl:py-6"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-brand-200">{eyebrow}</p>
        <h2 className="mt-1.5 mb-1 text-2xl leading-[1.3] font-bold text-white @xl:text-[28px]">{title}</h2>
        {subtitle ? <p className="text-brand-100">{subtitle}</p> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
      <dl className="flex w-full gap-3 @4xl:w-auto">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="min-w-0 flex-1 rounded-[10px] border border-white/15 bg-white/[.08] px-3 py-3 @xl:px-[18px] @4xl:min-w-32 @4xl:flex-none"
          >
            <dt className="text-[13px] text-brand-200">{stat.label}</dt>
            <dd className="font-num text-[32px] leading-[1.2] font-bold tabular-nums">{formatNumber(stat.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
