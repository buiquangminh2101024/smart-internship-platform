"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { AuditActivityItem, AuditHighlightDays } from "@sip/shared-types";
import {
  ADMIN_ACTIVITY_KEY,
  useActivityHighlights,
  useActivityItem,
  useActivityList,
  useActorJourney,
  useEntityJourney,
} from "@/hooks/useAdminActivityLog";
import { ApiError } from "@/lib/api-client";
import {
  HIGHLIGHT_PARAM,
  actionLabel,
  clearedFilters,
  countActiveFilters,
  effectiveRange,
  formatIsoDate,
  formatVnDateTime,
  parseActivityParams,
  parseHighlightDays,
  rangeLabel,
  toActivityParams,
  toListSearch,
  type ActivityFilters as Filters,
} from "@/lib/audit-activity";
import { formatNumber, vnTodayIso } from "@/lib/dashboard-format";
import { Icon } from "@/components/ui/Icon";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { DashButton } from "@/components/dashboard/DashButton";
import { AdminPanel, AdminPanelHead } from "@/components/dashboard/admin/AdminPanel";
import { ActivityDetail } from "@/components/admin/activity/ActivityDetail";
import { ActivityDetailDrawer, type DrawerTab } from "@/components/admin/activity/ActivityDetailDrawer";
import { ActivityFilters } from "@/components/admin/activity/ActivityFilters";
import { ActivityHighlights, type HighlightFilter } from "@/components/admin/activity/ActivityHighlights";
import { ActivityList, focusActivityRow } from "@/components/admin/activity/ActivityList";
import { ActorSessions } from "@/components/admin/activity/ActorSessions";
import { EntityJourney } from "@/components/admin/activity/EntityJourney";
import { ExportCsvButton } from "@/components/admin/activity/ExportCsvButton";

type DrawerTabKey = "detail" | "entity" | "actor";

const DRAWER_TABS: DrawerTab<DrawerTabKey>[] = [
  { key: "detail", label: "Chi tiết" },
  { key: "entity", label: "Hành trình đối tượng" },
  { key: "actor", label: "Hành trình người làm" },
];

/** Dòng vừa nhảy tới được tô nổi trong 1,5 giây. */
const HIGHLIGHT_MS = 1500;
/** Nhảy tới một bước của hành trình: tải thêm tối đa tới trang thứ 4 (200 dòng, bằng giới hạn hành trình). */
const JUMP_MAX_PAGES = 4;
const COPIED_MS = 2000;
const LIST_TITLE_ID = "activity-list-title";

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

export default function AdminActivityPage() {
  // useSearchParams() cần Suspense boundary khi Next prerender route này.
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-6 py-12 text-sm text-text-muted">Đang tải...</div>}>
      <AdminActivityView />
    </Suspense>
  );
}

/**
 * Nhật ký hoạt động (AD-20; bố cục theo plan "admin-activity-v2"): khối Điểm
 * chính, thanh lọc, danh sách chia theo ngày. Mọi bộ lọc, dòng đang mở và khoảng
 * của Điểm chính nằm trên URL (`parseActivityParams`, `parseHighlightDays`), nên
 * link chia sẻ mở đúng cảnh đang xem.
 */
