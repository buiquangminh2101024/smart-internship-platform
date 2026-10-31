"use client";

import Link from "next/link";
import type { ApplicationSkillMatch, EmployerApplicationListItem } from "@sip/shared-types";
import { APPLICATION_STATUS_LABEL, isFinalApplicationStatus } from "@/lib/application-status";
import { JOB_STATUS_LABEL } from "@/lib/job-post-display";
import { formatVnDayMonth, formatVnTime, formatWaited, initialsOf, waitedOverDays } from "@/lib/dashboard-format";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { DashButton } from "@/components/dashboard/DashButton";
import { TaskBadge } from "@/components/dashboard/TaskGroup";
import { RowCheckbox } from "@/components/interviews/SelectionBar";

/** Thao tác chính của một hồ sơ; "Từ chối" đi riêng vì luôn hỏi xác nhận. */
export type RowAction = "REVIEWING" | "SHORTLISTED" | "SCHEDULE" | "ACCEPTED";

/** Nút chính theo state machine (H3): chỉ những bước API cho phép. */
export function primaryActionOf(item: EmployerApplicationListItem): RowAction | null {
  switch (item.status) {
    case "PENDING":
      return "REVIEWING";
    case "REVIEWING":
      return "SHORTLISTED";
    case "SHORTLISTED":
      return "SCHEDULE";
    case "INTERVIEWING":
      return item.awaitingSchedule ? "SCHEDULE" : "ACCEPTED";
    default:
      return null;
  }
}

const ACTION_BUTTON: Record<RowAction, { label: string; icon: string }> = {
  REVIEWING: { label: "Xem xét", icon: "check" },
  SHORTLISTED: { label: "Vào danh sách rút gọn", icon: "list-checks" },
  SCHEDULE: { label: "Đặt lịch", icon: "calendar-plus" },
  ACCEPTED: { label: "Được nhận", icon: "badge-check" },
};

export function candidateName(item: EmployerApplicationListItem): string {
  return item.candidate.fullName?.trim() || "Ứng viên chưa đặt tên";
}

/** "Khớp 3/4 kỹ năng bắt buộc · 1/2 nên có" (D10). Chỉ là số, không đánh giá tốt / xấu. */
export function SkillMatchText({ match }: { match: ApplicationSkillMatch }) {
  const optional =
    match.optionalTotal > 0 ? (
      <span className="whitespace-nowrap">
        <span aria-hidden> · </span>
        <span className="font-num tabular-nums">
          {match.optionalMatched}/{match.optionalTotal}
        </span>{" "}
        nên có
      </span>
    ) : null;
  if (match.requiredTotal === 0) {
    return (
      <span className="text-text-muted">
        Tin chưa có kỹ năng yêu cầu
        {optional}
      </span>
    );
  }
  return (
    <span>
      Khớp{" "}
      <span className="font-num font-semibold text-text-strong tabular-nums">
        {match.requiredMatched}/{match.requiredTotal}
      </span>{" "}
      kỹ năng bắt buộc
      {optional}
    </span>
  );
}

export interface ApplicationRowProps {
  /** Đã áp trạng thái mới nếu vừa thao tác trong phiên. */
  item: EmployerApplicationListItem;
  /** Nhãn xanh sau thao tác ("Đã từ chối", "Đã đặt lịch 20/10 · 09:00"…). */
  note?: string | undefined;
  /** Ẩn tên tin khi đang lọc theo chính tin đó. */
  showJob: boolean;
  /** Tab Chờ duyệt: chờ quá 2 ngày thì chữ marigold đậm (như dashboard). */
  highlightWait: boolean;
  selected: boolean;
  /** Đang tải trang mới: chưa cho chọn hay thao tác. */
  locked: boolean;
  /** Thao tác đang chạy trên hồ sơ này. */
  busy: RowAction | "REJECTED" | null;
  onToggle: (checked: boolean) => void;
  onAction: (action: RowAction) => void;
  onReject: () => void;
}

function RowSelect({ item, selected, locked, onToggle }: ApplicationRowProps) {
  if (isFinalApplicationStatus(item.status)) return <span aria-hidden className="-mx-2 -my-1 block h-10 w-10 flex-none" />;
  return (
    <RowCheckbox
      label={candidateName(item)}
      checked={selected}
      disabled={locked}
      disabledReason="Đang tải trang mới"
      onChange={onToggle}
    />
  );
}

function Candidate({ item }: { item: EmployerApplicationListItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-[13px] font-bold text-brand-700"
      >
        {initialsOf(item.candidate.fullName)}
      </span>
      <div className="min-w-0">
        <Link
          href={`/employer/applications/${item.applicationId}`}
          className="font-bold break-words text-text-strong hover:text-brand-700 hover:underline"
        >
          {candidateName(item)}
        </Link>
        {item.candidate.universityName ? (
          <p className="break-words text-text-muted">{item.candidate.universityName}</p>
        ) : null}
      </div>
    </div>
  );
}

