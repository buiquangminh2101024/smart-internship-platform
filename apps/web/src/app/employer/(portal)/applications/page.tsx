"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  ApplicationStatus,
  AwaitingScheduleApplication,
  BulkApplicationTargetStatus,
  BulkUpdateApplicationStatusResult,
  EmployerApplicationListItem,
  EmployerApplicationsFocus,
  EmployerInterview,
} from "@sip/shared-types";
import { ApiError } from "@/lib/api-client";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABEL, isFinalApplicationStatus } from "@/lib/application-status";
import { formatNumber, formatVnDayMonth, formatVnTime } from "@/lib/dashboard-format";
import {
  COMPANY_APPLICATIONS_KEY,
  useBulkUpdateApplicationStatus,
  useCompanyApplications,
  useUpdateApplicationStatus,
} from "@/hooks/useApplications";
import { EMPLOYER_DASHBOARD_KEY } from "@/hooks/useEmployerDashboard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Pagination } from "@/components/ui/Pagination";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { DashButton } from "@/components/dashboard/DashButton";
import { SelectionBar, TriStateCheckbox } from "@/components/interviews/SelectionBar";
import { useInterviewScheduling } from "@/components/interviews/useInterviewScheduling";
import {
  ApplicationCard,
  ApplicationTableRow,
  candidateName,
  type ApplicationRowProps,
  type RowAction,
} from "@/components/applications/ApplicationRow";
import { ApplicationBulkActions, type BulkAction, type BulkCounts } from "@/components/applications/ApplicationBulkActions";
import { ApplicationsToolbar } from "@/components/applications/ApplicationsToolbar";
import { defaultSortFor, useApplicationsPageParams } from "@/components/applications/useApplicationsPageParams";

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

type TabValue = ApplicationStatus | null;

const TABS: { value: TabValue; label: string }[] = [
  { value: null, label: "Tất cả" },
  ...APPLICATION_STATUSES.map((status) => ({ value: status, label: APPLICATION_STATUS_LABEL[status].label })),
];

const tabId = (tab: TabValue) => `applications-tab-${tab ?? "all"}`;
const PANEL_ID = "applications-panel";
const FOCUS_HEADING_ID = "applications-focus-heading";

/** Nhóm gợi ý (AD-25): dòng trên dải gợi ý, tiêu đề và câu giải thích khi đang xem nhóm. */
const FOCUS_META: Record<
  EmployerApplicationsFocus,
  { strip: (count: string) => string; title: string; text: string; empty: string }
> = {
  reject: {
    strip: (count) => `${count} hồ sơ dưới ngưỡng, hệ thống đề xuất từ chối`,
    title: "Đề xuất từ chối",
    text: "Hồ sơ Chờ duyệt có điểm dưới ngưỡng đề xuất từ chối của tin. Hệ thống không tự từ chối: bạn xem lại rồi xác nhận.",
    empty: "Không còn hồ sơ nào được đề xuất từ chối.",
  },
  result: {
    strip: (count) => `${count} ứng viên đã phỏng vấn, chưa có kết quả`,
    title: "Cần kết quả phỏng vấn",
    text: "Ứng viên đã phỏng vấn, không còn lịch sắp tới và chưa có kết quả.",
    empty: "Không có ứng viên nào đang chờ kết quả phỏng vấn.",
  },
};

const FOCUS_ORDER: EmployerApplicationsFocus[] = ["reject", "result"];

/** Thanh thao tác ở nhóm đề xuất từ chối: chỉ từ chối, hoặc giữ lại để xem thêm. */
const REJECT_FOCUS_ACTIONS: BulkAction[] = ["REJECTED", "REVIEWING"];

type SingleTarget = "REVIEWING" | "SHORTLISTED" | "ACCEPTED" | "REJECTED";

/** Nhãn xanh ở lại trên hàng sau thao tác (như D18). */
const DONE_NOTE: Record<SingleTarget, string> = {
  REVIEWING: "Đã chuyển sang Đang xem xét",
  SHORTLISTED: "Đã chuyển sang Vào danh sách rút gọn",
  ACCEPTED: "Đã chuyển sang Được nhận",
  REJECTED: "Đã từ chối",
};

const SKIP_REASON: Record<BulkUpdateApplicationStatusResult["skipped"][number]["reason"], string> = {
  STATUS_CHANGED: "vì trạng thái vừa thay đổi",
  INVALID_TRANSITION: "vì trạng thái hiện tại không cho phép",
  NOT_FOUND: "vì không còn tồn tại",
};

