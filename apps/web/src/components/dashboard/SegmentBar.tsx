import { formatNumber } from "@/lib/dashboard-format";
import { CHART_TONE_BG, type ChartTone } from "./chart-tones";

export interface Segment {
  label: string;
  value: number;
  tone: ChartTone;
}

export interface SegmentBarProps {
  segments: Segment[];
  /** Tóm tắt cho trình đọc màn hình, vd. "Thời gian chờ của 19 hồ sơ". */
  label: string;
  className?: string;
}

/**
 * Thanh chia đoạn 10px + chú giải ô vuông (nhãn + số). Dùng cho thời gian chờ,
 * loại danh mục, còn hạn / sắp hết hạn. Tổng bằng 0 thì hiện thanh xám trống,
 * chú giải vẫn ghi 0.
 */
export function SegmentBar({ segments, label, className = "" }: SegmentBarProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const summary = `${label}: ${segments.map((s) => `${s.label} ${formatNumber(s.value)}`).join(", ")}`;

  return (
    <figure className={["flex flex-col gap-2", className].join(" ")}>
      <div role="img" aria-label={summary} className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-hover">
        {total > 0
          ? segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <span key={s.label} className={`block min-w-1 ${CHART_TONE_BG[s.tone]}`} style={{ flex: s.value }} />
              ))
          : null}
      </div>
      <figcaption>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-text-muted">
          {segments.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${CHART_TONE_BG[s.tone]}`} />
              <span>{s.label}</span>
              <span className="font-num font-bold tabular-nums text-text-strong">{formatNumber(s.value)}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
