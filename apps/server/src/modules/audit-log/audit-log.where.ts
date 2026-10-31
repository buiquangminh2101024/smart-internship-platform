import { Prisma } from "@prisma/client";
import type { AuditActionGroup, AuditActorRoleFilter } from "@sip/shared-types";
import { AUDIT_ACTION_GROUPS, type AuditAction } from "./audit-log.actions";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
// Việt Nam lệch UTC đúng 7 giờ và không đổi giờ theo mùa (L16, L29).
const VN_OFFSET_MS = 7 * HOUR_MS;

/**
 * Bộ lọc nhật ký đã kiểm ở DTO, dùng chung cho danh sách, `total`, CSV và
 * `/stats` (docs/06-backend/admin-audit-log/PLAN.md L7, L27–L29, L33).
 */
export interface ActivityFilter {
  groups?: AuditActionGroup[] | undefined;
  actions?: AuditAction[] | undefined;
  resubmit?: boolean | undefined;
  actorRoles?: AuditActorRoleFilter[] | undefined;
  actorId?: string | undefined;
  /** [gte, lt) theo UTC, đổi từ `from`/`to` (ngày Việt Nam) hoặc `since`/`until`. */
  range?: { gte?: Date | undefined; lt?: Date | undefined } | undefined;
  /** Ô thứ × giờ (giờ Việt Nam); chỉ có khi `range` đủ hai đầu. */
  slot?: { dow: number; hour: number } | undefined;
  /** Id người dùng có email khớp `q` (L8); mảng rỗng ⇒ không khớp dòng nào. */
  qUserIds?: string[] | undefined;
  entity?: { type: string; id: string } | undefined;
}

/** Chiều được bỏ khi `/stats` tính biểu đồ của chính chiều đó (L31, L32). */
export type FilterDimension = "group" | "action" | "resubmit" | "actorRole" | "slot";

export interface WhereOptions {
  omit?: readonly FilterDimension[];
  /** `q` khớp người làm hoặc đối tượng (danh sách, L8) hay chỉ người làm (biểu đồ, L18). */
  qMatch?: "actorOrEntity" | "actor";
}

/** `YYYY-MM-DD` (đã kiểm ở DTO) ⇒ 00:00 giờ Việt Nam của ngày đó. */
export function vnDayStart(date: string): Date {
  return new Date(`${date}T00:00:00+07:00`);
}

