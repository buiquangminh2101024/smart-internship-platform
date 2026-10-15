"use client";

import Link from "next/link";
import type { AwaitingScheduleApplication, EmployerInterview } from "@sip/shared-types";
import { formatNumber, initialsOf } from "@/lib/dashboard-format";
import {
  MODE_ICON,
  TZ_LABEL,
  formatInterviewSpan,
  formatRelativeDay,
  vnDateAndMinutes,
} from "@/lib/interview-format";
import { Icon } from "@/components/ui/Icon";
import { TriStateCheckbox } from "@/components/interviews/SelectionBar";
import { AwaitingScheduleRow } from "@/components/interviews/AwaitingScheduleRow";
import { DashButton } from "../DashButton";
import { TaskBadge, TaskGroup, TaskRow } from "../TaskGroup";

/**
 * "Hồ sơ chờ đặt lịch" (FE-5): chọn nhiều để lên lịch hàng loạt, hoặc "Đặt
 * lịch" từng hồ sơ. Dashboard hiện 5 hồ sơ chờ lâu nhất để báo có việc; danh
 * sách đầy đủ nằm ở tab "Chờ đặt lịch" của `/employer/interviews`.
 */
export function AwaitingScheduleGroup({
  total,
  items,
  selected,
  scheduled,
  onToggle,
  onSchedule,
}: {
  total: number;
  items: AwaitingScheduleApplication[];
  selected: ReadonlyMap<string, AwaitingScheduleApplication>;
  /** Hồ sơ vừa đặt lịch trong phiên này (applicationId → lịch). */
  scheduled: Readonly<Record<string, EmployerInterview>>;
  onToggle: (items: AwaitingScheduleApplication[], checked: boolean) => void;
  onSchedule: (item: AwaitingScheduleApplication) => void;
}) {
  const open = items.filter((item) => !scheduled[item.applicationId]);
  const selectedInView = open.filter((item) => selected.has(item.applicationId)).length;
  const scheduledCount = Object.keys(scheduled).length;
  const remaining = Math.max(0, total - scheduledCount);

  return (
    <TaskGroup
      title="Hồ sơ chờ đặt lịch"
      count={remaining}
      emptyText="Chưa có hồ sơ nào chờ đặt lịch. Chuyển hồ sơ sang “Lọt vào vòng trong” thì hồ sơ sẽ hiện ở đây."
      toolbar={
        <>
          <TriStateCheckbox
            visibleLabel
            label={`Chọn tất cả ${open.length} hồ sơ đang hiện`}
            checked={open.length > 0 && selectedInView === open.length}
            indeterminate={selectedInView > 0 && selectedInView < open.length}
            disabled={open.length === 0}
            onChange={(checked) => onToggle(open, checked)}
          />
          <span>Chờ lâu nhất trước</span>
        </>
      }
      footer={
        total > items.length ? (
          <Link href="/employer/interviews" className="text-brand-700 hover:underline">
            Xem tất cả {formatNumber(remaining)} hồ sơ
          </Link>
        ) : undefined
      }
    >
      {items.map((item) => (
        <AwaitingScheduleRow
          key={item.applicationId}
          item={item}
          selected={selected.has(item.applicationId)}
          scheduled={scheduled[item.applicationId]}
          onToggle={(checked) => onToggle([item], checked)}
          onSchedule={() => onSchedule(item)}
        />
      ))}
    </TaskGroup>
  );
}

/**
 * "Lịch phỏng vấn sắp tới" (FE-5): 5 buổi gần nhất trong 7 ngày tới, đổi lịch
 * ngay tại hàng (huỷ nằm trong hộp thoại đổi lịch). Hàng vừa đổi / huỷ cập
 * nhật tại chỗ cho tới lần tải lại kế tiếp.
 */
export function UpcomingInterviewsGroup({
  total,
  items,
  updated,
  cancelled,
  onReschedule,
}: {
  total: number;
  items: EmployerInterview[];
  updated: Readonly<Record<string, EmployerInterview>>;
  cancelled: Readonly<Record<string, true>>;
  onReschedule: (interview: EmployerInterview) => void;
}) {
  const cancelledCount = items.filter((item) => cancelled[item.id]).length;
  const hidden = Math.max(0, total - items.length);

  return (
    <TaskGroup
      title="Lịch phỏng vấn sắp tới"
      tone="brand"
      count={Math.max(0, total - cancelledCount)}
      emptyText="Chưa có buổi phỏng vấn nào trong 7 ngày tới. Đặt lịch từ nhóm “Hồ sơ chờ đặt lịch”."
      footer={
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {hidden > 0 ? (
            <span className="font-normal text-text-muted">Còn {formatNumber(hidden)} buổi khác trong 7 ngày tới.</span>
          ) : null}
          <Link href="/employer/interviews?view=upcoming" className="text-brand-700 hover:underline">
            Xem tất cả<span className="sr-only"> lịch phỏng vấn sắp tới</span>
          </Link>
        </span>
      }
    >
      {items.map((original) => {
        const interview = updated[original.id] ?? original;
        const isCancelled = cancelled[original.id] === true;
        const { date } = vnDateAndMinutes(interview.scheduledAt);
        return (
          <TaskRow
            key={original.id}
            done={isCancelled}
            initials={initialsOf(interview.candidateName)}
            title={
              <Link
                href={`/employer/applications/${interview.applicationId}`}
                className="hover:text-brand-700 hover:underline"
              >
                {interview.candidateName ?? "Ứng viên chưa đặt tên"}
              </Link>
            }
            meta={
              <>
                <span className="block">{interview.jobPostTitle}</span>
                <span
                  className={`mt-0.5 flex items-center gap-1.5 font-semibold ${
                    isCancelled ? "text-text-muted line-through" : "text-text-strong"
                  }`}
                >
                  <Icon name={MODE_ICON[interview.mode]} size={14} />
                  {formatRelativeDay(date)} · {formatInterviewSpan(interview.scheduledAt, interview.durationMinutes)}{" "}
                  {TZ_LABEL}
                </span>
              </>
            }
            actions={
              isCancelled ? (
                <TaskBadge tone="danger">Đã huỷ</TaskBadge>
              ) : (
                <DashButton variant="secondary" size="sm" onClick={() => onReschedule(interview)}>
                  Đổi lịch
                </DashButton>
              )
            }
          />
        );
      })}
    </TaskGroup>
  );
}
