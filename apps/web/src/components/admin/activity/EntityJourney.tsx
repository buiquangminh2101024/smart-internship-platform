"use client";

import type { KeyboardEvent } from "react";
import type { AuditActivityItem } from "@sip/shared-types";
import { ENTITY_LABEL, actionLabel } from "@/lib/audit-activity";
import { journeyMachine, replayJourney, type JourneyMachine, type JourneyNode, type TraversedEdge } from "@/lib/audit-journey";
import { formatVnDate, formatVnTime } from "@/lib/dashboard-format";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { GroupSwatch } from "./ActivityMeta";

const VIEW_W = 440;
const NODE_H = 36;
const ROW_GAP = 68;
const TOP = 40;
const BOTTOM = 44;

interface Point {
  x: number;
  y: number;
}

interface EdgeGeometry {
  d: string;
  mid: Point;
}

function layout(machine: JourneyMachine) {
  const cols = Math.max(...machine.nodes.map((node) => node.col)) + 1;
  const rows = Math.max(...machine.nodes.map((node) => node.row)) + 1;
  const colW = VIEW_W / cols;
  const nodeW = Math.min(104, colW - 18);
  const center = (node: JourneyNode): Point => ({ x: colW * (node.col + 0.5), y: TOP + NODE_H / 2 + node.row * ROW_GAP });
  return { nodeW, center, height: TOP + NODE_H + (rows - 1) * ROW_GAP + BOTTOM };
}

/** Đường của một cạnh: thẳng giữa hai ô kề nhau, cong lên khi nhảy cóc, cong xuống khi đi lùi. */
function edgeGeometry(a: Point, b: Point, nodeW: number): EdgeGeometry {
  const half = nodeW / 2;
  const halfH = NODE_H / 2;
  if (a.y === b.y) {
    const forward = b.x > a.x;
    const adjacent = Math.abs(b.x - a.x) <= nodeW + 60;
    if (forward && adjacent) {
      const start = { x: a.x + half, y: a.y };
      const end = { x: b.x - half - 2, y: b.y };
      return { d: `M${start.x},${start.y} L${end.x},${end.y}`, mid: { x: (start.x + end.x) / 2, y: a.y } };
    }
    const up = forward;
    const sy = up ? a.y - halfH : a.y + halfH;
    const ey = up ? b.y - halfH - 2 : b.y + halfH + 2;
    const cy = up ? a.y - halfH - 46 : a.y + halfH + 46;
    const cx = (a.x + b.x) / 2;
    return {
      d: `M${a.x},${sy} Q${cx},${cy} ${b.x},${ey}`,
      mid: { x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, y: 0.25 * sy + 0.5 * cy + 0.25 * ey },
    };
  }
  // Khác hàng: đi ngang ra cạnh bên rồi uốn vào cạnh bên của ô đích. Hai chiều lệch nhau 5px.
  const right = b.x >= a.x;
  const offset = right ? -5 : 5;
  const start = { x: a.x + (right ? half : -half), y: a.y + offset };
  const end = { x: b.x + (right ? -half - 2 : half + 2), y: b.y + offset };
  const cx = (start.x + end.x) / 2;
  return {
    d: `M${start.x},${start.y} C${cx},${start.y} ${cx},${end.y} ${end.x},${end.y}`,
    mid: { x: cx, y: (start.y + end.y) / 2 },
  };
}

