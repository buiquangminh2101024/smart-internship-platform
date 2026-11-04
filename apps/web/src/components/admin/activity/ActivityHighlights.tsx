"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type {
  AuditActivityHighlights,
  AuditHighlightAccount,
  AuditHighlightDays,
  AuditHighlightRule,
} from "@sip/shared-types";
import {
  DANGEROUS_ADMIN_ACTIONS,
  FAILED_LOGIN_ACTION,
  GROUP_META,
  RESUBMIT_ACTIONS,
  formatIsoDate,
  type ActivityFilters,
} from "@/lib/audit-activity";
import { formatNumber, formatVnDayMonth, formatVnTime } from "@/lib/dashboard-format";
import { Icon } from "@/components/ui/Icon";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { AdminPanel, AdminPanelHead, SegmentedControl, type SegmentedOption } from "@/components/dashboard/admin/AdminPanel";
import { GroupSwatch } from "./ActivityMeta";

/*
 * Khối "Điểm chính" của trang Nhật ký hoạt động (plan admin-activity-v2 N3–N7, bản 2.1
 * M6–M9): "Cần xem" có năm quy tắc, mỗi quy tắc mở ra danh sách tài khoản (hoặc tin);
 * "Hoạt động chính" có năm dòng cố định. Mọi số bấm được đều lọc danh sách (trang chuyển
 * sang tab Danh sách, M14), trừ quy tắc (e) dẫn sang trang Báo cáo vi phạm.
 */

/** Phần bộ lọc mà một dòng Điểm chính đặt cho danh sách (trang bỏ các lọc khác trước). */
export type HighlightFilter = Partial<
  Pick<ActivityFilters, "actions" | "resubmit" | "roles" | "ent" | "actorId" | "since" | "until" | "from" | "to">
>;

const DAY_OPTIONS: SegmentedOption<AuditHighlightDays>[] = [
  { value: 7, label: "7 ngày" },
  { value: 30, label: "30 ngày" },
];

const LOGIN_ACTION = "AUTH_LOGIN_SUCCEEDED";
const JOB_REPORTS_PATH = "/admin/job-reports";

/** `02/11 22:14` (trong 30 ngày nên bỏ năm). */
function shortDateTime(value: string): string {
  return `${formatVnDayMonth(value)} ${formatVnTime(value)}`;
}

function emailOf(account: AuditHighlightAccount): string {
  return account.email ?? "Tài khoản đã xoá";
}

const ROW_BUTTON =
  "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500";

// ─── Cần xem ─────────────────────────────────────────────────────────────

const ROW_ITEM = "border-t border-border-subtle first:border-t-0";
const ROW_GRID =
  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3.5 py-2.5 text-left hover:bg-surface-hover @xl:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto_auto]";
const MORE_ROW = `${ROW_BUTTON} flex w-full items-center gap-1.5 border-t border-border-subtle px-3.5 py-2.5 text-left text-[13px] font-semibold text-brand-700 hover:bg-surface-hover`;

/** Nội dung một hàng trong quy tắc đã mở: tên, chi tiết, thời điểm, mũi tên. */
function RuleRowContent({
  title,
  fullTitle,
  detail,
  when,
  whenLabel,
  external,
}: {
  title: string;
  fullTitle?: string | undefined;
  detail: ReactNode;
  when: string;
  /** Chữ trước thời điểm, vd. "Vượt ngưỡng". */
  whenLabel?: string;
  /** Hàng dẫn sang trang khác (mũi tên chéo). */
  external?: boolean;
}) {
  return (
    <>
      <span className="truncate text-sm font-semibold text-text-strong" title={fullTitle}>
        {title}
      </span>
      <span className="col-start-1 row-start-2 min-w-0 text-[13px] text-text-body @xl:col-start-2 @xl:row-start-1">
        {detail}
      </span>
      <span className="col-start-1 row-start-3 text-[13px] text-text-muted tabular-nums @xl:col-start-3 @xl:row-start-1">
        {whenLabel ? `${whenLabel} ` : null}
        <time dateTime={when}>{shortDateTime(when)}</time>
      </span>
      <Icon
        name={external ? "arrow-up-right" : "chevron-right"}
        size={16}
        className="col-start-2 row-span-3 row-start-1 text-text-muted @xl:col-start-4 @xl:row-span-1"
      />
    </>
  );
}

/**
 * Khung chung của một quy tắc: bằng 0 thì một dòng xám; khác 0 thì dòng tóm tắt viền
 * marigold, bấm để mở danh sách (mặc định đóng).
 */
