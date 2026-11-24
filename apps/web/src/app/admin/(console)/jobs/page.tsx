"use client";

import { Suspense, useCallback, useMemo, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { BulkModerationResult, JobPost, JobPostStatus, JobQualityBandFilter, ModerationQueueSort } from "@sip/shared-types";
import {
  fetchBulkModerationResult,
  useAdminJobPostIds,
  useAdminJobPostStats,
  useAdminJobPosts,
  useBulkModerateJobPosts,
} from "@/hooks/useJobPosts";
import { ApiError } from "@/lib/api-client";
import {
  BULK_MODERATION_LIMIT,
  JOB_QUALITY_BAND_LABEL,
  JOB_STATUS_LABEL,
  formatDate,
  topQualityIssues,
} from "@/lib/job-post-display";
import { formatNumber } from "@/lib/dashboard-format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import { StatCard } from "@/components/ui/StatCard";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { DashButton } from "@/components/dashboard/DashButton";
import { RowCheckbox, SelectionBar, TriStateCheckbox } from "@/components/interviews/SelectionBar";
import { JobQualityBadge } from "@/components/admin/JobQualityBadge";
import { JobQualityLegendButton } from "@/components/admin/JobQualityLegendDialog";
import {
  BulkApproveDialog,
  BulkRejectDialog,
  BulkResultDialog,
  type BulkSkippedItem,
} from "@/components/admin/JobBulkDialogs";

type StatusFilter = JobPostStatus | "ALL";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "PUBLISHED", label: "Đang hiển thị" },
  { value: "TAKEN_DOWN", label: "Đã hạ" },
  { value: "ALL", label: "Tất cả" },
];

/** Ô sắp xếp theo trạng thái; phần tử đầu là mặc định. Trạng thái khác không có ô sắp xếp. */
const SORT_OPTIONS: Partial<Record<StatusFilter, { value: ModerationQueueSort; label: string }[]>> = {
  PENDING: [
    { value: "submitted_asc", label: "Gửi trước" },
    { value: "score_desc", label: "Điểm cao nhất" },
    { value: "score_asc", label: "Điểm thấp nhất" },
  ],
  PUBLISHED: [
    { value: "created_desc", label: "Mới tạo trước" },
    { value: "score_asc", label: "Điểm thấp nhất" },
    { value: "score_desc", label: "Điểm cao nhất" },
  ],
};

/** Tab vùng khi lọc "Chờ duyệt"; `null` = Tất cả. "Chưa chấm" chỉ hiện khi có tin. */
const BAND_TABS: { value: JobQualityBandFilter | null; label: string }[] = [
  { value: "SUGGEST_APPROVE", label: JOB_QUALITY_BAND_LABEL.SUGGEST_APPROVE.label },
  { value: "NEEDS_REVIEW", label: JOB_QUALITY_BAND_LABEL.NEEDS_REVIEW.label },
  { value: "SUGGEST_REJECT", label: JOB_QUALITY_BAND_LABEL.SUGGEST_REJECT.label },
  { value: "UNSCORED", label: JOB_QUALITY_BAND_LABEL.UNSCORED.label },
  { value: null, label: "Tất cả" },
];

/** Tab có nút "Chọn tất cả tin trong vùng" (tab Cần xem kỹ không có, để Admin mở từng tin). */
const SELECT_ALL_BANDS: ReadonlySet<JobQualityBandFilter> = new Set(["SUGGEST_APPROVE", "SUGGEST_REJECT"]);

const EMPTY_TEXT: Record<JobQualityBandFilter | "ALL_PENDING" | "OTHER", string> = {
  SUGGEST_APPROVE: "Không có tin nào được đề xuất duyệt. Xem tab Cần xem kỹ để xử lý các tin còn lại.",
  NEEDS_REVIEW: "Không có tin nào cần xem kỹ.",
  SUGGEST_REJECT: "Không có tin nào bị đề xuất từ chối.",
  UNSCORED: "Mọi tin chờ duyệt đều đã có điểm.",
  ALL_PENDING: "Không có tin nào đang chờ duyệt.",
  OTHER: "Không có tin tuyển dụng nào ở trạng thái này.",
};

