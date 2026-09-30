"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AwaitingScheduleApplication,
  BatchScheduleFailureReason,
  EmployerInterview,
  InterviewBatchArrangement,
} from "@sip/shared-types";
import { ApiError } from "@/lib/api-client";
import { batchFailuresOf, useBatchScheduleInterviews, useEmployerInterviews } from "@/hooks/useInterviews";
import {
  MODE_LABEL,
  TZ_LABEL,
  addDaysIso,
  formatLongDate,
  hhmm,
  interviewEndMs,
  toMinutes,
  vnIso,
} from "@/lib/interview-format";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { DashButton } from "@/components/dashboard/DashButton";
import {
  ChipRadioGroup,
  GAP_CHOICES,
  InterviewFields,
  OptionCard,
  emptyInterviewForm,
  fieldId,
  focusFirstError,
  validateInterviewForm,
  type InterviewFormErrors,
  type InterviewFormValues,
} from "./InterviewFields";
import { candidateLabel } from "./InterviewDialog";
import { NoteBox } from "./NoteBox";

const PREFIX = "batch";
const TITLE_ID = "batch-title";
/** Mốc cảnh báo "kết thúc muộn" (không chặn). */
const LATE_END_MINUTES = 18 * 60;

const FAILURE_LABEL: Record<BatchScheduleFailureReason, string> = {
  NOT_FOUND: "Không còn tìm thấy hồ sơ",
  INVALID_STATUS: "Hồ sơ đã đổi trạng thái",
  ALREADY_SCHEDULED: "Đã có lịch",
};

export interface BatchScheduleDialogProps {
  /** Hồ sơ đã chọn (2–20), theo thứ tự chọn; null = đóng. */
  items: AwaitingScheduleApplication[] | null;
  companyAddress: string | null | undefined;
  /** userId của người đang đăng nhập — cảnh báo trùng với lịch do chính mình đặt. */
  myUserId: string | undefined;
  onClose: () => void;
  onScheduled: (interviews: EmployerInterview[]) => void;
}

/**
 * Lên lịch hàng loạt (D12): bước 1 thiết lập, bước 2 xem trước — đổi thứ tự
 * (↑/↓, giờ tính lại ngay), bỏ bớt (✕), cảnh báo không chặn. Server tạo tất
 * cả hoặc không: lỗi 409 giữ ở bước 2, tô đỏ dòng lỗi, cho bỏ các dòng đó rồi
 * thử lại.
 */
export function BatchScheduleDialog(props: BatchScheduleDialogProps) {
  const mutation = useBatchScheduleInterviews();
  const { items } = props;

  return (
    <Dialog
      open={items !== null}
      onClose={props.onClose}
      busy={mutation.isPending}
      size="lg"
      fullScreenOnMobile
      labelledBy={TITLE_ID}
      initialFocusId={fieldId(PREFIX, "date")}
    >
      {items ? <BatchContent {...props} items={items} mutation={mutation} /> : null}
    </Dialog>
  );
}

interface Slot {
  start: number;
  end: number;
}

function slotsOf(count: number, startTime: string, duration: number, gap: number, arrangement: InterviewBatchArrangement) {
  const start = toMinutes(startTime);
  return Array.from({ length: count }, (_, index): Slot => {
    const s = arrangement === "GROUP" ? start : start + index * (duration + gap);
    return { start: s, end: s + duration };
  });
}

type FocusRequest = { id: string; action: "up" | "down" | "remove" } | { target: "title" | "error" | "date" } | null;

