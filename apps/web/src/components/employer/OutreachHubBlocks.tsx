import Link from "next/link";
import type { EmployerOutreachSummary, OutreachInvitationStatus, OutreachJobSummary } from "@sip/shared-types";
import { type CompanyInvitationFilter, useCompanyOutreachInvitations } from "@/hooks/useCandidateOutreach";
import { formatNumber } from "@/lib/dashboard-format";
import { formatDeadline, JOB_STATUS_LABEL } from "@/lib/job-post-display";
import { Select } from "@/components/ui/Select";
import { StatCard } from "@/components/ui/StatCard";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { DashButton } from "@/components/dashboard/DashButton";
import { Panel, PanelHead } from "@/components/dashboard/Panel";
import { QuotaBar } from "@/components/dashboard/QuotaBar";
import { ChipGroup, type ChipOption } from "@/components/dashboard/RangeChips";
import { SegmentBar } from "@/components/dashboard/SegmentBar";
import { INVITATION_STATUS_LABEL, SentInvitationRow } from "./SentInvitationRow";

// Các khối của trang "Lời mời" (docs/05-frontend/phases/outreach-hub/PLAN.md).
// Số liệu cấp công ty (Q1); tìm / mời vẫn ở trang tìm ứng viên của từng tin.

// ─── Hàng số liệu ──────────────────────────────────────────────────────────

export function OutreachStats({ summary }: { summary: EmployerOutreachSummary }) {
  const { quota, last30Days } = summary;
  const expired = Math.max(0, last30Days.sent - last30Days.accepted - last30Days.declined - last30Days.pending);

  return (
    <section aria-label="Số liệu lời mời" className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {quota.mode === "BLOCKED" ? (
        <StatCard
          label="Lời mời còn lại hôm nay"
          icon="send"
          value="—"
          hint="Cần gói còn hiệu lực để gửi lời mời"
          footer={
            <DashButton href="/employer/subscription" variant="secondary" size="sm" iconAfter="arrow-right" className="self-start">
              Xem gói dịch vụ
            </DashButton>
          }
        />
      ) : (
        <StatCard
          label="Lời mời còn lại hôm nay"
          icon="send"
          value={formatNumber(quota.remainingToday)}
          unit={`/ ${formatNumber(quota.dailyQuota)} lời mời`}
          hint={quota.mode === "TRIAL" ? "Đang dùng thử, đặt lại lúc 07:00 mỗi ngày" : "Đặt lại lúc 07:00 mỗi ngày"}
          footer={<QuotaBar used={quota.usedToday} total={quota.dailyQuota} />}
        />
      )}

      <StatCard
        label="Kết quả 30 ngày"
        icon="mail-check"
        value={formatNumber(last30Days.sent)}
        unit="lời mời đã gửi"
        hint={
          last30Days.sent > 0
            ? `Chấp nhận ${formatNumber(last30Days.accepted)} / ${formatNumber(last30Days.sent)} (${Math.round(
                (last30Days.accepted / last30Days.sent) * 100,
              )}%)`
            : "Chưa gửi lời mời nào trong 30 ngày qua"
        }
        footer={
          <SegmentBar
            label="Kết quả lời mời 30 ngày"
            segments={[
              { label: "Chấp nhận", value: last30Days.accepted, tone: "success" },
              { label: "Đang chờ", value: last30Days.pending, tone: "wait-mid" },
              { label: "Từ chối", value: last30Days.declined, tone: "brand-soft" },
              { label: "Hết hạn", value: expired, tone: "muted" },
            ]}
          />
        }
      />
    </section>
  );
}

// ─── Tìm ứng viên theo tin ─────────────────────────────────────────────────

const JOBS_TITLE_ID = "outreach-jobs-title";