const LIST_ID = "admin-job-queue";
/** Lô chưa xong trong thời gian chờ của server: hỏi lại mỗi 2 giây, tối đa 30 giây. */
const BATCH_POLL_MS = 2000;
const BATCH_POLL_TRIES = 15;

function parseParams(search: URLSearchParams) {
  const rawStatus = search.get("status");
  const status: StatusFilter = FILTERS.some((f) => f.value === rawStatus) ? (rawStatus as StatusFilter) : "PENDING";
  const rawBand = search.get("band");
  const band =
    status === "PENDING" && rawBand && rawBand in JOB_QUALITY_BAND_LABEL ? (rawBand as JobQualityBandFilter) : null;
  const options = SORT_OPTIONS[status];
  const rawSort = search.get("sort");
  const sort = options?.some((o) => o.value === rawSort) ? (rawSort as ModerationQueueSort) : (options?.[0]?.value ?? null);
  return { status, band, sort };
}

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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AdminJobPostsPage() {
  // useSearchParams() cần Suspense boundary khi Next prerender route này.
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl px-6 py-12 text-sm text-text-muted">Đang tải...</div>}>
      <AdminJobQueue />
    </Suspense>
  );
}

/**
 * Hàng đợi kiểm duyệt tin (AD-29 F2 + F3, docs/05-frontend/phases/job-quality-moderation/PLAN.md):
 * tab vùng điểm khi lọc "Chờ duyệt", sắp xếp, "Xem thêm"; chọn nhiều tin rồi duyệt / từ chối một
 * lần. Trạng thái, vùng và sắp xếp nằm trên URL. Đổi bộ lọc thì bỏ chọn.
 */
