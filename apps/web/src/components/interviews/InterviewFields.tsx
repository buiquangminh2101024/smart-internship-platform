"use client";

import type { ReactNode } from "react";
import type { InterviewMode } from "@sip/shared-types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Icon } from "@/components/ui/Icon";
import { vnTodayIso } from "@/lib/dashboard-format";
import {
  MAX_DAYS_AHEAD,
  addDaysIso,
  hhmm,
  isMeetingUrl,
  vnDateAndMinutes,
  vnIso,
} from "@/lib/interview-format";

/**
 * Trường nhập chung của hộp thoại đặt / đổi lịch và lên lịch hàng loạt (FE-5).
 * `locations` giữ riêng nội dung đã gõ cho từng hình thức: đổi qua lại
 * Online ↔ Tại văn phòng không mất liên kết hay địa chỉ đã nhập.
 */
export interface InterviewFormValues {
  date: string;
  time: string;
  duration: number;
  mode: InterviewMode;
  locations: Record<InterviewMode, string>;
  note: string;
}

export type InterviewFormField = "date" | "time" | "location";
export type InterviewFormErrors = Partial<Record<InterviewFormField, string | undefined>>;

export const DURATION_CHOICES = [15, 30, 45, 60, 90];
export const GAP_CHOICES = [0, 5, 10, 15];
const NOTE_MAX = 2000;

export function emptyInterviewForm(companyAddress: string | null | undefined): InterviewFormValues {
  return {
    date: "",
    time: "",
    duration: 45,
    mode: "ONLINE",
    locations: { ONLINE: "", ONSITE: companyAddress ?? "" },
    note: "",
  };
}

/** Giờ bắt đầu: 06:00 – 21:00, bước 15 phút; thêm giờ hiện tại của lịch nếu lệch bước. */
function timeOptions(current: string) {
  const values: string[] = [];
  for (let m = 6 * 60; m <= 21 * 60; m += 15) values.push(hhmm(m));
  if (current && !values.includes(current)) values.push(current);
  values.sort();
  return [{ value: "", label: "Chọn giờ" }, ...values.map((value) => ({ value, label: value }))];
}

/**
 * Kiểm tra trước khi gửi. `lastSlotOffsetMinutes`: buổi cuối của lô bắt đầu
 * sau buổi đầu bao nhiêu phút (server kiểm cả buổi đầu và buổi cuối).
 */
export function validateInterviewForm(
  values: InterviewFormValues,
  { now = Date.now(), lastSlotOffsetMinutes = 0 }: { now?: number; lastSlotOffsetMinutes?: number } = {},
): InterviewFormErrors {
  const errors: InterviewFormErrors = {};
  const today = vnTodayIso(new Date(now));
  const location = values.locations[values.mode].trim();

  if (!values.date) errors.date = "Chọn ngày phỏng vấn.";
  else if (values.date < today) errors.date = "Chọn ngày từ hôm nay trở đi.";

  if (!values.time) errors.time = "Chọn giờ bắt đầu.";
  else if (values.date && !errors.date) {
    const start = new Date(vnIso(values.date, values.time)).getTime();
    const last = start + lastSlotOffsetMinutes * 60_000;
    if (start <= now) {
      errors.time = `Chọn giờ sau thời điểm hiện tại (${hhmm(vnDateAndMinutes(now).minutes)}).`;
    } else if (last > now + MAX_DAYS_AHEAD * 24 * 60 * 60_000) {
      errors.date = `Chỉ đặt lịch trong vòng ${MAX_DAYS_AHEAD} ngày tới.`;
    }
  }

  if (!location) {
    errors.location = values.mode === "ONLINE" ? "Nhập liên kết họp để ứng viên tham gia." : "Nhập địa chỉ phỏng vấn.";
  } else if (values.mode === "ONLINE" && !isMeetingUrl(location)) {
    errors.location = "Liên kết họp cần bắt đầu bằng https://";
  }
  return errors;
}

const FIELD_ORDER: InterviewFormField[] = ["date", "time", "location"];

/** Focus ô lỗi đầu tiên (id theo `fieldId`). */
export function focusFirstError(idPrefix: string, errors: InterviewFormErrors) {
  const first = FIELD_ORDER.find((field) => errors[field]);
  if (first) document.getElementById(fieldId(idPrefix, first))?.focus();
}

export function fieldId(idPrefix: string, field: InterviewFormField | "note"): string {
  return `${idPrefix}-${field}`;
}