function RuleShell({
  id,
  count,
  summary,
  none,
  hint,
  listLabel,
  more,
  children,
}: {
  id: string;
  count: number;
  summary: ReactNode;
  /** Câu khi bằng 0. */
  none: string;
  /** Cách quy tắc được tính, có ngưỡng thật từ server. */
  hint: string;
  listLabel: string;
  /** Hàng cuối "Xem cả …" khi danh sách bị cắt. */
  more?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `${id}-items`;

  if (count === 0) {
    return (
      <li className="grid gap-0.5 rounded-[10px] border border-border-subtle px-3.5 py-2.5">
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <Icon name="check" size={16} className="flex-none text-text-subtle" />
          {none}
        </p>
        <p className="pl-6 text-[13px] text-text-subtle">{hint}</p>
      </li>
    );
  }

  return (
    <li className="overflow-hidden rounded-[10px] border border-marigold-300 border-l-[3px] border-l-marigold-500 bg-surface-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={`${ROW_BUTTON} grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3.5 py-2.5 text-left hover:bg-marigold-100`}
      >
        <span className="grid min-w-0 gap-0.5">
          <span className="text-sm text-text-strong">{summary}</span>
          <span className="text-[13px] text-text-muted">{hint}</span>
        </span>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={18} className="text-text-muted" />
      </button>

      <div id={panelId} hidden={!open} className="border-t border-marigold-300 bg-surface-page">
        <ul aria-label={listLabel}>{children}</ul>
        {more}
      </div>
    </li>
  );
}

function Count({ value }: { value: number }) {
  return <b className="text-base text-marigold-800 tabular-nums">{formatNumber(value)}</b>;
}

interface RuleView<A extends AuditHighlightAccount> {
  id: string;
  rule: AuditHighlightRule<A>;
  /** "3 lần đăng nhập sai liên tục" (không có số). */
  noun: string;
  /** Câu khi bằng 0. */
  none: string;
  /** Cách quy tắc được tính, có ngưỡng thật từ server. */
  hint: string;
  /** Chi tiết của một tài khoản (sau email). */
  detail: (account: A) => ReactNode;
  /** Thời điểm hiện ở cuối hàng tài khoản. */
  when: (account: A) => string;
  onAccount: (account: A) => void;
  onShowAll: () => void;
}

/** Quy tắc đếm theo tài khoản: (a), (b), (c), (d). Bấm một tài khoản thì lọc danh sách bên dưới. */
function AttentionRule<A extends AuditHighlightAccount>({ view }: { view: RuleView<A> }) {
  const { rule } = view;
  const hidden = rule.accountCount - rule.accounts.length;
  return (
    <RuleShell
      id={view.id}
      count={rule.count}
      none={view.none}
      hint={view.hint}
      listLabel={`Tài khoản: ${view.noun}`}
      summary={
        <>
          <Count value={rule.count} /> {view.noun}
          <span className="text-text-muted"> · </span>
          <b className="tabular-nums">{formatNumber(rule.accountCount)}</b> tài khoản
        </>
      }
      more={
        hidden > 0 ? (
          <button type="button" onClick={view.onShowAll} className={MORE_ROW}>
            Xem cả {formatNumber(rule.accountCount)} tài khoản trong danh sách
            <Icon name="arrow-down" size={14} />
          </button>
        ) : null
      }
    >
      {rule.accounts.map((account) => (
        <li key={account.userId} className={ROW_ITEM}>
          <button type="button" onClick={() => view.onAccount(account)} className={`${ROW_BUTTON} ${ROW_GRID}`}>
            <RuleRowContent
              title={emailOf(account)}
              fullTitle={account.email ?? undefined}
              detail={view.detail(account)}
              when={view.when(account)}
            />
          </button>
        </li>
      ))}
    </RuleShell>
  );
}

/**
 * (e) Tin bị nhiều người báo cáo chưa xử lý (bản 2.1, M6, M8). Đơn vị là tin, không phải
 * tài khoản. Bằng chứng nằm ở bảng báo cáo, nên hàng dẫn sang trang Báo cáo vi phạm và mở
 * báo cáo cũ nhất đang chờ của tin đó.
 */
function ReportedJobsRule({
  reportedJobs,
  minReports,
  windowHours,
}: {
  reportedJobs: AuditActivityHighlights["attention"]["reportedJobs"];
  minReports: number;
  windowHours: number;
}) {
  const hidden = reportedJobs.count - reportedJobs.items.length;
  return (
    <RuleShell
      id="rule-reported-jobs"
      count={reportedJobs.count}
      none="Không có tin bị báo cáo dồn dập"
      hint={`Từ ${minReports} người khác nhau báo cáo cùng một tin trong ${windowHours} giờ, các báo cáo còn chờ xử lý`}
      listLabel="Tin bị nhiều người báo cáo chưa xử lý"
      summary={
        <>
          <Count value={reportedJobs.count} /> tin bị nhiều người báo cáo chưa xử lý
        </>
      }
      more={
        hidden > 0 ? (
          <Link href={JOB_REPORTS_PATH} className={MORE_ROW}>
            Xem cả {formatNumber(reportedJobs.count)} tin ở trang Báo cáo vi phạm
            <Icon name="arrow-up-right" size={14} />
          </Link>
        ) : null
      }
    >
      {reportedJobs.items.map((job) => (
        <li key={job.jobId} className={ROW_ITEM}>
          <Link
            href={`${JOB_REPORTS_PATH}?report=${encodeURIComponent(job.oldestPendingReportId)}`}
            className={`${ROW_BUTTON} ${ROW_GRID}`}
          >
            <RuleRowContent
              title={job.title}
              fullTitle={job.title}
              detail={
                <>
                  {job.companyName}
                  <span className="text-text-muted">
                    {" · "}
                    <b className="font-semibold text-text-body tabular-nums">{formatNumber(job.pendingReports)}</b> báo
                    cáo đang chờ · chờ từ <span className="tabular-nums">{shortDateTime(job.oldestPendingAt)}</span>
                  </span>
                </>
              }
              when={job.crossedAt}
              whenLabel="Vượt ngưỡng"
              external
            />
          </Link>
        </li>
      ))}
    </RuleShell>
  );
}

// ─── Hoạt động chính ─────────────────────────────────────────────────────

interface Part {
  count: number;
  label: string;
  filter: HighlightFilter;
}

/**
 * Một dòng: ô icon, tên nhóm, các số (M15). Từ `@xl` là lưới icon · tên 140px · số nên
 * năm dòng thẳng hàng; hẹp hơn thì các số xuống dưới tên.
 */
function ActivityLine({
  group,
  label,
  icon,
  parts,
  onFilter,
}: {
  group: "JOB_POST" | "COMPANY" | "PAYMENT" | "CATALOG";
  /** Mặc định là tên nhóm trong `GROUP_META`. */
  label?: string;
  /** Thay icon của nhóm, giữ màu. */
  icon?: string;
  parts: Part[];
  onFilter: (filter: HighlightFilter) => void;
}) {
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-x-2.5 border-t border-border-subtle py-2 first:border-t-0 @xl:grid-cols-[20px_140px_minmax(0,1fr)]">
      <GroupSwatch group={group} size={20} {...(icon ? { icon } : {})} />
      <span className="flex min-h-8 items-center text-sm font-semibold text-text-strong">{label ?? GROUP_META[group].label}</span>
      <p className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-1 text-sm text-text-body @xl:col-start-3">
        {parts.map((part, index) => (
          <span key={part.label} className="inline-flex items-center gap-1">
            {index > 0 ? (
              <span aria-hidden className="text-text-subtle">
                ·
              </span>
            ) : null}
            {part.count > 0 ? (
              <button
                type="button"
                onClick={() => onFilter(part.filter)}
                className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md px-1 text-text-strong hover:bg-surface-hover hover:underline focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <b className="tabular-nums">{formatNumber(part.count)}</b> {part.label}
              </button>
            ) : (
              <span className="inline-flex min-h-8 items-center gap-1 px-1 text-text-muted">
                <b className="font-semibold tabular-nums">0</b> {part.label}
              </span>
            )}
          </span>
        ))}
      </p>
    </li>
  );
}

