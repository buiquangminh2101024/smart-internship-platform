"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AwaitingScheduleApplication,
  DashboardAttentionJob,
  DashboardPendingApplication,
  EmployerInterview,
} from "@sip/shared-types";
import { ApiError } from "@/lib/api-client";
import { useUpdateApplicationStatus } from "@/hooks/useApplications";
import { EMPLOYER_DASHBOARD_KEY, useEmployerDashboardTasks } from "@/hooks/useEmployerDashboard";
import { formatDeadline } from "@/lib/job-post-display";
import {
  formatNumber,
  formatVnDate,
  formatVnDayMonth,
  formatVnTime,
  formatWaited,
  initialsOf,
  waitedOverDays,
} from "@/lib/dashboard-format";
import { useEmployerMe } from "@/hooks/useEmployerMe";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CancelInterviewDialog } from "@/components/interviews/CancelInterviewDialog";
import { InterviewDialog, candidateLabel } from "@/components/interviews/InterviewDialog";
import { SelectionBar } from "@/components/interviews/SelectionBar";
import { useInterviewScheduling } from "@/components/interviews/useInterviewScheduling";
import type { ToastData } from "@/components/ui/Toast";
import { BlockError, BlockSkeleton } from "../BlockState";
import { DashButton } from "../DashButton";
import { TaskBadge, TaskGroup, TaskRow } from "../TaskGroup";
import { PENDING_TASKS_ANCHOR } from "./EmployerKpiGrid";
import { AwaitingScheduleGroup, UpcomingInterviewsGroup } from "./InterviewGroups";

type Notify = (tone: ToastData["tone"], message: string) => void;
type Decision = "REVIEWING" | "REJECTED";

/**
 * "Việc cần làm" của Employer: hồ sơ chờ xử lý (Xem xét / Từ chối), tin cần
 * chú ý (Xem tin / Sửa tin), hồ sơ chờ đặt lịch và lịch phỏng vấn sắp tới
 * (FE-5). Thao tác chờ server trả lời rồi mới đổi giao diện; hàng đã xử lý ở
 * lại với nhãn trạng thái mới cho tới lần tải lại kế tiếp.
 */
export function EmployerTaskBoard({ notify }: { notify: Notify }) {
  const tasks = useEmployerDashboardTasks();
  const interviews = useInterviewTasks(notify);

  if (tasks.isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <BlockSkeleton height={360} />
        <BlockSkeleton height={360} />
      </div>
    );
  }
  if (tasks.isError) {
    return (
      <BlockError what="việc cần làm" onRetry={() => void tasks.refetch()} retrying={tasks.isFetching} minHeight={120} />
    );
  }

  const { pendingApplications, attentionJobs, awaitingSchedule, upcomingInterviews } = tasks.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <PendingApplicationsGroup
            total={pendingApplications.total}
            items={pendingApplications.items}
            notify={notify}
          />
          <AwaitingScheduleGroup
            total={awaitingSchedule.total}
            items={awaitingSchedule.items}
            selected={interviews.selected}
            scheduled={interviews.scheduled}
            onToggle={interviews.toggle}
            onSchedule={(item) => interviews.scheduling.start([item])}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <AttentionJobsGroup total={attentionJobs.total} items={attentionJobs.items} />
          <UpcomingInterviewsGroup
            total={upcomingInterviews.total}
            items={upcomingInterviews.items}
            updated={interviews.updated}
            cancelled={interviews.cancelled}
            onReschedule={interviews.setRescheduling}
          />
        </div>
      </div>
      <SelectionBar
        count={interviews.selected.size}
        onClear={interviews.clearSelection}
        onSchedule={() => interviews.scheduling.start([...interviews.selected.values()])}
      />
      {interviews.dialogs}
    </div>
  );
}

/**
 * Trạng thái của hai nhóm lịch phỏng vấn: hồ sơ đang chọn, hồ sơ vừa đặt lịch,
 * buổi vừa đổi / huỷ, và các hộp thoại. Sau mỗi thao tác chỉ tải lại số tổng
 * quan; danh sách việc giữ nguyên (kèm nhãn) tới lần mở trang kế tiếp.
 */