function JourneyDiagram({
  machine,
  edges,
  current,
  onStep,
}: {
  machine: JourneyMachine;
  edges: TraversedEdge[];
  current: string | null;
  onStep: (itemId: string) => void;
}) {
  const { nodeW, center, height } = layout(machine);
  const nodeByKey = new Map(machine.nodes.map((node) => [node.key, node]));
  const visited = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const traversedKeys = new Set(edges.map((edge) => `${edge.from}>${edge.to}`));
  const faint = machine.edges.filter((edge) => !traversedKeys.has(`${edge.from}>${edge.to}`));
  const labelOf = (key: string) => nodeByKey.get(key)?.label ?? key;

  function geometry(from: string, to: string): EdgeGeometry | null {
    const a = nodeByKey.get(from);
    const b = nodeByKey.get(to);
    if (!a || !b || from === to) return null;
    return edgeGeometry(center(a), center(b), nodeW);
  }

  function handleEdgeKey(event: KeyboardEvent<SVGGElement>, edge: TraversedEdge) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onStep(edge.itemIds[edge.itemIds.length - 1]!);
    }
  }

  const summary = edges.length
    ? edges.map((edge) => `${labelOf(edge.from)} sang ${labelOf(edge.to)} ${edge.count} lần`).join(", ")
    : "chưa có bước chuyển trạng thái nào";

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      className="block w-full"
      role="group"
      aria-label={`Sơ đồ trạng thái: ${summary}${current ? `. Hiện tại: ${labelOf(current)}` : ""}.`}
    >
      <defs>
        <marker id="journey-arrow-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--color-brand-700)" />
        </marker>
        <marker id="journey-arrow-off" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--color-border-default)" />
        </marker>
      </defs>

      {faint.map((edge) => {
        const g = geometry(edge.from, edge.to);
        return g ? (
          <path
            key={`${edge.from}>${edge.to}`}
            d={g.d}
            fill="none"
            stroke="var(--color-border-default)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            markerEnd="url(#journey-arrow-off)"
          />
        ) : null;
      })}

      {edges.map((edge) => {
        const g = geometry(edge.from, edge.to);
        return g ? (
          <path
            key={`path-${edge.from}>${edge.to}`}
            d={g.d}
            fill="none"
            stroke="var(--color-brand-700)"
            strokeWidth={2.5}
            markerEnd="url(#journey-arrow-on)"
          />
        ) : null;
      })}

      {machine.nodes.map((node) => {
        const { x, y } = center(node);
        const isCurrent = node.key === current;
        const isVisited = visited.has(node.key);
        return (
          <g key={node.key} aria-hidden>
            <rect
              x={x - nodeW / 2}
              y={y - NODE_H / 2}
              width={nodeW}
              height={NODE_H}
              rx={9}
              fill={isCurrent ? "var(--color-brand-600)" : isVisited ? "var(--color-brand-50)" : "var(--color-surface-card)"}
              stroke={isCurrent ? "var(--color-brand-600)" : isVisited ? "var(--color-brand-300)" : "var(--color-border-default)"}
              strokeWidth={1.5}
            />
            <text
              x={x}
              y={y + 4.5}
              textAnchor="middle"
              fontSize={13}
              fontWeight={isCurrent ? 700 : 600}
              fill={isCurrent ? "#ffffff" : isVisited ? "var(--color-brand-800)" : "var(--color-text-muted)"}
            >
              {node.label}
            </text>
          </g>
        );
      })}

      {/* Số lần đi qua cạnh: bấm để tới bước gần nhất của cạnh đó. Vẽ sau ô để không bị che. */}
      {edges.map((edge) => {
        const g = geometry(edge.from, edge.to);
        if (!g) return null;
        const label = `×${edge.count}`;
        const w = 12 + label.length * 7.5;
        return (
          <g
            key={`count-${edge.from}>${edge.to}`}
            role="button"
            tabIndex={0}
            aria-label={`${labelOf(edge.from)} sang ${labelOf(edge.to)}: ${edge.count} lần. Bấm để tới bước gần nhất.`}
            onClick={() => onStep(edge.itemIds[edge.itemIds.length - 1]!)}
            onKeyDown={(event) => handleEdgeKey(event, edge)}
            className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[3px] [&:focus-visible>rect]:stroke-brand-500 [&:hover>rect]:fill-brand-50"
          >
            <rect
              x={g.mid.x - w / 2}
              y={g.mid.y - 11}
              width={w}
              height={22}
              rx={11}
              fill="var(--color-surface-card)"
              stroke="var(--color-brand-700)"
              strokeWidth={1.5}
            />
            <text x={g.mid.x} y={g.mid.y + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--color-brand-800)">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Tab "Hành trình đối tượng": sơ đồ trạng thái (cạnh đã đi đậm, có số lần) và
 * danh sách các bước theo thời gian. Bấm một bước, hoặc số trên một cạnh, thì
 * nhảy tới dòng đó trong danh sách của trang.
 */
export function EntityJourney({
  entity,
  status,
  items,
  hasMore,
  currentRowId,
  onRetry,
  retrying,
  onStep,
}: {
  entity: { type: string; id: string };
  status: "pending" | "error" | "success";
  items: AuditActivityItem[];
  hasMore: boolean;
  currentRowId: string | null;
  onRetry: () => void;
  retrying: boolean;
  onStep: (itemId: string) => void;
}) {
  if (status === "pending") return <BlockSkeleton height={320} />;
  if (status === "error") return <BlockError what="hành trình của đối tượng" onRetry={onRetry} retrying={retrying} />;

  const machine = journeyMachine(entity.type);
  const replay = machine ? replayJourney(machine, items) : null;
  const typeLabel = ENTITY_LABEL[entity.type] ?? entity.type;

  return (
    <div className="grid gap-4">
      <p className="text-[13px] text-text-muted">
        {typeLabel} <span className="font-num text-text-body">{entity.id}</span> · {items.length} bước, cũ nhất trước.
      </p>

      {machine && replay ? (
        <figure className="rounded-xl border border-border-subtle bg-surface-page p-3">
          <JourneyDiagram machine={machine} edges={replay.edges} current={replay.current} onStep={onStep} />
          <figcaption className="mt-1 text-[13px] text-text-muted">
            Đường đậm là đường đối tượng đã đi, số là số lần. Nét đứt là đường chưa đi.
          </figcaption>
        </figure>
      ) : (
        <p className="text-[13px] text-text-muted">Loại đối tượng này không có sơ đồ trạng thái, chỉ có các bước.</p>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-text-body">Chưa có bước nào trong nhật ký của đối tượng này.</p>
      ) : (
        <ol className="grid gap-1" aria-label="Các bước theo thời gian">
          {items.map((item, index) => {
            const isCurrent = item.id === currentRowId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onStep(item.id)}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`grid w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)] gap-x-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand-500 motion-reduce:transition-none ${
                    isCurrent ? "bg-brand-50" : "hover:bg-surface-hover"
                  }`}
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-hover font-num text-[13px] font-bold text-text-body tabular-nums">
                    {index + 1}
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                      <GroupSwatch group={item.group} size={18} />
                      <b className="text-text-strong">{actionLabel(item.action, item.resubmit)}</b>
                      <span className="font-num text-text-muted tabular-nums">
                        {formatVnTime(item.createdAt)} {formatVnDate(item.createdAt)}
                      </span>
                      {isCurrent ? <span className="font-semibold text-brand-700">· đang xem</span> : null}
                    </span>
                    <span className="truncate text-[13px] text-text-muted">{item.actorEmail ?? "Hệ thống"}</span>
                    {item.reason ? <span className="text-[13px] text-text-body">Lý do: {item.reason}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {hasMore ? <p className="text-[13px] text-text-muted">Chỉ hiện 200 bước đầu.</p> : null}
    </div>
  );
}
