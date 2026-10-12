"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AwaitingScheduleApplication, AwaitingScheduleJobCount, EmployerInterview } from "@sip/shared-types";
import { useAwaitingSchedulePage } from "@/hooks/useInterviews";
import { formatNumber } from "@/lib/dashboard-format";
import { Pagination } from "@/components/ui/Pagination";
import type { ToastData } from "@/components/ui/Toast";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { SegmentedControl } from "@/components/dashboard/admin/AdminPanel";
import { AwaitingJobDivider } from "./AwaitingJobDivider";
import { AwaitingScheduleRow } from "./AwaitingScheduleRow";
import { SelectionBar, TriStateCheckbox } from "./SelectionBar";
import { useInterviewScheduling } from "./useInterviewScheduling";
import type { InterviewsPageParams, useInterviewsPageParams } from "./useInterviewsPageParams";

type Notify = (tone: ToastData["tone"], message: string) => void;
type UpdateParams = ReturnType<typeof useInterviewsPageParams>["update"];

interface ScheduledEntry {
  interview: EmployerInterview;
  /** Lúc đặt lịch, so với `requestedAt` của dữ liệu để không trừ số đếm hai lần. */
  at: number;
}

/**
 * Trạng thái của tab "Chờ đặt lịch", đặt ở cấp trang để số trên tab đúng cả khi
 * đang xem tab kia: trang dữ liệu hiện tại, hồ sơ đang chọn (giữ qua trang và bộ
 * lọc), hồ sơ vừa đặt lịch và số hồ sơ chờ theo tin.
 *
 * D18: đặt lịch xong, hàng ở lại kèm nhãn và danh sách không tải lại; số chờ trên
 * tab và hàng nút lọc trừ ngay các hồ sơ vừa đặt (chỉ những hồ sơ đặt sau khi dữ
 * liệu được lấy, vì dữ liệu mới hơn đã không còn tính chúng).
 */
export function useAwaitingTab(params: InterviewsPageParams, notify: Notify) {
  const grouping = params.groupByJob && params.jobPostId === null;
  const query = useAwaitingSchedulePage({
    jobPostId: params.jobPostId ?? undefined,
    sort: params.sort,
    group: grouping,
    page: params.page,
  });
  const [selected, setSelected] = useState<Map<string, AwaitingScheduleApplication>>(() => new Map());
  const [scheduled, setScheduled] = useState<Record<string, ScheduledEntry>>({});

  const scheduling = useInterviewScheduling({
    notify,
    onScheduled: (created) => {
      const at = Date.now();
      setScheduled((prev) => ({
        ...prev,
        ...Object.fromEntries(created.map((interview) => [interview.applicationId, { interview, at }])),
      }));
      setSelected((prev) => {
        const next = new Map(prev);
        for (const interview of created) next.delete(interview.applicationId);
        return next;
      });
    },
  });

  const data = query.data;
  const scheduledSince = new Map<string, number>();
  for (const entry of Object.values(scheduled)) {
    if (data && entry.at > data.requestedAt) {
      const jobPostId = entry.interview.jobPostId;
      scheduledSince.set(jobPostId, (scheduledSince.get(jobPostId) ?? 0) + 1);
    }
  }
  const jobCounts: AwaitingScheduleJobCount[] = (data?.jobCounts ?? []).map((job) => ({
    ...job,
    count: Math.max(0, job.count - (scheduledSince.get(job.jobPostId) ?? 0)),
  }));
  const awaitingTotal = jobCounts.reduce((sum, job) => sum + job.count, 0);

  function toggle(items: AwaitingScheduleApplication[], checked: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const item of items) {
        if (checked) next.set(item.applicationId, item);
        else next.delete(item.applicationId);
      }
      return next;
    });
  }

  return {
    query,
    grouping,
    jobCounts,
    /** `null` khi chưa có dữ liệu. */
    awaitingTotal: data ? awaitingTotal : null,
    selected,
    scheduled,
    toggle,
    clearSelection: () => setSelected(new Map()),
    scheduling,
  };
}

type AwaitingTabState = ReturnType<typeof useAwaitingTab>;

