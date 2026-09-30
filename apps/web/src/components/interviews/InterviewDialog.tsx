"use client";

import { useState } from "react";
import type { EmployerInterview, RescheduleInterviewRequest } from "@sip/shared-types";
import { ApiError } from "@/lib/api-client";
import { useRescheduleInterview, useScheduleInterview } from "@/hooks/useInterviews";
import { vnTodayIso } from "@/lib/dashboard-format";
import {
  MODE_LABEL,
  TZ_LABEL,
  formatInterviewWhen,
  formatLongDate,
  hhmm,
  toMinutes,
  vnDateAndMinutes,
  vnIso,
} from "@/lib/interview-format";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { DashButton } from "@/components/dashboard/DashButton";
import {
  InterviewFields,
  emptyInterviewForm,
  fieldId,
  focusFirstError,
  validateInterviewForm,
  type InterviewFormErrors,
  type InterviewFormValues,
} from "./InterviewFields";
import { NoteBox } from "./NoteBox";

/** Hồ sơ cần đặt lịch — lấy từ `AwaitingScheduleApplication`. */
export interface ScheduleCandidate {
  applicationId: string;
  candidateName: string | null;
  jobPostTitle: string;
  status: "SHORTLISTED" | "INTERVIEWING";
}

export type InterviewDialogTarget =
  | { kind: "schedule"; application: ScheduleCandidate }
  | { kind: "reschedule"; interview: EmployerInterview };

export interface InterviewDialogProps {
  target: InterviewDialogTarget | null;
  companyAddress: string | null | undefined;
  onClose: () => void;
  onScheduled?: (interview: EmployerInterview, application: ScheduleCandidate) => void;
  onRescheduled?: (interview: EmployerInterview) => void;
  /** Nút "Huỷ buổi phỏng vấn" khi đổi lịch: trang đóng hộp này rồi mở hộp huỷ. */
  onRequestCancel?: (interview: EmployerInterview) => void;
}

const FORM_ID = "interview-form";
const PREFIX = "iv";

export function candidateLabel(name: string | null | undefined): string {
  return name?.trim() || "ứng viên";
}

/**
 * Hộp thoại dùng chung cho đặt lịch (hồ sơ chờ đặt lịch) và đổi lịch (buổi
 * sắp tới). Gửi xong mới đóng; lỗi của server hiện ngay trong hộp thoại vì
 * Toast nằm dưới lớp phủ của hộp thoại.
 */
export function InterviewDialog(props: InterviewDialogProps) {
  const schedule = useScheduleInterview();
  const reschedule = useRescheduleInterview();
  const busy = schedule.isPending || reschedule.isPending;
  const { target } = props;
  const key = target ? (target.kind === "schedule" ? target.application.applicationId : target.interview.id) : "none";

  return (
    <Dialog
      open={target !== null}
      onClose={props.onClose}
      busy={busy}
      labelledBy={`${PREFIX}-title`}
      describedBy={`${PREFIX}-sub`}
      fullScreenOnMobile
      initialFocusId={fieldId(PREFIX, "date")}
    >
      {target ? (
        <InterviewDialogContent
          key={`${target.kind}-${key}`}
          {...props}
          target={target}
          busy={busy}
          scheduleMutation={schedule}
          rescheduleMutation={reschedule}
        />
      ) : null}
    </Dialog>
  );
}

function initialValues(target: InterviewDialogTarget, companyAddress: string | null | undefined): InterviewFormValues {
  const empty = emptyInterviewForm(companyAddress);
  if (target.kind === "schedule") return empty;
  const { interview } = target;
  const { date, minutes } = vnDateAndMinutes(interview.scheduledAt);
  return {
    date,
    time: hhmm(minutes),
    duration: interview.durationMinutes,
    mode: interview.mode,
    locations: { ...empty.locations, [interview.mode]: interview.location ?? "" },
    note: interview.note ?? "",
  };
}

/** Trường nào thật sự đổi so với lịch hiện tại (PATCH chỉ gửi phần đổi). */
function rescheduleChanges(original: InterviewFormValues, values: InterviewFormValues): RescheduleInterviewRequest {
  const changes: RescheduleInterviewRequest = {};
  if (values.date !== original.date || values.time !== original.time) changes.scheduledAt = vnIso(values.date, values.time);
  if (values.duration !== original.duration) changes.durationMinutes = values.duration;
  const location = values.locations[values.mode].trim();
  if (values.mode !== original.mode || location !== original.locations[original.mode].trim()) {
    // Server bắt buộc gửi kèm địa điểm mới khi đổi hình thức.
    changes.mode = values.mode;
    changes.location = location;
  }
  if (values.note.trim() !== original.note.trim()) changes.note = values.note.trim() || null;
  return changes;
}

/** Lỗi server → lỗi tại ô (giờ, ngày) hoặc một câu chung kèm cách sửa. */
function mapServerError(
  error: unknown,
  kind: InterviewDialogTarget["kind"],
): { field?: InterviewFormErrors; message?: string } {
  if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500) {
    return { message: "Không lưu được lịch. Kiểm tra kết nối rồi thử lại." };
  }
  if (/future/i.test(error.message)) return { field: { time: "Giờ này đã qua. Chọn giờ khác." } };
  if (/days ahead/i.test(error.message)) return { field: { date: "Chỉ đặt lịch trong vòng 180 ngày tới." } };
  if (kind === "schedule") {
    if (error.status === 404) return { message: "Không còn tìm thấy hồ sơ này. Tải lại trang để cập nhật danh sách." };
    if (error.status === 409) return { message: "Hồ sơ này đã có lịch phỏng vấn sắp tới. Tải lại trang để xem lịch." };
    return { message: "Hồ sơ đã đổi trạng thái nên không đặt lịch được nữa. Tải lại trang để xem trạng thái mới." };
  }
  if (error.status === 404) return { message: "Không còn tìm thấy buổi phỏng vấn này. Tải lại trang để cập nhật." };
  return {
    message:
      "Buổi phỏng vấn này đã bị huỷ, đã diễn ra hoặc hồ sơ đã có kết quả. Tải lại trang để xem trạng thái mới.",
  };
}

