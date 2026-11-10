"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import type { JobAutoOutreachDto, UpdateAutoOutreachSettingsRequest } from "@sip/shared-types";
import {
  DEFAULT_MIN_SCORE,
  HIRING_TARGET_MAX,
  parseIntInRange,
  useJobAutoOutreach,
  useUpdateJobAutoOutreach,
} from "@/hooks/useAutoOutreach";
import { ApiError } from "@/lib/api-client";
import { formatVnDate, formatVnDayMonth, formatVnTime } from "@/lib/dashboard-format";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { cappedUntilLabel } from "./CandidateSearchCard";

// Thẻ "Tự động mời ứng viên" ở cột phải trang tin (AD-23, plan frontend F2).
// Chỉ người đăng tin thấy: API trả 404 cho người khác ⇒ thẻ không hiện.

const TITLE_ID = "auto-outreach-title";
/** Sau khi lưu, đọc lại trong tối đa 30 giây để thấy lượt chạy nền vừa gửi lời mời. */
const POLL_AFTER_SAVE_MS = 30_000;

interface Draft {
  enabled: boolean;
  hiringTarget: string;
  minScore: string;
}

function toDraft(dto: JobAutoOutreachDto): Draft {
  return { enabled: dto.enabled, hiringTarget: String(dto.hiringTarget), minScore: String(dto.minScore) };
}

/** "lúc 14:30", hoặc "lúc 07:00 ngày 11/11" khi không phải hôm nay (giờ Việt Nam). */
function formatNextCheck(iso: string): string {
  const time = formatVnTime(iso);
  return formatVnDate(iso) === formatVnDate(new Date()) ? `lúc ${time}` : `lúc ${time} ngày ${formatVnDayMonth(iso)}`;
}

function Num({ value }: { value: number }) {
  return <span className="font-num font-bold tabular-nums text-text-strong">{value}</span>;
}

/** Dòng trạng thái theo `state` của server (không theo bản đang sửa). */
function AutoOutreachStatus({ data, jobId }: { data: JobAutoOutreachDto; jobId: string }) {
  const { state, status } = data;
  const invitationsLink = (
    <Button
      as="a"
      href={`/employer/jobs/${jobId}/candidate-search?tab=invited`}
      variant="link"
      size="sm"
      iconAfter="arrow-right"
      className="w-fit text-sm"
    >
      Xem lời mời
    </Button>
  );

  let body: ReactNode;
  switch (state) {
    case "OFF":
      return null;
    case "PLAN_NOT_ALLOWED":
      return (
        <div className="grid gap-2 rounded-lg bg-surface-page p-3 text-sm text-text-body">
          <p>Tự động mời có từ gói Cơ bản. Gói hiện tại chỉ mời tay được.</p>
          <Button as="a" href="/employer/subscription" variant="secondary" size="sm" className="w-fit">
            Xem gói dịch vụ
          </Button>
        </div>
      );
    case "NOT_PUBLISHED":
      return (
        <p className="rounded-lg bg-surface-page p-3 text-sm text-text-body">Bắt đầu mời khi tin được đăng.</p>
      );
    case "RUNNING":
      body = (
        <>
          <p>
            Đang giữ <Num value={status.active} />/<Num value={status.target ?? 0} /> lời mời ·{" "}
            <Num value={status.acceptedInvitations} /> đã nhận lời · Đã tuyển <Num value={status.hiredCount} />/
            <Num value={data.hiringTarget} />
          </p>
          <p className="text-text-muted">Hệ thống tự mời bù khi có người từ chối hoặc lời mời hết hạn.</p>
        </>
      );
      break;
    case "TARGET_MET":
      body = (
        <p>
          Đã tuyển đủ <Num value={status.hiredCount} />/<Num value={data.hiringTarget} />, hệ thống ngừng mời.
        </p>
      );
      break;
    case "NO_MATCH":
      body = (
        <p>
          Không còn ứng viên đạt ngưỡng {data.minScore}%. Hệ thống kiểm lại
          {status.nextCheckAt ? ` ${formatNextCheck(status.nextCheckAt)}` : " sau"}, hoặc bạn thử hạ ngưỡng.
        </p>
      );
      break;
    case "CANDIDATES_CAPPED":
      body = (
        <p>
          Các ứng viên phù hợp hôm nay đã nhận đủ lời mời. Hệ thống mời tiếp từ {cappedUntilLabel()}.
        </p>
      );
      break;
  }

  return (
    <div className="grid gap-1 rounded-lg bg-surface-page p-3 text-sm text-text-body" role="status">
      {body}
      {invitationsLink}
    </div>
  );
}

