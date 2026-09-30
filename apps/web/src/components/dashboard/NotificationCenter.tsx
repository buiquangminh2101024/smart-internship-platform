"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Notification } from "@sip/shared-types";
import {
  NOTIFICATIONS_HREF,
  NOTIFICATION_ACTION_LABEL,
  NOTIFICATION_GROUP_BY_TYPE,
  NOTIFICATION_GROUP_META,
  WARNING_NOTIFICATION_TYPES,
  formatRelativeTime,
} from "@/lib/notifications";
import {
  NOTIFICATION_GROUPS_BY_AREA,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationFeed,
  useNotificationUnreadByGroup,
  type NotificationCenterTab,
} from "@/hooks/useNotificationGroups";
import { formatNumber } from "@/lib/dashboard-format";
import { Icon } from "@/components/ui/Icon";
import type { ToastData } from "@/components/ui/Toast";
import { BlockError, BlockSkeleton } from "./BlockState";
import { DashButton } from "./DashButton";
import { PanelHead } from "./Panel";
import { AdminPanel, AdminPanelFoot, AdminPanelHead } from "./admin/AdminPanel";

type Notify = (tone: ToastData["tone"], message: string) => void;
type DashboardArea = "employer" | "admin";

const ALL_TAB = { label: "Tất cả", icon: "inbox" };

/**
 * Hai kiểu hình theo mẫu: Employer bản C (thông báo là thẻ viền riêng, cột
 * nhóm 220px) và Admin bản D (hàng ngăn bằng đường kẻ, cột nhóm 190px). Logic
 * dùng chung; chỉ khác class. Viết đủ tên class để Tailwind quét được.
 */
const SKIN = {
  employer: {
    body: "grid grid-cols-1 gap-4 @xl:grid-cols-[220px_minmax(0,1fr)] @xl:gap-6",
    tabs: "flex gap-1 overflow-x-auto border-b border-border-subtle pb-2 @xl:flex-col @xl:overflow-visible @xl:border-r @xl:border-b-0 @xl:pr-4 @xl:pb-0",
    tab: "h-10 rounded-lg px-3 font-semibold",
    tabActive: "bg-brand-50 text-brand-700 @xl:shadow-[inset_3px_0_0_var(--color-brand-600)]",
    list: "flex flex-col gap-2",
    item: "rounded-[10px] border px-4 py-3.5",
    itemRead: "border-border-subtle",
    itemUnread: "border-brand-200 bg-brand-50",
    icon: "h-9 w-9 rounded-lg",
    iconSize: 18,
  },
  admin: {
    body: "grid grid-cols-1 border-t border-border-subtle @xl:grid-cols-[190px_minmax(0,1fr)]",
    tabs: "flex gap-0.5 overflow-x-auto border-b border-border-subtle p-2 @xl:flex-col @xl:overflow-visible @xl:border-r @xl:border-b-0 @xl:p-2.5",
    tab: "h-[38px] rounded-lg px-2.5 text-[13px]",
    tabActive: "bg-brand-50 font-bold text-brand-700",
    list: "flex flex-col divide-y divide-border-subtle",
    item: "px-4 py-3",
    itemRead: "",
    itemUnread: "bg-brand-50/60",
    icon: "h-8 w-8 rounded-full",
    iconSize: 16,
  },
} as const;

export interface NotificationCenterProps {
  area: DashboardArea;
  /** Số thông báo mới nhất hiện trong mỗi nhóm. */
  limit?: number;
  notify?: Notify;
  className?: string;
}

/**
 * Trung tâm thông báo trên dashboard (AD-16): cột trái là nhóm kèm số chưa đọc,
 * cột phải là vài thông báo mới nhất của nhóm. Màn hình hẹp thì nhóm thành hàng
 * tab cuộn ngang. Chuông và trang `/…/notifications` vẫn giữ nguyên.
 */
