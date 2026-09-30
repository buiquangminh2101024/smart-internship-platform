"use client";

import { useState } from "react";
import type { EmployerInterview } from "@sip/shared-types";
import { ApiError } from "@/lib/api-client";
import { useCancelInterview } from "@/hooks/useInterviews";
import { TZ_LABEL, formatLongDate, hhmm, vnDateAndMinutes } from "@/lib/interview-format";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { DashButton } from "@/components/dashboard/DashButton";
import { candidateLabel } from "./InterviewDialog";
import { NoteBox } from "./NoteBox";

const FORM_ID = "cancel-interview-form";
const REASON_ID = "cancel-interview-reason";
const REASON_MAX = 500;

/**
 * Huỷ một buổi phỏng vấn: lý do bắt buộc (ứng viên đọc trong email và trang
 * hồ sơ). Để trống thì báo lỗi ngay tại ô, không gửi.
 */
export function CancelInterviewDialog({
  interview,
  onClose,
  onCancelled,
}: {
  interview: EmployerInterview | null;
  onClose: () => void;
  onCancelled: (interview: EmployerInterview) => void;
}) {
  const cancel = useCancelInterview();

  return (
    <Dialog
      open={interview !== null}
      onClose={onClose}
      busy={cancel.isPending}
      size="sm"
      labelledBy="cancel-interview-title"
      describedBy="cancel-interview-msg"
      initialFocusId={REASON_ID}
    >
      {interview ? (
        <CancelContent key={interview.id} interview={interview} mutation={cancel} onClose={onClose} onCancelled={onCancelled} />
      ) : null}
    </Dialog>
  );
}

function CancelContent({
  interview,
  mutation,
  onClose,
  onCancelled,
}: {
  interview: EmployerInterview;
  mutation: ReturnType<typeof useCancelInterview>;
  onClose: () => void;
  onCancelled: (interview: EmployerInterview) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const busy = mutation.isPending;
  const { date, minutes } = vnDateAndMinutes(interview.scheduledAt);

  async function submit() {
    setServerError(null);
    if (!reason.trim()) {
      setError("Nhập lý do để ứng viên biết vì sao lịch bị huỷ.");
      document.getElementById(REASON_ID)?.focus();
      return;
    }
    try {
      const cancelled = await mutation.mutateAsync({ interviewId: interview.id, data: { reason: reason.trim() } });
      onCancelled(cancelled);
    } catch (err) {
      setServerError(
        err instanceof ApiError && err.status >= 400 && err.status < 500
          ? "Buổi phỏng vấn này đã bị huỷ hoặc đã diễn ra. Tải lại trang để xem trạng thái mới."
          : "Không huỷ được lịch. Kiểm tra kết nối rồi thử lại.",
      );
    }
  }

  return (
    <>
      <DialogHeader
        titleId="cancel-interview-title"
        title={`Huỷ buổi phỏng vấn với ${candidateLabel(interview.candidateName)}?`}
        subtitleId="cancel-interview-msg"
        subtitle={`${formatLongDate(date)} · ${hhmm(minutes)} ${TZ_LABEL}. Ứng viên nhận email báo huỷ kèm lý do. Hồ sơ quay lại nhóm "Hồ sơ chờ đặt lịch".`}
      />
      <DialogBody>
        <form
          id={FORM_ID}
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {serverError ? (
            <NoteBox tone="danger" icon="circle-alert" role="alert">
              {serverError}
            </NoteBox>
          ) : null}
          <div className="grid gap-1.5">
            <div className="flex justify-between gap-2">
              <label htmlFor={REASON_ID} className="text-sm font-medium text-text-strong">
                Lý do huỷ<span className="text-red-600"> *</span>
              </label>
              <span className="font-num text-[13px] text-text-muted tabular-nums" aria-hidden>
                {reason.length}/{REASON_MAX}
              </span>
            </div>
            <Textarea
              id={REASON_ID}
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              disabled={busy}
              aria-invalid={error !== null}
              aria-describedby={`${REASON_ID}-hint`}
              className="aria-invalid:border-red-400"
              placeholder="Ví dụ: người phỏng vấn bận đột xuất, sẽ gửi lịch mới"
              onChange={(event) => {
                setReason(event.target.value);
                if (event.target.value.trim()) setError(null);
              }}
            />
            <span id={`${REASON_ID}-hint`} className={`text-[13px] ${error ? "text-red-600" : "text-text-muted"}`}>
              {error ?? "Ứng viên đọc được lý do này trong email và trang hồ sơ."}
            </span>
          </div>
        </form>
      </DialogBody>
      <DialogFooter>
        <DashButton variant="secondary" disabled={busy} onClick={onClose} className="max-[480px]:flex-1">
          Giữ lịch
        </DashButton>
        <DashButton variant="danger-solid" type="submit" form={FORM_ID} loading={busy} className="max-[480px]:flex-1">
          {busy ? "Đang huỷ" : "Huỷ buổi phỏng vấn"}
        </DashButton>
      </DialogFooter>
    </>
  );
}