function Job({ item }: { item: EmployerApplicationListItem }) {
  const status = item.jobPost.status;
  return (
    <span className="break-words">
      <Link href={`/employer/jobs/${item.jobPost.id}`} className="text-text-body hover:text-brand-700 hover:underline">
        {item.jobPost.title}
      </Link>
      {/* Tin không còn hiển thị: ghi trạng thái để khỏi nhầm là tin đang tuyển. */}
      {status !== "PUBLISHED" ? <span className="text-text-muted"> · {JOB_STATUS_LABEL[status].label}</span> : null}
    </span>
  );
}

function Applied({ item, highlightWait }: { item: EmployerApplicationListItem; highlightWait: boolean }) {
  const long = highlightWait && item.status === "PENDING" && waitedOverDays(item.appliedAt, 2);
  return (
    <span className={`whitespace-nowrap ${long ? "font-semibold text-marigold-800" : "text-text-muted"}`}>
      nộp {formatWaited(item.appliedAt)} trước
    </span>
  );
}

function Status({ item, note }: { item: EmployerApplicationListItem; note?: string | undefined }) {
  const status = APPLICATION_STATUS_LABEL[item.status];
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge tone={status.tone}>{status.label}</Badge>
      {item.nextInterviewAt ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-text-muted">
          <Icon name="calendar" size={14} />
          Phỏng vấn{" "}
          <span className="font-num tabular-nums">
            {formatVnDayMonth(item.nextInterviewAt)} · {formatVnTime(item.nextInterviewAt)}
          </span>
        </span>
      ) : item.status === "INTERVIEWING" && item.awaitingSchedule ? (
        <TaskBadge tone="warning">Cần đặt lại lịch</TaskBadge>
      ) : null}
      {note ? (
        <TaskBadge tone="success">
          <Icon name="check" size={14} className="mr-1" />
          {note}
        </TaskBadge>
      ) : null}
    </div>
  );
}

function Actions({ item, busy, locked, onAction, onReject }: ApplicationRowProps) {
  const action = primaryActionOf(item);
  const name = candidateName(item);
  const disabled = busy !== null || locked;
  return (
    <>
      {action ? (
        <DashButton
          size="sm"
          icon={ACTION_BUTTON[action].icon}
          loading={busy === action}
          disabled={disabled}
          onClick={() => onAction(action)}
        >
          {ACTION_BUTTON[action].label}
        </DashButton>
      ) : null}
      {!isFinalApplicationStatus(item.status) ? (
        <DashButton variant="danger" size="sm" disabled={disabled} onClick={onReject}>
          Từ chối
        </DashButton>
      ) : null}
      <Link
        href={`/employer/applications/${item.applicationId}`}
        aria-label={`Mở hồ sơ của ${name}`}
        title="Mở hồ sơ"
        className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-default bg-surface-card text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none"
      >
        <Icon name="chevron-right" size={16} />
      </Link>
    </>
  );
}

/** Một hồ sơ trong bảng (≥ 768px). */
export function ApplicationTableRow(props: ApplicationRowProps) {
  const { item, note, showJob, highlightWait, selected } = props;
  return (
    <tr className={`border-b border-border-subtle align-top last:border-0 ${selected ? "bg-brand-50" : ""}`}>
      <td className="w-12 py-3 pr-0 pl-3">
        <RowSelect {...props} />
      </td>
      <td className="min-w-[170px] py-3 pr-3">
        <Candidate item={item} />
      </td>
      {showJob ? (
        <td className="min-w-[140px] py-3 pr-3">
          <Job item={item} />
        </td>
      ) : null}
      <td className="py-3 pr-3">
        <Status item={item} note={note} />
      </td>
      <td className="py-3 pr-3">
        <Applied item={item} highlightWait={highlightWait} />
      </td>
      <td className="min-w-[130px] py-3 pr-3">
        <SkillMatchText match={item.skillMatch} />
      </td>
      <td className="py-3 pr-3">
        <div className="flex flex-wrap justify-end gap-2">
          <Actions {...props} />
        </div>
      </td>
    </tr>
  );
}

/** Một hồ sơ dạng thẻ (< 768px): ô chọn ở góc, nút ở dòng cuối. */
export function ApplicationCard(props: ApplicationRowProps) {
  const { item, note, showJob, highlightWait, selected } = props;
  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border p-3 ${
        selected ? "border-brand-200 bg-brand-50" : "border-border-subtle bg-surface-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Candidate item={item} />
        </div>
        <RowSelect {...props} />
      </div>
      <p className="flex flex-wrap gap-x-1.5">
        {showJob ? (
          <>
            <Job item={item} />
            <span aria-hidden className="text-text-muted">
              ·
            </span>
          </>
        ) : null}
        <Applied item={item} highlightWait={highlightWait} />
      </p>
      <Status item={item} note={note} />
      <p>
        <SkillMatchText match={item.skillMatch} />
      </p>
      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2">
        <Actions {...props} />
      </div>
    </li>
  );
}
