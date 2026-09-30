"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import type { AdminDashboardTasks, CatalogEntryKind, CatalogSuggester, Role } from "@sip/shared-types";
import { ApiError } from "@/lib/api-client";
import { useModerate, type ModerationDecision, type ModerationQueue } from "@/hooks/useAdminDashboard";
import { formatNumber, formatWaited, initialsOf } from "@/lib/dashboard-format";
import { Icon } from "@/components/ui/Icon";
import type { ToastData } from "@/components/ui/Toast";
import { DashButton } from "../DashButton";
import { AdminPanel, AdminPanelHead } from "./AdminPanel";
import { MODERATION_DESK_ID, QUEUE_ORDER } from "./AdminQueues";

type Notify = (tone: ToastData["tone"], message: string) => void;

const TAB_LABEL: Record<ModerationQueue, string> = {
  jobPosts: "Tin tuyển dụng",
  companies: "Công ty",
  catalog: "Danh mục",
};

const APPROVE_LABEL: Record<ModerationQueue, string> = {
  jobPosts: "Duyệt tin",
  companies: "Xác minh",
  catalog: "Duyệt",
};

const EMPTY_TEXT: Record<ModerationQueue, string> = {
  jobPosts: "Không có tin nào chờ duyệt. Tin mới sẽ hiện ở đây khi nhà tuyển dụng gửi duyệt.",
  companies: "Không có công ty nào chờ xác minh. Yêu cầu mới sẽ hiện ở đây.",
  catalog: "Không có đề xuất danh mục nào chờ duyệt.",
};

const QUICK_REASONS: Record<"jobPosts" | "companies", string[]> = {
  jobPosts: ["Thiếu mô tả quyền lợi", "Mô tả công việc chưa rõ", "Phụ cấp không hợp lệ", "Sai ngành nghề"],
  companies: ["MST không khớp giấy phép", "Giấy phép không đọc được", "Thông tin liên hệ không hợp lệ"],
};

const REASON_RECIPIENT: Record<"jobPosts" | "companies", string> = {
  jobPosts: "Nhà tuyển dụng nhận lý do này trong thông báo.",
  companies: "Công ty nhận lý do này và có thể gửi lại hồ sơ.",
};

const KIND_META: Record<CatalogEntryKind, { label: string; icon: string; href: string }> = {
  SKILL: { label: "Kỹ năng", icon: "sparkles", href: "/admin/skills" },
  UNIVERSITY: { label: "Trường", icon: "graduation-cap", href: "/admin/education-catalog" },
  MAJOR: { label: "Ngành", icon: "graduation-cap", href: "/admin/education-catalog" },
};

const ROLE_LABEL: Record<Role, string> = {
  CANDIDATE: "Ứng viên",
  EMPLOYER: "Nhà tuyển dụng",
  ADMIN: "Quản trị viên",
};

const HOUR_MS = 60 * 60 * 1000;

/** Mức nền của ô thời gian chờ: tin theo 6 / 24 giờ, công ty và danh mục theo 1 / 2 ngày (khớp thanh chia nhóm). */
function waitLevel(queue: ModerationQueue, since: string): 0 | 1 | 2 {
  const hours = (Date.now() - new Date(since).getTime()) / HOUR_MS;
  const [low, high] = queue === "jobPosts" ? [6, 24] : [24, 48];
  return hours >= high ? 2 : hours >= low ? 1 : 0;
}

const WAIT_CLASS = ["bg-surface-hover text-text-body", "bg-marigold-100 text-marigold-800", "bg-marigold-300 text-text-strong"];

type Outcome = "approved" | "rejected";

interface DeskRow {
  id: string;
  title: string;
  avatar: { initials: string } | { icon: string };
  meta: ReactNode;
  since: string;
  detailHref: string;
  kind?: CatalogEntryKind;
}