export function OutreachJobsPanel({ jobs }: { jobs: OutreachJobSummary[] }) {
  // Q3 — chỉ tin đang hiển thị mới tìm / mời được.
  const published = jobs.filter((job) => job.status === "PUBLISHED");

  return (
    <Panel labelledBy={JOBS_TITLE_ID}>
      <PanelHead
        as="h2"
        id={JOBS_TITLE_ID}
        title="Tìm ứng viên theo tin"
        subtitle="Mỗi lượt tìm gợi ý tối đa 10 ứng viên phù hợp với một tin đang hiển thị."
      />
      {published.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-page p-4">
          <p className="text-text-body">Chưa có tin nào đang hiển thị. Đăng tin để bắt đầu mời ứng viên.</p>
          <DashButton href="/employer/jobs/new" icon="plus" size="sm">
            Đăng tin mới
          </DashButton>
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {published.map((job) => (
            <OutreachJobRow key={job.jobPostId} job={job} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function OutreachJobRow({ job }: { job: OutreachJobSummary }) {
  const { invitations } = job;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <Link
          href={`/employer/jobs/${job.jobPostId}`}
          className="font-semibold break-words text-text-strong hover:text-brand-700 hover:underline"
        >
          {job.title}
        </Link>
        <p className="text-text-muted">
          {formatDeadline(job.expiresAt)} · Đã mời <Num value={invitations.total} /> · Chấp nhận{" "}
          <Num value={invitations.accepted} /> · Đang chờ <Num value={invitations.pending} />
        </p>
        {job.isOwner ? null : (
          <p className="text-text-muted">
            Chỉ người đăng tin mới tìm và mời được.
          </p>
        )}
      </div>
      {job.isOwner ? (
        <DashButton href={`/employer/jobs/${job.jobPostId}/candidate-search`} variant="secondary" size="sm" icon="search">
          Tìm ứng viên
        </DashButton>
      ) : (
        <DashButton variant="secondary" size="sm" icon="lock" disabled>
          Tìm ứng viên
        </DashButton>
      )}
    </li>
  );
}

function Num({ value }: { value: number }) {
  return <span className="font-num font-bold tabular-nums text-text-strong">{formatNumber(value)}</span>;
}

// ─── Lời mời đã gửi ────────────────────────────────────────────────────────

const STATUS_ORDER: OutreachInvitationStatus[] = ["PENDING", "ACCEPTED", "DECLINED", "EXPIRED"];
const STATUS_OPTIONS: ChipOption<OutreachInvitationStatus | "ALL">[] = [
  { value: "ALL", label: "Tất cả" },
  ...STATUS_ORDER.map((status) => ({ value: status, label: INVITATION_STATUS_LABEL[status].label })),
];
const SCOPE_OPTIONS: ChipOption<"all" | "mine">[] = [
  { value: "all", label: "Cả công ty" },
  { value: "mine", label: "Bạn gửi" },
];
const INVITATIONS_TITLE_ID = "outreach-invitations-title";

export interface CompanyInvitationsPanelProps {
  filter: CompanyInvitationFilter;
  /** `summary.jobs` — undefined khi số liệu chưa tải xong (ô chọn tin chỉ có "Tất cả tin"). */
  jobs: OutreachJobSummary[] | undefined;
  onFilterChange: (patch: Partial<CompanyInvitationFilter>) => void;
  onReset: () => void;
}

export function CompanyInvitationsPanel({ filter, jobs, onFilterChange, onReset }: CompanyInvitationsPanelProps) {
  const query = useCompanyOutreachInvitations(filter);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = filter.status !== null || filter.jobPostId !== null || filter.mine;

  const jobOptions = [
    { value: "", label: "Tất cả tin" },
    ...(jobs ?? []).map((job) => ({
      value: job.jobPostId,
      label: job.status === "PUBLISHED" ? job.title : `${job.title} (${JOB_STATUS_LABEL[job.status].label})`,
    })),
  ];

  return (
    <Panel labelledBy={INVITATIONS_TITLE_ID}>
      <PanelHead
        as="h2"
        id={INVITATIONS_TITLE_ID}
        title="Lời mời đã gửi"
        subtitle="Mới nhất trước. Trạng thái tự cập nhật khi ứng viên trả lời."
      />

      <div className="flex flex-wrap items-center gap-3">
        <ChipGroup
          label="Lọc theo trạng thái"
          options={STATUS_OPTIONS}
          value={filter.status ?? "ALL"}
          onChange={(value) => onFilterChange({ status: value === "ALL" ? null : value })}
          className="flex-wrap"
        />
        <ChipGroup
          label="Người gửi"
          options={SCOPE_OPTIONS}
          value={filter.mine ? "mine" : "all"}
          onChange={(value) => onFilterChange({ mine: value === "mine" })}
        />
        <div className="w-full sm:w-72">
          <Select
            id="outreach-job-filter"
            aria-label="Lọc theo tin"
            size="sm"
            options={jobOptions}
            value={filter.jobPostId ?? ""}
            onChange={(event) => onFilterChange({ jobPostId: event.target.value || null })}
          />
        </div>
      </div>

      {query.isPending ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Đang tải lời mời">
          {[0, 1, 2].map((index) => (
            <BlockSkeleton key={index} height={112} />
          ))}
        </div>
      ) : query.isError && items.length === 0 ? (
        <BlockError what="danh sách lời mời" onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : items.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-page p-4">
          <p className="text-text-body">
            {filtered
              ? "Không có lời mời nào khớp bộ lọc."
              : "Bạn chưa gửi lời mời nào. Chọn một tin ở khối trên để tìm ứng viên phù hợp."}
          </p>
          {filtered ? (
            <DashButton variant="secondary" size="sm" icon="x" onClick={onReset}>
              Xoá bộ lọc
            </DashButton>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {items.map((invitation) => (
              <SentInvitationRow
                key={invitation.invitationId}
                invitation={invitation}
                jobPost={invitation.jobPost}
                sentByMe={invitation.sentByMe}
              />
            ))}
          </div>
          {query.isFetchNextPageError ? (
            <BlockError what="thêm lời mời" onRetry={() => void query.fetchNextPage()} retrying={query.isFetchingNextPage} />
          ) : query.hasNextPage ? (
            <DashButton
              variant="secondary"
              className="self-center"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Tải thêm
            </DashButton>
          ) : null}
        </>
      )}
    </Panel>
  );
}