export function NotificationCenter({ area, limit = 8, notify, className = "" }: NotificationCenterProps) {
  const router = useRouter();
  const [tab, setTab] = useState<NotificationCenterTab>("ALL");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const unread = useNotificationUnreadByGroup(area);
  const feed = useNotificationFeed(area, tab);
  const markRead = useMarkNotificationRead(area);
  const markAll = useMarkAllNotificationsRead(area);
  const skin = SKIN[area];
  const admin = area === "admin";

  const tabs: NotificationCenterTab[] = ["ALL", ...NOTIFICATION_GROUPS_BY_AREA[area]];
  const totalUnread = unread.data?.total ?? 0;
  const unreadOf = (key: NotificationCenterTab) =>
    key === "ALL" ? totalUnread : (unread.data?.groups[key] ?? 0);
  const titleId = `${area}-notification-center-title`;
  const panelId = `${area}-notification-center-panel`;

  function selectTab(next: NotificationCenterTab, focus = false) {
    setTab(next);
    if (focus) tabRefs.current[next]?.focus();
  }

  function handleTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    selectTab(tabs[(index + step + tabs.length) % tabs.length]!, true);
  }

  function open(notification: Notification) {
    if (!notification.isRead) markRead.mutate(notification.id);
    if (notification.link) router.push(notification.link);
  }

  function readAll() {
    markAll.mutate(undefined, {
      onSuccess: () => notify?.("success", "Đã đánh dấu tất cả thông báo là đã đọc."),
      onError: () => notify?.("danger", "Không đánh dấu được. Kiểm tra kết nối rồi thử lại."),
    });
  }

  const readAllButton = (
    <DashButton
      variant={admin ? "ghost" : "secondary"}
      size="sm"
      icon="check"
      loading={markAll.isPending}
      disabled={totalUnread === 0}
      onClick={readAll}
    >
      Đánh dấu tất cả đã đọc
    </DashButton>
  );

  const items = feed.data?.items.slice(0, limit) ?? [];

  const list = feed.isPending ? (
    <BlockSkeleton height={320} className={admin ? "m-4" : ""} />
  ) : feed.isError ? (
    <BlockError
      what="thông báo"
      onRetry={() => void feed.refetch()}
      retrying={feed.isFetching}
      className={admin ? "m-4" : ""}
    />
  ) : items.length === 0 ? (
    <p className={`text-center text-[13px] text-text-muted ${admin ? "px-5 py-7" : "py-8"}`}>
      {tab === "ALL"
        ? "Chưa có thông báo nào. Thông báo mới sẽ hiện ở đây."
        : `Không có thông báo nào trong nhóm ${NOTIFICATION_GROUP_META[tab].label}.`}
    </p>
  ) : (
    <ul className={skin.list}>
      {items.map((notification) => {
        const group = NOTIFICATION_GROUP_BY_TYPE[notification.type];
        const warning = WARNING_NOTIFICATION_TYPES.has(notification.type);
        const isUnread = !notification.isRead;
        const accentBar = isUnread
          ? warning
            ? "shadow-[inset_3px_0_0_var(--color-marigold-500)]"
            : admin
              ? "shadow-[inset_3px_0_0_var(--color-brand-500)]"
              : "shadow-[inset_3px_0_0_var(--color-brand-600)]"
          : "";
        const iconTone = warning
          ? "bg-marigold-100 text-marigold-800"
          : isUnread
            ? admin
              ? "bg-brand-100 text-brand-700"
              : "bg-brand-50 text-brand-600"
            : admin
              ? "bg-surface-hover text-text-body"
              : "bg-surface-page text-text-muted";
        return (
          <li
            key={notification.id}
            className={`flex flex-wrap items-start gap-x-3 gap-y-2 ${skin.item} ${
              isUnread ? skin.itemUnread : skin.itemRead
            } ${accentBar}`}
          >
            <span aria-hidden className={`grid shrink-0 place-items-center ${skin.icon} ${iconTone}`}>
              <Icon
                name={warning ? warningIcon(notification.type) : NOTIFICATION_GROUP_META[group].icon}
                size={skin.iconSize}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className={`flex items-center gap-1.5 text-text-strong ${isUnread ? "font-bold" : "font-semibold"}`}>
                {isUnread ? (
                  <>
                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />
                    <span className="sr-only">Chưa đọc: </span>
                  </>
                ) : null}
                <span className="min-w-0">{notification.title}</span>
              </p>
              {notification.body ? (
                <p className={`mt-0.5 text-text-body ${admin ? "text-[13px]" : ""}`}>{notification.body}</p>
              ) : null}
              <p className={`mt-1 flex flex-wrap gap-x-3 text-text-muted ${admin ? "text-xs" : ""}`}>
                {admin ? (
                  <span>
                    {NOTIFICATION_GROUP_META[group].label} · {formatRelativeTime(notification.createdAt)}
                  </span>
                ) : (
                  <>
                    <span className="font-semibold text-brand-700">{NOTIFICATION_GROUP_META[group].label}</span>
                    <span>{formatRelativeTime(notification.createdAt)}</span>
                  </>
                )}
              </p>
            </div>
            {notification.link ? (
              // Hẹp: nút xuống dòng dưới nội dung, thẳng hàng với chữ (bỏ qua cột icon).
              <div className={`w-full @xl:w-auto @xl:self-center @xl:pl-0 ${admin ? "pl-11" : "pl-12"}`}>
                <DashButton variant="secondary" size="sm" onClick={() => open(notification)}>
                  {NOTIFICATION_ACTION_LABEL[notification.type]}
                </DashButton>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );

  const tablist = (
    <div
      role="tablist"
      aria-label="Nhóm thông báo"
      onKeyDown={handleTabKey}
      className={`[scrollbar-width:none] ${skin.tabs}`}
    >
      {tabs.map((key) => {
        const selected = key === tab;
        const meta = key === "ALL" ? ALL_TAB : NOTIFICATION_GROUP_META[key];
        const count = unreadOf(key);
        return (
          <button
            key={key}
            ref={(el) => {
              tabRefs.current[key] = el;
            }}
            type="button"
            role="tab"
            id={`${panelId}-tab-${key}`}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => selectTab(key)}
            // `relative`: giữ chữ `sr-only` (absolute) trong vùng cuộn ngang, không kéo rộng cả trang.
            className={`relative flex shrink-0 cursor-pointer items-center gap-2.5 text-left whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 @xl:w-full ${skin.tab} ${
              selected ? skin.tabActive : "text-text-body hover:bg-surface-hover"
            }`}
          >
            <Icon
              name={meta.icon}
              size={16}
              className={`hidden @xl:block ${selected ? "text-brand-600" : "text-text-muted"}`}
            />
            <span className="flex-1">{meta.label}</span>
            {count > 0 || admin ? (
              <span
                className={`inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-bold tabular-nums ${
                  count > 0 ? "bg-brand-600 text-white" : "bg-surface-hover text-text-muted"
                }`}
              >
                {formatNumber(count)}
                <span className="sr-only"> chưa đọc</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const seeAll = (
    <Link
      href={NOTIFICATIONS_HREF[area]}
      className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-700 hover:underline"
    >
      Xem tất cả thông báo
      <Icon name="arrow-right" size={16} />
    </Link>
  );

  if (admin) {
    return (
      <AdminPanel labelledBy={titleId} className={className}>
        <AdminPanelHead
          id={titleId}
          title="Thông báo"
          subtitle={`${limit} thông báo mới nhất theo nhóm. Chuông trên thanh đầu trang vẫn giữ nguyên.`}
          actions={readAllButton}
        />
        <div className={skin.body}>
          {tablist}
          <div role="tabpanel" id={panelId} aria-labelledby={`${panelId}-tab-${tab}`} className="min-w-0">
            {list}
          </div>
        </div>
        <AdminPanelFoot>{seeAll}</AdminPanelFoot>
      </AdminPanel>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      className={`@container flex min-w-0 flex-col gap-4 rounded-xl border border-border-subtle bg-surface-card p-5 text-sm ${className}`}
    >
      <PanelHead
        as="h2"
        id={titleId}
        title="Trung tâm thông báo"
        subtitle="Phân theo nhóm để xử lý từng việc. Chuông trên thanh đầu trang vẫn hiển thị thông báo mới nhất."
        actions={readAllButton}
      />
      <div className={skin.body}>
        {tablist}
        <div role="tabpanel" id={panelId} aria-labelledby={`${panelId}-tab-${tab}`} className="flex min-w-0 flex-col gap-3">
          {list}
          <div>{seeAll}</div>
        </div>
      </div>
    </section>
  );
}

function warningIcon(type: Notification["type"]): string {
  if (type === "JOB_POST_EXPIRING" || type === "SUBSCRIPTION_EXPIRING") return "clock";
  if (type === "JOB_POST_TAKEN_DOWN") return "arrow-down";
  return "triangle-alert";
}