function BatchContent({
  items: initialItems,
  companyAddress,
  myUserId,
  onClose,
  onScheduled,
  mutation,
}: BatchScheduleDialogProps & {
  items: AwaitingScheduleApplication[];
  mutation: ReturnType<typeof useBatchScheduleInterviews>;
}) {
  const [items, setItems] = useState(initialItems);
  const [step, setStep] = useState<1 | 2>(1);
  const [values, setValues] = useState<InterviewFormValues>(() => emptyInterviewForm(companyAddress));
  const [arrangement, setArrangement] = useState<InterviewBatchArrangement>("SEQUENTIAL");
  const [gap, setGap] = useState(0);
  const [errors, setErrors] = useState<InterviewFormErrors>({});
  const [failures, setFailures] = useState<Record<string, BatchScheduleFailureReason>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Focus cần chuyển sau lần render kế tiếp (đổi bước, đổi thứ tự, lỗi 409).
  const focusRequest = useRef<FocusRequest>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableSectionElement>(null);

  const busy = mutation.isPending;
  const group = arrangement === "GROUP";
  const effectiveGap = group ? 0 : gap;
  const count = items.length;
  const hasWhen = Boolean(values.date && values.time);
  const slots = hasWhen ? slotsOf(count, values.time, values.duration, effectiveGap, arrangement) : [];
  const spanStart = slots[0]?.start ?? 0;
  const spanEnd = slots[slots.length - 1]?.end ?? 0;
  const failedIds = Object.keys(failures);
  const remainingAfterFailures = items.filter((item) => !failures[item.applicationId]);

  // Lịch của chính mình trong ngày đã chọn — chỉ tải ở bước xem trước.
  const dayRange = step === 2 && values.date ? { from: vnIso(values.date, "00:00"), to: vnIso(addDaysIso(values.date, 1), "00:00") } : null;
  const dayInterviews = useEmployerInterviews(dayRange);
  const mine = (dayInterviews.data ?? []).filter((interview) => interview.createdById === myUserId);
  const dayStartMs = values.date ? new Date(vnIso(values.date, "00:00")).getTime() : 0;
  const overlapsOf = (slot: Slot) =>
    mine.filter((interview) => {
      const start = new Date(interview.scheduledAt).getTime();
      const end = interviewEndMs(interview.scheduledAt, interview.durationMinutes);
      return start < dayStartMs + slot.end * 60_000 && dayStartMs + slot.start * 60_000 < end;
    });

  useEffect(() => {
    const request = focusRequest.current;
    if (!request) return;
    focusRequest.current = null;
    if ("target" in request) {
      if (request.target === "title") titleRef.current?.focus();
      else if (request.target === "error") errorRef.current?.focus();
      else document.getElementById(fieldId(PREFIX, "date"))?.focus();
      return;
    }
    const row = tableRef.current?.querySelector(`[data-row="${request.id}"]`);
    const preferred = row?.querySelector<HTMLButtonElement>(`[data-action="${request.action}"]`);
    const fallback = row?.querySelector<HTMLButtonElement>(`[data-action="${request.action === "up" ? "down" : "up"}"]`);
    const target = preferred && !preferred.disabled ? preferred : fallback;
    if (target && !target.disabled) target.focus();
    else titleRef.current?.focus();
  });

  function setFocusRequest(request: FocusRequest) {
    focusRequest.current = request;
  }

  function goToPreview() {
    const lastOffset = group ? 0 : (count - 1) * (values.duration + effectiveGap);
    const found = validateInterviewForm(values, { lastSlotOffsetMinutes: lastOffset });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError(PREFIX, found);
      return;
    }
    setStep(2);
    setFocusRequest({ target: "title" });
  }

  function backToSetup() {
    setFailures({});
    setServerError(null);
    setStep(1);
    setFocusRequest({ target: "date" });
  }

  function move(index: number, direction: -1 | 1) {
    const to = index + direction;
    if (to < 0 || to >= count) return;
    const next = [...items];
    const moved = next[index]!;
    next[index] = next[to]!;
    next[to] = moved;
    setItems(next);
    const slot = slotsOf(next.length, values.time, values.duration, effectiveGap, arrangement)[to]!;
    setAnnouncement(`Đã chuyển ${candidateLabel(moved.candidateName)} tới vị trí ${to + 1}, giờ mới ${hhmm(slot.start)}.`);
    setFocusRequest({ id: moved.applicationId, action: direction < 0 ? "up" : "down" });
  }

  function remove(index: number) {
    const removed = items[index]!;
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    setFailures((prev) => {
      const next = { ...prev };
      delete next[removed.applicationId];
      return next;
    });
    setAnnouncement(`Đã bỏ ${candidateLabel(removed.candidateName)} khỏi đợt này. Hồ sơ vẫn nằm trong danh sách chờ.`);
    const neighbour = next[Math.min(index, next.length - 1)];
    setFocusRequest(neighbour ? { id: neighbour.applicationId, action: "remove" } : { target: "title" });
  }

  async function submit(list: AwaitingScheduleApplication[]) {
    setServerError(null);
    try {
      const result = await mutation.mutateAsync({
        applicationIds: list.map((item) => item.applicationId),
        arrangement,
        startAt: vnIso(values.date, values.time),
        durationMinutes: values.duration,
        ...(group ? {} : { gapMinutes: effectiveGap }),
        mode: values.mode,
        location: values.locations[values.mode].trim(),
        note: values.note.trim() || null,
      });
      onScheduled(result.items);
    } catch (error) {
      const batchFailures = batchFailuresOf(error);
      if (batchFailures) {
        setFailures(Object.fromEntries(batchFailures.map((failure) => [failure.applicationId, failure.reason])));
        setFocusRequest({ target: "error" });
        return;
      }
      setServerError(
        error instanceof ApiError && /future|days ahead/i.test(error.message)
          ? "Giờ bắt đầu không còn hợp lệ (đã qua hoặc quá 180 ngày). Bấm “Sửa thiết lập” để chọn giờ khác."
          : error instanceof ApiError && error.status >= 400 && error.status < 500
            ? "Không lên lịch được với thiết lập này. Bấm “Sửa thiết lập” để kiểm tra lại."
            : "Không lên lịch được. Kiểm tra kết nối rồi thử lại.",
      );
      setFocusRequest({ target: "error" });
    }
  }

  function confirm() {
    if (failedIds.length > 0) {
      // Bỏ các hồ sơ lỗi rồi gửi lại ngay với phần còn lại.
      setItems(remainingAfterFailures);
      setFailures({});
      void submit(remainingAfterFailures);
      return;
    }
    void submit(items);
  }

  // ─── Cảnh báo (không chặn xác nhận) ─────────────────────────────────────
  const warnings: string[] = [];
  const rowOverlap = slots.map((slot) => overlapsOf(slot));
  if (step === 2) {
    rowOverlap.forEach((overlaps, index) => {
      if (group && index > 0) return;
      const slot = slots[index]!;
      overlaps.forEach((interview) => {
        const start = new Date(interview.scheduledAt).getTime();
        const otherStart = Math.round((start - dayStartMs) / 60_000);
        const other = `${candidateLabel(interview.candidateName)}, ${hhmm(otherStart)} – ${hhmm(otherStart + interview.durationMinutes)}`;
        warnings.push(
          group
            ? `Buổi nhóm (${hhmm(slot.start)} – ${hhmm(slot.end)}) trùng với lịch bạn đã đặt: ${other}.`
            : `Buổi của ${candidateLabel(items[index]!.candidateName)} (${hhmm(slot.start)} – ${hhmm(slot.end)}) trùng với lịch bạn đã đặt: ${other}.`,
        );
      });
    });
    if (spanEnd > LATE_END_MINUTES) {
      warnings.push(`${group ? "Buổi nhóm" : "Buổi cuối"} kết thúc lúc ${hhmm(spanEnd)}, sau 18:00.`);
    }
  }

  const title = `Lên lịch phỏng vấn cho ${count} ứng viên`;

  return (
    <>
      <DialogHeader titleId={TITLE_ID} titleRef={titleRef} title={title} onClose={onClose} closeDisabled={busy}>
        <ol aria-label="Các bước" className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[13px] text-text-muted">
          <StepItem number={1} label="Thiết lập" current={step === 1} past={step === 2} />
          <li aria-hidden className="h-px w-6 bg-border-default" />
          <StepItem number={2} label="Xem trước" current={step === 2} past={false} />
        </ol>
      </DialogHeader>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {step === 1 ? (
        <DialogBody>
          <form
            id="batch-setup-form"
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              goToPreview();
            }}
          >
            <fieldset className="grid min-w-0 gap-1.5">
              <legend className="mb-1.5 text-sm font-medium text-text-strong">Cách xếp lịch</legend>
              <div className="grid grid-cols-2 gap-2 max-[480px]:grid-cols-1">
                <OptionCard
                  name={`${PREFIX}-arrangement`}
                  checked={!group}
                  title="Chia khung giờ liên tiếp"
                  description="Mỗi ứng viên một buổi, nối tiếp nhau theo thứ tự."
                  onSelect={() => setArrangement("SEQUENTIAL")}
                />
                <OptionCard
                  name={`${PREFIX}-arrangement`}
                  checked={group}
                  title="Cùng một giờ"
                  description="Phỏng vấn nhóm, mọi người cùng một khung giờ."
                  onSelect={() => setArrangement("GROUP")}
                />
              </div>
            </fieldset>
            <InterviewFields
              idPrefix={PREFIX}
              batch
              values={values}
              errors={errors}
              onChange={(next, changed) => {
                setValues(next);
                if (changed === "date" || changed === "time" || changed === "location") {
                  setErrors((prev) => ({ ...prev, [changed]: undefined }));
                } else if (changed === "mode") {
                  setErrors((prev) => ({ ...prev, location: undefined }));
                }
              }}
              afterDuration={
                group ? null : (
                  <ChipRadioGroup
                    className="col-span-full"
                    legend="Nghỉ giữa buổi"
                    name={`${PREFIX}-gap`}
                    options={GAP_CHOICES.map((minutes) => ({ value: minutes, label: minutes ? `${minutes} phút` : "Không nghỉ" }))}
                    value={gap}
                    onChange={setGap}
                  />
                )
              }
            />
            {hasWhen ? (
              <NoteBox tone="brand" icon="clock">
                {group ? (
                  <>
                    Dự kiến:{" "}
                    <b>
                      phỏng vấn nhóm {count} ứng viên, {hhmm(spanStart)} – {hhmm(spanEnd)} {TZ_LABEL}
                    </b>
                    , {formatLongDate(values.date)}.
                  </>
                ) : (
                  <>
                    Dự kiến:{" "}
                    <b>
                      {count} buổi, {hhmm(spanStart)} – {hhmm(spanEnd)} {TZ_LABEL}
                    </b>
                    , {formatLongDate(values.date)}. Bước sau cho xem và đổi thứ tự.
                  </>
                )}
              </NoteBox>
            ) : null}
          </form>
        </DialogBody>
      ) : (
        <DialogBody>
          {failedIds.length > 0 || serverError ? (
            <NoteBox tone="danger" icon="circle-alert" boxRef={errorRef} role="alert">
              {failedIds.length > 0 ? (
                <>
                  <b>Chưa lên lịch được: {failedIds.length} hồ sơ không còn hợp lệ.</b>
                  <p>
                    {remainingAfterFailures.length > 0
                      ? "Chưa có lịch nào được tạo. Bỏ các hồ sơ lỗi rồi thử lại, hoặc quay lại để sửa."
                      : "Chưa có lịch nào được tạo và không còn hồ sơ hợp lệ trong đợt này. Đóng hộp thoại rồi tải lại trang."}
                  </p>
                </>
              ) : (
                serverError
              )}
            </NoteBox>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p id="batch-summary" className="font-semibold text-text-strong">
              {formatLongDate(values.date)} · {MODE_LABEL[values.mode]} · {values.duration} phút
              {group ? "" : ` mỗi buổi${effectiveGap ? `, nghỉ ${effectiveGap} phút` : ""}`}
            </p>
            <button
              type="button"
              onClick={backToSetup}
              disabled={busy}
              className="cursor-pointer py-1 font-semibold text-brand-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              Sửa thiết lập
            </button>
          </div>

          {group ? (
            <p className="flex items-center gap-2 font-semibold text-text-strong">
              <Icon name="users" size={18} />
              Phỏng vấn nhóm: {count} ứng viên, {hhmm(spanStart)} – {hhmm(spanEnd)} {TZ_LABEL}
            </p>
          ) : null}

          {warnings.length > 0 ? (
            <NoteBox tone="warning" icon="triangle-alert">
              <b>Cần lưu ý</b> · không chặn xác nhận
              <ul className="mt-1 ml-[18px] list-disc">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </NoteBox>
          ) : null}

          <table aria-describedby="batch-summary" className="w-full border-collapse text-left max-[480px]:block">
            <thead className="max-[480px]:hidden">
              <tr className="text-[13px] text-text-muted">
                <th className="w-9 border-b border-border-subtle px-2.5 py-2 font-semibold">#</th>
                <th className="border-b border-border-subtle px-2.5 py-2 font-semibold">Ứng viên</th>
                <th className="border-b border-border-subtle px-2.5 py-2 font-semibold">Tin tuyển dụng</th>
                {group ? null : <th className="border-b border-border-subtle px-2.5 py-2 font-semibold">Giờ {TZ_LABEL}</th>}
                <th className="w-px border-b border-border-subtle px-2.5 py-2">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody ref={tableRef} className="max-[480px]:flex max-[480px]:flex-col max-[480px]:gap-2">
              {items.map((item, index) => {
                const slot = slots[index]!;
                const failure = failures[item.applicationId];
                const overlap = !group && rowOverlap[index]!.length > 0;
                const late = !group && slot.end > LATE_END_MINUTES;
                const name = candidateLabel(item.candidateName);
                const cell = `border-b border-border-subtle px-2.5 py-2.5 align-middle max-[480px]:border-0 max-[480px]:p-0 ${
                  failure ? "bg-red-50 max-[480px]:bg-transparent" : ""
                }`;
                return (
                  <tr
                    key={item.applicationId}
                    data-row={item.applicationId}
                    className={[
                      "max-[480px]:grid max-[480px]:grid-cols-[28px_minmax(0,1fr)_auto] max-[480px]:items-center max-[480px]:gap-x-2 max-[480px]:gap-y-0.5",
                      "max-[480px]:[grid-template-areas:'n_name_name'_'n_job_job'_'n_time_act'] max-[480px]:rounded-[10px] max-[480px]:border max-[480px]:p-3",
                      failure ? "max-[480px]:border-red-300 max-[480px]:bg-red-50" : "max-[480px]:border-border-subtle",
                    ].join(" ")}
                  >
                    <td
                      className={`${cell} w-9 font-num text-text-muted tabular-nums max-[480px]:w-auto max-[480px]:self-start max-[480px]:[grid-area:n] ${
                        failure ? "shadow-[inset_3px_0_0_var(--color-red-600)] max-[480px]:shadow-none" : ""
                      }`}
                    >
                      {index + 1}
                    </td>
                    <td className={`${cell} max-[480px]:[grid-area:name]`}>
                      <b className="text-text-strong">{name}</b>
                      {failure ? (
                        <span className="mt-0.5 flex items-center gap-1 text-[13px] font-bold text-red-700">
                          <Icon name="circle-alert" size={14} />
                          {FAILURE_LABEL[failure]}
                        </span>
                      ) : null}
                    </td>
                    <td className={`${cell} text-text-muted max-[480px]:[grid-area:job]`}>{item.jobPostTitle}</td>
                    {group ? null : (
                      <td
                        className={`${cell} font-semibold whitespace-nowrap max-[480px]:whitespace-normal max-[480px]:[grid-area:time] ${
                          overlap || late ? "text-marigold-800" : "text-text-strong"
                        }`}
                      >
                        <span className="font-num tabular-nums">
                          {hhmm(slot.start)} – {hhmm(slot.end)}
                        </span>
                        {overlap ? <RowWarning>Trùng giờ</RowWarning> : null}
                        {late ? <RowWarning>Sau 18:00</RowWarning> : null}
                      </td>
                    )}
                    <td className={`${cell} w-px text-right whitespace-nowrap max-[480px]:flex max-[480px]:w-auto max-[480px]:justify-end max-[480px]:[grid-area:act]`}>
                      {group ? null : (
                        <>
                          <IconButton
                            action="up"
                            icon="arrow-up"
                            label={`Đưa ${name} lên trước`}
                            disabled={busy || index === 0}
                            onClick={() => move(index, -1)}
                          />
                          <IconButton
                            action="down"
                            icon="arrow-down"
                            label={`Đưa ${name} xuống sau`}
                            disabled={busy || index === count - 1}
                            onClick={() => move(index, 1)}
                          />
                        </>
                      )}
                      <IconButton
                        action="remove"
                        icon="x"
                        danger
                        label={`Bỏ ${name} khỏi đợt này`}
                        disabled={busy || count === 1}
                        onClick={() => remove(index)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DialogBody>
      )}

      <DialogFooter>
        <p className="mr-auto text-[13px] text-text-muted max-[480px]:basis-full [&_b]:text-text-strong">
          {step === 1 ? (
            <>
              <b>{count}</b> ứng viên đã chọn
            </>
          ) : failedIds.length > 0 ? (
            <>
              Còn <b>{remainingAfterFailures.length} buổi</b> sau khi bỏ {failedIds.length} hồ sơ lỗi
            </>
          ) : (
            <>
              <b>{count} buổi</b> · {hhmm(spanStart)} – {hhmm(spanEnd)} · {count} email sẽ được gửi tới ứng viên
            </>
          )}
        </p>
        {step === 1 ? (
          <>
            <DashButton variant="secondary" onClick={onClose} className="max-[480px]:flex-1">
              Huỷ bỏ
            </DashButton>
            <DashButton type="submit" form="batch-setup-form" iconAfter="arrow-right" className="max-[480px]:flex-1">
              Xem trước
            </DashButton>
          </>
        ) : (
          <>
            <DashButton variant="secondary" icon="arrow-left" disabled={busy} onClick={backToSetup} className="max-[480px]:flex-1">
              Quay lại
            </DashButton>
            {failedIds.length > 0 && remainingAfterFailures.length === 0 ? null : (
              <DashButton
                icon={failedIds.length > 0 ? "rotate-ccw" : "check"}
                loading={busy}
                onClick={confirm}
                className="max-[480px]:flex-1"
              >
                {busy ? "Đang lên lịch" : failedIds.length > 0 ? "Bỏ các hồ sơ lỗi và thử lại" : "Xác nhận lên lịch"}
              </DashButton>
            )}
          </>
        )}
      </DialogFooter>
    </>
  );
}

function StepItem({ number, label, current, past }: { number: number; label: string; current: boolean; past: boolean }) {
  return (
    <li aria-current={current ? "step" : undefined} className={`flex items-center gap-1.5 ${current ? "font-bold text-brand-700" : ""}`}>
      <span
        aria-hidden
        className={`grid h-[22px] w-[22px] place-items-center rounded-full border text-xs font-bold ${
          current
            ? "border-brand-600 bg-brand-600 text-white"
            : past
              ? "border-brand-100 bg-brand-100 text-brand-700"
              : "border-border-default bg-surface-card"
        }`}
      >
        {number}
      </span>
      {label}
    </li>
  );
}

function RowWarning({ children }: { children: string }) {
  return (
    <span className="flex items-center gap-1 text-[13px] font-bold text-marigold-800">
      <Icon name="triangle-alert" size={14} />
      {children}
    </span>
  );
}

function IconButton({
  action,
  icon,
  label,
  disabled,
  danger = false,
  onClick,
}: {
  action: "up" | "down" | "remove";
  icon: string;
  label: string;
  disabled: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-action={action}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-text-muted disabled:cursor-default disabled:opacity-35 max-[480px]:h-10 max-[480px]:w-11 ${
        danger ? "enabled:hover:bg-red-50 enabled:hover:text-red-700" : "enabled:hover:bg-surface-hover enabled:hover:text-text-strong"
      }`}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