function singleDoneMessage(to: SingleTarget, name: string): string {
  return to === "REJECTED"
    ? `Đã từ chối hồ sơ của ${name}.`
    : `Đã chuyển hồ sơ của ${name} sang ${APPLICATION_STATUS_LABEL[to].label}.`;
}

/** D7: số hồ sơ đã đổi, rồi số hồ sơ bị bỏ qua theo từng lý do. */
function bulkDoneMessage(to: BulkApplicationTargetStatus, result: BulkUpdateApplicationStatusResult): string {
  const count = result.updated.length;
  const parts = [
    count === 0
      ? "Không hồ sơ nào được đổi."
      : to === "REJECTED"
        ? `Đã từ chối ${count} hồ sơ.`
        : `Đã chuyển ${count} hồ sơ sang ${APPLICATION_STATUS_LABEL[to].label}.`,
  ];
  const byReason = new Map<keyof typeof SKIP_REASON, number>();
  for (const { reason } of result.skipped) byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  for (const [reason, skipped] of byReason) parts.push(`${skipped} hồ sơ không đổi được ${SKIP_REASON[reason]}.`);
  if (result.skipped.length > 0) parts.push("Tải lại trang để xem trạng thái mới.");
  return parts.join(" ");
}

function statusErrorMessage(err: unknown, name: string): string {
  // 409: server đã gửi câu tiếng Việt ("Trạng thái hồ sơ vừa được thay đổi…").
  if (err instanceof ApiError && err.status === 409) return err.message;
  if (err instanceof ApiError && (err.status === 400 || err.status === 404)) {
    return `Hồ sơ của ${name} đã đổi trạng thái hoặc không còn. Tải lại trang để xem trạng thái mới.`;
  }
  return "Không cập nhật được hồ sơ. Kiểm tra kết nối rồi thử lại.";
}

/** Hàng được hộp thoại đặt lịch dùng chung với trang Lịch phỏng vấn. */
function toAwaiting(item: EmployerApplicationListItem): AwaitingScheduleApplication {
  return {
    applicationId: item.applicationId,
    status: item.status === "INTERVIEWING" ? "INTERVIEWING" : "SHORTLISTED",
    candidateName: item.candidate.fullName,
    candidateAvatarUrl: item.candidate.avatarUrl,
    jobPostId: item.jobPost.id,
    jobPostTitle: item.jobPost.title,
    // API danh sách không trả lúc vào trạng thái hiện tại; hộp thoại không hiện mốc này.
    waitingSince: item.appliedAt,
  };
}

/** Trạng thái mới của một hồ sơ vừa thao tác trong phiên. */
interface Handled {
  status: ApplicationStatus;
  awaitingSchedule: boolean;
  nextInterviewAt: string | null;
  note: string;
}

/**
 * Trạng thái gắn với một tổ hợp tab / bộ lọc / sắp xếp / trang (`key`). Đổi tổ
 * hợp ⇒ bỏ chọn và bỏ nhãn (D2, D18). `frozen`: danh sách lúc thao tác đầu tiên —
 * hàng vừa xử lý ở lại tại chỗ trong khi số trên tab được tải lại.
 */
interface ViewState {
  key: string;
  frozen: EmployerApplicationListItem[] | null;
  handled: Record<string, Handled>;
  selected: ReadonlySet<string>;
  /** Nhóm đề xuất từ chối: đã chọn sẵn mọi hồ sơ của trang chưa (một lần mỗi tổ hợp). */
  seeded: boolean;
}

function emptyView(key: string): ViewState {
  return { key, frozen: null, handled: {}, selected: new Set(), seeded: false };
}

function handledFor(item: EmployerApplicationListItem, to: SingleTarget): Handled {
  const final = to === "REJECTED" || to === "ACCEPTED";
  return {
    status: to,
    awaitingSchedule: to === "SHORTLISTED",
    // Từ chối / nhận: server huỷ lịch sắp tới (H3).
    nextInterviewAt: final ? null : item.nextInterviewAt,
    note: DONE_NOTE[to],
  };
}

type Rejecting = { kind: "single"; item: EmployerApplicationListItem } | { kind: "bulk"; items: EmployerApplicationListItem[] };