interface JobRun {
  jobPostId: string;
  jobPostTitle: string;
  items: AwaitingScheduleApplication[];
}

/** Các hồ sơ liền nhau của cùng một tin trên trang (API đã xếp liền theo tin). */
function runsOf(items: AwaitingScheduleApplication[]): JobRun[] {
  const runs: JobRun[] = [];
  for (const item of items) {
    const last = runs.at(-1);
    if (last && last.jobPostId === item.jobPostId) last.items.push(item);
    else runs.push({ jobPostId: item.jobPostId, jobPostTitle: item.jobPostTitle, items: [item] });
  }
  return runs;
}

const SORT_OPTIONS = [
  { value: "oldest" as const, label: "Chờ lâu nhất trước" },
  { value: "newest" as const, label: "Chờ ngắn nhất trước" },
];
const DISPLAY_OPTIONS = [
  { value: "time" as const, label: "Theo thời gian" },
  { value: "job" as const, label: "Nhóm theo tin" },
];

/**
 * Tab "Chờ đặt lịch" (D16–D19): lọc theo tin, hiển thị theo thời gian hoặc nhóm
 * theo tin, sắp xếp theo thời gian chờ, 50 hồ sơ mỗi trang, chọn nhiều để lên
 * lịch hàng loạt.
 */
