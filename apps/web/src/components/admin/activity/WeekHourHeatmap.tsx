"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { DOW_LABEL, DOW_SHORT, slotLabel } from "@/lib/audit-activity";
import { formatNumber } from "@/lib/dashboard-format";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Thang một màu nhạt → đậm (sequential); 0 dùng nền xám để tách hẳn "không có gì". */
const BUCKET_CLASSES = ["bg-brand-100", "bg-brand-200", "bg-brand-400", "bg-brand-600", "bg-brand-800"] as const;
const ZERO_CLASS = "bg-surface-hover";

/** Ngưỡng trên của từng bậc, chia đều theo giá trị lớn nhất (số nguyên, không trùng nhau). */
function bucketBounds(max: number): number[] {
  if (max <= 0) return [];
  const steps = Math.min(BUCKET_CLASSES.length, max);
  const bounds: number[] = [];
  for (let index = 1; index <= steps; index += 1) {
    const bound = Math.ceil((max * index) / steps);
    if (bound > (bounds[bounds.length - 1] ?? 0)) bounds.push(bound);
  }
  return bounds;
}

function bucketOf(value: number, bounds: number[]): number {
  if (value <= 0) return -1;
  const index = bounds.findIndex((bound) => value <= bound);
  return index === -1 ? bounds.length - 1 : index;
}

/** Bậc màu theo số bậc thật (ít bậc thì dàn đều từ nhạt tới đậm). */
function classOf(bucket: number, count: number): string {
  if (bucket < 0) return ZERO_CLASS;
  if (count <= 1) return BUCKET_CLASSES[BUCKET_CLASSES.length - 1]!;
  const index = Math.round((bucket * (BUCKET_CLASSES.length - 1)) / (count - 1));
  return BUCKET_CLASSES[index]!;
}

/**
 * Lưới 7 hàng (Thứ Hai … Chủ Nhật) × 24 giờ, giờ Việt Nam. Mỗi ô là nút: bấm
 * hoặc Enter thì lọc theo ô đó (`dow`/`hour`), bấm lại ô đang chọn thì bỏ lọc.
 * Roving tabindex: một ô nhận Tab, mũi tên đi giữa các ô, Home/End về đầu/cuối hàng.
 */
export function WeekHourHeatmap({
  heatmap,
  selected,
  onSelect,
}: {
  heatmap: number[][];
  selected: { dow: number; hour: number } | null;
  onSelect: (slot: { dow: number; hour: number } | null) => void;
}) {
  const max = Math.max(0, ...heatmap.flat());
  const bounds = bucketBounds(max);
  const [focus, setFocus] = useState<{ row: number; col: number }>(() =>
    selected ? { row: selected.dow - 1, col: selected.hour } : { row: 0, col: 9 },
  );
  const cells = useRef(new Map<string, HTMLButtonElement>());

  function move(row: number, col: number) {
    const next = { row: Math.min(6, Math.max(0, row)), col: Math.min(23, Math.max(0, col)) };
    setFocus(next);
    cells.current.get(`${next.row}-${next.col}`)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, row: number, col: number) {
    const keys: Record<string, [number, number]> = {
      ArrowUp: [row - 1, col],
      ArrowDown: [row + 1, col],
      ArrowLeft: [row, col - 1],
      ArrowRight: [row, col + 1],
      Home: [event.ctrlKey ? 0 : row, 0],
      End: [event.ctrlKey ? 6 : row, 23],
    };
    const target = keys[event.key];
    if (!target) return;
    event.preventDefault();
    move(target[0], target[1]);
  }

  return (
    <div className="grid gap-3">
      {/* Cuộn ngang trong khối khi hẹp; cột nhãn thứ dính bên trái. */}
      <div className="overflow-x-auto pb-1">
        <table className="w-full min-w-[820px] border-separate border-spacing-[2px] lg:min-w-[480px]">
          <caption className="sr-only">
            Số sự kiện theo thứ và giờ. Dùng phím mũi tên để đi giữa các ô, Enter để lọc theo ô.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface-card">
                <span className="sr-only">Thứ</span>
              </th>
              {HOURS.map((hour) => (
                <th key={hour} scope="col" className="h-6 text-center text-xs font-normal text-text-muted tabular-nums">
                  {hour % 3 === 0 ? hour : <span className="sr-only">{hour}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.map((counts, row) => (
              <tr key={row}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-surface-card pr-2 text-left text-[13px] font-medium whitespace-nowrap text-text-body"
                >
                  <abbr title={DOW_LABEL[row]} className="no-underline">
                    {DOW_SHORT[row]}
                  </abbr>
                </th>
                {HOURS.map((col) => {
                  const value = counts[col] ?? 0;
                  const isSelected = selected?.dow === row + 1 && selected.hour === col;
                  const label = `${slotLabel(row + 1, col)}: ${formatNumber(value)} sự kiện`;
                  return (
                    <td key={col} className="p-0">
                      <button
                        ref={(node) => {
                          const key = `${row}-${col}`;
                          if (node) cells.current.set(key, node);
                          else cells.current.delete(key);
                        }}
                        type="button"
                        tabIndex={focus.row === row && focus.col === col ? 0 : -1}
                        aria-pressed={isSelected}
                        aria-label={label}
                        title={label}
                        onFocus={() => setFocus({ row, col })}
                        onKeyDown={(event) => handleKeyDown(event, row, col)}
                        onClick={() => onSelect(isSelected ? null : { dow: row + 1, hour: col })}
                        className={`block h-8 w-full min-w-8 cursor-pointer rounded-[4px] lg:min-w-0 ${classOf(bucketOf(value, bounds), bounds.length)} ${
                          isSelected ? "ring-2 ring-brand-700 ring-offset-1 ring-offset-surface-card" : "hover:ring-1 hover:ring-brand-400"
                        } focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-muted" aria-label="Chú giải thang màu">
        <span className="flex items-center gap-1.5">
          <i aria-hidden className={`inline-block h-3 w-3 rounded-[3px] ${ZERO_CLASS}`} />0
        </span>
        {bounds.map((bound, index) => {
          const low = index === 0 ? 1 : bounds[index - 1]! + 1;
          return (
            <span key={bound} className="flex items-center gap-1.5 tabular-nums">
              <i aria-hidden className={`inline-block h-3 w-3 rounded-[3px] ${classOf(index, bounds.length)}`} />
              {low === bound ? formatNumber(bound) : `${formatNumber(low)}–${formatNumber(bound)}`}
            </span>
          );
        })}
      </div>
    </div>
  );
}