function suggesterText(suggestedBy: CatalogSuggester | null): ReactNode {
  if (!suggestedBy) return "Không rõ người đề xuất";
  const role = ROLE_LABEL[suggestedBy.role];
  if (!suggestedBy.name) return `Đề xuất bởi một ${role.toLowerCase()}`;
  return (
    <>
      Đề xuất bởi <span className="text-text-body">{suggestedBy.name}</span> ({role})
    </>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-text-subtle">
      ·
    </span>
  );
}

function rowsOf(queue: ModerationQueue, tasks: AdminDashboardTasks): DeskRow[] {
  if (queue === "jobPosts") {
    return tasks.jobPosts.items.map((job) => ({
      id: job.jobPostId,
      title: job.title,
      avatar: { initials: initialsOf(job.companyName) },
      meta: (
        <>
          <span>{job.companyName}</span>
          <Dot />
          <span>gửi {formatWaited(job.submittedAt)} trước</span>
        </>
      ),
      since: job.submittedAt,
      detailHref: `/admin/jobs/${job.jobPostId}`,
    }));
  }
  if (queue === "companies") {
    return tasks.companies.items.map((company) => ({
      id: company.companyId,
      title: company.name,
      avatar: { initials: initialsOf(company.name) },
      meta: (
        <>
          <span>{company.taxCode ? `MST ${company.taxCode}` : "Chưa có MST"}</span>
          {company.businessLicenseUrl ? (
            <>
              <Dot />
              <a
                href={company.businessLicenseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 font-bold text-brand-700 hover:underline"
              >
                <Icon name="file-text" size={14} />
                Giấy phép KD
                <span className="sr-only"> (mở trong thẻ mới)</span>
              </a>
            </>
          ) : null}
          <Dot />
          <span>yêu cầu {formatWaited(company.submittedAt)} trước</span>
        </>
      ),
      since: company.submittedAt,
      detailHref: `/admin/companies/${company.companyId}`,
    }));
  }
  return tasks.catalog.items.map((entry) => ({
    id: entry.id,
    title: entry.name,
    avatar: { icon: KIND_META[entry.kind].icon },
    meta: (
      <>
        <span className="rounded-full bg-surface-hover px-[7px] py-px text-xs font-bold text-text-body">
          {KIND_META[entry.kind].label}
        </span>
        <span>{suggesterText(entry.suggestedBy)}</span>
        <Dot />
        <span>{formatWaited(entry.createdAt)} trước</span>
      </>
    ),
    since: entry.createdAt,
    detailHref: KIND_META[entry.kind].href,
    kind: entry.kind,
  }));
}

export interface ModerationDeskProps {
  tasks: AdminDashboardTasks;
  /** Số chờ mới nhất (từ `overview`) cho tab và chân khối; thiếu thì lấy tổng của `tasks`. */
  totals?: Record<ModerationQueue, number> | undefined;
  catalogSplit?: { skills: number; education: number } | undefined;
  selected: ModerationQueue;
  onSelect: (queue: ModerationQueue) => void;
  notify: Notify;
}

/**
 * "Bàn duyệt" (Admin bản D): ba tab hàng chờ, mỗi tab tối đa 5 hàng chờ lâu
 * nhất. Duyệt / từ chối ngay tại hàng; hàng đã xử lý ở lại chỗ cũ với nhãn
 * trạng thái tới lần tải lại kế tiếp.
 */
export function ModerationDesk({ tasks, totals, catalogSplit, selected, onSelect, notify }: ModerationDeskProps) {
  const tabRefs = useRef<Partial<Record<ModerationQueue, HTMLButtonElement | null>>>({});
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const baseId = useId();

  const totalOf = (queue: ModerationQueue) => totals?.[queue] ?? tasks[queue].total;

  function handleTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = QUEUE_ORDER[(QUEUE_ORDER.indexOf(selected) + step + QUEUE_ORDER.length) % QUEUE_ORDER.length]!;
    onSelect(next);
    tabRefs.current[next]?.focus();
  }

  const rows = rowsOf(selected, tasks);
  const tabId = (queue: ModerationQueue) => `${baseId}-tab-${queue}`;
  const paneId = `${baseId}-pane`;

  return (
    <AdminPanel id={MODERATION_DESK_ID} labelledBy="admin-desk-title" className="scroll-mt-24">
      <AdminPanelHead
        id="admin-desk-title"
        title="Bàn duyệt"
        subtitle="Chờ lâu nhất ở trên. Từ chối tin và công ty cần nhập lý do."
      />
      <div
        role="tablist"
        aria-label="Hàng chờ"
        onKeyDown={handleTabKey}
        className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border-subtle px-3 [scrollbar-width:none] @xl:px-5"
      >
        {QUEUE_ORDER.map((queue) => {
          const isSelected = queue === selected;
          return (
            <button
              key={queue}
              ref={(el) => {
                tabRefs.current[queue] = el;
              }}
              type="button"
              role="tab"
              id={tabId(queue)}
              aria-selected={isSelected}
              aria-controls={paneId}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(queue)}
              className={`-mb-px inline-flex h-[42px] shrink-0 cursor-pointer items-center gap-2 border-b-2 px-2.5 text-[13px] font-bold whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none focus-visible:rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 ${
                isSelected ? "border-brand-600 text-brand-700" : "border-transparent text-text-muted hover:text-text-strong"
              }`}
            >
              {TAB_LABEL[queue]}
              <span className="inline-grid h-5 min-w-[22px] place-items-center rounded-full bg-brand-50 px-[7px] text-xs font-bold text-brand-700 tabular-nums">
                {formatNumber(totalOf(queue))}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={paneId} aria-labelledby={tabId(selected)}>
        {rows.length === 0 ? (
          <p className="px-5 py-7 text-center text-[13px] text-text-muted">{EMPTY_TEXT[selected]}</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rows.map((row) => (
              <ModerationRow
                key={`${selected}-${row.id}`}
                queue={selected}
                row={row}
                outcome={outcomes[row.id]}
                onDone={(outcome) => setOutcomes((prev) => ({ ...prev, [row.id]: outcome }))}
                notify={notify}
              />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 border-t border-border-subtle px-5 py-2.5">
          {selected === "catalog" ? (
            <>
              <SeeAll href="/admin/skills">
                Kỹ năng chờ duyệt ({formatNumber(catalogSplit?.skills ?? 0)})
              </SeeAll>
              <SeeAll href="/admin/education-catalog">
                Trường, ngành chờ duyệt ({formatNumber(catalogSplit?.education ?? 0)})
              </SeeAll>
            </>
          ) : selected === "jobPosts" ? (
            <SeeAll href="/admin/jobs">Xem tất cả {formatNumber(totalOf("jobPosts"))} tin</SeeAll>
          ) : (
            <SeeAll href="/admin/companies">Xem tất cả {formatNumber(totalOf("companies"))} công ty</SeeAll>
          )}
        </div>
      </div>
    </AdminPanel>
  );
}

function SeeAll({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-700 hover:underline">
      {children}
      <Icon name="arrow-right" size={16} />
    </Link>
  );
}

function ModerationRow({
  queue,
  row,
  outcome,
  onDone,
  notify,
}: {
  queue: ModerationQueue;
  row: DeskRow;
  outcome: Outcome | undefined;
  onDone: (outcome: Outcome) => void;
  notify: Notify;
}) {
  const moderate = useModerate();
  const [busy, setBusy] = useState<ModerationDecision | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const rejectButtonRef = useRef<HTMLButtonElement>(null);
  const rejectId = useId();
  const level = waitLevel(queue, row.since);

  async function decide(decision: ModerationDecision, reason?: string) {
    setBusy(decision);
    try {
      await moderate.mutateAsync({
        queue,
        id: row.id,
        decision,
        ...(reason ? { reason } : {}),
        ...(row.kind ? { kind: row.kind } : {}),
      });
      const result: Outcome = decision === "approve" ? "approved" : "rejected";
      setRejectOpen(false);
      onDone(result);
      const label =
        result === "rejected" ? "Đã từ chối" : queue === "companies" ? "Đã xác minh" : "Đã duyệt";
      notify("success", `${label}: ${row.title}${reason ? ` (lý do: ${reason})` : ""}.`);
    } catch (err) {
      notify(
        "danger",
        err instanceof ApiError && [400, 404, 409].includes(err.status)
          ? `"${row.title}" đã được xử lý hoặc không còn. Bấm Làm mới để xem hàng chờ mới.`
          : "Không thực hiện được. Kiểm tra kết nối rồi thử lại.",
      );
    } finally {
      setBusy(null);
    }
  }

  function closeReject() {
    setRejectOpen(false);
    rejectButtonRef.current?.focus();
  }

  const done = outcome !== undefined;

  return (
    <li>
      <div className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-page motion-reduce:transition-none @xl:grid-cols-[36px_minmax(0,1fr)_auto_auto] @xl:px-5">
        <span
          aria-hidden
          className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand-50 text-xs font-bold text-brand-700"
        >
          {"icon" in row.avatar ? <Icon name={row.avatar.icon} size={18} /> : row.avatar.initials}
        </span>
        <div className="min-w-0">
          <p className={`font-bold @xl:truncate ${done ? "text-text-muted" : "text-text-strong"}`}>{row.title}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-text-muted">{row.meta}</p>
        </div>
        <span
          title={`Đã chờ ${formatWaited(row.since)}`}
          className={`col-start-2 inline-flex h-[26px] items-center gap-[5px] justify-self-start rounded-full px-[9px] text-xs font-bold whitespace-nowrap tabular-nums @xl:col-start-auto ${
            WAIT_CLASS[level]
          } ${done ? "opacity-50" : ""}`}
        >
          <Icon name="clock" size={14} />
          <span className="sr-only">Đã chờ </span>
          {formatWaited(row.since)}
        </span>
        <div className="col-span-2 flex flex-wrap items-center gap-1 @xl:col-span-1">
          {done ? (
            <span
              role="status"
              className={`inline-flex h-[26px] items-center gap-[5px] rounded-full px-2.5 text-xs font-bold ${
                outcome === "approved" ? "bg-success-100 text-success-700" : "bg-red-100 text-red-700"
              }`}
            >
              <Icon name={outcome === "approved" ? "check" : "x"} size={14} />
              {outcome === "rejected" ? "Đã từ chối" : queue === "companies" ? "Đã xác minh" : "Đã duyệt"}
            </span>
          ) : (
            <>
              <DashButton
                size="sm"
                loading={busy === "approve"}
                disabled={busy !== null}
                onClick={() => void decide("approve")}
                className="flex-1 @xl:flex-none"
              >
                {APPROVE_LABEL[queue]}
              </DashButton>
              <button
                ref={rejectButtonRef}
                type="button"
                aria-expanded={rejectOpen}
                aria-controls={rejectId}
                disabled={busy !== null}
                onClick={() => setRejectOpen((open) => !open)}
                className="inline-flex h-8 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 text-[13px] font-bold text-red-700 transition-colors duration-150 hover:bg-red-50 disabled:cursor-progress disabled:opacity-75 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 @xl:flex-none"
              >
                Từ chối
              </button>
            </>
          )}
          <Link
            href={row.detailHref}
            aria-label={`Xem chi tiết ${row.title}`}
            className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text-strong motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <Icon name="external-link" size={16} />
          </Link>
        </div>
      </div>
      {rejectOpen && !done ? (
        queue === "catalog" ? (
          <CatalogRejectConfirm
            id={rejectId}
            name={row.title}
            sending={busy === "reject"}
            onConfirm={() => void decide("reject")}
            onCancel={closeReject}
          />
        ) : (
          <RejectReason
            id={rejectId}
            queue={queue}
            sending={busy === "reject"}
            onConfirm={(reason) => void decide("reject", reason)}
            onCancel={closeReject}
          />
        )
      ) : null}
    </li>
  );
}

const REJECT_BOX =
  "mx-4 mb-3.5 flex flex-col gap-2.5 rounded-[10px] border border-red-100 bg-red-50/40 p-3.5 @xl:mr-5 @xl:ml-[68px]";

/** Ô lý do từ chối mở ngay dưới hàng (tin, công ty): bắt buộc, có gợi ý lý do hay dùng. */
function RejectReason({
  id,
  queue,
  sending,
  onConfirm,
  onCancel,
}: {
  id: string;
  queue: "jobPosts" | "companies";
  sending: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [showError, setShowError] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = `${id}-input`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  function addQuickReason(text: string) {
    setReason((current) => (current.trim() ? `${current.trim()}; ${text.toLowerCase()}` : text));
    setShowError(false);
    inputRef.current?.focus();
  }

  function submit() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setShowError(true);
      inputRef.current?.focus();
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <div id={id} className={REJECT_BOX}>
      <label htmlFor={inputId} className="text-[13px] font-bold text-text-strong">
        Lý do từ chối <span className="font-normal text-red-700">(bắt buộc)</span>
      </label>
      <div role="group" aria-label="Lý do thường dùng" className="flex flex-wrap gap-1.5">
        {QUICK_REASONS[queue].map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => addQuickReason(text)}
            className="inline-flex h-7 cursor-pointer items-center rounded-full border border-border-default bg-surface-card px-2.5 text-xs text-text-body transition-colors duration-150 hover:border-brand-300 hover:bg-brand-50 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            {text}
          </button>
        ))}
      </div>
      <textarea
        ref={inputRef}
        id={inputId}
        rows={2}
        autoFocus
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          if (event.target.value.trim()) setShowError(false);
        }}
        aria-invalid={showError || undefined}
        aria-describedby={showError ? `${hintId} ${errorId}` : hintId}
        placeholder="Ví dụ: thiếu mô tả quyền lợi"
        className="min-h-16 w-full resize-y rounded-lg border border-border-default bg-surface-card px-[11px] py-[9px] text-sm text-text-strong focus:border-brand-400 focus:outline-2 focus:outline-brand-400 aria-invalid:border-red-600 aria-invalid:outline-red-600"
      />
      <p id={hintId} className="text-xs text-text-muted">
        {REASON_RECIPIENT[queue]}
      </p>
      {showError ? (
        <p id={errorId} className="flex items-center gap-[5px] text-xs font-bold text-red-700">
          <Icon name="circle-alert" size={14} />
          Nhập lý do từ chối trước khi xác nhận.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <DashButton variant="danger-solid" size="sm" loading={sending} onClick={submit}>
          {sending ? "Đang gửi" : "Xác nhận từ chối"}
        </DashButton>
        <DashButton variant="secondary" size="sm" disabled={sending} onClick={onCancel}>
          Huỷ
        </DashButton>
      </div>
    </div>
  );
}

/** Danh mục: chỉ hỏi xác nhận, không cần lý do. */
function CatalogRejectConfirm({
  id,
  name,
  sending,
  onConfirm,
  onCancel,
}: {
  id: string;
  name: string;
  sending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div id={id} role="group" aria-labelledby={`${id}-title`} className={REJECT_BOX}>
      <p id={`${id}-title`} className="text-[13px] font-bold text-text-strong">
        Từ chối đề xuất “{name}”?
      </p>
      <p className="text-xs text-text-muted">Mục này sẽ không được thêm vào danh mục.</p>
      <div className="flex flex-wrap gap-2">
        <DashButton variant="danger-solid" size="sm" loading={sending} onClick={onConfirm}>
          {sending ? "Đang gửi" : "Xác nhận từ chối"}
        </DashButton>
        <DashButton variant="secondary" size="sm" disabled={sending} onClick={onCancel}>
          Huỷ
        </DashButton>
      </div>
    </div>
  );
}
