"use client";

import { useState } from "react";
import type { ActivityActorFilter, AuditActivityItem } from "@sip/shared-types";
import { useAdminActivity } from "@/hooks/useAdminDashboard";
import { formatRelativeTime } from "@/lib/notifications";
import { Icon } from "@/components/ui/Icon";
import { BlockError, BlockSkeleton } from "../BlockState";
import { AdminPanel, AdminPanelHead, SegmentedControl, type SegmentedOption } from "./AdminPanel";

const ACTOR_OPTIONS: SegmentedOption<ActivityActorFilter>[] = [
  { value: "admin", label: "Quản trị viên" },
  { value: "all", label: "Tất cả" },
];

const SUBTITLE: Record<ActivityActorFilter, string> = {
  admin: "Thao tác của quản trị viên.",
  all: "Mọi thao tác, gồm cả nhà tuyển dụng và hệ thống.",
};

type Tone = "ok" | "no" | "down" | "brand" | "sys";

const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-success-100 text-success-700",
  no: "bg-red-100 text-red-700",
  down: "bg-marigold-100 text-marigold-800",
  brand: "bg-brand-100 text-brand-700",
  sys: "bg-surface-hover text-text-muted",
};

const ENTITY_ICON: Record<string, string> = {
  JobPost: "clipboard-check",
  Company: "building-2",
  Payment: "credit-card",
  Subscription: "credit-card",
  Skill: "sparkles",
  University: "graduation-cap",
  Major: "graduation-cap",
};

/** Icon theo loại thao tác: duyệt xanh, từ chối đỏ, gỡ tin marigold, xác minh brand, không phải Admin xám. */
function lookOf(item: AuditActivityItem): { tone: Tone; icon: string } {
  if (item.actorRole !== "ADMIN") return { tone: "sys", icon: ENTITY_ICON[item.entityType] ?? "history" };
  if (item.action.endsWith("_REJECTED")) return { tone: "no", icon: "x" };
  if (item.action === "JOB_POST_RETRACTED") return { tone: "down", icon: "arrow-down" };
  if (item.action === "COMPANY_VERIFIED") return { tone: "brand", icon: "building-2" };
  if (/APPROVED|MERGED|PUBLISHED/.test(item.action)) return { tone: "ok", icon: "check" };
  return { tone: "brand", icon: ENTITY_ICON[item.entityType] ?? "settings" };
}

/**
 * "Hoạt động gần đây" (Admin bản D): dòng thời gian 5 mục, mặc định chỉ thao
 * tác của quản trị viên. Mỗi mục: email người làm, câu `summary` đã lưu (không
 * ghép lại câu), khung lý do nếu có, thời gian.
 */
export function ActivityTimeline() {
  const [actor, setActor] = useState<ActivityActorFilter>("admin");
  const activity = useAdminActivity(actor);
  const items = activity.data?.items ?? [];

  return (
    <AdminPanel labelledBy="admin-activity-title">
      <AdminPanelHead
        id="admin-activity-title"
        title="Hoạt động gần đây"
        subtitle={SUBTITLE[actor]}
        actions={<SegmentedControl options={ACTOR_OPTIONS} value={actor} onChange={setActor} label="Lọc hoạt động" />}
      />
      {activity.isPending ? (
        <BlockSkeleton height={280} className="mx-5 mb-4" />
      ) : activity.isError ? (
        <div className="px-4 pb-4">
          <BlockError what="hoạt động gần đây" onRetry={() => void activity.refetch()} retrying={activity.isFetching} />
        </div>
      ) : items.length === 0 ? (
        <p className="px-5 pt-2 pb-6 text-[13px] text-text-muted">
          {actor === "admin"
            ? "Chưa có thao tác nào của quản trị viên. Duyệt hoặc từ chối một mục thì thao tác sẽ hiện ở đây."
            : "Chưa có hoạt động nào."}
        </p>
      ) : (
        <ul className="px-4 pt-1 pb-3 @xl:px-5">
          {items.map((item, index) => {
            const look = lookOf(item);
            const last = index === items.length - 1;
            return (
              <li key={item.id} className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-2.5">
                {last ? null : (
                  <span aria-hidden className="absolute top-11 -bottom-1 left-[15px] w-0.5 bg-border-subtle" />
                )}
                <span
                  aria-hidden
                  className={`relative z-[1] grid h-8 w-8 place-items-center rounded-full shadow-[0_0_0_3px_var(--color-surface-card)] ${TONE_CLASS[look.tone]}`}
                >
                  <Icon name={look.icon} size={16} />
                </span>
                <div className="min-w-0 text-[13px]">
                  <p className="truncate font-bold text-text-strong">{item.actorEmail ?? "Hệ thống"}</p>
                  <p className="text-text-body">{item.summary}</p>
                  {item.reason ? (
                    <p
                      className={`mt-1.5 rounded-r-md border-l-[3px] px-2.5 py-1.5 text-text-body ${
                        look.tone === "down" ? "border-marigold-500 bg-marigold-100" : "border-red-600 bg-red-50"
                      }`}
                    >
                      Lý do: {item.reason}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-text-muted">
                    <time dateTime={item.createdAt}>{formatRelativeTime(item.createdAt)}</time>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminPanel>
  );
}
