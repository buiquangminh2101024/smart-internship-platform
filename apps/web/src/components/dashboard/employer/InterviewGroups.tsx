"use client";

import { useState } from "react";
import Link from "next/link";
import type { AwaitingScheduleApplication, EmployerInterview } from "@sip/shared-types";
import { useAwaitingSchedule } from "@/hooks/useInterviews";
import { formatNumber, formatVnDayMonth, formatVnTime, formatWaited, initialsOf } from "@/lib/dashboard-format";
import {
  MODE_ICON,
  TZ_LABEL,
  formatInterviewSpan,
  formatRelativeDay,
  vnDateAndMinutes,
} from "@/lib/interview-format";
import { Icon } from "@/components/ui/Icon";
import { RowCheckbox, TriStateCheckbox } from "@/components/interviews/SelectionBar";
import { candidateLabel } from "@/components/interviews/InterviewDialog";
import { DashButton } from "../DashButton";
import { TaskBadge, TaskGroup, TaskRow } from "../TaskGroup";

/** Số hàng mỗi nhóm hiện sẵn (API dashboard trả 5). */
const VISIBLE_ROWS = 5;

/**
 * "Hồ sơ chờ đặt lịch" (FE-5): chọn nhiều để lên lịch hàng loạt, hoặc "Đặt
 * lịch" từng hồ sơ. Dashboard trả 5 hồ sơ chờ lâu nhất; "Hiện thêm" tải danh
 * sách đầy đủ (tối đa 100) ngay trong nhóm vì chưa có trang riêng.
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
  const [expanded, setExpanded] = useState(false);
  const full = useAwaitingSchedule(undefined, expanded);
  const rows = expanded && full.data ? full.data : items;
  const open = rows.filter((item) => !scheduled[item.applicationId]);
  const selectedInView = open.filter((item) => selected.has(item.applicationId)).length;
  const scheduledCount = Object.keys(scheduled).length;
  const hidden = Math.max(0, total - items.length);

  return (
    <TaskGroup
      title="Hồ sơ chờ đặt lịch"
      count={Math.max(0, total - scheduledCount)}
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
        hidden > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            disabled={expanded && full.isPending}
            onClick={() => setExpanded((value) => !value)}
            className="cursor-pointer py-1.5 text-brand-700 hover:underline disabled:cursor-progress"
          >
            {expanded && full.isPending
              ? "Đang tải…"
              : expanded && full.isError
                ? "Không tải được danh sách đầy đủ — thu gọn"
                : expanded
                  ? "Thu gọn"
                  : `Hiện thêm ${formatNumber(hidden)} hồ sơ`}
          </button>
        ) : undefined
      }
    >
      {(expanded && full.data ? rows : rows.slice(0, VISIBLE_ROWS)).map((item) => {
        const interview = scheduled[item.applicationId];
        const isSelected = selected.has(item.applicationId);
        const name = candidateLabel(item.candidateName);
        return (
          <TaskRow
            key={item.applicationId}
            done={interview !== undefined}
            selected={isSelected}
            select={
              interview ? (
                <span aria-hidden className="-mx-2 -my-1 h-10 w-10 flex-none" />
              ) : (
                <RowCheckbox checked={isSelected} label={name} onChange={(checked) => onToggle([item], checked)} />
              )
            }
            initials={initialsOf(item.candidateName)}
            title={
              <Link href={`/employer/applications/${item.applicationId}`} className="hover:text-brand-700 hover:underline">
                {item.candidateName ?? "Ứng viên chưa đặt tên"}
              </Link>
            }
            meta={
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span>
                  {item.jobPostTitle}
                  <span aria-hidden> ·</span>
                </span>
                {item.status === "INTERVIEWING" ? (
                  <>
                    <TaskBadge tone="warning">Cần đặt lại lịch</TaskBadge>
                    <span>chờ {formatWaited(item.waitingSince)}</span>
                  </>
                ) : (
                  <span>vào vòng trong {formatWaited(item.waitingSince)} trước</span>
                )}
              </span>
            }
            actions={
              interview ? (
                <TaskBadge tone="success">
                  <Icon name="check" size={14} className="mr-1" />
                  Đã đặt lịch {formatVnDayMonth(interview.scheduledAt)} · {formatVnTime(interview.scheduledAt)}
                </TaskBadge>
              ) : (
                <DashButton size="sm" icon="calendar-plus" onClick={() => onSchedule(item)}>
                  Đặt lịch
                </DashButton>
              )
            }
          />
        );
      })}
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
        hidden > 0 ? (
          <span className="font-normal text-text-muted">Còn {formatNumber(hidden)} buổi khác trong 7 ngày tới.</span>
        ) : undefined
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