/** Trang "Ứng viên": hồ sơ của mọi tin của công ty — docs/05-frontend/phases/employer-applications/PLAN.md. */
export default function EmployerApplicationsPage() {
  // useSearchParams() cần Suspense boundary khi Next prerender route này.
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1240px] p-4 sm:p-6">
          <BlockSkeleton height={480} />
        </div>
      }
    >
      <ApplicationsPageContent />
    </Suspense>
  );
}

function ApplicationsPageContent() {
  const { query, update } = useApplicationsPageParams();
  const { toasts, push, dismiss } = useToast();
  const queryClient = useQueryClient();
  const list = useCompanyApplications(query);
  const updateStatus = useUpdateApplicationStatus();
  const bulkUpdate = useBulkUpdateApplicationStatus();
  const data = list.data;

  const viewKey = JSON.stringify(query);
  const [viewState, setViewState] = useState<ViewState>(() => emptyView(viewKey));
  const view = viewState.key === viewKey ? viewState : emptyView(viewKey);
  // Thao tác xong sau khi người dùng đã đổi tab / trang thì không ghi nhãn vào tổ hợp mới.
  const viewKeyRef = useRef(viewKey);
  useEffect(() => {
    viewKeyRef.current = viewKey;
  }, [viewKey]);

  const [busy, setBusy] = useState<{ id: string; action: RowAction | "REJECTED" } | null>(null);
  const [bulkBusy, setBulkBusy] = useState<BulkAction | null>(null);
  const [rejecting, setRejecting] = useState<Rejecting | null>(null);
  const [pageAnnounced, setPageAnnounced] = useState(false);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const summaryRef = useRef<HTMLParagraphElement>(null);

  // Trang xin vượt trang cuối: API trả trang cuối, URL sửa theo.
  const returnedPage = data && !list.isPlaceholderData ? data.page : null;
  useEffect(() => {
    if (returnedPage !== null && returnedPage !== query.page) {
      update({ page: returnedPage === 1 ? null : String(returnedPage) }, "replace");
    }
  }, [returnedPage, query.page, update]);

  // `job` trên URL không phải tin của công ty (404): bỏ qua như giá trị lạ.
  const jobNotFound = list.error instanceof ApiError && list.error.status === 404 && query.jobPostId !== null;
  useEffect(() => {
    if (jobNotFound) update({ job: null, page: null }, "replace");
  }, [jobNotFound, update]);

  const baseItems = view.frozen ?? data?.items ?? [];
  const rows = baseItems.map((item) => {
    const handled = view.handled[item.applicationId];
    return handled
      ? {
          ...item,
          status: handled.status,
          awaitingSchedule: handled.awaitingSchedule,
          nextInterviewAt: handled.nextInterviewAt,
          // Người dùng vừa đổi: không còn là lần đổi của hệ thống, cũng không còn chờ kết quả.
          changedBySystem: false,
          needsResult: false,
        }
      : item;
  });
  const locked = list.isPlaceholderData;
  const selectable = rows.filter((row) => !isFinalApplicationStatus(row.status));
  const selectedRows = selectable.filter((row) => view.selected.has(row.applicationId));
  const awaitingSelected = selectedRows.filter((row) => row.awaitingSchedule);
  // Nhóm đề xuất từ chối: mọi hồ sơ trên trang được chọn sẵn, bỏ chọn từng dòng được (F2).
  // Đặt state ngay trong lúc render (không qua effect), một lần mỗi tổ hợp.
  if (query.focus === "reject" && data && !list.isPlaceholderData && !view.frozen && !view.seeded) {
    setViewState({
      ...view,
      seeded: true,
      selected: new Set(
        data.items.filter((item) => !isFinalApplicationStatus(item.status)).map((item) => item.applicationId),
      ),
    });
  }
  const bulkCounts: BulkCounts = {
    REVIEWING: selectedRows.filter((row) => row.status === "PENDING").length,
    SHORTLISTED: selectedRows.filter((row) => row.status === "REVIEWING").length,
    SCHEDULE: awaitingSelected.length,
    REJECTED: selectedRows.length,
  };

  function patchView(key: string, change: (view: ViewState) => ViewState) {
    if (key !== viewKeyRef.current) return;
    setViewState((prev) => change(prev.key === key ? prev : emptyView(key)));
  }

  function toggle(items: EmployerApplicationListItem[], checked: boolean) {
    patchView(viewKey, (current) => {
      const selected = new Set(current.selected);
      for (const item of items) {
        if (checked) selected.add(item.applicationId);
        else selected.delete(item.applicationId);
      }
      return { ...current, selected };
    });
  }

  function markHandled(key: string, snapshot: EmployerApplicationListItem[], entries: [string, Handled][]) {
    patchView(key, (current) => {
      const selected = new Set(current.selected);
      for (const [id] of entries) selected.delete(id);
      return {
        ...current,
        frozen: current.frozen ?? snapshot,
        handled: { ...current.handled, ...Object.fromEntries(entries) },
        selected,
      };
    });
  }

  /** Số trên menu và dashboard đúng ngay; danh sách tải lại qua hook. */
  function refreshCounts() {
    void queryClient.invalidateQueries({ queryKey: [...EMPLOYER_DASHBOARD_KEY, "overview"] });
  }

  const scheduling = useInterviewScheduling({
    notify: push,
    onScheduled: (interviews: EmployerInterview[]) => {
      markHandled(
        viewKey,
        data?.items ?? [],
        interviews.map((interview) => [
          interview.applicationId,
          {
            status: "INTERVIEWING",
            awaitingSchedule: false,
            nextInterviewAt: interview.scheduledAt,
            note: `Đã đặt lịch ${formatVnDayMonth(interview.scheduledAt)} · ${formatVnTime(interview.scheduledAt)}`,
          },
        ]),
      );
      void queryClient.invalidateQueries({ queryKey: COMPANY_APPLICATIONS_KEY });
      refreshCounts();
    },
  });

  async function changeOne(item: EmployerApplicationListItem, to: SingleTarget) {
    const key = viewKey;
    const snapshot = data?.items ?? [];
    const name = candidateName(item);
    setBusy({ id: item.applicationId, action: to });
    try {
      await updateStatus.mutateAsync({ id: item.applicationId, data: { status: to } });
      markHandled(key, snapshot, [[item.applicationId, handledFor(item, to)]]);
      push("success", singleDoneMessage(to, name));
      refreshCounts();
    } catch (err) {
      push("danger", statusErrorMessage(err, name));
    } finally {
      setBusy(null);
      setRejecting(null);
    }
  }

  async function changeMany(items: EmployerApplicationListItem[], to: BulkApplicationTargetStatus) {
    const key = viewKey;
    const snapshot = data?.items ?? [];
    const byId = new Map(items.map((item) => [item.applicationId, item]));
    setBulkBusy(to);
    try {
      const result = await bulkUpdate.mutateAsync({ applicationIds: items.map((item) => item.applicationId), status: to });
      markHandled(
        key,
        snapshot,
        result.updated.flatMap((id) => {
          const item = byId.get(id);
          return item ? [[id, handledFor(item, to)] as [string, Handled]] : [];
        }),
      );
      push(result.updated.length > 0 ? "success" : "danger", bulkDoneMessage(to, result));
      refreshCounts();
    } catch {
      push("danger", "Không cập nhật được hồ sơ. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setBulkBusy(null);
      setRejecting(null);
    }
  }

  function rowAction(item: EmployerApplicationListItem, action: RowAction) {
    if (action === "SCHEDULE") scheduling.start([toAwaiting(item)]);
    else void changeOne(item, action);
  }

  function bulkAction(action: BulkAction) {
    if (action === "REVIEWING") void changeMany(selectedRows.filter((row) => row.status === "PENDING"), "REVIEWING");
    else if (action === "SHORTLISTED") void changeMany(selectedRows.filter((row) => row.status === "REVIEWING"), "SHORTLISTED");
    else if (action === "SCHEDULE") scheduling.start(awaitingSelected.map(toAwaiting));
    else setRejecting({ kind: "bulk", items: selectedRows });
  }

  function selectTab(tab: TabValue) {
    if (tab === query.status) return;
    update({ status: tab, page: null }, "push");
  }

  /** Đổi nhóm gợi ý: về trang 1, sắp xếp về mặc định; khoá tổ hợp đổi nên bỏ chọn. */
  function selectFocus(focus: EmployerApplicationsFocus | null) {
    update({ focus, status: null, sort: null, page: null }, "push");
  }

  /** Nhóm đề xuất từ chối: xử lý xong trang đang giữ ⇒ tải lại từ trang 1 và chọn sẵn lại. */
  function nextSuggested() {
    setViewState(emptyView(viewKey));
    if (query.page !== 1) update({ page: null }, "push");
  }

  function handleTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.value === query.status);
    const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!.value;
    selectTab(next);
    tabRefs.current.get(tabId(next))?.focus();
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

  const header = (subtitle: string | null) => (
    <header>
      <h1 className="text-[28px] leading-[1.3] font-bold text-text-strong">Ứng viên</h1>
      <p className="mt-1 min-h-[1.5em] text-text-muted">{subtitle}</p>
    </header>
  );

  const shell = "mx-auto flex w-full max-w-[1240px] flex-col gap-5 p-4 text-sm text-text-body sm:p-6";

  if (list.isPending || jobNotFound) {
    return (
      <div className={shell}>
        {header(null)}
        <BlockSkeleton height={44} />
        <BlockSkeleton height={40} />
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <BlockSkeleton key={index} height={64} />
          ))}
        </div>
      </div>
    );
  }
  if (list.isError || !data) {
    return (
      <div className={shell}>
        {header(null)}
        <BlockError what="danh sách hồ sơ" onRetry={() => void list.refetch()} retrying={list.isFetching} />
      </div>
    );
  }

  const allCount = APPLICATION_STATUSES.reduce((sum, status) => sum + data.statusCounts[status], 0);
  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));
  const from = (data.page - 1) * data.pageSize + 1;
  const to = from + rows.length - 1;
  const showJob = query.jobPostId === null;
  const selectedOnPage = selectedRows.length;
  const jobTitle = rows.find((row) => row.jobPost.id === query.jobPostId)?.jobPost.title;

  const rowProps = (item: EmployerApplicationListItem): ApplicationRowProps => ({
    item,
    note: view.handled[item.applicationId]?.note,
    showJob,
    highlightWait: query.status === "PENDING",
    selected: view.selected.has(item.applicationId),
    locked,
    busy: busy?.id === item.applicationId ? busy.action : null,
    focus: query.focus,
    onToggle: (checked) => toggle([item], checked),
    onAction: (action) => rowAction(item, action),
    onReject: () => setRejecting({ kind: "single", item }),
  });

  let empty: { title: string; text?: string; action?: "new-job" | "clear" | "exit-focus" } | null = null;
  if (data.total === 0) {
    if (query.q && allCount === 0) {
      empty = {
        title: `Không tìm thấy hồ sơ khớp “${query.q}”.`,
        text: "Thử tên khác hoặc bỏ lọc theo tin.",
        action: "clear",
      };
    } else if (allCount === 0 && query.jobPostId) {
      empty = { title: "Tin này chưa có hồ sơ nào.", text: "Hồ sơ mới sẽ hiện ở đây khi ứng viên nộp." };
    } else if (allCount === 0) {
      empty = { title: "Chưa có hồ sơ nào.", text: "Hồ sơ mới sẽ hiện ở đây khi ứng viên nộp.", action: "new-job" };
    } else if (query.focus) {
      empty = { title: FOCUS_META[query.focus].empty, action: "exit-focus" };
    } else {
      empty = { title: `Không có hồ sơ ${query.status ? APPLICATION_STATUS_LABEL[query.status].label : ""}.` };
    }
  }

  // Nhóm đề xuất từ chối, sau khi đã xử lý ít nhất một hồ sơ và danh sách đã tải lại:
  // số hồ sơ còn được đề xuất mà không nằm trên trang đang giữ.
  const handledCount = Object.keys(view.handled).length;
  const unhandledSuggested = rows.filter(
    (row) => row.status === "PENDING" && view.handled[row.applicationId] === undefined,
  ).length;
  const suggestedLeft =
    query.focus === "reject" && handledCount > 0 && !list.isFetching ? Math.max(0, data.total - unhandledSuggested) : 0;
  const strip = query.focus === null ? FOCUS_ORDER.filter((focus) => data.focusCounts[focus] > 0) : [];

  const rejectCount = rejecting?.kind === "bulk" ? rejecting.items.length : 1;

  return (
    <div className={shell}>
      {header(`${formatNumber(allCount)} hồ sơ của ${formatNumber(data.jobCounts.length)} tin`)}

      {strip.length > 0 ? (
        // Dải gợi ý (AD-25): dòng chữ có nút, không phải thẻ số. Chỉ hiện nhóm có hồ sơ.
        <ul aria-label="Gợi ý xử lý hồ sơ" className="flex flex-col gap-2 lg:flex-row">
          {strip.map((focus) => (
            <li
              key={focus}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-l-[3px] border-border-subtle border-l-marigold-500 bg-surface-card py-2 pr-2 pl-3 lg:flex-[1_1_0]"
            >
              <span className="text-text-strong">{FOCUS_META[focus].strip(formatNumber(data.focusCounts[focus]))}</span>
              <DashButton variant="secondary" size="sm" iconAfter="arrow-right" onClick={() => selectFocus(focus)}>
                Xem
              </DashButton>
            </li>
          ))}
        </ul>
      ) : null}

      {query.focus ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-3">
          <div className="min-w-0 flex-[1_1_320px]">
            <h2 id={FOCUS_HEADING_ID} className="text-base font-bold text-text-strong">
              {FOCUS_META[query.focus].title}{" "}
              <span className="font-num tabular-nums text-text-muted">({formatNumber(data.total)})</span>
            </h2>
            <p className="mt-1 text-text-muted">{FOCUS_META[query.focus].text}</p>
          </div>
          <DashButton variant="secondary" size="sm" icon="x" onClick={() => selectFocus(null)}>
            Thoát
          </DashButton>
        </div>
      ) : (
        /* Bóng dưới thay cho border: vùng cuộn ngang cắt mất phần `-mb-px` của tab. */
        <div
          role="tablist"
          aria-label="Trạng thái hồ sơ"
          onKeyDown={handleTabKey}
          className="flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-border-subtle)]"
        >
          {TABS.map((tab) => {
            const isSelected = tab.value === query.status;
            const count = tab.value === null ? allCount : data.statusCounts[tab.value];
            const attention = tab.value === "PENDING" && count > 0;
            return (
              <button
                key={tab.value ?? "all"}
                ref={(element) => {
                  if (element) tabRefs.current.set(tabId(tab.value), element);
                  else tabRefs.current.delete(tabId(tab.value));
                }}
                type="button"
                role="tab"
                id={tabId(tab.value)}
                aria-selected={isSelected}
                aria-controls={PANEL_ID}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => selectTab(tab.value)}
                className={`relative inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 text-sm font-bold whitespace-nowrap transition-colors duration-150 focus-visible:rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none ${
                  isSelected ? "border-brand-600 text-brand-700" : "border-transparent text-text-muted hover:text-text-strong"
                }`}
              >
                {tab.label}
                <span
                  className={`inline-grid h-[22px] min-w-[26px] place-items-center rounded-full px-2 font-num text-[13px] font-bold tabular-nums ${
                    attention
                      ? "bg-marigold-100 text-marigold-800"
                      : isSelected
                        ? "bg-brand-100 text-brand-700"
                        : "bg-surface-hover text-text-muted"
                  }`}
                >
                  <span className="sr-only">: </span>
                  {formatNumber(count)}
                  <span className="sr-only"> hồ sơ</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div
        role={query.focus ? "region" : "tabpanel"}
        id={PANEL_ID}
        aria-labelledby={query.focus ? FOCUS_HEADING_ID : tabId(query.status)}
        className="flex flex-col gap-4"
      >
        <ApplicationsToolbar
          q={query.q}
          jobPostId={query.jobPostId}
          sort={query.sort}
          jobs={data.jobCounts}
          fallbackJobTitle={jobTitle}
          onSearch={(q) => update({ q: q || null, page: null }, "replace")}
          onJob={(jobPostId) => update({ job: jobPostId, page: null }, "replace")}
          onSort={(sort) =>
            update({ sort: sort === defaultSortFor(query.status, query.focus) ? null : sort, page: null }, "replace")
          }
        />

        <section
          aria-label="Danh sách hồ sơ"
          className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-card p-4"
        >
          {empty ? (
            <div className="py-6 text-center">
              <p className="font-semibold text-text-strong">{empty.title}</p>
              {empty.text ? <p className="mt-1 text-text-muted">{empty.text}</p> : null}
              {empty.action === "new-job" ? (
                <div className="mt-4 flex justify-center">
                  <DashButton href="/employer/jobs/new" icon="plus">
                    Đăng tin mới
                  </DashButton>
                </div>
              ) : empty.action === "exit-focus" ? (
                <div className="mt-4 flex justify-center">
                  <DashButton variant="secondary" icon="arrow-left" onClick={() => selectFocus(null)}>
                    Về danh sách hồ sơ
                  </DashButton>
                </div>
              ) : empty.action === "clear" ? (
                <div className="mt-4 flex justify-center">
                  <DashButton
                    variant="secondary"
                    icon="x"
                    onClick={() => update({ q: null, job: null, page: null }, "replace")}
                  >
                    Bỏ lọc
                  </DashButton>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2 text-text-muted">
                <TriStateCheckbox
                  visibleLabel
                  label={`Chọn tất cả ${selectable.length} hồ sơ trên trang này`}
                  checked={selectable.length > 0 && selectedOnPage === selectable.length}
                  indeterminate={selectedOnPage > 0 && selectedOnPage < selectable.length}
                  disabled={selectable.length === 0 || locked}
                  onChange={(checked) => toggle(selectable, checked)}
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
                aria-busy={locked || undefined}
                className={`transition-opacity duration-200 motion-reduce:transition-none ${locked ? "opacity-55" : ""}`}
              >
                {/* `relative`: chữ `sr-only` (absolute) trong vùng cuộn ngang không kéo rộng trang. */}
                <div className="relative hidden overflow-x-auto md:block">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border-subtle text-[13px] text-text-muted">
                        <th scope="col" className="w-12 py-2 pr-0 pl-3 font-semibold">
                          <span className="sr-only">Chọn</span>
                        </th>
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          Ứng viên
                        </th>
                        {showJob ? (
                          <th scope="col" className="py-2 pr-3 font-semibold">
                            Tin tuyển dụng
                          </th>
                        ) : null}
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          Trạng thái
                        </th>
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          Ngày nộp
                        </th>
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          Phù hợp
                        </th>
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          Khớp kỹ năng
                        </th>
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          <span className="sr-only">Thao tác</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((item) => (
                        <ApplicationTableRow key={item.applicationId} {...rowProps(item)} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="flex flex-col gap-2 md:hidden">
                  {rows.map((item) => (
                    <ApplicationCard key={item.applicationId} {...rowProps(item)} />
                  ))}
                </ul>
              </div>

              {suggestedLeft > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-hover px-3 py-2">
                  <span className="text-text-strong">
                    Còn <span className="font-num font-bold tabular-nums">{formatNumber(suggestedLeft)}</span> hồ sơ
                    được đề xuất
                  </span>
                  <DashButton variant="secondary" size="sm" iconAfter="arrow-right" onClick={nextSuggested}>
                    Xem tiếp
                  </DashButton>
                </div>
              ) : null}

              <Pagination page={data.page} pageCount={pageCount} onChange={goToPage} label="Phân trang hồ sơ" className="mt-2" />
            </>
          )}
          <p className="sr-only" aria-live="polite">
            {pageAnnounced && !locked ? `Trang ${data.page}` : ""}
          </p>

          <SelectionBar
            count={selectedRows.length}
            unit="hồ sơ"
            onClear={() => patchView(viewKey, (current) => ({ ...current, selected: new Set() }))}
            actions={
              <ApplicationBulkActions
                counts={bulkCounts}
                busy={bulkBusy}
                onAction={bulkAction}
                only={query.focus === "reject" ? REJECT_FOCUS_ACTIONS : undefined}
              />
            }
          />
        </section>
      </div>

      {scheduling.dialogs}
      <ConfirmDialog
        isOpen={rejecting !== null}
        title={rejecting?.kind === "bulk" ? `Từ chối ${rejectCount} hồ sơ?` : "Từ chối hồ sơ này?"}
        message={
          rejecting?.kind === "single"
            ? `Hồ sơ của ${candidateName(rejecting.item)} cho tin "${rejecting.item.jobPost.title}" sẽ chuyển sang Bị từ chối. Ứng viên sẽ nhận email thông báo. Bạn không thể hoàn tác.`
            : "Ứng viên sẽ nhận email thông báo. Bạn không thể hoàn tác."
        }
        confirmLabel={rejecting?.kind === "bulk" ? `Từ chối ${rejectCount} hồ sơ` : "Từ chối hồ sơ"}
        cancelLabel="Giữ lại"
        isDestructive
        isConfirming={bulkBusy === "REJECTED" || busy?.action === "REJECTED"}
        onConfirm={() => {
          if (rejecting?.kind === "single") void changeOne(rejecting.item, "REJECTED");
          else if (rejecting?.kind === "bulk") void changeMany(rejecting.items, "REJECTED");
        }}
        onCancel={() => setRejecting(null)}
      />
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
