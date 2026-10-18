"use client";

import type { AuditActivityItem } from "@sip/shared-types";
import {
  actionLabel,
  groupSessions,
  sessionRange,
  sessionTimeLabel,
  type ActivitySession,
} from "@/lib/audit-activity";
import { formatNumber } from "@/lib/dashboard-format";
import { Icon } from "@/components/ui/Icon";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";

const CHAIN_MAX = 5;

/** Chuỗi nhãn rút gọn: hành động liền nhau giống nhau gộp thành `Duyệt tin ×3`. */
function chainOf(session: ActivitySession): string {
  const parts: Array<{ label: string; count: number }> = [];
  for (const item of session.items) {
    const label = actionLabel(item.action, item.resubmit);
    const last = parts[parts.length - 1];
    if (last && last.label === label) last.count += 1;
    else parts.push({ label, count: 1 });
  }
  const text = parts
    .slice(0, CHAIN_MAX)
    .map((part) => (part.count > 1 ? `${part.label} ×${part.count}` : part.label))
    .join(" → ");
  return parts.length > CHAIN_MAX ? `${text} → …` : text;
}

/**
 * Tab "Hành trình người làm": các phiên của một người (hai thao tác cách nhau
 * ≤ 30 phút thì cùng phiên), mới nhất trước. Bấm một phiên thì lọc danh sách
 * đúng phiên đó (`actorId` + `since`/`until`, L33).
 */
export function ActorSessions({
  email,
  scopeLabel,
  status,
  items,
  hasMore,
  currentRowId,
  onRetry,
  retrying,
  onSelectSession,
}: {
  email: string | null;
  /** vd. "ngày 18/10/2026" hoặc "19/09/2026 – 18/10/2026". */
  scopeLabel: string;
  status: "pending" | "error" | "success";
  items: AuditActivityItem[];
  hasMore: boolean;
  currentRowId: string | null;
  onRetry: () => void;
  retrying: boolean;
  onSelectSession: (range: { since: string; until: string }) => void;
}) {
  if (status === "pending") return <BlockSkeleton height={240} />;
  if (status === "error") return <BlockError what="hành trình của người làm" onRetry={onRetry} retrying={retrying} />;

  const sessions = groupSessions(items).reverse();

  return (
    <div className="grid gap-3">
      <p className="text-[13px] text-text-muted">
        Thao tác của <b className="text-text-strong [overflow-wrap:anywhere]">{email ?? "người này"}</b> trong {scopeLabel}:{" "}
        {formatNumber(items.length)} thao tác, {formatNumber(sessions.length)} phiên. Bấm một phiên để lọc danh sách theo phiên đó.
      </p>

      {sessions.length === 0 ? (
        <p className="text-sm text-text-body">Không có thao tác nào trong khoảng này.</p>
      ) : (
        <ul className="grid gap-2">
          {sessions.map((session) => {
            const containsCurrent = currentRowId !== null && session.items.some((item) => item.id === currentRowId);
            return (
              <li key={session.start}>
                <button
                  type="button"
                  onClick={() => onSelectSession(sessionRange(session))}
                  className={`grid w-full cursor-pointer gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none ${
                    containsCurrent ? "border-brand-300 bg-brand-50" : "border-border-subtle hover:bg-surface-hover"
                  }`}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-num text-sm font-semibold text-text-strong tabular-nums">
                      <Icon name="clock" size={14} className="text-text-muted" />
                      {sessionTimeLabel(session.start, session.end)}
                    </span>
                    <span className="text-[13px] text-text-muted">
                      <b className="text-text-strong tabular-nums">{formatNumber(session.items.length)}</b> thao tác
                      {containsCurrent ? " · có dòng đang xem" : ""}
                    </span>
                  </span>
                  <span className="text-[13px] text-text-body">{chainOf(session)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore ? <p className="text-[13px] text-text-muted">Chỉ hiện 200 thao tác đầu trong khoảng này.</p> : null}
    </div>
  );
}