// ─── Khối ────────────────────────────────────────────────────────────────

export function ActivityHighlights({
  days,
  onDaysChange,
  status,
  data,
  dimmed,
  onRetry,
  retrying,
  onFilter,
  onOpenRow,
}: {
  days: AuditHighlightDays;
  onDaysChange: (days: AuditHighlightDays) => void;
  status: "pending" | "error" | "success";
  data: AuditActivityHighlights | undefined;
  /** Đang tải khoảng mới, còn hiện số của khoảng cũ. */
  dimmed: boolean;
  onRetry: () => void;
  retrying: boolean;
  /** Lọc danh sách theo một dòng (trang bỏ các lọc khác và chuyển sang tab Danh sách). */
  onFilter: (filter: HighlightFilter) => void;
  /** Mở ngăn kéo chi tiết ở một dòng nhật ký. */
  onOpenRow: (id: string) => void;
}) {
  let body: ReactNode;
  if (status === "pending" || !data) {
    body =
      status === "error" ? (
        <BlockError what="điểm chính" onRetry={onRetry} retrying={retrying} />
      ) : (
        <BlockSkeleton height={380} />
      );
  } else {
    const range = { from: data.from, to: data.to };
    const t = data.thresholds;
    const { failedLogins, adminNewIp, adminDangerBurst, employerSubmitBurst, reportedJobs } = data.attention;
    const { jobPosts, companies, payments, catalog, jobReports } = data.activity;
    const submitActions = [...RESUBMIT_ACTIONS];
    const dangerActions = [...DANGEROUS_ADMIN_ACTIONS];

    body = (
      <div
        className={`grid gap-5 transition-opacity duration-150 motion-reduce:transition-none ${dimmed ? "opacity-60" : ""}`}
        aria-busy={dimmed || undefined}
      >
        <section aria-labelledby="highlights-attention" className="grid gap-2">
          <h3 id="highlights-attention" className="text-[13px] font-bold text-text-muted">
            Cần xem
          </h3>
          {/* Thứ tự theo đối tượng (M7): đăng nhập, Admin, Employer, tin. */}
          <ul className="grid gap-2">
            <AttentionRule
              view={{
                id: "rule-failed-logins",
                rule: failedLogins,
                noun: "lần đăng nhập sai liên tục",
                none: "Không có lần đăng nhập sai bất thường",
                hint: `Sai mật khẩu ${t.failedLoginAttempts} lần trong ${t.failedLoginWindowMinutes} phút vào cùng một tài khoản`,
                detail: (account) => <>{formatNumber(account.count)} lần bị dò</>,
                when: (account) => account.latestAt,
                onAccount: (account) =>
                  onFilter({ ...range, actions: [FAILED_LOGIN_ACTION], ent: { type: "User", id: account.userId } }),
                onShowAll: () => onFilter({ ...range, actions: [FAILED_LOGIN_ACTION] }),
              }}
            />
            <AttentionRule
              view={{
                id: "rule-admin-new-ip",
                rule: adminNewIp,
                noun: "lần Admin đăng nhập từ IP mới",
                none: "Không có Admin đăng nhập từ IP mới",
                hint: `IP chưa thấy ở lần đăng nhập nào của Admin đó trong ${t.newIpLookbackDays} ngày trước`,
                detail: (account) => (
                  <>
                    IP mới <span className="font-num tabular-nums">{account.ip}</span>
                    <span className="text-text-muted">
                      {" · "}
                      {account.knownIps.length > 0
                        ? `IP quen: ${account.knownIps.join(", ")}`
                        : `Chưa đăng nhập trong ${t.newIpLookbackDays} ngày trước`}
                    </span>
                  </>
                ),
                when: (account) => account.latestAt,
                onAccount: (account) => onOpenRow(account.latestLogId),
                onShowAll: () => onFilter({ ...range, actions: [LOGIN_ACTION] }),
              }}
            />
            <AttentionRule
              view={{
                id: "rule-admin-danger-burst",
                rule: adminDangerBurst,
                noun: "lần Admin thao tác nguy hiểm dồn dập",
                none: "Không có Admin thao tác nguy hiểm dồn dập",
                hint: `Một Admin có từ ${t.dangerousActionsPerHour} lần khoá tài khoản, đăng xuất mọi thiết bị, tắt kiểm duyệt tin, từ chối công ty hoặc hạ tin trong cùng một giờ`,
                detail: (account) => (
                  <>
                    {formatNumber(account.count)} lần · nhiều nhất{" "}
                    <b className="tabular-nums">{formatNumber(account.maxPerHour)}</b> thao tác/giờ
                  </>
                ),
                when: (account) => account.latestHour.since,
                onAccount: (account) =>
                  onFilter({
                    actions: dangerActions,
                    actorId: account.userId,
                    since: account.latestHour.since,
                    until: account.latestHour.until,
                  }),
                onShowAll: () => onFilter({ ...range, actions: dangerActions, roles: ["ADMIN"] }),
              }}
            />
            <AttentionRule
              view={{
                id: "rule-employer-burst",
                rule: employerSubmitBurst,
                noun: "lần Employer gửi duyệt dồn dập",
                none: "Không có Employer gửi duyệt dồn dập",
                hint: `Một tài khoản Employer gửi từ ${t.submitBurstPerHour} tin trong cùng một giờ`,
                detail: (account) => (
                  <>
                    {formatNumber(account.count)} lần · nhiều nhất{" "}
                    <b className="tabular-nums">{formatNumber(account.maxPerHour)}</b> tin/giờ
                  </>
                ),
                when: (account) => account.latestHour.since,
                onAccount: (account) =>
                  onFilter({
                    actions: submitActions,
                    actorId: account.userId,
                    since: account.latestHour.since,
                    until: account.latestHour.until,
                  }),
                onShowAll: () => onFilter({ ...range, actions: submitActions, roles: ["EMPLOYER"] }),
              }}
            />
            <ReportedJobsRule
              reportedJobs={reportedJobs}
              minReports={t.reportedJobMinReports}
              windowHours={t.reportedJobWindowHours}
            />
          </ul>
        </section>

        <section aria-labelledby="highlights-activity" className="grid gap-1">
          <h3 id="highlights-activity" className="text-[13px] font-bold text-text-muted">
            Hoạt động chính
          </h3>
          <ul>
            <ActivityLine
              group="JOB_POST"
              onFilter={onFilter}
              parts={[
                {
                  count: jobPosts.approved,
                  label: "tin được duyệt",
                  filter: { ...range, actions: ["JOB_POST_APPROVED", "JOB_POST_AUTO_PUBLISHED"] },
                },
                { count: jobPosts.rejected, label: "tin bị từ chối", filter: { ...range, actions: ["JOB_POST_REJECTED"] } },
                {
                  count: jobPosts.resubmitted,
                  label: "tin gửi lại sau từ chối",
                  filter: { ...range, actions: submitActions, resubmit: true },
                },
              ]}
            />
            <ActivityLine
              group="COMPANY"
              onFilter={onFilter}
              parts={[
                {
                  count: companies.verified,
                  label: "công ty được xác minh",
                  filter: { ...range, actions: ["COMPANY_VERIFIED", "COMPANY_AUTO_VERIFIED"] },
                },
                { count: companies.rejected, label: "công ty bị từ chối", filter: { ...range, actions: ["COMPANY_REJECTED"] } },
              ]}
            />
            <ActivityLine
              group="PAYMENT"
              onFilter={onFilter}
              parts={[
                {
                  count: payments.completed,
                  label: "lần thanh toán gói dịch vụ",
                  filter: { ...range, actions: ["PAYMENT_COMPLETED"] },
                },
              ]}
            />
            <ActivityLine
              group="CATALOG"
              onFilter={onFilter}
              parts={[
                {
                  count: catalog.approved,
                  label: "mục danh mục được duyệt",
                  filter: { ...range, actions: ["CATALOG_ENTRY_APPROVED", "CATALOG_ENTRY_RENAME_APPROVED"] },
                },
                { count: catalog.rejected, label: "bị từ chối", filter: { ...range, actions: ["CATALOG_ENTRY_REJECTED"] } },
                { count: catalog.merged, label: "được gộp", filter: { ...range, actions: ["CATALOG_ENTRY_MERGED"] } },
              ]}
            />
            {/* Báo cáo vi phạm thuộc nhóm Tin tuyển dụng (M1, M9): cùng màu, icon lá cờ như menu (M15). */}
            <ActivityLine
              group="JOB_POST"
              label="Báo cáo vi phạm"
              icon="flag"
              onFilter={onFilter}
              parts={[
                {
                  count: jobReports.takenDown,
                  label: "tin bị gỡ theo báo cáo",
                  filter: { ...range, actions: ["JOB_REPORT_ACTION_EXECUTED"] },
                },
                {
                  count: jobReports.dismissed,
                  label: "báo cáo bỏ qua (giữ tin)",
                  filter: { ...range, actions: ["JOB_REPORT_RESOLVED"] },
                },
              ]}
            />
          </ul>
        </section>
      </div>
    );
  }

  return (
    <AdminPanel labelledBy="activity-highlights-title">
      <AdminPanelHead
        id="activity-highlights-title"
        title="Điểm chính"
        subtitle={
          data ? (
            <span className="tabular-nums">
              {formatIsoDate(data.from)} – {formatIsoDate(data.to)}
            </span>
          ) : (
            `${days} ngày gần nhất`
          )
        }
        actions={
          <SegmentedControl options={DAY_OPTIONS} value={days} onChange={onDaysChange} label="Khoảng của điểm chính" />
        }
      />
      <div className="px-4 pb-4 @xl:px-5 @xl:pb-5">{body}</div>
    </AdminPanel>
  );
}