export function InterviewFields({
  idPrefix,
  values,
  errors,
  onChange,
  batch = false,
  /** Chèn sau ô thời lượng (vd. "Nghỉ giữa buổi" của lô). */
  afterDuration,
  disabled = false,
}: {
  idPrefix: string;
  values: InterviewFormValues;
  errors: InterviewFormErrors;
  onChange: (next: InterviewFormValues, changed: InterviewFormField | "duration" | "mode" | "note") => void;
  batch?: boolean;
  afterDuration?: ReactNode;
  disabled?: boolean;
}) {
  const today = vnTodayIso();
  const online = values.mode === "ONLINE";
  const durations = DURATION_CHOICES.includes(values.duration)
    ? DURATION_CHOICES
    : [...DURATION_CHOICES, values.duration].sort((a, b) => a - b);

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 max-[480px]:grid-cols-1">
      <Input
        id={fieldId(idPrefix, "date")}
        type="date"
        label="Ngày"
        required
        min={today}
        max={addDaysIso(today, MAX_DAYS_AHEAD)}
        value={values.date}
        error={errors.date}
        disabled={disabled}
        onChange={(event) => onChange({ ...values, date: event.target.value }, "date")}
      />
      <Select
        id={fieldId(idPrefix, "time")}
        label="Giờ bắt đầu (GMT+7)"
        required
        options={timeOptions(values.time)}
        value={values.time}
        error={errors.time}
        disabled={disabled}
        onChange={(event) => onChange({ ...values, time: event.target.value }, "time")}
      />

      <ChipRadioGroup
        className="col-span-full"
        legend={batch ? "Thời lượng mỗi buổi" : "Thời lượng"}
        name={`${idPrefix}-duration`}
        options={durations.map((minutes) => ({ value: minutes, label: `${minutes} phút` }))}
        value={values.duration}
        disabled={disabled}
        onChange={(duration) => onChange({ ...values, duration }, "duration")}
      />
      {afterDuration}

      <fieldset className="col-span-full grid min-w-0 gap-1.5" disabled={disabled}>
        <legend className="mb-1.5 text-sm font-medium text-text-strong">
          Hình thức<span className="text-red-600"> *</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 max-[480px]:grid-cols-1">
          <OptionCard
            name={`${idPrefix}-mode`}
            checked={online}
            icon="video"
            title="Online"
            description="Gửi liên kết họp cho ứng viên."
            onSelect={() => onChange({ ...values, mode: "ONLINE" }, "mode")}
          />
          <OptionCard
            name={`${idPrefix}-mode`}
            checked={!online}
            icon="building-2"
            title="Tại văn phòng"
            description="Điền sẵn địa chỉ công ty."
            onSelect={() => onChange({ ...values, mode: "ONSITE" }, "mode")}
          />
        </div>
      </fieldset>

      {/* className của Input gắn vào thẻ <input>, nên bọc ngoài để trải hết hai cột. */}
      <div className="col-span-full">
        <Input
          id={fieldId(idPrefix, "location")}
          type={online ? "url" : "text"}
          label={online ? "Liên kết họp" : "Địa chỉ"}
          required
          maxLength={500}
          placeholder={online ? "https://meet.google.com/…" : "Số nhà, đường, phường, quận, tỉnh/thành"}
          hint={
            online
              ? "Dán liên kết Google Meet, Zoom hoặc Microsoft Teams."
              : "Đã điền sẵn địa chỉ công ty. Sửa nếu phỏng vấn ở nơi khác."
          }
          value={values.locations[values.mode]}
          error={errors.location}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...values, locations: { ...values.locations, [values.mode]: event.target.value } }, "location")
          }
        />
      </div>

      <div className="col-span-full grid gap-1.5">
        <div className="flex justify-between gap-2">
          <label htmlFor={fieldId(idPrefix, "note")} className="text-sm font-medium text-text-strong">
            Ghi chú gửi ứng viên
          </label>
          <span className="font-num text-[13px] text-text-muted tabular-nums" aria-hidden>
            {values.note.length}/{NOTE_MAX}
          </span>
        </div>
        <Textarea
          id={fieldId(idPrefix, "note")}
          rows={3}
          maxLength={NOTE_MAX}
          value={values.note}
          disabled={disabled}
          placeholder="Ví dụ: chuẩn bị portfolio; mang CCCD khi đến văn phòng"
          aria-describedby={`${fieldId(idPrefix, "note")}-hint`}
          onChange={(event) => onChange({ ...values, note: event.target.value }, "note")}
        />
        <span id={`${fieldId(idPrefix, "note")}-hint`} className="text-[13px] text-text-muted">
          Không bắt buộc.{" "}
          {batch
            ? "Mỗi ứng viên nhận cùng ghi chú này trong email riêng."
            : "Ứng viên thấy ghi chú trong email và trang hồ sơ."}
        </span>
      </div>
    </div>
  );
}

/** Nhóm nút chọn dạng chip (radio gốc, ẩn hình tròn): thời lượng, nghỉ giữa buổi. */
export function ChipRadioGroup<T extends number | string>({
  legend,
  name,
  options,
  value,
  onChange,
  disabled = false,
  className = "",
}: {
  legend: string;
  name: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <fieldset className={`grid min-w-0 gap-1.5 ${className}`} disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium text-text-strong">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label key={String(option.value)} className="relative inline-flex">
              <input
                type="radio"
                name={name}
                value={String(option.value)}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="peer absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <span
                className={[
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 font-semibold transition-colors duration-150 motion-reduce:transition-none",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500",
                  checked
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-border-default bg-surface-card text-text-body peer-hover:bg-surface-hover",
                ].join(" ")}
              >
                {checked ? <Icon name="check" size={14} /> : null}
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Thẻ lựa chọn hai phương án (hình thức, cách xếp lịch): radio gốc, chấm tròn vẽ lại. */
export function OptionCard({
  name,
  checked,
  icon,
  title,
  description,
  onSelect,
}: {
  name: string;
  checked: boolean;
  icon?: string;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <label className="relative block">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="peer absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        className={[
          "flex h-full items-start gap-2.5 rounded-[10px] border px-3 py-2.5",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500",
          checked
            ? "border-brand-600 bg-brand-50 shadow-[inset_0_0_0_1px_var(--color-brand-600)]"
            : "border-border-default bg-surface-card peer-hover:bg-surface-hover",
        ].join(" ")}
      >
        <span
          aria-hidden
          className={`mt-px grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-2 ${
            checked ? "border-brand-600" : "border-border-default"
          }`}
        >
          {checked ? <span className="h-2 w-2 rounded-full bg-brand-600" /> : null}
        </span>
        <span className="min-w-0">
          <b className="flex items-center gap-1.5 text-text-strong">
            {icon ? <Icon name={icon} size={16} /> : null}
            {title}
          </b>
          <small className="mt-0.5 block text-[13px] font-normal text-text-muted">{description}</small>
        </span>
      </span>
    </label>
  );
}
