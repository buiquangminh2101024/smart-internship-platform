"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { AuditActivityGroup, AuditActivityStats } from "@sip/shared-types";
import { AUDIT_GROUPS, GROUP_META } from "@/lib/audit-activity";
import { formatDayMonth, formatNumber, weekdayShort } from "@/lib/dashboard-format";
import { GroupDot } from "./ActivityMeta";

type Day = AuditActivityStats["byDay"][number];

/** Thứ tự chồng từ dưới lên; `OTHER` trên cùng. */
export const STACK_ORDER: AuditActivityGroup[] = [...AUDIT_GROUPS, "OTHER"];

const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 44 };
const GAP = 2;
const LABEL_MIN_PX = 46;

/** Trục Y "đẹp": 0 và 4 vạch theo bước 1/2/5 × 10^k. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(value);
  if (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! + step);
  return ticks;
}

function dayText(day: Day): string {
  const parts = STACK_ORDER.filter((group) => (day.counts[group] ?? 0) > 0).map(
    (group) => `${GROUP_META[group].label} ${formatNumber(day.counts[group]!)}`,
  );
  return `${weekdayShort(day.date)} ${formatDayMonth(day.date)}: ${formatNumber(day.total)} sự kiện${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

/** Đo chiều rộng thật của khung (biểu đồ vẽ đúng px, không co giãn bằng viewBox). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/**
 * Cột chồng theo ngày × nhóm, trục Y có số. Kéo chuột / chạm để chọn khoảng
 * ngày; bàn phím: ←/→ chọn ngày, Shift + ←/→ mở rộng khoảng, Enter để lọc, Esc để bỏ chọn.
 */
