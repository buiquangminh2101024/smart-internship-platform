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

// Vẽ đúng px theo bề rộng đo được (không phóng viewBox): chữ, nét và chấm giữ
// nguyên cỡ dù thẻ rộng hay hẹp, chỉ chiều ngang giãn ra.
const CHART_H = 240;
const PAD_TOP = 26;
const PAD_BOTTOM = 28;
const PAD_RIGHT = 64; // chỗ cho nhãn "TB x,x" ngoài vùng vẽ
/** Chữ tối thiểu 13px (sip-ui). */
const AXIS_FONT = 13;
const PEAK_FONT = 13;
/** Hẹp hơn thì cuộn ngang thay vì ép nhãn ngày chồng lên nhau. */
const MIN_WIDTH_PX = 480;
/** Ô số liệu cách điểm đang chọn; điểm gần mép trên hơn mức này thì ô nằm dưới điểm. */
const TOOLTIP_GAP = 12;
const TOOLTIP_FLIP_Y = 44;
/** Bề rộng ước lượng của ô số liệu, để biết bên phải còn đủ chỗ không. */
const TOOLTIP_EST_W = 140;

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
  const [boxRef, chartW] = useRenderedWidth<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Ngày đang chọn, và ô số liệu có phải lật sang trái điểm không (tính theo phần đang nhìn thấy của vùng cuộn). */
  const [hoverState, setHoverState] = useState<{ index: number; flipLeft: boolean } | null>(null);
  const hover = hoverState?.index ?? null;

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

  const axisFont = AXIS_FONT;
  const peakFont = PEAK_FONT;

  const tickChars = Math.max(...ticks.map((t) => formatNumber(t).length));
  const padLeft = Math.max(34, Math.ceil(tickChars * axisFont * 0.62) + 10);
  const plotW = Math.max(chartW - padLeft - PAD_RIGHT, 1);
  const plotBottom = CHART_H - PAD_BOTTOM;
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
    const vx = event.clientX - event.currentTarget.getBoundingClientRect().left;
    const i = n <= 1 ? 0 : Math.round(((vx - padLeft) / plotW) * (n - 1));
    const index = Math.min(Math.max(i, 0), n - 1);
    const box = scrollRef.current;
    // Vị trí của điểm trong phần đang nhìn thấy (vùng cuộn có thể hẹp hơn biểu đồ ở màn hình nhỏ).
    const visibleX = box ? x(index) - box.scrollLeft : x(index);
    const visibleW = box ? box.clientWidth : chartW;
    const roomRight = visibleW - visibleX;
    // Chỉ lật khi bên phải thiếu chỗ và bên trái rộng hơn.
    setHoverState({ index, flipLeft: roomRight < TOOLTIP_GAP + TOOLTIP_EST_W && visibleX > roomRight });
  }

  const hovered = hover !== null && hover < n ? points[hover]! : null;
  const hx = hover !== null ? x(hover) : 0;
  const hy = hovered ? y(hovered.value) : 0;
  // Ô số liệu nằm trên điểm (ngón tay không che khi chạm), lật xuống dưới khi điểm sát mép trên;
  // lật sang trái khi bên phải phần đang nhìn thấy không đủ chỗ.
  const tooltipBelow = hy < TOOLTIP_FLIP_Y;
  const tooltipLeft = hoverState?.flipLeft ?? false;

  return (
    <div className={["relative", className].join(" ")}>
      <div ref={scrollRef} className="overflow-x-auto">
        <div ref={boxRef} className="relative" style={{ minWidth: MIN_WIDTH_PX, height: CHART_H }}>
          {chartW > 0 ? (
            <svg
              width={chartW}
              height={CHART_H}
              viewBox={`0 0 ${chartW} ${CHART_H}`}
              role="img"
              aria-label={summary}
              className="absolute inset-0 block touch-pan-x"
              onPointerMove={onPointerMove}
              onPointerDown={onPointerMove}
              // Cảm ứng: nhấc tay cũng phát pointerleave — giữ ô số liệu tới lần chạm sau.
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setHoverState(null);
              }}
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
                  y={CHART_H - 6}
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
          ) : null}

          {hovered ? (
            <div
              aria-hidden
              className="pointer-events-none absolute z-10 rounded-md border border-border-default bg-surface-card px-2 py-1 text-[13px] whitespace-nowrap text-text-strong shadow-sm"
              style={{
                left: hx,
                top: hy,
                transform: `translate(${tooltipLeft ? `calc(-100% - ${TOOLTIP_GAP}px)` : `${TOOLTIP_GAP}px`}, ${
                  tooltipBelow ? `${TOOLTIP_GAP}px` : `calc(-100% - ${TOOLTIP_GAP}px)`
                })`,
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
