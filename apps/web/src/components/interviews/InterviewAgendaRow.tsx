"use client";

import Link from "next/link";
import type { EmployerInterview } from "@sip/shared-types";
import { initialsOf } from "@/lib/dashboard-format";
import { MODE_LABEL, hhmm, isMeetingUrl, vnDateAndMinutes } from "@/lib/interview-format";
import { Icon } from "@/components/ui/Icon";
import { DashButton } from "@/components/dashboard/DashButton";
import { TaskBadge } from "@/components/dashboard/TaskGroup";

export const agendaRowId = (interviewId: string) => `interview-row-${interviewId}`;

/**
 * Một buổi phỏng vấn trong nhóm ngày: giờ, ô chữ cái đầu, tên (link hồ sơ), tin,
 * hình thức + địa điểm, nút "Đổi lịch" / "Huỷ". Buổi đã tới giờ bắt đầu thì API
 * không cho đổi / huỷ nữa (backend F1), nên dòng mờ và không có nút.
 */
export function InterviewAgendaRow({
  interview,
  now,
  highlighted = false,
  onReschedule,
  onCancel,
}: {
  interview: EmployerInterview;
  now: number;
  /** Vừa được chọn từ dải tuần: nền và viền brand khoảng 2 giây. */
  highlighted?: boolean;
  onReschedule: () => void;
  onCancel: () => void;
}) {
  const { minutes } = vnDateAndMinutes(interview.scheduledAt);
  const cancelled = interview.status === "CANCELLED";
  const started = !cancelled && new Date(interview.scheduledAt).getTime() <= now;
  const location = interview.location?.trim() ?? "";
  const name = interview.candidateName ?? "Ứng viên chưa đặt tên";

  return (
    <li
      id={agendaRowId(interview.id)}
      className={`flex scroll-mt-28 flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border p-3 transition-colors duration-200 motion-reduce:transition-none max-[720px]:flex-col max-[720px]:flex-nowrap max-[720px]:items-stretch ${
        highlighted
          ? "border-brand-300 bg-brand-50"
          : cancelled || started
            ? "border-border-subtle bg-surface-card"
            : "border-transparent bg-surface-page"
      }`}
    >
      <div className="flex min-w-0 flex-[1_1_320px] items-start gap-3 max-[720px]:flex-none">
        <div className={`w-[72px] shrink-0 pt-0.5 whitespace-nowrap ${cancelled || started ? "text-text-muted" : "text-text-strong"}`}>
          <p className={`font-num text-[15px] font-bold tabular-nums ${cancelled ? "line-through" : ""}`}>
            {hhmm(minutes)}
          </p>
          <p className="font-num text-[13px] text-text-muted tabular-nums">
            đến {hhmm(minutes + interview.durationMinutes)}
          </p>
        </div>
        <span
          aria-hidden
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold ${
            cancelled || started ? "bg-surface-hover text-text-muted" : "bg-brand-100 text-brand-700"
          }`}
        >
          {initialsOf(interview.candidateName)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-text-muted">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/employer/applications/${interview.applicationId}`}
              data-agenda-link
              className={`min-w-0 rounded-sm font-bold hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                cancelled || started ? "text-text-body" : "text-text-strong"
              }`}
            >
              {name}
            </Link>
            {cancelled ? (
              <TaskBadge tone="danger">Đã huỷ</TaskBadge>
            ) : started ? (
              <span className="inline-flex h-[22px] items-center rounded-full bg-surface-hover px-2 text-[13px] font-bold whitespace-nowrap text-text-muted">
                Đã qua giờ
              </span>
            ) : null}
          </div>
          <p className="truncate">{interview.jobPostTitle}</p>
          <p className="flex min-w-0 items-center gap-1.5">
            <Icon name={interview.mode === "ONLINE" ? "video" : "map-pin"} size={14} className="shrink-0" />
            <span className="sr-only">{MODE_LABEL[interview.mode]}: </span>
            {location && interview.mode === "ONLINE" && isMeetingUrl(location) ? (
              <a
                href={location}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-brand-700 hover:underline"
              >
                {location}
              </a>
            ) : (
              <span className="min-w-0 truncate">{location || MODE_LABEL[interview.mode]}</span>
            )}
          </p>
          {cancelled && interview.cancelReason ? (
            <p className="text-text-body">
              <span className="font-semibold">Lý do huỷ:</span> {interview.cancelReason}
            </p>
          ) : null}
        </div>
      </div>
      {cancelled || started ? null : (
        <div className="flex shrink-0 gap-2 max-[720px]:w-full">
          <DashButton variant="secondary" size="sm" icon="calendar-clock" onClick={onReschedule} className="max-[720px]:flex-1">
            Đổi lịch
          </DashButton>
          <DashButton variant="danger" size="sm" onClick={onCancel} className="max-[720px]:flex-1">
            Huỷ<span className="sr-only"> buổi phỏng vấn với {name}</span>
          </DashButton>
        </div>
      )}
    </li>
  );
}
