"use client";

import { useState } from "react";
import type { AwaitingScheduleApplication, EmployerInterview } from "@sip/shared-types";
import { useEmployerMe } from "@/hooks/useEmployerMe";
import { formatVnDayMonth, formatVnTime } from "@/lib/dashboard-format";
import type { ToastData } from "@/components/ui/Toast";
import { BatchScheduleDialog } from "./BatchScheduleDialog";
import { InterviewDialog, candidateLabel } from "./InterviewDialog";

type Notify = (tone: ToastData["tone"], message: string) => void;

/**
 * Luồng đặt lịch dùng chung cho dashboard và danh sách hồ sơ của một tin:
 * `start([một hồ sơ])` mở hộp thoại đặt lịch đơn, `start([nhiều hồ sơ])` mở
 * hộp thoại lên lịch hàng loạt. Trang render `dialogs` một lần.
 */
export function useInterviewScheduling({
  notify,
  onScheduled,
}: {
  notify: Notify;
  /** Lịch vừa tạo (một hoặc nhiều) — trang cập nhật hàng / số đếm. */
  onScheduled: (interviews: EmployerInterview[]) => void;
}) {
  const { data: me } = useEmployerMe();
  const [single, setSingle] = useState<AwaitingScheduleApplication | null>(null);
  const [batch, setBatch] = useState<AwaitingScheduleApplication[] | null>(null);

  function start(list: AwaitingScheduleApplication[]) {
    if (list.length === 1) setSingle(list[0]!);
    else if (list.length > 1) setBatch(list);
  }

  const dialogs = (
    <>
      <InterviewDialog
        target={single ? { kind: "schedule", application: single } : null}
        companyAddress={me?.company?.address}
        onClose={() => setSingle(null)}
        onScheduled={(interview, application) => {
          setSingle(null);
          onScheduled([interview]);
          notify(
            "success",
            `Đã đặt lịch phỏng vấn với ${candidateLabel(application.candidateName)} lúc ${formatVnTime(
              interview.scheduledAt,
            )} ngày ${formatVnDayMonth(interview.scheduledAt)}.`,
          );
        }}
      />
      <BatchScheduleDialog
        items={batch}
        companyAddress={me?.company?.address}
        myUserId={me?.employer?.userId}
        onClose={() => setBatch(null)}
        onScheduled={(interviews) => {
          setBatch(null);
          onScheduled(interviews);
          notify("success", `Đã lên lịch ${interviews.length} buổi phỏng vấn.`);
        }}
      />
    </>
  );

  return { start, dialogs };
}
