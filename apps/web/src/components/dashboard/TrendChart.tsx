"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { DailyPoint } from "@sip/shared-types";
import { formatDayMonth, formatDecimal, formatNumber } from "@/lib/dashboard-format";

export interface TrendChartProps {
  points: DailyPoint[];
  /** Đơn vị của giá trị, vd. "hồ sơ", "lượt xem". */
  unit: string;
  /** Kỳ đang xem, đưa vào mô tả cho trình đọc màn hình, vd. "30 ngày qua". */
  periodLabel: string;
  /** Câu hiện giữa biểu đồ khi mọi ngày bằng 0. */
  emptyText: string;
  className?: string;
}

// Hệ toạ độ của mẫu bản C: viewBox 640×230, co giãn theo bề rộng thẻ.
const VIEW_W = 640;
const VIEW_H = 230;
const PAD_TOP = 26;
const PAD_BOTTOM = 28;
const PAD_RIGHT = 64; // chỗ cho nhãn "TB x,x" ngoài vùng vẽ
const AXIS_FONT = 12;
const PEAK_FONT = 13;
/** Chữ không nhỏ hơn 13px khi biểu đồ bị thu hẹp (sip-ui). */
const MIN_FONT_PX = 13;
const MIN_WIDTH_PX = 480;

/** Bước chia trục Y "đẹp" (1, 2, 4, 5 × 10^n) cho khoảng 4 vạch. */
function niceStep(max: number): number {
  const raw = Math.max(max / 4, 1);
  const pow10 = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 4, 5, 10]) {
    if (m * pow10 >= raw) return m * pow10;
  }
  return 10 * pow10;
}

/** Nhãn trục X: 7 ngày ghi đủ, 30 ngày mỗi tuần, 90 ngày mỗi 15 ngày; luôn có ngày cuối. */
function xLabelIndexes(n: number): number[] {
  if (n === 0) return [];
  const every = n <= 10 ? 1 : n <= 45 ? 7 : 15;
  const out: number[] = [];
  for (let i = 0; i < n - 1; i += every) {
    if (n - 1 - i >= every / 2) out.push(i);
  }
  out.push(n - 1);
  return out;
}

function useRenderedWidth<T extends Element>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/**
 * Biểu đồ đường theo ngày (mẫu bản C): lưới, trục Y, nhãn ngày, vùng tô nhạt,
 * đường trung bình nét đứt "TB x,x", đỉnh là chấm marigold kèm số, ngày cuối
 * chấm brand. Rê chuột / chạm vào biểu đồ hiện ô "DD/MM: n đơn vị" của ngày gần nhất.
 */
