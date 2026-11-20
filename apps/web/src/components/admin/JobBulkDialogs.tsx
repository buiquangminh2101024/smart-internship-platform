"use client";

import { useId, useState, type ReactNode } from "react";
import type { BulkModerationSkipReason, JobPost } from "@sip/shared-types";
import { DashButton } from "@/components/dashboard/DashButton";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Textarea } from "@/components/ui/Textarea";
import { JobQualityBadge } from "@/components/admin/JobQualityBadge";
import {
  BULK_SKIP_REASON_LABEL,
  JOB_REJECT_PRESET_REASONS,
  composeRejectReason,
} from "@/lib/job-post-display";

/*
 * Hộp thoại duyệt / từ chối / kết quả hàng loạt ở hàng đợi `/admin/jobs` (AD-29 F3,
 * docs/05-frontend/phases/job-quality-moderation/PLAN.md). Danh sách tin truyền vào là
 * các tin đã chọn, đã có trên trang (trang tải đủ trước khi mở hộp thoại).
 */

function JobLine({ job, children }: { job: JobPost; children?: ReactNode }) {
  return (
    <li className="grid gap-1 border-b border-border-subtle py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 font-semibold text-text-strong">{job.title}</span>
        <JobQualityBadge quality={job.quality} showLabel={false} />
      </div>
      <span className="text-[13px] text-text-muted">{job.company.name}</span>
      {children}
    </li>
  );
}

export function BulkApproveDialog({
  open,
  jobs,
  busy,
  onClose,
  onConfirm,
  onDeselect,
}: {
  open: boolean;
  jobs: JobPost[];
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Bỏ chọn các tin không thuộc vùng đề xuất duyệt. */
  onDeselect: (ids: string[]) => void;
}) {
  const titleId = useId();
  const outside = jobs.filter((job) => job.quality?.band !== "SUGGEST_APPROVE");
  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} busy={busy} size="md">
      <DialogHeader titleId={titleId} title={`Duyệt ${jobs.length} tin?`} onClose={onClose} closeDisabled={busy} />
      <DialogBody>
        <p>Tin sẽ hiển thị công khai và hệ thống sẽ tự gửi lời mời tới ứng viên phù hợp ngay sau khi duyệt.</p>
        {outside.length > 0 ? (
          <div className="grid gap-2 rounded-lg border-l-[3px] border-marigold-500 bg-marigold-100 px-4 py-3 text-marigold-800">
            <p className="flex items-center gap-2 font-semibold">
              <Icon name="triangle-alert" size={16} />
              {outside.length} tin không nằm trong vùng đề xuất duyệt
            </p>
            <ul className="grid gap-0.5 text-[13px]">
              {outside.map((job) => (
                <li key={job.id}>
                  {job.title} · {job.quality ? `${job.quality.score} điểm` : "Chưa chấm"}
                </li>
              ))}
            </ul>
            <div>
              <DashButton
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => onDeselect(outside.map((job) => job.id))}
              >
                Bỏ chọn {outside.length} tin này
              </DashButton>
            </div>
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <DashButton variant="secondary" disabled={busy} onClick={onClose}>
          Hủy
        </DashButton>
        <DashButton icon="check" loading={busy} disabled={jobs.length === 0} onClick={onConfirm}>
          Duyệt {jobs.length} tin
        </DashButton>
      </DialogFooter>
    </Dialog>
  );
}

