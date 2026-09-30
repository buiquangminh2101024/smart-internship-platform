"use client";

import type { DashboardRange } from "@sip/shared-types";

export interface ChipOption<T extends string | number> {
  value: T;
  label: string;
}

export interface ChipGroupProps<T extends string | number> {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nhãn của nhóm cho trình đọc màn hình. */
  label: string;
  className?: string;
}

/** Nhóm nút chọn một, trạng thái qua `aria-pressed`. */
export function ChipGroup<T extends string | number>({ options, value, onChange, label, className = "" }: ChipGroupProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={["inline-flex rounded-lg border border-border-default bg-surface-card p-0.5", className].join(" ")}
    >
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(option.value)}
            className={`h-8 cursor-pointer rounded-md px-3 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none ${
              pressed ? "bg-brand-50 text-brand-700" : "text-text-body hover:bg-surface-hover"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const RANGE_OPTIONS: ChipOption<DashboardRange>[] = [
  { value: 7, label: "7 ngày" },
  { value: 30, label: "30 ngày" },
  { value: 90, label: "90 ngày" },
];

export interface RangeChipsProps {
  value: DashboardRange;
  onChange: (value: DashboardRange) => void;
  className?: string;
}

/** Nút 7/30/90 ngày — đặt cạnh các biểu đồ nó điều khiển, không ở đầu trang (D10). */
export function RangeChips({ value, onChange, className }: RangeChipsProps) {
  return (
    <ChipGroup
      options={RANGE_OPTIONS}
      value={value}
      onChange={onChange}
      label="Khoảng thời gian của biểu đồ"
      {...(className ? { className } : {})}
    />
  );
}
