"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ApplicationInterview,
  AwaitingScheduleApplication,
  EmployerApplicationView,
  EmployerInterview,
} from "@sip/shared-types";
import { MODE_ICON, MODE_LABEL, formatInterviewWhen, formatDuration, isMeetingUrl } from "@/lib/interview-format";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { DashButton } from "@/components/dashboard/DashButton";
import { TaskBadge } from "@/components/dashboard/TaskGroup";
import { useInterviewActions, type InterviewChange } from "./useInterviewActions";

/** Số buổi trong "Lịch sử" khi chưa bấm "Xem thêm". */
const HISTORY_VISIBLE = 3;

let toastIdCounter = 0;

function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const push = useCallback((tone: ToastData["tone"], message: string) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, tone, message }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  return { toasts, push, dismiss };
}

function candidateNameOf(application: EmployerApplicationView): string | null {
  const name: unknown = application.candidate?.fullName;
  return typeof name === "string" && name.trim() ? name : null;
}

/** Hộp thoại cần `EmployerInterview`: ghép lịch rút gọn với các trường của hồ sơ. */
function toEmployerInterview(interview: ApplicationInterview, application: EmployerApplicationView): EmployerInterview {
  return {
    ...interview,
    applicationId: application.id,
    candidateName: candidateNameOf(application),
    candidateAvatarUrl: null,
    jobPostId: application.jobPostId,
    jobPostTitle: application.jobPost.title,
  };
}

function toApplicationInterview(interview: EmployerInterview): ApplicationInterview {
  const { id, scheduledAt, durationMinutes, mode, location, note, status, cancelReason, createdById, createdAt } = interview;
  return { id, scheduledAt, durationMinutes, mode, location, note, status, cancelReason, createdById, createdAt };
}

/** Ghi kết quả API vào danh sách lịch của hồ sơ (thay buổi cùng `id`, thêm buổi mới), sớm nhất trước. */
function mergeInterviews(current: ApplicationInterview[], change: InterviewChange): ApplicationInterview[] {
  const incoming = change.kind === "scheduled" ? change.interviews : [change.interview];
  const byId = new Map(current.map((interview) => [interview.id, interview]));
  for (const interview of incoming) byId.set(interview.id, toApplicationInterview(interview));
  return [...byId.values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id));
}

/**
 * Khối "Lịch phỏng vấn" ở trang chi tiết hồ sơ: buổi sắp tới (đổi / huỷ), nút
 * đặt lịch khi hồ sơ đặt lịch được, và lịch sử (buổi đã diễn ra, buổi đã huỷ).
 */