export function TrendChart({ points, unit, periodLabel, emptyText, className = "" }: TrendChartProps) {
  const [svgRef, renderedWidth] = useRenderedWidth<SVGSVGElement>();
  const [hover, setHover] = useState<number | null>(null);

  const n = points.length;
  const values = points.map((p) => p.value);
  const total = values.reduce((sum, v) => sum + v, 0);
  const max = Math.max(0, ...values);
  const peakIndex = max > 0 ? values.indexOf(max) : -1;
  const average = n > 0 ? total / n : 0;

  const step = niceStep(max);
  const yMax = max > 0 ? Math.ceil(max / step) * step : 4;
  const ticks: number[] = [];
  for (let t = 0; t <= yMax; t += max > 0 ? step : 1) ticks.push(t);

  // Đơn vị viewBox → px thật; giữ chữ tối thiểu 13px khi thẻ hẹp.
  const scale = renderedWidth > 0 ? renderedWidth / VIEW_W : 1;
  const axisFont = Math.max(AXIS_FONT, MIN_FONT_PX / scale);
  const peakFont = Math.max(PEAK_FONT, MIN_FONT_PX / scale);

  const tickChars = Math.max(...ticks.map((t) => formatNumber(t).length));
  const padLeft = Math.max(34, Math.ceil(tickChars * axisFont * 0.62) + 10);
  const plotW = VIEW_W - padLeft - PAD_RIGHT;
  const plotBottom = VIEW_H - PAD_BOTTOM;
  const plotH = plotBottom - PAD_TOP;
  const x = (i: number) => padLeft + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v: number) => plotBottom - (v / yMax) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const areaPath = n > 1 ? `${linePath} L${x(n - 1).toFixed(1)} ${plotBottom} L${x(0).toFixed(1)} ${plotBottom} Z` : "";

  const summary =
    total > 0 && peakIndex >= 0
      ? `Biểu đồ đường ${unit} theo ngày trong ${periodLabel}. Tổng ${formatNumber(total)}, cao nhất ${formatNumber(
          max,
        )} vào ${formatDayMonth(points[peakIndex]!.date)}, trung bình ${formatDecimal(average)} mỗi ngày.`
      : `Không có ${unit} nào trong ${periodLabel}.`;

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (n === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const vx = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const i = n <= 1 ? 0 : Math.round(((vx - padLeft) / plotW) * (n - 1));
    setHover(Math.min(Math.max(i, 0), n - 1));
  }

  const hovered = hover !== null && hover < n ? points[hover]! : null;
  const hx = hover !== null ? x(hover) : 0;
  const hy = hovered ? y(hovered.value) : 0;

  return (
    <div className={["relative", className].join(" ")}>
      <div className="overflow-x-auto">
        <div className="relative" style={{ minWidth: MIN_WIDTH_PX }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            role="img"
            aria-label={summary}
            className="block h-auto w-full touch-pan-x"
            onPointerMove={onPointerMove}
            onPointerDown={onPointerMove}
            onPointerLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padLeft} x2={padLeft + plotW} y1={y(t)} y2={y(t)} className="stroke-border-subtle" strokeWidth={1} />
                <text
                  x={padLeft - 8}
                  y={y(t)}
                  dy="0.35em"
                  textAnchor="end"
                  fontSize={axisFont}
                  className="fill-text-muted font-num tabular-nums"
                >
                  {formatNumber(t)}
                </text>
              </g>
            ))}

            {xLabelIndexes(n).map((i) => (
              <text
                key={points[i]!.date}
                x={x(i)}
                y={VIEW_H - 6}
                textAnchor="middle"
                fontSize={axisFont}
                className="fill-text-muted font-num tabular-nums"
              >
                {formatDayMonth(points[i]!.date)}
              </text>
            ))}

            {areaPath ? <path d={areaPath} className="fill-brand-600" fillOpacity={0.14} /> : null}

            {hovered ? (
              <g aria-hidden>
                <line x1={hx} x2={hx} y1={PAD_TOP} y2={plotBottom} className="stroke-border-default" strokeWidth={1} />
                <circle cx={hx} cy={hy} r={9} className="fill-brand-100" />
              </g>
            ) : null}

            {n > 0 ? (
              <path
                d={linePath}
                fill="none"
                className="stroke-brand-600"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}

            {total > 0 ? (
              <g>
                <line
                  x1={padLeft}
                  x2={padLeft + plotW}
                  y1={y(average)}
                  y2={y(average)}
                  className="stroke-text-subtle"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <text x={padLeft + plotW + 8} y={y(average)} dy="0.35em" fontSize={axisFont} className="fill-text-muted">
                  TB {formatDecimal(average)}
                </text>
              </g>
            ) : null}

            {peakIndex >= 0 ? (
              <g>
                <circle
                  cx={x(peakIndex)}
                  cy={y(max)}
                  r={5.5}
                  className="fill-marigold-500 stroke-surface-card"
                  strokeWidth={2}
                />
                <text
                  x={Math.min(Math.max(x(peakIndex), padLeft + 10), padLeft + plotW)}
                  y={y(max) - 12}
                  textAnchor="middle"
                  fontSize={peakFont}
                  className="fill-text-strong font-num font-bold tabular-nums"
                >
                  {formatNumber(max)}
                </text>
              </g>
            ) : null}

            {n > 0 && peakIndex !== n - 1 ? (
              <circle cx={x(n - 1)} cy={y(values[n - 1]!)} r={4.5} className="fill-brand-600 stroke-surface-card" strokeWidth={2} />
            ) : null}

            {hovered && hover !== peakIndex && hover !== n - 1 ? (
              <circle cx={hx} cy={hy} r={4} aria-hidden className="fill-brand-600 stroke-surface-card" strokeWidth={2} />
            ) : null}
          </svg>

          {hovered ? (
            <div
              aria-hidden
              className="pointer-events-none absolute z-10 rounded-md border border-border-default bg-surface-card px-2 py-1 text-[13px] whitespace-nowrap text-text-strong shadow-sm"
              style={{
                left: `${(hx / VIEW_W) * 100}%`,
                top: `${(hy / VIEW_H) * 100}%`,
                transform: hx > VIEW_W * 0.7 ? "translate(calc(-100% - 12px), 12px)" : "translate(12px, 12px)",
              }}
            >
              {formatDayMonth(hovered.date)}:{" "}
              <span className="font-num font-bold tabular-nums">{formatNumber(hovered.value)}</span> {unit}
            </div>
          ) : null}
        </div>
      </div>

      {/* Ngoài vùng cuộn để luôn nằm giữa phần đang nhìn thấy. */}
      {total === 0 ? (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-sm text-text-muted">
          <span className="rounded-md bg-surface-card px-2 py-1">{emptyText}</span>
        </p>
      ) : null}
    </div>
  );
}