export function AutoOutreachCard({ jobId, published }: { jobId: string; published: boolean }) {
  const [pollUntil, setPollUntil] = useState(0);
  const query = useJobAutoOutreach(jobId, true, pollUntil);
  const update = useUpdateJobAutoOutreach();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  // 404 = không phải người đăng tin (khớp quyền của API) ⇒ không hiện thẻ.
  if (query.isError && query.error instanceof ApiError && query.error.status === 404) return null;

  const heading = (
    <h2 id={TITLE_ID} className="text-xs font-semibold tracking-wide text-text-subtle uppercase">
      Tự động mời ứng viên
    </h2>
  );

  if (query.isPending) {
    return (
      <Card padding="md" className="grid gap-3" aria-busy="true">
        {heading}
        <span className="h-24 animate-pulse rounded-lg bg-surface-page" />
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card padding="md" className="grid gap-3">
        {heading}
        <p className="text-sm text-text-body">Không tải được cài đặt tự động mời.</p>
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
  const planNotAllowed = data.state === "PLAN_NOT_ALLOWED";
  const values = draft ?? toDraft(data);
  const hiringTarget = parseIntInRange(values.hiringTarget, 1, HIRING_TARGET_MAX);
  const minScore = parseIntInRange(values.minScore, 0, 100);
  const hiringTargetError = hiringTarget === null ? `Nhập số nguyên từ 1 đến ${HIRING_TARGET_MAX}.` : undefined;
  const minScoreError = minScore === null ? "Nhập số nguyên từ 0 đến 100." : undefined;

  const patch: UpdateAutoOutreachSettingsRequest = {
    ...(values.enabled !== data.enabled ? { enabled: values.enabled } : {}),
    ...(hiringTarget !== null && hiringTarget !== data.hiringTarget ? { hiringTarget } : {}),
    ...(minScore !== null && minScore !== data.minScore ? { minScore } : {}),
  };
  const changed = Object.keys(patch).length > 0;
  const valid = hiringTarget !== null && minScore !== null;

  function edit(next: Partial<Draft>) {
    setDraft({ ...values, ...next });
    setSaved(false);
    update.reset();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !changed) return;
    update.mutate(
      { jobId, patch },
      {
        onSuccess: (dto) => {
          setDraft(null);
          setSaved(true);
          if (dto.enabled && published) setPollUntil(Date.now() + POLL_AFTER_SAVE_MS);
        },
      },
    );
  }

  return (
    <Card padding="md" className="grid gap-3">
      <form onSubmit={submit} noValidate className="grid gap-3" aria-labelledby={TITLE_ID}>
        <div className="flex items-center justify-between gap-3">
          {heading}
          <button
            type="button"
            role="switch"
            aria-checked={values.enabled}
            aria-labelledby={TITLE_ID}
            disabled={planNotAllowed || update.isPending}
            onClick={() => edit({ enabled: !values.enabled })}
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

        <fieldset disabled={planNotAllowed || update.isPending} className="grid gap-3 disabled:text-text-muted">
          <Input
            label="Số người cần tuyển"
            type="number"
            inputMode="numeric"
            min={1}
            max={HIRING_TARGET_MAX}
            size="sm"
            value={values.hiringTarget}
            error={hiringTargetError}
            onChange={(event) => edit({ hiringTarget: event.target.value })}
          />
          <Input
            label="Ngưỡng điểm phù hợp (%)"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            size="sm"
            value={values.minScore}
            error={minScoreError}
            hint={`Đề xuất: ${DEFAULT_MIN_SCORE}%. Thấp hơn thì mời được nhiều người hơn nhưng kém phù hợp hơn.`}
            onChange={(event) => edit({ minScore: event.target.value })}
          />
        </fieldset>

        <AutoOutreachStatus data={data} jobId={jobId} />

        {planNotAllowed ? null : (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={!changed || !valid} loading={update.isPending}>
              Lưu cài đặt
            </Button>
            {update.isError ? (
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
        )}
      </form>
    </Card>
  );
}
