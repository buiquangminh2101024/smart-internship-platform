"use client";

import Link from "next/link";
import type { AwaitingScheduleApplication, EmployerInterview } from "@sip/shared-types";
import { formatVnDayMonth, formatVnTime, formatWaited, initialsOf, waitedOverDays } from "@/lib/dashboard-format";
import { Icon } from "@/components/ui/Icon";
import { DashButton } from "@/components/dashboard/DashButton";
import { TaskBadge, TaskRow } from "@/components/dashboard/TaskGroup";
import { candidateLabel } from "./InterviewDialog";
import { RowCheckbox } from "./SelectionBar";

/**
 * Một hồ sơ chờ đặt lịch (dashboard và tab "Chờ đặt lịch"): ô chọn, tên, tin,
 * thời gian chờ, nút "Đặt lịch". Đặt lịch xong thì hàng ở lại với nhãn ngày giờ,
 * không còn ô chọn. Thời gian chờ quá 2 ngày: chữ marigold đậm.
 */
export function AwaitingScheduleRow({
  item,
  selected,
  scheduled,
  showJob = true,
  onToggle,
  onSchedule,
}: {
  item: AwaitingScheduleApplication;
  selected: boolean;
  /** Lịch vừa đặt cho hồ sơ này trong phiên. */
  scheduled?: EmployerInterview | undefined;
  /** Bỏ tên tin khi hàng đã nằm dưới dải phân cách của tin. */
  showJob?: boolean;
  onToggle: (checked: boolean) => void;
  onSchedule: () => void;
}) {
  const name = candidateLabel(item.candidateName);
  const waitedClass = waitedOverDays(item.waitingSince, 2) ? "font-semibold text-marigold-800" : undefined;

  return (
    <TaskRow
      done={scheduled !== undefined}
      selected={selected}
      select={
        scheduled ? (
          <span aria-hidden className="-mx-2 -my-1 h-10 w-10 flex-none" />
        ) : (
          <RowCheckbox checked={selected} label={name} onChange={onToggle} />
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
          {showJob ? (
            <span>
              {item.jobPostTitle}
              <span aria-hidden> ·</span>
            </span>
          ) : null}
          {item.status === "INTERVIEWING" ? (
            <>
              <TaskBadge tone="warning">Cần đặt lại lịch</TaskBadge>
              <span className={waitedClass}>chờ {formatWaited(item.waitingSince)}</span>
            </>
          ) : (
            <span className={waitedClass}>vào vòng trong {formatWaited(item.waitingSince)} trước</span>
          )}
        </span>
      }
      actions={
        scheduled ? (
          <TaskBadge tone="success">
            <Icon name="check" size={14} className="mr-1" />
            Đã đặt lịch {formatVnDayMonth(scheduled.scheduledAt)} · {formatVnTime(scheduled.scheduledAt)}
          </TaskBadge>
        ) : (
          <DashButton size="sm" icon="calendar-plus" onClick={onSchedule}>
            Đặt lịch
          </DashButton>
        )
      }
    />
  );
}
