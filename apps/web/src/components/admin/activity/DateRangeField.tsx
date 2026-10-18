"use client";

import { useId, useState, type KeyboardEvent } from "react";
import {
  DEFAULT_RANGE_DAYS,
  MAX_RANGE_DAYS,
  formatIsoDate,
  parseDateInput,
  rangeDays,
  shiftDate,
  type ActivityRange,
} from "@/lib/audit-activity";
import { vnTodayIso } from "@/lib/dashboard-format";
import { Input } from "@/components/ui/Input";
import { SegmentedControl, type SegmentedOption } from "@/components/dashboard/admin/AdminPanel";

type Preset = 7 | 30 | 90 | "custom";

const PRESETS: SegmentedOption<Preset>[] = [
  { value: 7, label: "7 ngày" },
  { value: 30, label: "30 ngày" },
  { value: 90, label: "90 ngày" },
];

function presetOf(range: ActivityRange, today: string): Preset {
  if (range.kind !== "days") return "custom";
  if (range.isDefault) return DEFAULT_RANGE_DAYS;
  if (range.to !== today) return "custom";
  const days = rangeDays(range.from, range.to);
  return days === 7 || days === 30 || days === 90 ? days : "custom";
}

interface FieldErrors {
  from?: string;
  to?: string;
}

/**
 * Nút 7/30/90 ngày và hai ô ngày `DD/MM/YYYY`. Ô ngày áp dụng khi rời ô hoặc
 * bấm Enter; sai định dạng, ngày ngược hay quá 366 ngày thì báo ngay tại ô
 * (`aria-invalid`) và không đổi bộ lọc. `null` = bỏ khoảng ngày, về mặc định
 * (30 ngày, hoặc toàn bộ thời gian khi `allByDefault`).
 */
export function DateRangeField({
  range,
  allByDefault = false,
  linkError,
  onChange,
}: {
  range: ActivityRange;
  /** Bỏ khoảng ngày thì xem toàn bộ thời gian (đang lọc đối tượng hoặc xem lưu trữ), nên nút 30 ngày phải gửi ngày rõ. */
  allByDefault?: boolean;
  /** Lỗi khoảng ngày đọc từ link (đã bị bỏ qua). */
  linkError?: string | undefined;
  onChange: (next: { from: string; to: string } | null) => void;
}) {
  const today = vnTodayIso();
  const shown = range.kind === "days" ? { from: formatIsoDate(range.from), to: formatIsoDate(range.to) } : { from: "", to: "" };
  const syncKey = `${shown.from}|${shown.to}`;

  // Ô giữ chữ đang gõ; khoảng đổi từ nơi khác (nút, biểu đồ, link) thì ghi đè.
  const [fromText, setFromText] = useState(shown.from);
  const [toText, setToText] = useState(shown.to);
  const [syncedKey, setSyncedKey] = useState(syncKey);
  const [errors, setErrors] = useState<FieldErrors>({});
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    setFromText(shown.from);
    setToText(shown.to);
    setErrors({});
  }

  const messageId = useId();
  const message = errors.from ?? errors.to ?? linkError;

  function apply() {
    if (fromText.trim() === shown.from && toText.trim() === shown.to) {
      setErrors({});
      return;
    }
    const next: FieldErrors = {};
    const from = parseDateInput(fromText);
    const to = parseDateInput(toText);
    if (!from) next.from = "Nhập ngày dạng DD/MM/YYYY.";
    if (!to) next.to = "Nhập ngày dạng DD/MM/YYYY.";
    if (from && to && from > to) next.to = "Ngày kết thúc phải từ ngày bắt đầu trở đi.";
    else if (from && to && rangeDays(from, to) > MAX_RANGE_DAYS) next.to = `Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày.`;
    setErrors(next);
    if (from && to && !next.from && !next.to) onChange({ from, to });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      apply();
    }
  }

  function choosePreset(preset: Preset) {
    if (preset === "custom") return;
    if (preset === DEFAULT_RANGE_DAYS && !allByDefault) onChange(null);
    else onChange({ from: shiftDate(today, -(preset - 1)), to: today });
  }

  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium text-text-strong">Khoảng ngày</span>
      <div className="flex flex-wrap items-start gap-2">
        <SegmentedControl options={PRESETS} value={presetOf(range, today)} onChange={choosePreset} label="Chọn nhanh khoảng ngày" size="md" />
        <div className="flex items-center gap-1.5">
          <Input
            aria-label="Từ ngày"
            aria-invalid={Boolean(errors.from)}
            aria-describedby={message ? messageId : undefined}
            size="sm"
            inputMode="numeric"
            placeholder="DD/MM/YYYY"
            className={`w-[136px] font-num tabular-nums ${errors.from ? "border-red-400!" : ""}`}
            value={fromText}
            onChange={(event) => setFromText(event.target.value)}
            onBlur={apply}
            onKeyDown={handleKeyDown}
          />
          <span aria-hidden className="text-text-muted">
            –
          </span>
          <Input
            aria-label="Đến ngày"
            aria-invalid={Boolean(errors.to ?? (errors.from ? undefined : linkError))}
            aria-describedby={message ? messageId : undefined}
            size="sm"
            inputMode="numeric"
            placeholder="DD/MM/YYYY"
            className={`w-[136px] font-num tabular-nums ${errors.to || (!errors.from && linkError) ? "border-red-400!" : ""}`}
            value={toText}
            onChange={(event) => setToText(event.target.value)}
            onBlur={apply}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
      {message ? (
        <p id={messageId} className="text-sm text-red-600">
          {message}
        </p>
      ) : null}
      {range.kind === "all" ? (
        <p className="text-[13px] text-text-muted">Đang xem toàn bộ thời gian. Chọn nút hoặc nhập ngày để thu hẹp.</p>
      ) : range.kind === "time" ? (
        <p className="text-[13px] text-text-muted">Đang lọc theo một phiên làm việc. Nhập ngày để bỏ lọc phiên.</p>
      ) : null}
    </div>
  );
}