/** Ngày Việt Nam (`YYYY-MM-DD`) của một thời điểm. */
export function vnDateOf(instant: Date): string {
  return new Date(instant.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Thứ theo giờ Việt Nam: 1 = Thứ Hai … 7 = Chủ Nhật. */
export function vnIsoDow(instant: Date): number {
  const day = new Date(instant.getTime() + VN_OFFSET_MS).getUTCDay();
  return day === 0 ? 7 : day;
}

export function vnHour(instant: Date): number {
  return new Date(instant.getTime() + VN_OFFSET_MS).getUTCHours();
}

export function floorHour(instant: Date): Date {
  return new Date(Math.floor(instant.getTime() / HOUR_MS) * HOUR_MS);
}

/**
 * Các khung 1 giờ trong [gte, lt) rơi vào ô `dow` × `hour` giờ Việt Nam (L29),
 * cắt theo hai đầu khoảng. Khoảng tối đa 366 ngày ⇒ tối đa 53 khung.
 */
export function hourSlots(range: { gte: Date; lt: Date }, dow: number, hour: number): Array<{ gte: Date; lt: Date }> {
  const slots: Array<{ gte: Date; lt: Date }> = [];
  for (let day = vnDayStart(vnDateOf(range.gte)); day < range.lt; day = new Date(day.getTime() + DAY_MS)) {
    if (vnIsoDow(day) !== dow) continue;
    const start = new Date(day.getTime() + hour * HOUR_MS);
    const end = new Date(start.getTime() + HOUR_MS);
    const gte = start > range.gte ? start : range.gte;
    const lt = end < range.lt ? end : range.lt;
    if (gte < lt) slots.push({ gte, lt });
  }
  return slots;
}

const NOTHING: Prisma.AuditLogWhereInput = { id: { in: [] } };

/** Tập action sau khi giao `group` với `action` (L27); undefined ⇒ không lọc theo action. */
function allowedActions(filter: ActivityFilter, omit: readonly FilterDimension[]): string[] | undefined {
  let allowed: Set<string> | undefined;
  if (filter.groups && !omit.includes("group")) {
    allowed = new Set(filter.groups.flatMap((group) => AUDIT_ACTION_GROUPS[group]));
  }
  if (filter.actions && !omit.includes("action")) {
    const actions = filter.actions;
    allowed = allowed ? new Set(actions.filter((action) => allowed!.has(action))) : new Set(actions);
  }
  return allowed ? [...allowed] : undefined;
}

/**
 * `where` của `audit_logs` (và `audit_logs_archive`, cùng cột) cho mọi bộ lọc.
 * Nhóm đổi thành `action IN (...)` để đi index `(action, createdAt)` (L14).
 */
export function buildActivityWhere(filter: ActivityFilter, options: WhereOptions = {}): Prisma.AuditLogWhereInput {
  const omit = options.omit ?? [];
  const and: Prisma.AuditLogWhereInput[] = [];

  const actions = allowedActions(filter, omit);
  if (actions) and.push({ action: { in: actions } });

  if (filter.resubmit !== undefined && !omit.includes("resubmit")) {
    // Dòng cũ thiếu khoá được đọc là "gửi lần đầu" (L28) ⇒ `false` là "khác true".
    // `NOT` không gồm dòng có metadata null hoặc thiếu khoá (so sánh với NULL) ⇒ thêm AnyNull.
    and.push(
      filter.resubmit
        ? { metadata: { path: ["resubmit"], equals: true } }
        : {
            OR: [
              { NOT: { metadata: { path: ["resubmit"], equals: true } } },
              { metadata: { path: ["resubmit"], equals: Prisma.AnyNull } },
            ],
          },
    );
  }

  if (filter.actorRoles && !omit.includes("actorRole")) {
    const roles = filter.actorRoles.map(
      (role): Prisma.AuditLogWhereInput => (role === "SYSTEM" ? { actorId: null } : { actorRole: role }),
    );
    and.push(roles.length === 1 ? roles[0]! : { OR: roles });
  }

  if (filter.actorId) and.push({ actorId: filter.actorId });

  if (filter.range && (filter.range.gte || filter.range.lt)) {
    and.push({
      createdAt: {
        ...(filter.range.gte ? { gte: filter.range.gte } : {}),
        ...(filter.range.lt ? { lt: filter.range.lt } : {}),
      },
    });
  }

  if (filter.slot && filter.range?.gte && filter.range.lt && !omit.includes("slot")) {
    const slots = hourSlots({ gte: filter.range.gte, lt: filter.range.lt }, filter.slot.dow, filter.slot.hour);
    and.push(slots.length === 0 ? NOTHING : { OR: slots.map((slot) => ({ createdAt: slot })) });
  }

  if (filter.qUserIds) {
    const ids = { in: filter.qUserIds };
    and.push(
      filter.qUserIds.length === 0
        ? NOTHING
        : options.qMatch === "actor"
          ? { actorId: ids }
          : { OR: [{ actorId: ids }, { entityType: "User", entityId: ids }] },
    );
  }

  if (filter.entity) and.push({ entityType: filter.entity.type, entityId: filter.entity.id });

  return and.length === 0 ? {} : { AND: and };
}

/** Mốc thời gian so với cột `timestamp(3)` (giờ UTC, không múi giờ) mà không phụ thuộc TimeZone của phiên. */
export function utcSql(instant: Date): Prisma.Sql {
  return Prisma.sql`(${instant.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

/** Thêm cho top người làm: mọi dòng có người làm, hoặc đúng các id này. */
export type StatsActorFilter = "any" | string[];

/**
 * `WHERE` của `audit_log_hourly_stats` (L18). Bảng chỉ có nhóm, vai trò và
 * người làm, nên `action`/`resubmit` không áp được ở đây (service đếm thẳng
 * trên `audit_logs` khi có hai bộ lọc này); `q` chỉ khớp người làm.
 */
export function buildStatsWhereSql(
  filter: ActivityFilter,
  window: { gte: Date; lt: Date },
  omit: readonly FilterDimension[] = [],
  actors?: StatsActorFilter,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"bucketStart" >= ${utcSql(window.gte)}`,
    Prisma.sql`"bucketStart" < ${utcSql(window.lt)}`,
  ];
  if (filter.groups && !omit.includes("group")) {
    conditions.push(Prisma.sql`"actionGroup" IN (${Prisma.join(filter.groups)})`);
  }
  if (filter.actorRoles && !omit.includes("actorRole")) {
    conditions.push(Prisma.sql`"actorKind" IN (${Prisma.join(filter.actorRoles)})`);
  }
  if (filter.slot && filter.range?.gte && filter.range.lt && !omit.includes("slot")) {
    const slots = hourSlots({ gte: filter.range.gte, lt: filter.range.lt }, filter.slot.dow, filter.slot.hour);
    conditions.push(
      slots.length === 0
        ? Prisma.sql`FALSE`
        : Prisma.sql`"bucketStart" IN (${Prisma.join(slots.map((slot) => utcSql(slot.gte)))})`,
    );
  }
  if (filter.qUserIds) {
    conditions.push(
      filter.qUserIds.length === 0 ? Prisma.sql`FALSE` : Prisma.sql`"actorId" IN (${Prisma.join(filter.qUserIds)})`,
    );
  }
  if (actors === "any") conditions.push(Prisma.sql`"actorId" IS NOT NULL`);
  else if (actors) {
    conditions.push(actors.length === 0 ? Prisma.sql`FALSE` : Prisma.sql`"actorId" IN (${Prisma.join(actors)})`);
  }
  return Prisma.join(conditions, " AND ");
}