export function ApplicationInterviewsCard({ application }: { application: EmployerApplicationView }) {
  const queryClient = useQueryClient();
  const { toasts, push, dismiss } = useToast();
  const [now] = useState(Date.now);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const actions = useInterviewActions({
    notify: push,
    // D3: ghi ngay kết quả vào cache; `markStale` của hook vẫn tải lại chi tiết ở nền
    // (đặt lịch có thể đổi SHORTLISTED → INTERVIEWING).
    onChanged: (change) => {
      queryClient.setQueryData<EmployerApplicationView>(["employer", "applications", application.id], (old) =>
        old ? { ...old, interviews: mergeInterviews(old.interviews, change) } : old,
      );
      // Nút vừa mở hộp thoại (Huỷ lịch / Đặt lịch) có thể đã biến mất: đưa focus về
      // nút đầu tiên của khối thay vì để rơi về đầu trang.
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active && active !== document.body && active.isConnected) return;
        cardRef.current?.querySelector<HTMLElement>("button")?.focus();
      }, 0);
    },
  });

  const startsAt = (interview: ApplicationInterview) => new Date(interview.scheduledAt).getTime();
  const upcoming = application.interviews.filter(
    (interview) => interview.status === "SCHEDULED" && startsAt(interview) > now,
  );
  const history = application.interviews
    .filter((interview) => interview.status === "CANCELLED" || startsAt(interview) <= now)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt) || b.id.localeCompare(a.id));
  const visibleHistory = showAllHistory ? history : history.slice(0, HISTORY_VISIBLE);
  const schedulable =
    upcoming.length === 0 && (application.status === "SHORTLISTED" || application.status === "INTERVIEWING");

  function startScheduling() {
    if (application.status !== "SHORTLISTED" && application.status !== "INTERVIEWING") return;
    const item: AwaitingScheduleApplication = {
      applicationId: application.id,
      status: application.status,
      candidateName: candidateNameOf(application),
      candidateAvatarUrl: null,
      jobPostId: application.jobPostId,
      jobPostTitle: application.jobPost.title,
      waitingSince: application.updatedAt,
    };
    actions.schedule([item]);
  }

  return (
    <Card padding="md" as="section" aria-labelledby="application-interviews-title" className="text-sm">
      <div ref={cardRef} className="flex flex-col gap-3">
        <h3 id="application-interviews-title" className="flex items-center gap-2 font-bold text-text-strong">
          <Icon name="calendar-clock" size={18} className="text-brand-600" />
          Lịch phỏng vấn
        </h3>

        {upcoming.map((interview) => (
          <div key={interview.id} className="flex flex-col gap-2 rounded-[10px] border border-brand-100 bg-brand-50 px-3.5 py-3">
            <dl className="flex flex-col gap-1.5">
              <Detail icon="calendar" label="Thời gian">
                <b>{formatInterviewWhen(interview.scheduledAt, interview.durationMinutes)}</b>
                <span className="ml-1.5 text-[13px] text-text-muted">{formatDuration(interview.durationMinutes)}</span>
              </Detail>
              <Detail icon={MODE_ICON[interview.mode]} label="Hình thức">
                {MODE_LABEL[interview.mode]}
              </Detail>
              {interview.location ? (
                <Detail icon={interview.mode === "ONLINE" ? "link" : "map-pin"} label={interview.mode === "ONLINE" ? "Liên kết họp" : "Địa chỉ"}>
                  {interview.mode === "ONLINE" && isMeetingUrl(interview.location) ? (
                    <a
                      href={interview.location}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold break-all text-brand-700 hover:underline"
                    >
                      {interview.location.replace(/^https?:\/\//i, "")}
                      <Icon name="external-link" size={14} className="shrink-0" />
                      <span className="sr-only">(mở trong thẻ mới)</span>
                    </a>
                  ) : (
                    interview.location
                  )}
                </Detail>
              ) : null}
              {interview.note ? (
                <Detail icon="message-square-text" label="Ghi chú">
                  <span className="whitespace-pre-line">{interview.note}</span>
                </Detail>
              ) : null}
            </dl>
            <div className="flex flex-wrap gap-2">
              <DashButton
                variant="secondary"
                size="sm"
                icon="calendar-clock"
                onClick={() => actions.reschedule(toEmployerInterview(interview, application))}
              >
                Đổi lịch
              </DashButton>
              <DashButton variant="danger" size="sm" onClick={() => actions.cancel(toEmployerInterview(interview, application))}>
                Huỷ lịch
              </DashButton>
            </div>
          </div>
        ))}

        {upcoming.length === 0 ? (
          schedulable ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-text-muted">Hồ sơ chưa có lịch phỏng vấn sắp tới.</p>
              <DashButton size="sm" icon="calendar-plus" onClick={startScheduling}>
                Đặt lịch phỏng vấn
              </DashButton>
            </div>
          ) : (
            <p className="text-text-muted">Chỉ đặt lịch được khi hồ sơ ở bước Lọt vào vòng trong.</p>
          )
        ) : null}

        {history.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
            <h4 className="font-semibold text-text-strong">Lịch sử</h4>
            <ul className="flex flex-col gap-2">
              {visibleHistory.map((interview) => {
                const cancelled = interview.status === "CANCELLED";
                return (
                  <li key={interview.id} className="flex flex-col gap-1 text-text-muted">
                    <span className="flex flex-wrap items-center gap-2">
                      {cancelled ? (
                        <TaskBadge tone="danger">Đã huỷ</TaskBadge>
                      ) : (
                        <span className="inline-flex h-[22px] items-center rounded-full bg-surface-hover px-2 text-[13px] font-bold whitespace-nowrap text-text-muted">
                          Đã diễn ra
                        </span>
                      )}
                      <span className={cancelled ? "line-through" : undefined}>
                        {formatInterviewWhen(interview.scheduledAt, interview.durationMinutes)}
                      </span>
                    </span>
                    <span>{MODE_LABEL[interview.mode]}</span>
                    {cancelled && interview.cancelReason ? (
                      <span className="text-text-body">Lý do huỷ: {interview.cancelReason}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {history.length > HISTORY_VISIBLE ? (
              <DashButton variant="ghost" size="sm" onClick={() => setShowAllHistory((value) => !value)} className="self-start">
                {showAllHistory ? "Thu gọn" : `Xem thêm ${history.length - HISTORY_VISIBLE} buổi`}
              </DashButton>
            ) : null}
          </div>
        ) : null}

      </div>
      {actions.dialogs}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </Card>
  );
}

function Detail({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1.5 text-[13px] text-text-muted">
        <Icon name={icon} size={14} />
        {label}
      </dt>
      <dd className="min-w-0 text-text-strong [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}
