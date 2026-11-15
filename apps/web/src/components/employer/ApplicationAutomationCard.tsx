"use client";

import { type FormEvent, useState } from "react";
import type { JobApplicationAutomationSettings, UpdateJobApplicationAutomationRequest } from "@sip/shared-types";
import { useJobApplicationAutomation, useUpdateJobApplicationAutomation } from "@/hooks/useApplicationAutomation";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ApplicationAutomationFields, parseRejectBelow, type ApplicationAutomationDraft } from "./ApplicationAutomationFields";

// Thẻ "Tự động xử lý hồ sơ" ở cột phải trang tin, ngay dưới "Tự động mời ứng viên"
// (AD-25, plan frontend F4). Chỉ người đăng tin thấy: API trả 404 cho người khác ⇒ thẻ không hiện.

const TITLE_ID = "application-automation-title";

function toDraft(dto: JobApplicationAutomationSettings): ApplicationAutomationDraft {
  return {
    autoReviewEnabled: dto.autoReviewEnabled,
    rejectSuggestBelowScore: String(dto.rejectSuggestBelowScore),
    autoCloseInterviewedEnabled: dto.autoCloseInterviewedEnabled,
  };
}

export function ApplicationAutomationCard({
  jobId,
  thresholdEditable,
}: {
  jobId: string;
  /** Thẻ tự mời (nơi sửa X) có hiện ở trang này không; quyết định câu "sửa ở đâu". */
  thresholdEditable: boolean;
}) {
  const query = useJobApplicationAutomation(jobId);
  const update = useUpdateJobApplicationAutomation();
  const [draft, setDraft] = useState<ApplicationAutomationDraft | null>(null);
  const [saved, setSaved] = useState(false);

  // 404 = không phải người đăng tin (khớp quyền của API) ⇒ không hiện thẻ.
  if (query.isError && query.error instanceof ApiError && query.error.status === 404) return null;

  const heading = (
    <h2 id={TITLE_ID} className="text-xs font-semibold tracking-wide text-text-subtle uppercase">
      Tự động xử lý hồ sơ
    </h2>
  );

  if (query.isPending) {
    return (
      <Card padding="md" className="grid gap-3" aria-busy="true">
        {heading}
        <span className="h-32 animate-pulse rounded-lg bg-surface-page" />
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card padding="md" className="grid gap-3">
        {heading}
        <p className="text-sm text-text-body">Không tải được cài đặt tự động xử lý hồ sơ.</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon="refresh-cw"
          className="w-fit"
          loading={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Tải lại
        </Button>
      </Card>
    );
  }

  const data = query.data;
  const values = draft ?? toDraft(data);
  const rejectBelow = parseRejectBelow(values.rejectSuggestBelowScore, data.matchThreshold);

  const patch: UpdateJobApplicationAutomationRequest = {
    ...(values.autoReviewEnabled !== data.autoReviewEnabled ? { autoReviewEnabled: values.autoReviewEnabled } : {}),
    ...(rejectBelow !== null && rejectBelow !== data.rejectSuggestBelowScore
      ? { rejectSuggestBelowScore: rejectBelow }
      : {}),
    ...(values.autoCloseInterviewedEnabled !== data.autoCloseInterviewedEnabled
      ? { autoCloseInterviewedEnabled: values.autoCloseInterviewedEnabled }
      : {}),
  };
  const changed = Object.keys(patch).length > 0;
  const valid = rejectBelow !== null;

  function edit(next: ApplicationAutomationDraft) {
    setDraft(next);
    setSaved(false);
    update.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !changed) return;
    update.mutate(
      { jobId, patch },
      {
        onSuccess: () => {
          setDraft(null);
          setSaved(true);
        },
      },
    );
  }

  return (
    <Card padding="md" className="grid gap-3">
      <form onSubmit={submit} noValidate className="grid gap-3" aria-labelledby={TITLE_ID}>
        {heading}

        <ApplicationAutomationFields
          values={values}
          matchThreshold={data.matchThreshold}
          thresholdNote={thresholdEditable ? "sửa ở thẻ trên" : "không đổi được khi tin đã kết thúc"}
          disabled={update.isPending}
          onChange={edit}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={!changed || !valid} loading={update.isPending}>
            Lưu cài đặt
          </Button>
          {update.isError ? (
            // 400 (Y ≥ X, kể cả khi X vừa bị hạ ở thẻ tự mời) mang câu tiếng Việt của server.
            <p className="text-sm text-red-600" role="alert">
              {update.error instanceof ApiError ? update.error.message : "Không lưu được cài đặt, vui lòng thử lại."}
            </p>
          ) : saved ? (
            <p className="inline-flex items-center gap-1 text-sm text-success-700" role="status">
              <Icon name="check" size={14} />
              Đã lưu.
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