export function BulkRejectDialog({
  open,
  jobs,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  jobs: JobPost[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  /** `reason` undefined = mỗi tin dùng lý do tự sinh của nó. */
  onConfirm: (reason: string | undefined) => void;
}) {
  const titleId = useId();
  const commonId = useId();
  const [useCommon, setUseCommon] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [detail, setDetail] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const missing = jobs.filter((job) => !job.quality?.suggestedRejectReason);
  const nothingToReject = !useCommon && missing.length === jobs.length;

  function toggle(reason: string) {
    setChecked((prev) => (prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]));
  }

  function handleConfirm() {
    if (!useCommon) {
      onConfirm(undefined);
      return;
    }
    const reason = composeRejectReason(checked, detail);
    if (!reason) {
      setLocalError("Chọn ít nhất một lý do hoặc nhập lý do cụ thể");
      return;
    }
    setLocalError(null);
    onConfirm(reason);
  }

  const message = localError ?? error;

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} busy={busy} size="lg" fullScreenOnMobile>
      <DialogHeader
        titleId={titleId}
        title={`Từ chối ${jobs.length} tin?`}
        subtitle="Nhà tuyển dụng nhận được lý do để sửa tin rồi gửi lại."
        onClose={onClose}
        closeDisabled={busy}
      />
      <DialogBody>
        <label htmlFor={commonId} className="flex cursor-pointer items-center gap-2 font-semibold text-text-strong">
          <input
            id={commonId}
            type="checkbox"
            checked={useCommon}
            onChange={(event) => setUseCommon(event.target.checked)}
            className="h-[18px] w-[18px] cursor-pointer accent-brand-600"
          />
          Dùng một lý do chung cho tất cả
        </label>

        {useCommon ? (
          <div className="grid gap-3 rounded-lg bg-surface-page px-4 py-3">
            <fieldset className="grid gap-2">
              <legend className="mb-1 font-medium text-text-strong">Lý do từ chối</legend>
              {JOB_REJECT_PRESET_REASONS.map((reason) => (
                <label key={reason} className="flex cursor-pointer items-center gap-2 text-text-body">
                  <input
                    type="checkbox"
                    checked={checked.includes(reason)}
                    onChange={() => toggle(reason)}
                    className="h-4 w-4 cursor-pointer accent-brand-600"
                  />
                  {reason}
                </label>
              ))}
            </fieldset>
            <Textarea
              label="Nhập lý do cụ thể"
              rows={3}
              placeholder="Nhà tuyển dụng sẽ nhận được lý do này để chỉnh sửa..."
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
            />
          </div>
        ) : missing.length > 0 ? (
          <p className="flex items-start gap-2 rounded-lg border-l-[3px] border-marigold-500 bg-marigold-100 px-4 py-3 font-semibold text-marigold-800">
            <Icon name="triangle-alert" size={16} className="mt-0.5 shrink-0" />
            {missing.length} tin sẽ bị bỏ qua vì chưa có lý do. Chọn &ldquo;Dùng một lý do chung&rdquo; để từ chối cả các tin này.
          </p>
        ) : null}

        <div>
          <p className="mb-1 font-medium text-text-strong">
            {useCommon ? "Các tin sẽ bị từ chối" : "Lý do tự sinh theo điểm của từng tin"}
          </p>
          <ul className="rounded-lg border border-border-subtle px-4">
            {jobs.map((job) => (
              <JobLine key={job.id} job={job}>
                {useCommon ? null : job.quality?.suggestedRejectReason ? (
                  <p className="text-[13px] text-text-body">{job.quality.suggestedRejectReason}</p>
                ) : (
                  <p className="text-[13px] font-semibold text-marigold-800">Chưa có lý do</p>
                )}
              </JobLine>
            ))}
          </ul>
        </div>

        {message ? (
          <p role="alert" className="text-red-700">
            {message}
          </p>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <DashButton variant="secondary" disabled={busy} onClick={onClose}>
          Hủy
        </DashButton>
        <DashButton variant="danger-solid" icon="circle-x" loading={busy} disabled={nothingToReject} onClick={handleConfirm}>
          Từ chối {useCommon ? jobs.length : jobs.length - missing.length} tin
        </DashButton>
      </DialogFooter>
    </Dialog>
  );
}

export interface BulkSkippedItem {
  id: string;
  title: string;
  reason: BulkModerationSkipReason;
}

/** Danh sách tin bị bỏ qua sau một lô (chỉ mở khi có tin bị bỏ qua). */
export function BulkResultDialog({
  open,
  action,
  succeeded,
  skipped,
  onClose,
}: {
  open: boolean;
  action: "APPROVE" | "REJECT";
  succeeded: number;
  skipped: BulkSkippedItem[];
  onClose: () => void;
}) {
  const titleId = useId();
  const verb = action === "APPROVE" ? "duyệt" : "từ chối";
  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="sm">
      <DialogHeader
        titleId={titleId}
        title={`${skipped.length} tin chưa được ${verb}`}
        subtitle={`Đã ${verb} ${succeeded} tin. Các tin dưới đây bị bỏ qua.`}
        onClose={onClose}
      />
      <DialogBody>
        <ul className="grid gap-2">
          {skipped.map((item) => (
            <li key={item.id} className="grid gap-0.5">
              <span className="font-semibold text-text-strong">{item.title}</span>
              <span className="text-[13px] text-text-muted">{BULK_SKIP_REASON_LABEL[item.reason]}</span>
            </li>
          ))}
        </ul>
      </DialogBody>
      <DialogFooter>
        <DashButton onClick={onClose}>Đóng</DashButton>
      </DialogFooter>
    </Dialog>
  );
}
