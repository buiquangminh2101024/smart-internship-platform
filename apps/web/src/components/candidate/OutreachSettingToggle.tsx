"use client";

import { useState } from "react";
import { useUpdateOutreachSettings } from "@/hooks/useCandidateOutreach";
import { Card } from "@/components/ui/Card";

// Cờ "Cho phép nhà tuyển dụng tìm thấy" (B3, AD-15) — docs/05-frontend/phases/candidate-outreach/PLAN.md
// (quyết định 3). Mặc định tắt; lưu ngay khi bấm, không đi qua form "Thông tin cá nhân".

export function OutreachSettingToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (isOpenToOutreach: boolean) => void;
}) {
  const { mutate, isPending } = useUpdateOutreachSettings();
  const [error, setError] = useState("");

  function toggle(next: boolean) {
    setError("");
    mutate(
      { isOpenToOutreach: next },
      {
        onSuccess: (settings) => onChange(settings.isOpenToOutreach),
        onError: (cause) => setError(cause instanceof Error ? cause.message : "Không lưu được cài đặt."),
      },
    );
  }

  return (
    <Card padding="md" className="grid gap-2">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-pine-600"
          checked={value}
          disabled={isPending}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span className="grid gap-1">
          <span className="text-base font-semibold text-text-strong">Cho phép nhà tuyển dụng tìm thấy và mời bạn</span>
          <span className="text-sm text-text-muted">
            Khi bật: nhà tuyển dụng thấy tên, ảnh, học vấn, kỹ năng và kinh nghiệm của bạn, <strong>không</strong> thấy
            số điện thoại và email. Bạn có thể tắt bất cứ lúc nào. Lời mời nhận được nằm ở mục{" "}
            <a href="/job-invitations" className="text-brand-700 underline">
              Lời mời ứng tuyển
            </a>
            .
          </span>
        </span>
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </Card>
  );
}
