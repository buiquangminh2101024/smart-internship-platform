"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { AuditActivityItem, AuditActivityStats } from "@sip/shared-types";
import {
  ADMIN_ACTIVITY_KEY,
  useActivityItem,
  useActivityList,
  useActivityStats,
  useActorJourney,
  useEntityJourney,
  useRecentFailedLogins,
} from "@/hooks/useAdminActivityLog";
import { useAdminDashboardOverview } from "@/hooks/useAdminDashboard";
import { ApiError } from "@/lib/api-client";
import {
  FAILED_LOGIN_ACTION,
  actionLabel,
  clearedFilters,
  countActiveFilters,
  effectiveRange,
  formatIsoDate,
  formatVnDateTime,
  parseActivityParams,
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
import { ActivityList, focusActivityRow } from "@/components/admin/activity/ActivityList";
import { ActivityStatsGrid } from "@/components/admin/activity/ActivityStatsGrid";
import { ActorSessions } from "@/components/admin/activity/ActorSessions";
import { EntityJourney } from "@/components/admin/activity/EntityJourney";
import { ExportCsvButton } from "@/components/admin/activity/ExportCsvButton";
import { SecurityAlertBar } from "@/components/admin/activity/SecurityAlertBar";

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

/** Hành trình người làm mở từ "Top 5 người làm": theo khoảng ngày của thống kê. */
interface ActorDrawer {
  actorId: string;
  email: string | null;
  range: { from: string; to: string };
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
 * Nhật ký hoạt động (AD-20, plan FE "admin-audit-log", bản C "Bàn điều tra").
 * Mọi bộ lọc và dòng đang mở nằm trên URL (`parseActivityParams` là chỗ đọc duy
 * nhất), nên link chia sẻ mở đúng cảnh đang xem. Biểu đồ bấm được để đổi bộ lọc.
 */
function AdminActivityView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toasts, push, dismiss } = useToast();

  const search = searchParams.toString();
  const { filters, row, errors } = useMemo(() => parseActivityParams(new URLSearchParams(search)), [search]);
  const range = effectiveRange(filters);
  const listSearch = toListSearch(filters).toString();

  const update = useCallback(
    (next: Filters, nextRow: string | null = null) => {
      const query = toActivityParams(next, nextRow).toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname],
  );
  const changeFilters = useCallback((next: Filters) => update(next, null), [update]);
  const clearFilters = useCallback(() => update(clearedFilters(filters), null), [update, filters]);

  // ─── Danh sách ─────────────────────────────────────────────────────────
  const list = useActivityList(filters);
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const firstPage = list.data?.pages[0];
  const total = firstPage?.total;
  const pageCount = list.data?.pages.length ?? 0;
  const { hasNextPage, fetchNextPage } = list;

  // ─── Thống kê, cảnh báo ────────────────────────────────────────────────
  const stats = useActivityStats(filters, { enabled: true });
  const [statsOpen, setStatsOpen] = useState(false);
  const alertCount = filters.archived ? 0 : (stats.data?.securityAlerts ?? 0);
  const recentFailed = useRecentFailedLogins(filters, { enabled: alertCount > 0 });
  // Cùng key với số chờ trên menu của shell, nên không gọi thêm API.
  const overview = useAdminDashboardOverview();

  // ─── Ngăn kéo ──────────────────────────────────────────────────────────
  const [actorDrawer, setActorDrawer] = useState<ActorDrawer | null>(null);
  const drawerOpen = row !== null || actorDrawer !== null;
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

  // Mở từ một dòng: thao tác của người đó trong ngày (giờ Việt Nam) của dòng.
  const rowDay = item ? vnTodayIso(new Date(item.createdAt)) : null;
  const actorTarget =
    actorDrawer ??
    (item?.actorId && rowDay ? { actorId: item.actorId, email: item.actorEmail, range: { from: rowDay, to: rowDay } } : null);
  const actorJourney = useActorJourney(actorTarget?.actorId ?? null, actorTarget?.range ?? null, filters.archived, {
    enabled: actorDrawer !== null || (row !== null && tab === "actor"),
  });
  const actorScope = actorTarget
    ? actorTarget.range.from === actorTarget.range.to
      ? `ngày ${formatIsoDate(actorTarget.range.from)}`
      : `${formatIsoDate(actorTarget.range.from)} – ${formatIsoDate(actorTarget.range.to)}`
    : "";

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

  // Đóng ngăn kéo thì trả focus về dòng đã mở (hoặc dòng vừa nhảy tới).
  useEffect(() => {
    if (drawerOpen || !focusAfterCloseRef.current) return;
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
    focusAfterCloseRef.current = entry.id;
    update(filters, entry.id);
  }

  function closeDrawer() {
    if (row) focusAfterCloseRef.current ??= row;
    setActorDrawer(null);
    if (row) update(filters, null);
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
    setActorDrawer(null);
    update(
      { ...clearedFilters(filters), actorId: actorTarget.actorId, since: session.since, until: session.until },
      null,
    );
  }

  function openActorJourney(actor: AuditActivityStats["topActors"][number]) {
    if (!stats.data) return;
    setActorDrawer({ actorId: actor.actorId, email: actor.email, range: { from: stats.data.from, to: stats.data.to } });
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
  if (actorDrawer) {
    drawerBody = (
      <ActorSessions
        email={actorDrawer.email}
        scopeLabel={actorScope}
        status={actorJourney.status}
        items={actorJourney.data?.items ?? []}
        hasMore={actorJourney.data?.hasMore ?? false}
        currentRowId={null}
        onRetry={() => void actorJourney.refetch()}
        retrying={actorJourney.isFetching}
        onSelectSession={selectSession}
      />
    );
  } else if (item) {
    if (tab === "detail") {
      drawerBody = <ActivityDetail item={item} />;
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
                <b className="text-text-strong tabular-nums">{formatNumber(total)}</b> sự kiện
              </>
            ) : (
              "Đang đếm sự kiện"
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
      ) : null}

      <ActivityFilters
        filters={filters}
        errors={errors}
        range={range}
        actorEmail={actorEmail}
        onChange={changeFilters}
        onClear={clearFilters}
      />

      {alertCount > 0 ? (
        <SecurityAlertBar
          count={alertCount}
          recent={recentFailed.data?.items ?? []}
          recentStatus={recentFailed.status}
          filtered={filters.actions.length === 1 && filters.actions[0] === FAILED_LOGIN_ACTION}
          onShowAll={() => update({ ...filters, actions: [FAILED_LOGIN_ACTION], resubmit: null }, null)}
        />
      ) : null}

      {/* Màn hẹp: danh sách trước, thống kê gom vào mục đóng sẵn ở dưới. Màn rộng: thống kê trước. */}
      <div className="flex flex-col gap-5">
        <AdminPanel labelledBy="activity-list-title" className="lg:order-2">
          <AdminPanelHead id="activity-list-title" title="Sự kiện" subtitle="Mới nhất trước. Bấm một dòng để xem chi tiết và hành trình." />
          <ActivityList
            items={items}
            total={total}
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

        <section aria-label="Thống kê" className="grid gap-3 lg:order-1">
          <button
            type="button"
            aria-expanded={statsOpen}
            aria-controls="activity-stats"
            onClick={() => setStatsOpen((value) => !value)}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-[14px] border border-border-subtle bg-surface-card px-4 text-sm font-semibold text-text-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 lg:hidden"
          >
            <Icon name="chart-column" size={16} className="text-text-muted" />
            <span className="flex-1 text-left">Thống kê</span>
            <Icon name={statsOpen ? "chevron-up" : "chevron-down"} size={16} className="text-text-muted" />
          </button>
          <div id="activity-stats" className={`${statsOpen ? "block" : "hidden"} lg:block`}>
            <ActivityStatsGrid
              filters={filters}
              status={stats.status}
              stats={stats.data}
              retrying={stats.isFetching}
              onRetry={() => void stats.refetch()}
              pendingJobPosts={overview.data?.queues.jobPosts.total}
              onChange={changeFilters}
              onOpenActorJourney={openActorJourney}
            />
          </div>
        </section>
      </div>

      <ActivityDetailDrawer<DrawerTabKey>
        open={drawerOpen}
        onClose={closeDrawer}
        title={actorDrawer ? "Hành trình người làm" : item ? actionLabel(item.action, item.resubmit) : "Chi tiết sự kiện"}
        subtitle={actorDrawer ? (actorDrawer.email ?? "Tài khoản đã xoá") : item ? formatVnDateTime(item.createdAt) : undefined}
        tabs={!actorDrawer && item ? DRAWER_TABS : undefined}
        tab={tab}
        onTabChange={(next) => setTabState({ row, tab: next })}
        actions={
          !actorDrawer && row ? (
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