export function ActivityDayChart({
  days,
  onSelectRange,
}: {
  days: Day[];
  onSelectRange: (from: string, to: string) => void;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [announce, setAnnounce] = useState("");

  const n = days.length;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = n > 0 ? plotW / n : 0;
  const barW = Math.max(2, Math.min(28, slot * 0.72));
  const ticks = niceTicks(Math.max(0, ...days.map((day) => day.total)));
  const yMax = ticks[ticks.length - 1]!;
  const y = (value: number) => PAD.top + plotH - (value / yMax) * plotH;
  const labelEvery = Math.max(1, Math.ceil(LABEL_MIN_PX / Math.max(slot, 1)));

  const selection =
    anchor !== null && cursor !== null ? { lo: Math.min(anchor, cursor), hi: Math.max(anchor, cursor) } : null;
  const tipIndex = dragging ? cursor : (hover ?? cursor);
  const tipDay = tipIndex !== null ? days[tipIndex] : undefined;

  function indexAt(clientX: number, target: Element): number {
    const rect = target.getBoundingClientRect();
    const x = clientX - rect.left - PAD.left;
    return Math.min(n - 1, Math.max(0, Math.floor(x / slot)));
  }

  function commit(lo: number, hi: number) {
    const from = days[lo]!.date;
    const to = days[hi]!.date;
    setAnchor(null);
    setCursor(null);
    onSelectRange(from, to);
  }

  function handlePointerDown(event: PointerEvent<SVGRectElement>) {
    if (n === 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const index = indexAt(event.clientX, event.currentTarget.ownerSVGElement!);
    setDragging(true);
    setAnchor(index);
    setCursor(index);
  }

  function handlePointerMove(event: PointerEvent<SVGRectElement>) {
    if (n === 0) return;
    const index = indexAt(event.clientX, event.currentTarget.ownerSVGElement!);
    if (dragging) setCursor(index);
    else setHover(index);
  }

  function handlePointerUp() {
    if (!dragging || !selection) return;
    setDragging(false);
    commit(selection.lo, selection.hi);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (n === 0) return;
    const current = cursor ?? n - 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = Math.min(n - 1, Math.max(0, current + (event.key === "ArrowRight" ? 1 : -1)));
      const nextAnchor = event.shiftKey ? (anchor ?? current) : next;
      setCursor(next);
      setAnchor(nextAnchor);
      const lo = Math.min(nextAnchor, next);
      const hi = Math.max(nextAnchor, next);
      setAnnounce(
        lo === hi
          ? dayText(days[next]!)
          : `Đã chọn ${formatDayMonth(days[lo]!.date)} – ${formatDayMonth(days[hi]!.date)}, bấm Enter để lọc`,
      );
    } else if (event.key === "Enter" && selection) {
      event.preventDefault();
      commit(selection.lo, selection.hi);
    } else if (event.key === "Escape" && selection) {
      event.preventDefault();
      setAnchor(null);
      setCursor(null);
      setAnnounce("Đã bỏ chọn");
    }
  }

  const tipLeft = tipIndex !== null ? PAD.left + slot * (tipIndex + 0.5) : 0;

  return (
    <div className="grid gap-3">
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label="Biểu đồ số sự kiện theo ngày. Dùng mũi tên trái phải để chọn ngày, giữ Shift để mở rộng khoảng, Enter để lọc theo khoảng đã chọn."
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (cursor === null && n > 0) {
            setCursor(n - 1);
            setAnchor(n - 1);
            setAnnounce(dayText(days[n - 1]!));
          }
        }}
        onBlur={() => {
          if (!dragging) {
            setCursor(null);
            setAnchor(null);
          }
        }}
        className="relative rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
        style={{ height: HEIGHT }}
      >
        {width > 0 ? (
          <svg width={width} height={HEIGHT} className="block touch-none select-none" aria-hidden>
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={tick === 0 ? "var(--color-border-default)" : "var(--color-border-subtle)"}
                />
                <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={12} fill="var(--color-text-muted)" className="tabular-nums">
                  {formatNumber(tick)}
                </text>
              </g>
            ))}

            {selection ? (
              <rect
                x={PAD.left + slot * selection.lo}
                y={PAD.top}
                width={slot * (selection.hi - selection.lo + 1)}
                height={plotH}
                fill="var(--color-brand-100)"
                rx={4}
              />
            ) : null}

            {days.map((day, index) => {
              const x = PAD.left + slot * index + (slot - barW) / 2;
              let top = y(0);
              const dim = tipIndex !== null && tipIndex !== index && !selection;
              return (
                <g key={day.date} opacity={dim ? 0.55 : 1}>
                  {STACK_ORDER.map((group) => {
                    const value = day.counts[group] ?? 0;
                    if (value <= 0) return null;
                    const h = (value / yMax) * plotH;
                    top -= h;
                    // Khoảng 2px màu nền giữa hai đoạn; đoạn quá thấp vẫn hiện tối thiểu 1px.
                    const drawH = Math.max(1, h - GAP);
                    return <rect key={group} x={x} y={top + (h - drawH)} width={barW} height={drawH} rx={Math.min(3, barW / 4)} fill={GROUP_META[group].color} />;
                  })}
                </g>
              );
            })}

            {days.map((day, index) =>
              index % labelEvery === (n - 1) % labelEvery ? (
                <text
                  key={`x-${day.date}`}
                  x={PAD.left + slot * (index + 0.5)}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  fontSize={12}
                  fill="var(--color-text-muted)"
                  className="tabular-nums"
                >
                  {formatDayMonth(day.date)}
                </text>
              ) : null,
            )}

            {/* Vùng nhận chuột/chạm phủ cả phần vẽ. */}
            <rect
              x={PAD.left}
              y={PAD.top}
              width={plotW}
              height={plotH + PAD.bottom}
              fill="transparent"
              className="cursor-crosshair"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => {
                setDragging(false);
                setAnchor(null);
                setCursor(null);
              }}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        ) : null}

        {tipDay ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-10 w-max max-w-[220px] rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-[13px] shadow-[0_6px_20px_rgba(11,31,27,0.14)]"
            style={{
              left: Math.min(Math.max(tipLeft - 110, 0), Math.max(0, width - 220)),
            }}
          >
            <p className="font-bold text-text-strong">
              {weekdayShort(tipDay.date)} {formatDayMonth(tipDay.date)} · {formatNumber(tipDay.total)} sự kiện
            </p>
            <ul className="mt-1 grid gap-0.5">
              {STACK_ORDER.filter((group) => (tipDay.counts[group] ?? 0) > 0)
                .reverse()
                .map((group) => (
                  <li key={group} className="flex items-center gap-1.5 text-text-body">
                    <GroupDot group={group} />
                    <span className="flex-1">{GROUP_META[group].label}</span>
                    <b className="text-text-strong tabular-nums">{formatNumber(tipDay.counts[group]!)}</b>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </div>

      <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-text-body" aria-label="Chú giải">
        {STACK_ORDER.filter((group) => group !== "OTHER" || days.some((day) => (day.counts.OTHER ?? 0) > 0)).map((group) => (
          <li key={group} className="flex items-center gap-1.5">
            <GroupDot group={group} />
            {GROUP_META[group].label}
          </li>
        ))}
      </ul>
    </div>
  );
}
