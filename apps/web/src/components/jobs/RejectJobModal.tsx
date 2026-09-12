"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Textarea } from "@/components/ui/Textarea";

/** Lý do dựng sẵn trong ảnh mẫu `Screenshot 2026-09-12 134745.png`. */
const PRESET_REASONS = [
  "Thiếu thông tin",
  "Nội dung không phù hợp",
  "Thông tin không hợp lệ",
  "Vi phạm chính sách",
  "Khác",
];

export interface RejectJobModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  submitting?: boolean;
  error?: string | null;
  onCancel: () => void;
  /** Nhận chuỗi lý do đã ghép (checkbox + mô tả chi tiết). */
  onConfirm: (reason: string) => void;
}

/**
 * Modal nhập lý do cho hành động từ chối / thu hồi tin. Các lý do chọn sẵn và
 * phần nhập tự do được ghép thành MỘT chuỗi `reason` duy nhất gửi lên backend
 * (schema chỉ có 1 field `reason`).
 */
export function RejectJobModal({
  title,
  description,
  confirmLabel,
  submitting = false,
  error,
  onCancel,
  onConfirm,
}: RejectJobModalProps) {
  const [checked, setChecked] = useState<string[]>([]);
  const [detail, setDetail] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function toggle(reason: string) {
    setChecked((prev) => (prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]));
  }

  function handleConfirm() {
    const parts = [checked.join(", "), detail.trim()].filter(Boolean);
    if (parts.length === 0) {
      setLocalError("Vui lòng chọn ít nhất một lý do hoặc nhập lý do cụ thể");
      return;
    }
    setLocalError(null);
    onConfirm(parts.join(". "));
  }

  const message = localError ?? error;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-text-strong/40 px-4">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <h2 className="inline-flex items-center gap-2 font-semibold text-red-700">
            <Icon name="triangle-alert" size={18} />
            {title}
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onCancel}
            className="text-text-muted transition-colors hover:text-text-strong"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-4">
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-text-strong">{description}</legend>
            {PRESET_REASONS.map((reason) => (
              <label key={reason} className="flex items-center gap-2 text-sm text-text-body">
                <input type="checkbox" checked={checked.includes(reason)} onChange={() => toggle(reason)} />
                {reason}
              </label>
            ))}
          </fieldset>

          <Textarea
            label="Nhập lý do cụ thể"
            rows={3}
            placeholder="Nhà tuyển dụng sẽ nhận được lý do này để chỉnh sửa..."
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />

          {message ? <p className="text-sm text-red-600">{message}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-4">
          <Button type="button" variant="ghost" disabled={submitting} onClick={onCancel}>
            Hủy
          </Button>
          <Button type="button" variant="danger" icon="circle-x" loading={submitting} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
