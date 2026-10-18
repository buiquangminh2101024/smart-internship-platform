"use client";

import type { AuditActivityStats } from "@sip/shared-types";
import { formatNumber } from "@/lib/dashboard-format";
import { DashButton } from "@/components/dashboard/DashButton";
import { roleLabelOf } from "./ActivityMeta";

type Actor = AuditActivityStats["topActors"][number];

/**
 * Top 5 người làm: email, vai trò, số lượt, thanh. Bấm email thì lọc theo email
 * đó (`q`); "Xem hành trình" mở tab "Hành trình người làm".
 */
export function TopActorsList({
  actors,
  selectedQ,
  onFilterEmail,
  onOpenJourney,
}: {
  actors: Actor[];
  selectedQ: string | null;
  onFilterEmail: (email: string) => void;
  onOpenJourney: (actor: Actor) => void;
}) {
  if (actors.length === 0) {
    return <p className="py-4 text-[13px] text-text-muted">Không có người làm nào trong khoảng này.</p>;
  }
  const max = Math.max(...actors.map((actor) => actor.count));

  return (
    <ol className="grid gap-1">
      {actors.map((actor, index) => {
        const pressed = actor.email !== null && selectedQ === actor.email;
        return (
          <li key={actor.actorId} className={`grid gap-1.5 rounded-lg px-2.5 py-2 ${pressed ? "bg-brand-50" : ""}`}>
            <div className="flex min-w-0 items-center gap-2 text-[13px]">
              <span className="w-4 flex-none text-text-muted tabular-nums">{index + 1}</span>
              {actor.email ? (
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => onFilterEmail(actor.email!)}
                  title={`Lọc theo ${actor.email}`}
                  className="min-w-0 flex-1 cursor-pointer truncate rounded text-left font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                >
                  {actor.email}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate text-text-muted">Tài khoản đã xoá</span>
              )}
              <b className="text-sm text-text-strong tabular-nums">{formatNumber(actor.count)}</b>
            </div>
            <span aria-hidden className="ml-6 block h-2 overflow-hidden rounded-full bg-surface-hover">
              <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(actor.count / max) * 100}%` }} />
            </span>
            <div className="-my-1 flex items-center justify-between gap-2 pl-6">
              <span className="text-[13px] text-text-muted">{roleLabelOf(actor.actorRole)}</span>
              <DashButton variant="ghost" size="sm" icon="route" className="-mr-2" onClick={() => onOpenJourney(actor)}>
                Xem hành trình<span className="sr-only"> của {actor.email ?? "tài khoản đã xoá"}</span>
              </DashButton>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
