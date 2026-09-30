"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { DashButton } from "@/components/dashboard/DashButton";
import { BATCH_MAX } from "@/lib/interview-format";

/**
 * Thanh thao tác khi đã chọn hồ sơ (D12): "Đã chọn N ứng viên · Bỏ chọn ·
 * Lên lịch phỏng vấn". Đặt làm con cuối của khối chứa danh sách: `sticky`
 * giữ thanh ở đáy màn hình trong lúc khối đó còn hiện, và chừa chỗ cuối khối
 * nên không che hàng cuối. Số đếm đọc qua vùng `aria-live` luôn có mặt.
 */
export function SelectionBar({
  count,
  onClear,
  onSchedule,
}: {
  count: number;
  onClear: () => void;
  onSchedule: () => void;
}) {
  const over = count > BATCH_MAX;
  const [announcement, setAnnouncement] = useState("");
  const previous = useRef(count);

  useEffect(() => {
    if (previous.current === count) return;
    previous.current = count;
    setAnnouncement(count > 0 ? `Đã chọn ${count} ứng viên` : "Đã bỏ chọn tất cả");
  }, [count]);

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {count > 0 ? (
        <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
          <div
            role="region"
            aria-label="Thao tác với hồ sơ đã chọn"
            className="pointer-events-auto flex w-full max-w-[760px] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-brand-800 py-2.5 pr-3 pl-5 text-white shadow-[0_12px_32px_rgba(11,31,27,0.3)]"
          >
            <p className="font-semibold">
              Đã chọn <b className="font-num text-lg tabular-nums">{count}</b> ứng viên
            </p>
            <button
              type="button"
              onClick={onClear}
              className="h-8 cursor-pointer rounded-lg px-3 text-[13px] font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Bỏ chọn
            </button>
            <span className="flex-1" />
            {over ? (
              <span className="flex items-center gap-1.5 text-[13px] text-brand-200">
                <Icon name="info" size={14} />
                Tối đa {BATCH_MAX} ứng viên mỗi lần
              </span>
            ) : null}
            <DashButton
              variant="light"
              icon="calendar-plus"
              disabled={over}
              onClick={onSchedule}
              className="max-[480px]:flex-[1_1_100%]"
            >
              Lên lịch phỏng vấn
            </DashButton>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Ô chọn có trạng thái "chọn một phần" cho "Chọn tất cả". */
export function TriStateCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  label,
  visibleLabel = false,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Hiện nhãn cạnh ô; mặc định nhãn chỉ dành cho trình đọc màn hình. */
  visibleLabel?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label
      className={`inline-flex min-h-9 items-center gap-2 font-semibold text-text-strong ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-[18px] w-[18px] flex-none cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
      />
      <span className={visibleLabel ? undefined : "sr-only"}>{label}</span>
    </label>
  );
}

/** Ô chọn một hồ sơ: vùng bấm 40×40 quanh ô 18px. */
export function RowCheckbox({
  checked,
  disabled = false,
  onChange,
  label,
  disabledReason,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  /** Tên ứng viên. */
  label: string;
  /** Vì sao không chọn được (title + trình đọc màn hình). */
  disabledReason?: string;
}) {
  return (
    <label
      title={disabled ? disabledReason : undefined}
      className={`-mx-2 -my-1 grid h-10 w-10 flex-none place-items-center ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-[18px] w-[18px] cursor-pointer accent-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
      />
      <span className="sr-only">{disabled ? `${label}: ${disabledReason ?? "không chọn được"}` : `Chọn ${label}`}</span>
    </label>
  );
}