function AdminJobQueue() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toasts, push, dismiss } = useToast();

  const search = searchParams.toString();
  const { status, band, sort } = useMemo(() => parseParams(new URLSearchParams(search)), [search]);
  const filterKey = `${status}|${band ?? ""}|${sort ?? ""}`;

  const query = useAdminJobPosts({ status, band: band ?? undefined, sort: sort ?? undefined });
  const { data: stats } = useAdminJobPostStats();
  const idsMutation = useAdminJobPostIds();
  const bulk = useBulkModerateJobPosts();

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? items.length;
  const pendingByBand = stats?.pendingByBand;

  // Chọn gắn với bộ lọc: đổi bộ lọc thì vùng chọn cũ không còn hiệu lực.
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: filterKey, ids: new Set() });
  const selectedIds = useMemo(
    () => (selection.key === filterKey ? selection.ids : new Set<string>()),
    [selection, filterKey],
  );
  const setSelectedIds = useCallback(
    (update: (prev: Set<string>) => Set<string>) =>
      setSelection((prev) => ({ key: filterKey, ids: update(prev.key === filterKey ? prev.ids : new Set()) })),
    [filterKey],
  );
  const clearSelection = useCallback(() => setSelection({ key: filterKey, ids: new Set() }), [filterKey]);

  const selectedJobs = useMemo(() => items.filter((job) => selectedIds.has(job.id)), [items, selectedIds]);
  const selectable = status === "PENDING";
  const pendingOnPage = useMemo(() => items.filter((job) => job.status === "PENDING"), [items]);
  const allOnPageSelected = pendingOnPage.length > 0 && pendingOnPage.every((job) => selectedIds.has(job.id));
  const someOnPageSelected = pendingOnPage.some((job) => selectedIds.has(job.id));

  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectKey, setRejectKey] = useState(0);
  const [result, setResult] = useState<{ action: "APPROVE" | "REJECT"; succeeded: number; skipped: BulkSkippedItem[] } | null>(
    null,
  );

  const navigate = useCallback(
    (next: { status: StatusFilter; band: JobQualityBandFilter | null; sort: ModerationQueueSort | null }) => {
      const params = new URLSearchParams();
      params.set("status", next.status);
      if (next.band) params.set("band", next.band);
      const defaultSort = SORT_OPTIONS[next.status]?.[0]?.value ?? null;
      if (next.sort && next.sort !== defaultSort) params.set("sort", next.sort);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

  function changeStatus(next: StatusFilter) {
    navigate({ status: next, band: null, sort: null });
  }

  async function selectAllInBand() {
    try {
      const res = await idsMutation.mutateAsync({ status, band: band ?? undefined, sort: sort ?? undefined });
      // Tải tiếp tới khi mọi tin được chọn đều có trên trang (tối đa 50 tin = 3 trang), để hộp
      // thoại hiện đủ tên và lý do của từng tin.
      const loaded = new Set(items.map((job) => job.id));
      let hasNext = query.hasNextPage;
      while (hasNext && res.ids.some((id) => !loaded.has(id))) {
        const next = await query.fetchNextPage();
        next.data?.pages.forEach((page) => page.items.forEach((job) => loaded.add(job.id)));
        hasNext = next.hasNextPage;
      }
      setSelectedIds(() => new Set(res.ids.filter((id) => loaded.has(id))));
      if (res.total > res.ids.length) {
        push("info", `Đã chọn ${res.ids.length} tin đầu tiên trong ${res.total} tin. Mỗi lần xử lý tối đa ${BULK_MODERATION_LIMIT} tin.`);
      }
    } catch (err) {
      push("danger", err instanceof ApiError ? err.message : "Không chọn được các tin, thử lại sau");
    }
  }

  async function runBulk(action: "APPROVE" | "REJECT", reason?: string) {
    const ids = selectedJobs.map((job) => job.id);
    const titles = new Map(selectedJobs.map((job) => [job.id, job.title]));
    setRejectError(null);
    let outcome: BulkModerationResult;
    try {
      outcome = await bulk.mutateAsync(
        action === "APPROVE" ? { action, ids } : reason ? { action, ids, reason } : { action, ids },
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Không thực hiện được, thử lại sau";
      if (action === "REJECT") setRejectError(message);
      else push("danger", message);
      return;
    }

    setDialog(null);
    clearSelection();
    // Lô chưa xong trong thời gian chờ thì phần còn lại chạy ở nền: hỏi lại tới khi xong.
    for (let i = 0; i < BATCH_POLL_TRIES && outcome.pending.length > 0; i++) {
      await wait(BATCH_POLL_MS);
      try {
        outcome = await fetchBulkModerationResult(outcome.batchId);
      } catch {
        break;
      }
    }
    void queryClient.invalidateQueries({ queryKey: ["adminJobPosts"] });
    void queryClient.invalidateQueries({ queryKey: ["adminJobPostStats"] });

    const verb = action === "APPROVE" ? "duyệt" : "từ chối";
    if (outcome.succeeded.length > 0) push("success", `Đã ${verb} ${outcome.succeeded.length} tin`);
    if (outcome.pending.length > 0) {
      push("info", `${outcome.pending.length} tin vẫn đang được xử lý. Tải lại trang sau ít phút để xem kết quả.`);
    }
    if (outcome.skipped.length > 0) {
      setResult({
        action,
        succeeded: outcome.succeeded.length,
        skipped: outcome.skipped.map((item) => ({ ...item, title: titles.get(item.id) ?? "Tin đã chọn" })),
      });
    }
  }

  const overLimit = selectedJobs.length > BULK_MODERATION_LIMIT;
  const sortOptions = SORT_OPTIONS[status];
  const showQuality = status === "PENDING" || status === "PUBLISHED";
  const bandTabs = BAND_TABS.filter(
    (tab) => tab.value !== "UNSCORED" || band === "UNSCORED" || (pendingByBand?.UNSCORED ?? 0) > 0,
  );

  function bandCount(value: JobQualityBandFilter | null): number | undefined {
    if (!stats) return undefined;
    return value === null ? stats.pending : pendingByBand?.[value];
  }

  function handleTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = bandTabs.findIndex((tab) => tab.value === band);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % bandTabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + bandTabs.length) % bandTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = bandTabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = bandTabs[next]!;
    navigate({ status, band: target.value, sort });
    document.getElementById(bandTabId(target.value))?.focus();
  }

  const emptyText =
    status === "PENDING" ? EMPTY_TEXT[band ?? "ALL_PENDING"] : EMPTY_TEXT.OTHER;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold text-text-strong">Kiểm duyệt tin tuyển dụng</h1>
          <p className="text-sm text-text-muted">Xem và xử lý các tin tuyển dụng cần kiểm duyệt.</p>
        </div>
        <JobQualityLegendButton size="md" />
      </div>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard icon="clock" label="Tin chờ duyệt" value={stats.pending} />
          <StatCard icon="briefcase" label="Tin đang hiển thị" value={stats.published} />
          <StatCard icon="archive" label="Tin đã kết thúc" value={stats.closed} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo trạng thái">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={status === f.value ? "primary" : "secondary"}
              size="sm"
              aria-pressed={status === f.value}
              onClick={() => changeStatus(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        {sortOptions && sort ? (
          <label className="flex items-center gap-2 text-sm whitespace-nowrap text-text-muted">
            Sắp xếp
            <Select
              size="sm"
              className="w-44"
              value={sort}
              options={sortOptions}
              onChange={(event) => navigate({ status, band, sort: event.target.value as ModerationQueueSort })}
            />
          </label>
        ) : null}
      </div>

      {status === "PENDING" ? (
        <div
          role="tablist"
          aria-label="Vùng điểm chất lượng"
          onKeyDown={handleTabKey}
          className="-mb-2 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border-subtle [scrollbar-width:none]"
        >
          {bandTabs.map((tab) => {
            const selected = tab.value === band;
            const count = bandCount(tab.value);
            return (
              <button
                key={tab.value ?? "ALL"}
                type="button"
                role="tab"
                id={bandTabId(tab.value)}
                aria-selected={selected}
                aria-controls={LIST_ID}
                tabIndex={selected ? 0 : -1}
                onClick={() => !selected && navigate({ status, band: tab.value, sort })}
                className={`-mb-px inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 text-sm font-bold whitespace-nowrap transition-colors duration-150 focus-visible:rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none ${
                  selected ? "border-brand-600 text-brand-700" : "border-transparent text-text-muted hover:text-text-strong"
                }`}
              >
                {tab.label}
                {count !== undefined ? (
                  <span className="inline-grid h-5 min-w-[22px] place-items-center rounded-full bg-surface-hover px-[7px] text-xs font-bold text-text-body tabular-nums">
                    {formatNumber(count)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <section id={LIST_ID} role={status === "PENDING" ? "tabpanel" : undefined} aria-labelledby={status === "PENDING" ? bandTabId(band) : undefined} className="grid gap-3">
        <h2 className="sr-only">
          Danh sách tin
        </h2>

        {selectable && pendingOnPage.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TriStateCheckbox
              checked={allOnPageSelected}
              indeterminate={someOnPageSelected && !allOnPageSelected}
              onChange={(checked) =>
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  for (const job of pendingOnPage) {
                    if (checked) next.add(job.id);
                    else next.delete(job.id);
                  }
                  return next;
                })
              }
              label={`Chọn ${pendingOnPage.length} tin đang hiện`}
              visibleLabel
            />
            {band && SELECT_ALL_BANDS.has(band) ? (
              <DashButton
                variant="secondary"
                size="sm"
                icon="list-checks"
                loading={idsMutation.isPending}
                onClick={() => void selectAllInBand()}
              >
                Chọn tất cả tin trong vùng
              </DashButton>
            ) : null}
          </div>
        ) : null}

        {query.isLoading ? (
          <p className="text-sm text-text-muted">Đang tải...</p>
        ) : query.isError ? (
          <Card padding="md" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-body">Không tải được danh sách tin.</p>
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              Thử lại
            </Button>
          </Card>
        ) : items.length === 0 ? (
          <Card padding="md">
            <p className="text-sm text-text-muted">{emptyText}</p>
          </Card>
        ) : (
          <>
            {items.map((job) => (
              <QueueRow
                key={job.id}
                job={job}
                showQuality={showQuality}
                selectable={selectable && job.status === "PENDING"}
                selected={selectedIds.has(job.id)}
                onSelect={(checked) =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(job.id);
                    else next.delete(job.id);
                    return next;
                  })
                }
              />
            ))}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <p className="text-sm text-text-muted" aria-live="polite">
                Đang hiện <span className="font-num tabular-nums">{formatNumber(items.length)}</span> /{" "}
                <span className="font-num tabular-nums">{formatNumber(total)}</span> tin
              </p>
              {query.hasNextPage ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  Xem thêm
                </Button>
              ) : null}
            </div>
          </>
        )}
      </section>

      {selectable ? (
        <SelectionBar
          count={selectedJobs.length}
          unit="tin"
          onClear={clearSelection}
          actions={
            <>
              {overLimit ? (
                <span className="flex items-center gap-1.5 text-[13px] text-brand-200">
                  <Icon name="info" size={14} />
                  Mỗi lần xử lý tối đa {BULK_MODERATION_LIMIT} tin
                </span>
              ) : null}
              <div className="flex flex-wrap gap-2 max-[480px]:basis-full">
                <DashButton
                  variant="light"
                  size="sm"
                  icon="check"
                  disabled={overLimit || bulk.isPending}
                  onClick={() => setDialog("approve")}
                  className="max-[480px]:flex-[1_1_auto] max-[480px]:justify-center"
                >
                  Duyệt {selectedJobs.length} tin
                </DashButton>
                <button
                  type="button"
                  disabled={overLimit || bulk.isPending}
                  onClick={() => {
                    setRejectError(null);
                    setRejectKey((key) => key + 1);
                    setDialog("reject");
                  }}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-red-300/50 bg-transparent px-3 text-[13px] font-semibold whitespace-nowrap text-red-200 transition-colors duration-150 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none max-[480px]:flex-[1_1_auto] max-[480px]:justify-center"
                >
                  <Icon name="x" size={14} />
                  Từ chối {selectedJobs.length} tin
                </button>
              </div>
            </>
          }
        />
      ) : null}

      <BulkApproveDialog
        open={dialog === "approve"}
        jobs={selectedJobs}
        busy={bulk.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => void runBulk("APPROVE")}
        onDeselect={(ids) => {
          const next = new Set(selectedIds);
          ids.forEach((id) => next.delete(id));
          setSelectedIds(() => next);
          if (next.size === 0) setDialog(null);
        }}
      />
      <BulkRejectDialog
        key={rejectKey}
        open={dialog === "reject"}
        jobs={selectedJobs}
        busy={bulk.isPending}
        error={rejectError}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => void runBulk("REJECT", reason)}
      />
      {result ? (
        <BulkResultDialog
          open
          action={result.action}
          succeeded={result.succeeded}
          skipped={result.skipped}
          onClose={() => setResult(null)}
        />
      ) : null}

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function bandTabId(band: JobQualityBandFilter | null): string {
  return `job-band-tab-${band ?? "ALL"}`;
}

function QueueRow({
  job,
  showQuality,
  selectable,
  selected,
  onSelect,
}: {
  job: JobPost;
  showQuality: boolean;
  selectable: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}) {
  const statusInfo = JOB_STATUS_LABEL[job.status];
  const issues = showQuality ? topQualityIssues(job.quality) : [];
  const flags = new Set(job.quality?.flags ?? []);
  const sentAt = job.submittedAt ?? job.createdAt;
  return (
    <Card
      padding="md"
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 ${selected ? "ring-2 ring-brand-300" : ""}`}
    >
      {selectable ? <RowCheckbox checked={selected} onChange={onSelect} label={job.title} /> : null}
      <div className="grid min-w-0 flex-1 basis-60 gap-1">
        <span className="font-medium text-text-strong">{job.title}</span>
        <span className="text-sm text-text-muted">
          {job.company.name} · {job.submittedAt ? "Gửi duyệt" : "Ngày tạo"}{" "}
          <span className="font-num tabular-nums">{formatDate(sentAt)}</span>
        </span>
        {issues.length > 0 ? (
          <ul className="grid gap-0.5 text-[13px]">
            {issues.map((issue) => (
              <li
                key={issue.code}
                className={`flex items-start gap-1.5 ${flags.has(issue.code) ? "font-semibold text-red-700" : "text-text-body"}`}
              >
                <Icon name={flags.has(issue.code) ? "triangle-alert" : "minus"} size={14} className="mt-0.5 shrink-0" />
                {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {showQuality ? <JobQualityBadge quality={job.quality} /> : null}
        {job.status !== "PENDING" ? <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge> : null}
        <Button as="a" href={`/admin/jobs/${job.id}`} variant="secondary" size="sm">
          {job.status === "PENDING" ? "Kiểm tra" : "Xem chi tiết"}
        </Button>
      </div>
    </Card>
  );
}
