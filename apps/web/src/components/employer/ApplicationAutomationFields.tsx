"use client";

import { useId } from "react";
import { AUTO_CLOSE_GRACE_DAYS, AUTO_CLOSE_INTERVIEWED_DAYS } from "@/hooks/useApplicationAutomation";
import { parseIntInRange } from "@/hooks/useAutoOutreach";
import { Input } from "@/components/ui/Input";

// Các ô cài đặt "Tự động xử lý hồ sơ" (AD-25, plan frontend F4). Dùng chung cho thẻ trên
// trang tin (`ApplicationAutomationCard`) và khối cài đặt của form tạo tin.

export interface ApplicationAutomationDraft {
  autoReviewEnabled: boolean;
  /** Y dạng chuỗi của ô nhập; kiểm bằng `parseRejectBelow`. */
  rejectSuggestBelowScore: string;
  autoCloseInterviewedEnabled: boolean;
}

/** Y hợp lệ là số nguyên 0 ≤ Y < X (server cũng chặn, trả 400). Sai thì null. */
export function parseRejectBelow(value: string, matchThreshold: number): number | null {
  return matchThreshold <= 0 ? null : parseIntInRange(value, 0, matchThreshold - 1);
}

export function rejectBelowError(value: string, matchThreshold: number): string | undefined {
  if (parseRejectBelow(value, matchThreshold) !== null) return undefined;
  return matchThreshold <= 0
    ? "Ngưỡng phù hợp đang là 0%, nên không đặt được ngưỡng đề xuất từ chối."
    : `Nhập số nguyên từ 0 đến ${matchThreshold - 1}.`;
}

function CheckRow({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-desc`}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-600 disabled:cursor-not-allowed"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-text-strong">
          {label}
        </label>
        <p id={`${id}-desc`} className="mt-0.5 text-sm text-text-muted">
          {description}
        </p>
      </div>
    </div>
  );
}

export function ApplicationAutomationFields({
  values,
  matchThreshold,
  thresholdNote,
  disabled,
  onChange,
}: {
  values: ApplicationAutomationDraft;
  /** X của tin (ngưỡng tự mời), chỉ đọc ở đây. */
  matchThreshold: number;
  /** Nơi sửa X, nối sau "Dùng chung với tự mời" (vd. "sửa ở thẻ trên"). */
  thresholdNote: string;
  disabled: boolean;
  onChange: (next: ApplicationAutomationDraft) => void;
}) {
  const edit = (next: Partial<ApplicationAutomationDraft>) => onChange({ ...values, ...next });
  return (
    <div className="grid gap-4">
      <CheckRow
        checked={values.autoReviewEnabled}
        disabled={disabled}
        label="Tự chuyển hồ sơ đạt ngưỡng sang “Đang xem xét”"
        description={`Ngưỡng phù hợp: ${matchThreshold}%. Dùng chung với tự mời, ${thresholdNote}.`}
        onChange={(checked) => edit({ autoReviewEnabled: checked })}
      />

      <div className="sm:max-w-xs">
        <Input
          label="Đề xuất từ chối khi điểm dưới (%)"
          type="number"
          inputMode="numeric"
          min={0}
          max={Math.max(0, matchThreshold - 1)}
          size="sm"
          value={values.rejectSuggestBelowScore}
          error={rejectBelowError(values.rejectSuggestBelowScore, matchThreshold)}
          hint="Hệ thống chỉ đề xuất. Bạn xác nhận ở trang Ứng viên."
          disabled={disabled}
          onChange={(event) => edit({ rejectSuggestBelowScore: event.target.value })}
        />
      </div>

      <CheckRow
        checked={values.autoCloseInterviewedEnabled}
        disabled={disabled}
        label="Tự đóng hồ sơ đã phỏng vấn nếu không có kết quả"
        description={`${AUTO_CLOSE_INTERVIEWED_DAYS} ngày sau khi tin đóng, hoặc sau buổi phỏng vấn gần nhất nếu muộn hơn. Ứng viên nhận thông báo tin đã ngừng tuyển.`}
        onChange={(checked) => edit({ autoCloseInterviewedEnabled: checked })}
      />

      <div className="grid gap-1 rounded-lg bg-surface-page p-3 text-sm text-text-body">
        <p>
          Khi tin đóng: hồ sơ Chờ duyệt tự đóng ngay; hồ sơ chưa phỏng vấn tự đóng sau {AUTO_CLOSE_GRACE_DAYS} ngày.
        </p>
        <p className="text-text-muted">
          Ô đầu tiên chỉ bật tắt việc tự chuyển sang “Đang xem xét”. Đề xuất từ chối, nhắc hằng tuần và tự đóng vẫn
          chạy khi tắt ô này.
        </p>
      </div>
    </div>
  );
}
