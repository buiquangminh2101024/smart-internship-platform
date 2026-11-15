"use client";

import type { ReactNode } from "react";
import { DEFAULT_MIN_SCORE, HIRING_TARGET_MAX } from "@/hooks/useAutoOutreach";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

// Nhóm cuối form tạo tin (AD-23, plan frontend F3). Lưu bằng PATCH …/auto-outreach
// sau khi tạo nháp; ngưỡng điểm để mặc định, chỉnh ở thẻ trên trang tin.

export interface AutoOutreachDraftValues {
  hiringTarget: string;
  enabled: boolean;
}

const SWITCH_LABEL_ID = "new-job-auto-outreach-label";

export function AutoOutreachDraftFields({
  values,
  error,
  /** Gói Dùng thử (hoặc chưa có gói) không tự mời được ⇒ ẩn công tắc, chỉ giữ số người cần tuyển. */
  autoAllowed,
  disabled,
  onChange,
  children,
}: {
  values: AutoOutreachDraftValues;
  error: string | undefined;
  autoAllowed: boolean;
  disabled: boolean;
  onChange: (next: AutoOutreachDraftValues) => void;
  /** Phần cài đặt nối thêm dưới đường kẻ (AD-25: các ô "Tự động xử lý hồ sơ"). */
  children?: ReactNode;
}) {
  return (
    <Card padding="lg" className="grid gap-4">
      <h2 className="text-base font-semibold text-text-strong">
        {autoAllowed ? "Số người cần tuyển và tự động mời" : "Tuyển dụng"}
      </h2>
      <div className="sm:max-w-sm">
        <Input
          label="Số người cần tuyển"
          type="number"
          inputMode="numeric"
          min={1}
          max={HIRING_TARGET_MAX}
          value={values.hiringTarget}
          error={error}
          hint={autoAllowed ? "Hệ thống ngừng tự mời khi đã tuyển đủ số người này." : undefined}
          disabled={disabled}
          onChange={(event) => onChange({ ...values, hiringTarget: event.target.value })}
        />
      </div>

      {autoAllowed ? (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p id={SWITCH_LABEL_ID} className="text-sm font-medium text-text-strong">
              Tự động mời ứng viên phù hợp khi tin được đăng
            </p>
            <p className="mt-1 text-sm text-text-muted">
              Hệ thống gửi lời mời cho ứng viên đạt từ {DEFAULT_MIN_SCORE}% phù hợp và mời bù khi có người từ chối. Bạn
              đổi ngưỡng điểm hoặc tắt ở trang tin sau khi tạo.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={values.enabled}
            aria-labelledby={SWITCH_LABEL_ID}
            disabled={disabled}
            onClick={() => onChange({ ...values, enabled: !values.enabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-50 ${
              values.enabled ? "bg-brand-600" : "bg-text-subtle"
            }`}
          >
            <span
              aria-hidden
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                values.enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      ) : null}

      {children ? <div className="grid gap-4 border-t border-border-subtle pt-4">{children}</div> : null}
    </Card>
  );
}
