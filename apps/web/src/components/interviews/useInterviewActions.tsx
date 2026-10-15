"use client";

import { useState } from "react";
import type { AwaitingScheduleApplication, EmployerInterview } from "@sip/shared-types";
import { useEmployerMe } from "@/hooks/useEmployerMe";
import { formatVnDayMonth, formatVnTime } from "@/lib/dashboard-format";
import type { ToastData } from "@/components/ui/Toast";
import { CancelInterviewDialog } from "./CancelInterviewDialog";
import { InterviewDialog, candidateLabel } from "./InterviewDialog";
import { useInterviewScheduling } from "./useInterviewScheduling";

type Notify = (tone: ToastData["tone"], message: string) => void;

export type InterviewChange =
  | { kind: "scheduled"; interviews: EmployerInterview[] }
  | { kind: "rescheduled"; interview: EmployerInterview }
  | { kind: "cancelled"; interview: EmployerInterview };

/**
 * Đặt / đổi / huỷ lịch phỏng vấn, dùng chung cho dashboard, trang lịch, trang
 * hồ sơ theo tin và chi tiết hồ sơ: hồ sơ đang chọn, hồ sơ vừa đặt lịch, buổi
 * vừa đổi / huỷ, và các hộp thoại (trang render `dialogs` một lần).
 *
 * Hook chỉ ghi lại kết quả để trang hiện nhãn tại chỗ; trang nào cần tải lại
 * dữ liệu thì làm trong `onChanged`.
 */
export function useInterviewActions({
  notify,
  onChanged,
}: {
  notify: Notify;
  onChanged?: (change: InterviewChange) => void;
}) {
  const { data: me } = useEmployerMe();
  const [selected, setSelected] = useState<Map<string, AwaitingScheduleApplication>>(() => new Map());
  const [scheduled, setScheduled] = useState<Record<string, EmployerInterview>>({});
  const [updated, setUpdated] = useState<Record<string, EmployerInterview>>({});
  const [cancelled, setCancelled] = useState<Record<string, true>>({});
  const [rescheduling, setRescheduling] = useState<EmployerInterview | null>(null);
  const [cancelling, setCancelling] = useState<EmployerInterview | null>(null);

  const scheduling = useInterviewScheduling({
    notify,
    onScheduled: (created) => {
      setScheduled((prev) => ({
        ...prev,
        ...Object.fromEntries(created.map((interview) => [interview.applicationId, interview])),
      }));
      setSelected((prev) => {
        const next = new Map(prev);
        for (const interview of created) next.delete(interview.applicationId);
        return next;
      });
      onChanged?.({ kind: "scheduled", interviews: created });
    },
  });

  function toggle(items: AwaitingScheduleApplication[], checked: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const item of items) {
        if (checked) next.set(item.applicationId, item);
        else next.delete(item.applicationId);
      }
      return next;
    });
  }

  const dialogs = (
    <>
      {scheduling.dialogs}
      <InterviewDialog
        target={rescheduling ? { kind: "reschedule", interview: rescheduling } : null}
        companyAddress={me?.company?.address}
        onClose={() => setRescheduling(null)}
        onRescheduled={(interview) => {
          setRescheduling(null);
          setUpdated((prev) => ({ ...prev, [interview.id]: interview }));
          notify(
            "success",
            `Đã đổi lịch phỏng vấn với ${candidateLabel(interview.candidateName)} sang ${formatVnDayMonth(
              interview.scheduledAt,
            )} lúc ${formatVnTime(interview.scheduledAt)}.`,
          );
          onChanged?.({ kind: "rescheduled", interview });
        }}
        onRequestCancel={(interview) => {
          setRescheduling(null);
          setCancelling(interview);
        }}
      />
      <CancelInterviewDialog
        interview={cancelling}
        onClose={() => setCancelling(null)}
        onCancelled={(interview) => {
          setCancelling(null);
          setCancelled((prev) => ({ ...prev, [interview.id]: true }));
          notify(
            "success",
            `Đã huỷ buổi phỏng vấn với ${candidateLabel(interview.candidateName)}. Hồ sơ quay lại nhóm chờ đặt lịch.`,
          );
          onChanged?.({ kind: "cancelled", interview });
        }}
      />
    </>
  );

  return {
    selected,
    scheduled,
    updated,
    cancelled,
    toggle,
    clearSelection: () => setSelected(new Map()),
    /** Mở hộp đặt lịch: một hồ sơ → đặt lịch đơn, nhiều hồ sơ → lên lịch hàng loạt. */
    schedule: scheduling.start,
    reschedule: (interview: EmployerInterview) => setRescheduling(interview),
    cancel: (interview: EmployerInterview) => setCancelling(interview),
    dialogs,
  };
}