function InterviewDialogContent({
  target,
  companyAddress,
  onClose,
  onScheduled,
  onRescheduled,
  onRequestCancel,
  busy,
  scheduleMutation,
  rescheduleMutation,
}: InterviewDialogProps & {
  target: InterviewDialogTarget;
  busy: boolean;
  scheduleMutation: ReturnType<typeof useScheduleInterview>;
  rescheduleMutation: ReturnType<typeof useRescheduleInterview>;
}) {
  const [original] = useState(() => initialValues(target, companyAddress));
  const [values, setValues] = useState(original);
  const [errors, setErrors] = useState<InterviewFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const isReschedule = target.kind === "reschedule";
  const name = candidateLabel(isReschedule ? target.interview.candidateName : target.application.candidateName);
  const jobTitle = isReschedule ? target.interview.jobPostTitle : target.application.jobPostTitle;
  const changes = isReschedule ? rescheduleChanges(original, values) : null;
  const unchanged = changes !== null && Object.keys(changes).length === 0;
  const today = vnTodayIso();
  const hasWhen = Boolean(values.date && values.time && values.date >= today);

  async function submit() {
    const found = validateInterviewForm(values);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) {
      focusFirstError(PREFIX, found);
      return;
    }
    try {
      if (target.kind === "schedule") {
        const interview = await scheduleMutation.mutateAsync({
          applicationId: target.application.applicationId,
          data: {
            scheduledAt: vnIso(values.date, values.time),
            durationMinutes: values.duration,
            mode: values.mode,
            location: values.locations[values.mode].trim(),
            note: values.note.trim() || null,
          },
        });
        onScheduled?.(interview, target.application);
      } else {
        if (!changes || unchanged) return;
        const interview = await rescheduleMutation.mutateAsync({ interviewId: target.interview.id, data: changes });
        onRescheduled?.(interview);
      }
    } catch (error) {
      const mapped = mapServerError(error, target.kind);
      if (mapped.field) {
        setErrors(mapped.field);
        focusFirstError(PREFIX, mapped.field);
      }
      setServerError(mapped.message ?? null);
    }
  }

  return (
    <>
      <DialogHeader
        titleId={`${PREFIX}-title`}
        title={isReschedule ? "Đổi lịch phỏng vấn" : "Đặt lịch phỏng vấn"}
        subtitleId={`${PREFIX}-sub`}
        subtitle={`${name} · ${jobTitle}`}
        onClose={onClose}
        closeDisabled={busy}
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
          {isReschedule ? (
            <NoteBox tone="muted" icon="calendar-clock">
              Lịch hiện tại:{" "}
              <b>
                {formatInterviewWhen(target.interview.scheduledAt, target.interview.durationMinutes)} ·{" "}
                {MODE_LABEL[target.interview.mode]}
              </b>
            </NoteBox>
          ) : null}
          <InterviewFields
            idPrefix={PREFIX}
            values={values}
            errors={errors}
            disabled={busy}
            onChange={(next, changed) => {
              setValues(next);
              if (changed === "date" || changed === "time" || changed === "location") {
                setErrors((prev) => ({ ...prev, [changed]: undefined }));
              } else if (changed === "mode") {
                setErrors((prev) => ({ ...prev, location: undefined }));
              }
            }}
          />
          {hasWhen ? (
            <NoteBox tone="brand" icon="info">
              <b>
                {formatLongDate(values.date)} · {values.time} – {hhmm(toMinutes(values.time) + values.duration)} {TZ_LABEL}
              </b>{" "}
              · {MODE_LABEL[values.mode]}.{" "}
              {isReschedule ? (
                "Ứng viên nhận thông báo và email báo đổi lịch, có cả giờ cũ và giờ mới."
              ) : (
                <>
                  Ứng viên nhận thông báo và email.
                  {target.application.status === "SHORTLISTED" ? (
                    <>
                      {" "}
                      Hồ sơ chuyển sang trạng thái <b>Phỏng vấn</b>.
                    </>
                  ) : null}
                </>
              )}
            </NoteBox>
          ) : null}
        </form>
      </DialogBody>
      <DialogFooter>
        {isReschedule && onRequestCancel ? (
          <DashButton
            variant="danger"
            icon="calendar-x"
            className="mr-auto"
            disabled={busy}
            onClick={() => onRequestCancel(target.interview)}
          >
            Huỷ buổi phỏng vấn
          </DashButton>
        ) : null}
        {unchanged ? <span className="mr-auto text-[13px] text-text-muted">Chưa có thay đổi nào</span> : null}
        <DashButton variant="secondary" disabled={busy} onClick={onClose} className="max-[480px]:flex-1">
          Đóng
        </DashButton>
        <DashButton
          type="submit"
          form={FORM_ID}
          loading={busy}
          disabled={unchanged}
          className="max-[480px]:flex-1"
        >
          {busy ? "Đang lưu" : isReschedule ? "Lưu lịch mới" : "Đặt lịch"}
        </DashButton>
      </DialogFooter>
    </>
  );
}