function AdminActivityView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toasts, push, dismiss } = useToast();

  const search = searchParams.toString();
  const { filters, row, errors } = useMemo(() => parseActivityParams(new URLSearchParams(search)), [search]);
  const highlightDays = useMemo(() => parseHighlightDays(new URLSearchParams(search)), [search]);
  const range = effectiveRange(filters);
  const listSearch = toListSearch(filters).toString();

  const navigate = useCallback(
    (next: Filters, nextRow: string | null, days: AuditHighlightDays) => {
      const params = toActivityParams(next, nextRow);
      if (days === 30) params.set(HIGHLIGHT_PARAM, "30");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname],
  );
  const update = useCallback(
    (next: Filters, nextRow: string | null = null) => navigate(next, nextRow, highlightDays),
    [navigate, highlightDays],
  );
  const changeFilters = useCallback((next: Filters) => update(next, null), [update]);
  const clearFilters = useCallback(() => update(clearedFilters(filters), null), [update, filters]);

  // ─── Danh sách ─────────────────────────────────────────────────────────
  const list = useActivityList(filters);
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const firstPage = list.data?.pages[0];
  const total = firstPage?.total;
  const dayCounts = useMemo(
    () => (firstPage?.dayCounts ? new Map(firstPage.dayCounts.map((day) => [day.date, day.count])) : undefined),
    [firstPage],
  );
  const pageCount = list.data?.pages.length ?? 0;
  const { hasNextPage, fetchNextPage } = list;

  // ─── Điểm chính (không áp cho nhật ký đã lưu trữ) ──────────────────────
  const highlights = useActivityHighlights(highlightDays, { enabled: !filters.archived });

  // ─── Ngăn kéo ──────────────────────────────────────────────────────────
  const drawerOpen = row !== null;
  const [tabState, setTabState] = useState<{ row: string | null; tab: DrawerTabKey }>({ row: null, tab: "detail" });
  const tab = tabState.row === row ? tabState.tab : "detail";

  const loadedItem = row ? (items.find((item) => item.id === row) ?? null) : null;
  const itemQuery = useActivityItem(row, filters.archived, {
    enabled: row !== null && loadedItem === null && list.status !== "pending",
  });
  const item = loadedItem ?? itemQuery.data ?? null;
  const itemMissing = itemQuery.error instanceof ApiError && itemQuery.error.status === 404;

  const entityJourney = useEntityJourney(
    item ? { type: item.entityType, id: item.entityId } : null,
    filters.archived,
    { enabled: row !== null && tab === "entity" },
  );

  // Thao tác của người làm trong ngày (giờ Việt Nam) của dòng đang mở.
  const rowDay = item ? vnTodayIso(new Date(item.createdAt)) : null;
  const actorTarget =
    item?.actorId && rowDay ? { actorId: item.actorId, email: item.actorEmail, range: { from: rowDay, to: rowDay } } : null;
  const actorJourney = useActorJourney(actorTarget?.actorId ?? null, actorTarget?.range ?? null, filters.archived, {
    enabled: row !== null && tab === "actor",
  });
  const actorScope = actorTarget ? `ngày ${formatIsoDate(actorTarget.range.from)}` : "";

  // Dòng mở từ quy tắc "Admin đăng nhập từ IP mới": hiện IP quen để so (N7).
  const newIpAccount = row
    ? highlights.data?.attention.adminNewIp.accounts.find((account) => account.latestLogId === row)
    : undefined;

  // Email của người làm đang lọc (chip "Phiên … của …"): lấy từ dòng đã tải, hoặc nhớ lúc chọn phiên.
  const [knownActor, setKnownActor] = useState<{ id: string; email: string | null } | null>(null);
  const actorEmail = filters.actorId
    ? (items.find((entry) => entry.actorId === filters.actorId)?.actorEmail ??
      (knownActor?.id === filters.actorId ? knownActor.email : null))
    : null;

  // ─── Focus và tô nổi ───────────────────────────────────────────────────
  const focusAfterCloseRef = useRef<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [jump, setJump] = useState<{ id: string; search: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Nút ngoài danh sách đã mở ngăn kéo (tài khoản trong khối Điểm chính).
  const openerRef = useRef<HTMLElement | null>(null);

  // Đóng ngăn kéo thì trả focus về nút đã mở, hoặc dòng đã mở (hoặc dòng vừa nhảy tới).
  useEffect(() => {
    if (drawerOpen) return;
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) {
      const frame = requestAnimationFrame(() => opener.focus());
      return () => cancelAnimationFrame(frame);
    }
    if (!focusAfterCloseRef.current) return;
    const id = focusAfterCloseRef.current;
    focusAfterCloseRef.current = null;
    const frame = requestAnimationFrame(() => focusActivityRow(id));
    return () => cancelAnimationFrame(frame);
  }, [drawerOpen]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightId]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  // Nhảy tới một bước chưa có trong danh sách: đợi danh sách theo đối tượng tải xong,
  // tải thêm vài lô nếu cần; vẫn không thấy thì mở thẳng dòng đó trong ngăn kéo.
  const listSettled = list.status === "success" && !list.isPlaceholderData && !list.isFetchingNextPage;
  useEffect(() => {
    if (!jump || jump.search !== listSearch || !listSettled) return;
    const frame = requestAnimationFrame(() => {
      if (items.some((entry) => entry.id === jump.id)) {
        setJump(null);
        setHighlightId(jump.id);
        focusActivityRow(jump.id);
      } else if (hasNextPage && pageCount < JUMP_MAX_PAGES) {
        void fetchNextPage();
      } else {
        setJump(null);
        update(filters, jump.id);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [jump, listSearch, listSettled, items, hasNextPage, pageCount, fetchNextPage, update, filters]);

  // ─── Thao tác ──────────────────────────────────────────────────────────
  function openRow(entry: AuditActivityItem) {
    openerRef.current = null;
    focusAfterCloseRef.current = entry.id;
    update(filters, entry.id);
  }

  /** Mở ngăn kéo từ một nút ngoài danh sách; đóng thì focus quay về nút đó. */
  function openRowFromOutside(id: string) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusAfterCloseRef.current = null;
    update(filters, id);
  }

  function closeDrawer() {
    if (!row) return;
    if (!openerRef.current) focusAfterCloseRef.current ??= row;
    update(filters, null);
  }

  function jumpToRow(id: string) {
    if (items.some((entry) => entry.id === id)) {
      focusAfterCloseRef.current = id;
      setHighlightId(id);
      update(filters, null);
      return;
    }
    // Bước cũ hơn khoảng đang xem: bỏ các lọc khác, xem toàn bộ lịch sử của đối tượng.
    const next: Filters = { ...clearedFilters(filters), ent: item ? { type: item.entityType, id: item.entityId } : null };
    focusAfterCloseRef.current = null;
    setJump({ id, search: toListSearch(next).toString() });
    update(next, null);
  }

  function selectSession(session: { since: string; until: string }) {
    if (!actorTarget) return;
    setKnownActor({ id: actorTarget.actorId, email: actorTarget.email });
    update(
      { ...clearedFilters(filters), actorId: actorTarget.actorId, since: session.since, until: session.until },
      null,
    );
  }

  /** Một dòng Điểm chính: thay bộ lọc danh sách rồi đưa focus tới tiêu đề danh sách (N7). */
  function applyHighlight(patch: HighlightFilter) {
    if (patch.actorId) {
      const account = highlights.data?.attention.employerSubmitBurst.accounts.find((entry) => entry.userId === patch.actorId);
      if (account) setKnownActor({ id: account.userId, email: account.email });
    }
    update({ ...clearedFilters(filters), ...patch }, null);
    requestAnimationFrame(() => {
      const heading = document.getElementById(LIST_TITLE_ID);
      if (!heading) return;
      // Tiêu đề nhận focus bằng script (không vào thứ tự Tab) để bàn phím đi tiếp từ danh sách.
      heading.setAttribute("tabindex", "-1");
      heading.scrollIntoView({ block: "start", behavior: "auto" });
      heading.focus({ preventScroll: true });
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      push("danger", "Không sao chép được liên kết. Bạn sao chép địa chỉ trên thanh trình duyệt.");
    }
  }

  const [reloading, setReloading] = useState(false);
  async function reload() {
    setReloading(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ADMIN_ACTIVITY_KEY });
    } finally {
      setReloading(false);
    }
  }

  // ─── Nội dung ngăn kéo ─────────────────────────────────────────────────
  let drawerBody;
  if (item) {
    if (tab === "detail") {
      drawerBody = (
        <div className="grid gap-4">
          {newIpAccount ? (
            <p className="rounded-[10px] border border-marigold-300 bg-marigold-100 px-3 py-2 text-[13px] text-marigold-800">
              Lần đăng nhập từ IP mới <b className="font-num tabular-nums">{newIpAccount.ip}</b>.{" "}
              {newIpAccount.knownIps.length > 0 ? (
                <>
                  IP quen trong {highlights.data?.thresholds.newIpLookbackDays} ngày trước:{" "}
                  <span className="font-num tabular-nums">{newIpAccount.knownIps.join(", ")}</span>.
                </>
              ) : (
                `Admin này chưa đăng nhập lần nào trong ${highlights.data?.thresholds.newIpLookbackDays} ngày trước đó.`
              )}
            </p>
          ) : null}
          <ActivityDetail item={item} />
        </div>
      );
    } else if (tab === "entity") {
      drawerBody = (
        <EntityJourney
          entity={{ type: item.entityType, id: item.entityId }}
          status={entityJourney.status}
          items={entityJourney.data?.items ?? []}
          hasMore={entityJourney.data?.hasMore ?? false}
          currentRowId={item.id}
          onRetry={() => void entityJourney.refetch()}
          retrying={entityJourney.isFetching}
          onStep={jumpToRow}
        />
      );
    } else if (!item.actorId) {
      drawerBody = (
        <p className="text-sm text-text-body">
          Dòng này do hệ thống ghi (vd. thanh toán, phát hiện đăng nhập sai nhiều lần), không có người làm nên không có
          hành trình người làm.
        </p>
      );
    } else {
      drawerBody = (
        <ActorSessions
          email={item.actorEmail}
          scopeLabel={actorScope}
          status={actorJourney.status}
          items={actorJourney.data?.items ?? []}
          hasMore={actorJourney.data?.hasMore ?? false}
          currentRowId={item.id}
          onRetry={() => void actorJourney.refetch()}
          retrying={actorJourney.isFetching}
          onSelectSession={selectSession}
        />
      );
    }
  } else if (itemMissing) {
    drawerBody = (
      <div className="grid justify-items-start gap-3">
        <p className="text-sm text-text-body">
          {filters.archived
            ? "Không tìm thấy dòng này trong nhật ký đã lưu trữ."
            : "Không tìm thấy dòng này, có thể đã được chuyển sang lưu trữ."}
        </p>
        {filters.archived ? null : (
          <DashButton variant="secondary" size="sm" icon="archive" onClick={() => update({ ...filters, archived: true }, row)}>
            Xem trong lưu trữ
          </DashButton>
        )}
      </div>
    );
  } else if (itemQuery.status === "error") {
    drawerBody = <BlockError what="dòng nhật ký" onRetry={() => void itemQuery.refetch()} retrying={itemQuery.isFetching} />;
  } else {
    drawerBody = <BlockSkeleton height={280} />;
  }

  const hasFilters = countActiveFilters(filters) > 0;

  return (
    // Admin bản D: số dùng font chữ thường + `tabular-nums`, không mono (như dashboard).
    <div className="mx-auto grid w-full max-w-[1360px] content-start gap-5 p-4 text-sm text-text-body [--font-num:var(--font-sans)] sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-2xl font-semibold text-text-strong">Nhật ký hoạt động</h1>
          <p className="text-sm text-text-muted">
            {total !== undefined ? (
              <>
                <b className="text-text-strong tabular-nums">{formatNumber(total)}</b> hoạt động
              </>
            ) : (
              "Đang đếm hoạt động"
            )}{" "}
            · <span className="tabular-nums">{rangeLabel(range)}</span>
            {filters.archived ? " · nhật ký đã lưu trữ" : ""}
          </p>
          {firstPage?.searchTruncated ? (
            <p className="text-[13px] text-text-muted">Có hơn 200 tài khoản khớp, bạn gõ email cụ thể hơn.</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <ExportCsvButton filters={filters} total={total} onResult={push} />
          <button
            type="button"
            aria-pressed={filters.archived}
            onClick={() => update({ ...filters, archived: !filters.archived }, null)}
            className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none ${
              filters.archived
                ? "border-brand-300 bg-brand-50 text-brand-800"
                : "border-border-default bg-surface-card text-text-strong hover:bg-surface-hover"
            }`}
          >
            <Icon name="archive" size={16} />
            Xem nhật ký đã lưu trữ
          </button>
          <DashButton variant="ghost" icon="refresh-cw" loading={reloading} onClick={reload}>
            Tải lại
          </DashButton>
        </div>
      </header>

      {filters.archived ? (
        <p className="flex items-start gap-2 rounded-[14px] border border-border-subtle bg-surface-card px-4 py-3 text-[13px] text-text-body">
          <Icon name="archive" size={16} className="mt-0.5 flex-none text-text-muted" />
          Bạn đang xem nhật ký đã lưu trữ: các dòng cũ đã được chuyển khỏi nhật ký chính. Bấm lại nút “Xem nhật ký đã lưu
          trữ” để quay về nhật ký hiện tại.
        </p>
      ) : (
        <ActivityHighlights
          days={highlightDays}
          onDaysChange={(days) => navigate(filters, row, days)}
          status={highlights.status}
          data={highlights.data}
          dimmed={highlights.isPlaceholderData}
          onRetry={() => void highlights.refetch()}
          retrying={highlights.isFetching}
          onFilter={applyHighlight}
          onOpenRow={openRowFromOutside}
        />
      )}

      <ActivityFilters
        filters={filters}
        errors={errors}
        range={range}
        actorEmail={actorEmail}
        onChange={changeFilters}
        onClear={clearFilters}
      />

      <AdminPanel labelledBy={LIST_TITLE_ID}>
        <AdminPanelHead
          id={LIST_TITLE_ID}
          title="Danh sách hoạt động"
          subtitle="Mới nhất trước, chia theo ngày. Bấm một dòng để xem chi tiết và hành trình."
        />
        <ActivityList
          items={items}
          total={total}
          dayCounts={dayCounts}
          status={list.status}
          dimmed={list.isPlaceholderData}
          hasMore={hasNextPage}
          loadingMore={list.isFetchingNextPage}
          activeId={row}
          highlightId={highlightId}
          hasFilters={hasFilters}
          archived={filters.archived}
          onOpen={openRow}
          onLoadMore={() => void fetchNextPage()}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
          onClearFilters={clearFilters}
        />
      </AdminPanel>

      <ActivityDetailDrawer<DrawerTabKey>
        open={drawerOpen}
        onClose={closeDrawer}
        title={item ? actionLabel(item.action, item.resubmit) : "Chi tiết hoạt động"}
        subtitle={item ? formatVnDateTime(item.createdAt) : undefined}
        tabs={item ? DRAWER_TABS : undefined}
        tab={tab}
        onTabChange={(next) => setTabState({ row, tab: next })}
        actions={
          row ? (
            <DashButton variant="secondary" size="sm" icon={copied ? "check" : "link"} onClick={copyLink}>
              {copied ? "Đã sao chép liên kết" : "Sao chép liên kết tới dòng này"}
            </DashButton>
          ) : undefined
        }
      >
        {drawerBody}
      </ActivityDetailDrawer>

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
