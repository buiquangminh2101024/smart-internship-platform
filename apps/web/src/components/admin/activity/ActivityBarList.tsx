"use client";

import type { ReactNode } from "react";
import { formatNumber } from "@/lib/dashboard-format";

export interface ActivityBarItem<K extends string> {
  key: K;
  label: string;
  value: number;
  /** Class nền đầy đủ của thanh (vd. "bg-audit-job"). */
  barClass: string;
  /** Icon / ô màu trước nhãn. */
  lead?: ReactNode;
}

/**
 * Thanh ngang có số và phần trăm, mỗi hàng là nút bật/tắt bộ lọc (`aria-pressed`).
 * Dựng theo ý `BarList` của dashboard nhưng viết riêng, vì `BarList` là `<dl>`
 * chỉ để đọc. Dùng cho "Tỉ lệ theo nhóm" và "Vai trò người làm".
 */
export function ActivityBarList<K extends string>({
  items,
  selected,
  onToggle,
  label,
}: {
  items: ActivityBarItem<K>[];
  selected: readonly K[];
  onToggle: (key: K) => void;
  /** Nhãn nhóm nút, vd. "Lọc theo nhóm". */
  label: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const max = Math.max(0, ...items.map((item) => item.value));

  return (
    <ul className="grid gap-1" aria-label={label}>
      {items.map((item) => {
        const pressed = selected.includes(item.key);
        const percent = total > 0 ? Math.round((item.value / total) * 100) : 0;
        return (
          <li key={item.key}>
            <button
              type="button"
              aria-pressed={pressed}
              onClick={() => onToggle(item.key)}
              className={`grid w-full cursor-pointer gap-1.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none ${
                pressed ? "border-brand-300 bg-brand-50" : "border-transparent hover:bg-surface-hover"
              }`}
            >
              <span className="flex items-center gap-2 text-[13px]">
                {item.lead}
                <span className={`flex-1 font-semibold ${pressed ? "text-brand-800" : "text-text-strong"}`}>{item.label}</span>
                <b className="text-sm text-text-strong tabular-nums">{formatNumber(item.value)}</b>
                <span className="w-10 text-right text-text-muted tabular-nums">{percent}%</span>
              </span>
              <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-surface-hover">
                <span
                  className={`block h-full rounded-full ${item.barClass}`}
                  style={{ width: max > 0 ? `${Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0)}%` : "0%" }}
                />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