export function AwaitingScheduleTab({
  params,
  update,
  state,
}: {
  params: InterviewsPageParams;
  update: UpdateParams;
  state: AwaitingTabState;
}) {
  const { query, grouping, jobCounts, selected, scheduled, toggle, scheduling } = state;
  const data = query.data;
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const filterRefs = useRef(new Map<string, HTMLButtonElement>());
  const [pageAnnounced, setPageAnnounced] = useState(false);

  // Trang xin vượt trang cuối: API trả trang cuối, URL sửa theo.
  const returnedPage = data && !query.isPlaceholderData ? data.page : null;
  useEffect(() => {
    if (returnedPage !== null && returnedPage !== params.page) {
      update({ page: returnedPage === 1 ? null : String(returnedPage) }, "replace");
    }
  }, [returnedPage, params.page, update]);

  // "tiếp từ trang trước" cho nhóm đầu trang. Trang có nhiều nhóm thì nhóm đầu kết
  // thúc trên trang này, nên chỉ cần so số hồ sơ của tin với số trên trang. Cả trang
  // là một tin thì hỏi API hồ sơ cuối của trang trước (`pageSize=1`).
  const runs = grouping && data ? runsOf(data.items) : [];
  const firstRun = runs[0];
  const serverCountOf = (jobPostId: string) => data?.jobCounts.find((job) => job.jobPostId === jobPostId)?.count ?? 0;
  const needsProbe =
    data !== undefined &&
    !query.isPlaceholderData &&
    data.page > 1 &&
    runs.length === 1 &&
    firstRun !== undefined &&
    serverCountOf(firstRun.jobPostId) > firstRun.items.length;
  const probe = useAwaitingSchedulePage(
    { sort: params.sort, group: true, page: data ? (data.page - 1) * data.pageSize : 1, pageSize: 1 },
    needsProbe,
  );
  let firstContinued = false;
  if (data && firstRun && data.page > 1) {
    firstContinued =
      runs.length > 1
        ? serverCountOf(firstRun.jobPostId) > firstRun.items.length
        : needsProbe && !probe.isPlaceholderData && probe.data?.items[0]?.jobPostId === firstRun.jobPostId;
  }

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <BlockSkeleton height={40} />
        <BlockSkeleton height={420} />
      </div>
    );
  }
  if (query.isError || !data) {
    return <BlockError what="hồ sơ chờ đặt lịch" onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }

  const items = data.items;
  const open = items.filter((item) => !scheduled[item.applicationId]);
  const selectedOnPage = open.filter((item) => selected.has(item.applicationId)).length;
  const onPage = new Set(items.map((item) => item.applicationId));
  const elsewhereCount = [...selected.keys()].filter((id) => !onPage.has(id)).length;
  const selectedJobCount = new Set([...selected.values()].map((item) => item.jobPostId)).size;
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  const from = (data.page - 1) * data.pageSize + 1;
  const to = from + items.length - 1;
  const countOf = (jobPostId: string) => jobCounts.find((job) => job.jobPostId === jobPostId)?.count ?? 0;

  // Nút lọc: tin còn hồ sơ chờ, cộng tin đang lọc (kể cả khi đã về 0).
  const filterJobs = jobCounts.filter((job) => job.count > 0 || job.jobPostId === params.jobPostId);
  if (params.jobPostId && !filterJobs.some((job) => job.jobPostId === params.jobPostId)) {
    filterJobs.push({
      jobPostId: params.jobPostId,
      jobPostTitle: items[0]?.jobPostTitle ?? selectedTitleOf(selected, params.jobPostId) ?? "Tin đang lọc",
      count: 0,
    });
  }
  const allCount = jobCounts.reduce((sum, job) => sum + job.count, 0);

  function setJob(jobPostId: string | null) {
    update({ job: jobPostId, page: null }, "replace");
  }

  function goToPage(page: number) {
    update({ page: page === 1 ? null : String(page) }, "push");
    setPageAnnounced(true);
    const summary = summaryRef.current;
    if (summary) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      summary.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
      summary.focus({ preventScroll: true });
    }
  }

  function onlyThisJob(jobPostId: string) {
    setJob(jobPostId);
    filterRefs.current.get(jobPostId)?.focus();
  }

  const renderRow = (item: AwaitingScheduleApplication, showJob: boolean) => (
    <AwaitingScheduleRow
      key={item.applicationId}
      item={item}
      showJob={showJob}
      selected={selected.has(item.applicationId)}
      scheduled={scheduled[item.applicationId]?.interview}
      onToggle={(checked) => toggle([item], checked)}
      onSchedule={() => scheduling.start([item])}
    />
  );

  const filterButtonClass = (pressed: boolean) =>
    `inline-flex h-9 max-w-full cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none ${
      pressed
        ? "border-brand-300 bg-brand-50 text-brand-700"
        : "border-border-default bg-surface-card text-text-body hover:bg-surface-hover"
    }`;

  return (
    <div className="flex flex-col gap-4">
      {allCount > 0 || params.jobPostId ? (
        <div role="group" aria-label="Lọc theo tin tuyển dụng" className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={params.jobPostId === null}
            onClick={() => setJob(null)}
            className={filterButtonClass(params.jobPostId === null)}
          >
            Tất cả
            <span className="font-num tabular-nums">{formatNumber(allCount)}</span>
          </button>
          {filterJobs.map((job) => {
            const pressed = job.jobPostId === params.jobPostId;
            return (
              <button
                key={job.jobPostId}
                ref={(element) => {
                  if (element) filterRefs.current.set(job.jobPostId, element);
                  else filterRefs.current.delete(job.jobPostId);
                }}
                type="button"
                aria-pressed={pressed}
                onClick={() => setJob(job.jobPostId)}
                className={filterButtonClass(pressed)}
              >
                <span className="max-w-[260px] truncate" title={job.jobPostTitle}>
                  {job.jobPostTitle}
                </span>
                <span className="font-num tabular-nums">{formatNumber(job.count)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {data.total > 0 ? (
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {params.jobPostId === null ? (
            <ToolbarControl label="Hiển thị">
              <SegmentedControl
                label="Hiển thị"
                size="md"
                fullWidth
                options={DISPLAY_OPTIONS}
                value={grouping ? "job" : "time"}
                onChange={(value) => update({ group: value === "job" ? "job" : null, page: null }, "replace")}
              />
            </ToolbarControl>
          ) : null}
          <ToolbarControl label="Sắp xếp">
            <SegmentedControl
              label="Sắp xếp"
              size="md"
              fullWidth
              options={SORT_OPTIONS}
              value={params.sort}
              onChange={(value) => update({ sort: value === "newest" ? "new" : null, page: null }, "replace")}
            />
          </ToolbarControl>
        </div>
      ) : null}

      <section
        aria-label="Hồ sơ chờ đặt lịch"
        className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-card p-4 text-sm"
      >
        {data.total === 0 ? (
          <div className="py-6 text-center">
            <p className="font-semibold text-text-strong">
              {params.jobPostId ? "Tin này chưa có hồ sơ nào chờ đặt lịch" : "Chưa có hồ sơ nào chờ đặt lịch"}
            </p>
            <p className="mt-1 text-text-muted">
              Hồ sơ bạn chuyển sang Lọt vào vòng trong sẽ hiện ở đây để đặt lịch phỏng vấn.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2 text-text-muted">
              <TriStateCheckbox
                visibleLabel
                label={`Chọn tất cả ${open.length} hồ sơ trên trang này`}
                checked={open.length > 0 && selectedOnPage === open.length}
                indeterminate={selectedOnPage > 0 && selectedOnPage < open.length}
                disabled={open.length === 0 || query.isPlaceholderData}
                onChange={(checked) => toggle(open, checked)}
              />
              <p ref={summaryRef} tabIndex={-1} className="scroll-mt-24 rounded-md outline-brand-500 focus-visible:outline-2">
                Hồ sơ{" "}
                <span className="font-num tabular-nums">
                  {formatNumber(from)}–{formatNumber(to)}
                </span>{" "}
                trên <span className="font-num tabular-nums">{formatNumber(data.total)}</span>
              </p>
            </div>

            <div
              aria-busy={query.isPlaceholderData || undefined}
              className={`flex flex-col gap-4 transition-opacity duration-200 motion-reduce:transition-none ${
                query.isPlaceholderData ? "opacity-55" : ""
              }`}
            >
              {grouping ? (
                runs.map((run, index) => {
                  const headingId = `awaiting-job-${data.page}-${index}`;
                  const runOpen = run.items.filter((item) => !scheduled[item.applicationId]);
                  const runSelected = runOpen.filter((item) => selected.has(item.applicationId)).length;
                  return (
                    <section key={`${run.jobPostId}-${index}`} aria-labelledby={headingId} className="flex flex-col gap-2">
                      <AwaitingJobDivider
                        headingId={headingId}
                        jobTitle={run.jobPostTitle}
                        count={countOf(run.jobPostId)}
                        continued={index === 0 && firstContinued}
                        checked={runOpen.length > 0 && runSelected === runOpen.length}
                        indeterminate={runSelected > 0 && runSelected < runOpen.length}
                        disabled={runOpen.length === 0 || query.isPlaceholderData}
                        onToggle={(checked) => toggle(runOpen, checked)}
                        onOnlyThisJob={() => onlyThisJob(run.jobPostId)}
                      />
                      <ul className="flex flex-col gap-2">{run.items.map((item) => renderRow(item, false))}</ul>
                    </section>
                  );
                })
              ) : (
                <ul className="flex flex-col gap-2">{items.map((item) => renderRow(item, true))}</ul>
              )}
            </div>

            <Pagination
              page={data.page}
              pageCount={pageCount}
              onChange={goToPage}
              label="Phân trang hồ sơ chờ đặt lịch"
              className="mt-2"
            />
          </>
        )}
        <p className="sr-only" aria-live="polite">
          {pageAnnounced && !query.isPlaceholderData ? `Trang ${data.page}` : ""}
        </p>

        <SelectionBar
          count={selected.size}
          jobCount={selectedJobCount}
          elsewhereCount={elsewhereCount}
          onClear={state.clearSelection}
          onSchedule={() => scheduling.start([...selected.values()])}
        />
      </section>
      {scheduling.dialogs}
    </div>
  );
}

function selectedTitleOf(selected: ReadonlyMap<string, AwaitingScheduleApplication>, jobPostId: string) {
  for (const item of selected.values()) if (item.jobPostId === jobPostId) return item.jobPostTitle;
  return undefined;
}

/** Nhãn chữ nhỏ bên trái nút gạt; điện thoại: nhãn ở trên, nút giãn hết ngang. */
function ToolbarControl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 max-[720px]:w-full max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:gap-1">
      <span aria-hidden className="text-[13px] text-text-muted">
        {label}
      </span>
      <div className="min-[721px]:w-fit">{children}</div>
    </div>
  );
}