function useInterviewTasks(notify: Notify) {
  const queryClient = useQueryClient();
  const { data: me } = useEmployerMe();
  const [selected, setSelected] = useState<Map<string, AwaitingScheduleApplication>>(() => new Map());
  const [scheduled, setScheduled] = useState<Record<string, EmployerInterview>>({});
  const [updated, setUpdated] = useState<Record<string, EmployerInterview>>({});
  const [cancelled, setCancelled] = useState<Record<string, true>>({});
  const [rescheduling, setRescheduling] = useState<EmployerInterview | null>(null);
  const [cancelling, setCancelling] = useState<EmployerInterview | null>(null);

  const refreshOverview = () =>
    void queryClient.invalidateQueries({ queryKey: [...EMPLOYER_DASHBOARD_KEY, "overview"] });

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
      refreshOverview();
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
          refreshOverview();
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
          refreshOverview();
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
    setRescheduling,
    scheduling,
    dialogs,
  };
}

function PendingApplicationsGroup({
  total,
  items,
  notify,
}: {
  total: number;
  items: DashboardPendingApplication[];
  notify: Notify;
}) {
  const queryClient = useQueryClient();
  const updateStatus = useUpdateApplicationStatus();
  const [handled, setHandled] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState<{ id: string; decision: Decision } | null>(null);
  const [rejecting, setRejecting] = useState<DashboardPendingApplication | null>(null);

  // Hàng đã xử lý vẫn hiện (kèm nhãn) nhưng không còn tính vào số đang chờ.
  const handledInView = items.filter((item) => handled[item.applicationId]).length;
  const remaining = Math.max(0, total - handledInView);

  async function decide(item: DashboardPendingApplication, decision: Decision) {
    const name = item.candidateName ?? "ứng viên";
    setBusy({ id: item.applicationId, decision });
    try {
      await updateStatus.mutateAsync({ id: item.applicationId, data: { status: decision } });
      setHandled((prev) => ({ ...prev, [item.applicationId]: decision }));
      setRejecting(null);
      notify(
        "success",
        decision === "REVIEWING" ? `Đã chuyển hồ sơ của ${name} sang Đang xem xét.` : `Đã từ chối hồ sơ của ${name}.`,
      );
      // Hook đã đánh dấu cả dashboard là cũ (không tải lại). Số tổng quan và biểu
      // đồ tải lại ngay; danh sách việc thì không, để hàng vừa xử lý còn ở lại
      // với nhãn trạng thái mới tới lần mở trang kế tiếp.
      void queryClient.invalidateQueries({ queryKey: [...EMPLOYER_DASHBOARD_KEY, "overview"] });
      void queryClient.invalidateQueries({ queryKey: [...EMPLOYER_DASHBOARD_KEY, "analytics"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications", "employer"] });
    } catch (err) {
      setRejecting(null);
      notify(
        "danger",
        err instanceof ApiError && (err.status === 400 || err.status === 404)
          ? `Hồ sơ của ${name} đã đổi trạng thái hoặc không còn. Tải lại trang để xem trạng thái mới.`
          : "Không cập nhật được hồ sơ. Kiểm tra kết nối rồi thử lại.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <TaskGroup
        id={PENDING_TASKS_ANCHOR}
        title="Hồ sơ chờ xử lý"
        count={remaining}
        emptyText="Chưa có hồ sơ chờ xử lý. Hồ sơ mới sẽ hiện ở đây khi ứng viên nộp."
        footer={
          total > items.length ? (
            <Link href="/employer/jobs" className="text-brand-700 hover:underline">
              Xem tất cả {formatNumber(total)} hồ sơ theo từng tin
            </Link>
          ) : undefined
        }
      >
        {items.map((item) => {
          const decision = handled[item.applicationId];
          const isBusy = busy?.id === item.applicationId;
          const waitedLong = waitedOverDays(item.waitingSince, 2);
          const detailHref = `/employer/applications/${item.applicationId}`;
          return (
            <TaskRow
              key={item.applicationId}
              initials={initialsOf(item.candidateName)}
              done={decision !== undefined}
              title={
                <Link href={detailHref} className="hover:text-brand-700 hover:underline">
                  {item.candidateName ?? "Ứng viên chưa đặt tên"}
                </Link>
              }
              badge={
                decision === "REVIEWING" ? (
                  <TaskBadge tone="brand">Đang xem xét</TaskBadge>
                ) : decision === "REJECTED" ? (
                  <TaskBadge tone="danger">Đã từ chối</TaskBadge>
                ) : undefined
              }
              meta={
                <>
                  <span>{item.jobPostTitle}</span>
                  <span aria-hidden> · </span>
                  {item.universityName ? (
                    <>
                      <span>{item.universityName}</span>
                      <span aria-hidden> · </span>
                    </>
                  ) : null}
                  {/* Chờ quá 2 ngày: chữ marigold đậm, khớp đoạn "Trên 2 ngày" của thẻ KPI. */}
                  <span className={waitedLong ? "font-semibold text-marigold-800" : undefined}>
                    {formatWaited(item.waitingSince)} trước
                  </span>
                </>
              }
              actions={
                decision === "REVIEWING" ? (
                  <DashButton href={detailHref} variant="secondary" size="sm">
                    Mở hồ sơ
                  </DashButton>
                ) : decision ? undefined : (
                  <>
                    <DashButton
                      size="sm"
                      icon="check"
                      loading={isBusy && busy?.decision === "REVIEWING"}
                      disabled={isBusy}
                      onClick={() => void decide(item, "REVIEWING")}
                    >
                      Xem xét
                    </DashButton>
                    <DashButton variant="danger" size="sm" disabled={isBusy} onClick={() => setRejecting(item)}>
                      Từ chối
                    </DashButton>
                  </>
                )
              }
            />
          );
        })}
      </TaskGroup>

      <ConfirmDialog
        isOpen={rejecting !== null}
        title="Từ chối hồ sơ này?"
        message={
          rejecting
            ? `Hồ sơ của ${rejecting.candidateName ?? "ứng viên"} cho tin "${rejecting.jobPostTitle}" sẽ chuyển sang Bị từ chối và ứng viên nhận thông báo. Không hoàn tác được.`
            : ""
        }
        confirmLabel="Từ chối hồ sơ"
        cancelLabel="Giữ lại"
        isDestructive
        isConfirming={busy?.decision === "REJECTED"}
        onConfirm={() => rejecting && void decide(rejecting, "REJECTED")}
        onCancel={() => setRejecting(null)}
      />
    </>
  );
}

function AttentionJobsGroup({ total, items }: { total: number; items: DashboardAttentionJob[] }) {
  return (
    <TaskGroup
      title="Tin cần chú ý"
      count={total}
      emptyText="Không có tin nào sắp hết hạn hoặc bị từ chối."
      footer={
        total > items.length ? (
          <Link href="/employer/jobs" className="text-brand-700 hover:underline">
            Xem tất cả {formatNumber(total)} tin
          </Link>
        ) : undefined
      }
    >
      {items.map((job) =>
        job.kind === "EXPIRING" ? (
          <TaskRow
            key={`${job.kind}-${job.jobPostId}`}
            icon="briefcase"
            title={job.title}
            meta={`${formatDeadline(job.expiresAt)} · ${formatNumber(job.applicationCount)} hồ sơ`}
            actions={
              <DashButton href={`/employer/jobs/${job.jobPostId}`} variant="secondary" size="sm">
                Xem tin
              </DashButton>
            }
          />
        ) : (
          <TaskRow
            key={`${job.kind}-${job.jobPostId}`}
            icon="triangle-alert"
            title={job.title}
            meta={`Bị từ chối${job.rejectedAt ? ` ngày ${formatVnDate(job.rejectedAt)}` : ""}: ${
              job.rejectedReason ?? "không có lý do cụ thể"
            }`}
            actions={
              <DashButton href={`/employer/jobs/${job.jobPostId}?edit=1`} variant="secondary" size="sm">
                Sửa tin
              </DashButton>
            }
          />
        ),
      )}
    </TaskGroup>
  );
}
