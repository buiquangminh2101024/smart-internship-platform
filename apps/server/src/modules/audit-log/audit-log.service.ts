import type { AuditLog, Prisma } from "@prisma/client";
import type {
  AuditActionGroup,
  AuditActivityGroup,
  AuditActivityItem,
  AuditActivityPage,
  AuditActivityStats,
  AuditActorRoleFilter,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { RateLimiter } from "../../shared/ports/RateLimiter";
import type { CompanySubscriptionRepository } from "../subscriptions/company-subscription.repository";
import type { UserRepository } from "../users/user.repository";
import { groupOfAction } from "./audit-log.actions";
import { exportFileName, toActivityCsv } from "./audit-log.csv";
import type { ActivityExportQuery, ActivityListQuery, ActivityStatsQuery } from "./audit-log.dto";
import type { AuditLogRepository, AuditLogWriteData, StatBucket } from "./audit-log.repository";
import { toStatBuckets } from "./audit-log-stats.job";
import {
  DAY_MS,
  HOUR_MS,
  buildActivityWhere,
  buildStatsWhereSql,
  floorHour,
  vnDateOf,
  vnDayStart,
  vnHour,
  vnIsoDow,
  type ActivityFilter,
  type FilterDimension,
  type StatsActorFilter,
} from "./audit-log.where";

/** `q` khớp tối đa chừng này người dùng (L8). */
export const MAX_SEARCH_USERS = 200;
/** Xuất CSV tối đa chừng này dòng, mỗi Admin tối đa chừng này lần mỗi giờ (L13). */
export const EXPORT_MAX_ROWS = 5000;
export const EXPORT_LIMIT_PER_HOUR = 10;
const DEFAULT_STATS_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const TOP_ACTORS = 5;

const GROUP_ORDER: readonly AuditActionGroup[] = ["JOB_POST", "COMPANY", "CATALOG", "PAYMENT", "ACCOUNT", "SECURITY"];
const ROLE_ORDER: readonly AuditActorRoleFilter[] = ["ADMIN", "EMPLOYER", "CANDIDATE", "SYSTEM"];
const JOB_POST_FLOW_ACTIONS = [
  "JOB_POST_SUBMITTED",
  "JOB_POST_AUTO_PUBLISHED",
  "JOB_POST_APPROVED",
  "JOB_POST_REJECTED",
  "JOB_POST_RETRACTED",
];

/**
 * `metadata.reason` — lý do Admin nhập khi từ chối/gỡ tin, từ chối công ty, khoá
 * tài khoản (AD-17, dùng lại ở users.service). Dòng
 * khác không có khoá này (hoặc metadata không phải object) ⇒ null.
 */
export function readReason(metadata: Prisma.JsonValue): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const reason = metadata["reason"];
  return typeof reason === "string" && reason.trim() !== "" ? reason : null;
}

function readObject(metadata: Prisma.JsonValue): Prisma.JsonObject | null {
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) ? metadata : null;
}

const SUBMIT_ACTIONS = new Set(["JOB_POST_SUBMITTED", "JOB_POST_AUTO_PUBLISHED"]);

/**
 * `metadata.resubmit` (L28) — chỉ có nghĩa với hai hành động gửi tin; dòng ghi
 * trước khi có khoá này coi là gửi lần đầu. Hành động khác ⇒ null.
 */
export function readResubmit(action: string, metadata: Prisma.JsonValue): boolean | null {
  if (!SUBMIT_ACTIONS.has(action)) return null;
  return readObject(metadata)?.["resubmit"] === true;
}

/** `metadata.ip` (L6) — chỉ dòng nhóm Bảo mật mới lưu IP. */
export function readIp(action: string, metadata: Prisma.JsonValue): string | null {
  if (groupOfAction(action) !== "SECURITY") return null;
  const ip = readObject(metadata)?.["ip"];
  return typeof ip === "string" && ip !== "" ? ip : null;
}

/** Các tham số lọc chung của danh sách, CSV và `/stats` (đã kiểm ở DTO). */
type FilterQuery = Pick<
  ActivityListQuery,
  "actor" | "group" | "action" | "resubmit" | "actorRole" | "from" | "to" | "dow" | "hour" | "q"
> &
  Partial<Pick<ActivityListQuery, "actorId" | "since" | "until" | "entityType" | "entityId">>;

/**
 * Nhật ký hoạt động cho Admin (AD-16, AD-20). `summary` là câu tiếng Việt do caller
 * render lúc ghi — snapshot, không dựng lại khi đọc (giống Notification).
 */
export class AuditLogService {
  private readonly auditLogRepository: AuditLogRepository;
  private readonly userRepository: UserRepository;
  private readonly companySubscriptionRepository: CompanySubscriptionRepository;
  private readonly rateLimiter: RateLimiter;
  private readonly logger: Logger;

  constructor({
    auditLogRepository,
    userRepository,
    companySubscriptionRepository,
    rateLimiter,
    logger,
  }: {
    auditLogRepository: AuditLogRepository;
    userRepository: UserRepository;
    companySubscriptionRepository: CompanySubscriptionRepository;
    rateLimiter: RateLimiter;
    logger: Logger;
  }) {
    this.auditLogRepository = auditLogRepository;
    this.userRepository = userRepository;
    this.companySubscriptionRepository = companySubscriptionRepository;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
  }

  /**
   * GET /admin/activity (L7–L10, L12, L23, L27–L29, L33). `total` chỉ tính ở trang
   * đầu. Dashboard vẫn gọi `?limit&actor=admin` như cũ (D14).
   */
  async listActivity(query: ActivityListQuery): Promise<AuditActivityPage> {
    const { filter, searchTruncated } = await this.toFilter(query);
    const where = buildActivityWhere(filter);
    const [page, total] = await Promise.all([
      this.auditLogRepository.list(where, {
        cursor: query.cursor,
        limit: query.limit,
        order: query.order,
        archived: query.archived,
      }),
      query.cursor ? undefined : this.auditLogRepository.count(where, query.archived),
    ]);
    return {
      items: await this.toItems(page.items),
      hasMore: page.hasMore,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      ...(total !== undefined ? { total } : {}),
      ...(searchTruncated ? { searchTruncated: true } : {}),
    };
  }

  /** GET /admin/activity/:id (L35). */
  async getActivity(id: string, archived: boolean): Promise<AuditActivityItem> {
    const row = await this.auditLogRepository.findById(id, archived);
    if (!row) throw new AppError(404, "Activity entry not found");
    const [item] = await this.toItems([row]);
    return item!;
  }

  /**
   * GET /admin/activity/export (L13). Tối đa `EXPORT_MAX_ROWS` dòng, mỗi Admin
   * `EXPORT_LIMIT_PER_HOUR` lần mỗi giờ.
   */
  async exportCsv(adminId: string, query: ActivityExportQuery, now: Date = new Date()): Promise<{ fileName: string; content: string }> {
    let allowed = true;
    try {
      allowed = await this.rateLimiter.consume(`audit-export:${adminId}`, EXPORT_LIMIT_PER_HOUR, 60 * 60);
    } catch (error) {
      // Redis lỗi thì vẫn cho xuất: giới hạn chỉ để đỡ tải, không phải chốt bảo mật.
      this.logger.error("Không kiểm được giới hạn xuất nhật ký", { error });
    }
    if (!allowed) {
      throw new AppError(429, `At most ${EXPORT_LIMIT_PER_HOUR} exports per hour`, "AUDIT_EXPORT_RATE_LIMITED");
    }

    const { filter } = await this.toFilter(query);
    const where = buildActivityWhere(filter);
    const total = await this.auditLogRepository.count(where, query.archived);
    if (total > EXPORT_MAX_ROWS) {
      throw new AppError(
        422,
        `Export is limited to ${EXPORT_MAX_ROWS} rows (${total} match); narrow the date range`,
        "AUDIT_EXPORT_TOO_LARGE",
      );
    }
    const rows = await this.auditLogRepository.listForExport(where, {
      order: query.order,
      archived: query.archived,
      take: EXPORT_MAX_ROWS,
    });
    return { fileName: exportFileName(now), content: toActivityCsv(await this.toItems(rows)) };
  }

  /**
   * GET /admin/activity/stats (L11, L18, L31, L32). Các giờ đã gộp đọc từ
   * `audit_log_hourly_stats`; phần sau giờ gộp gần nhất đếm thẳng trên
   * `audit_logs`. Có `action`/`resubmit` thì đếm thẳng cả khoảng, vì bảng thống
   * kê chỉ gộp theo nhóm (index `(action, createdAt)` giữ phần này nhẹ).
   * `q` ở đây chỉ khớp người làm, trừ `securityAlerts` (khớp như danh sách).
   */
  async getStats(query: ActivityStatsQuery, now: Date = new Date()): Promise<AuditActivityStats> {
    const { from, to } = statsDateRange(query, now);
    const range = { gte: vnDayStart(from), lt: new Date(vnDayStart(to).getTime() + DAY_MS) };
    const [{ filter }, latest] = await Promise.all([
      this.toFilter({ ...query, from, to }),
      filterNeedsRaw(query) ? Promise.resolve(null) : this.auditLogRepository.findLatestStatBucket(),
    ]);

    // Bảng thống kê phủ [range.gte, split); đếm thẳng phủ [split, range.lt).
    const rawFrom = latest && !filterNeedsRaw(query) ? new Date(latest.getTime() + HOUR_MS) : range.gte;
    const split = new Date(Math.min(Math.max(rawFrom.getTime(), range.gte.getTime()), range.lt.getTime()));
    const statsWindow = split > range.gte ? { gte: range.gte, lt: split } : null;
    const statsWhere = (omit: readonly FilterDimension[] = [], actors?: StatsActorFilter) =>
      buildStatsWhereSql(filter, statsWindow!, omit, actors);

    const rawWhere = buildActivityWhere(
      { ...filter, range: { gte: split, lt: range.lt } },
      { omit: ["group", "actorRole", "slot"], qMatch: "actor" },
    );
    const flowWhere = buildActivityWhere(filter, { omit: ["group", "action", "resubmit"], qMatch: "actor" });

    const [rawRows, dayGroup, groups, roles, heat, securityAlerts, flow, resubmitted] = await Promise.all([
      split < range.lt ? this.auditLogRepository.findStatRows(rawWhere) : Promise.resolve([]),
      statsWindow ? this.auditLogRepository.sumStats(statsWhere(), ["day", "group"]) : Promise.resolve([]),
      statsWindow ? this.auditLogRepository.sumStats(statsWhere(["group"]), ["group"]) : Promise.resolve([]),
      statsWindow ? this.auditLogRepository.sumStats(statsWhere(["actorRole"]), ["role"]) : Promise.resolve([]),
      statsWindow ? this.auditLogRepository.sumStats(statsWhere(["slot"]), ["dow", "hour"]) : Promise.resolve([]),
      this.auditLogRepository.count({
        AND: [buildActivityWhere(filter), { action: "AUTH_LOGIN_FAILED_REPEATED" }],
      }),
      this.auditLogRepository.countByAction({ AND: [flowWhere, { action: { in: JOB_POST_FLOW_ACTIONS } }] }),
      this.auditLogRepository.count({
        AND: [flowWhere, { action: "JOB_POST_SUBMITTED" }, { metadata: { path: ["resubmit"], equals: true } }],
      }),
    ]);

    // Phần đếm thẳng: lấy dư (bỏ nhóm, vai trò, ô giờ) rồi lọc lại cho từng biểu đồ (L31).
    const raw = toStatBuckets(
      rawRows.map((row) => ({ ...row, bucketStart: floorHour(row.createdAt), count: 1 })),
    );
    const matches = rawMatcher(filter);
    const rawAll = raw.filter((bucket) => matches(bucket));

    const topActors = await this.topActors(rawAll, statsWindow ? (actors) => statsWhere([], actors) : null);

    const byDay = new Map<string, Partial<Record<AuditActivityGroup, number>>>();
    for (let day = range.gte; day < range.lt; day = new Date(day.getTime() + DAY_MS)) byDay.set(vnDateOf(day), {});
    const addDay = (day: string, group: AuditActivityGroup, count: number) => {
      const counts = byDay.get(day);
      if (counts) counts[group] = (counts[group] ?? 0) + count;
    };
    for (const row of dayGroup) addDay(row.day, row.group, row.count);
    for (const bucket of rawAll) addDay(vnDateOf(bucket.bucketStart), bucket.actionGroup, bucket.count);

    const groupCounts = new Map<AuditActivityGroup, number>();
    const addGroup = (group: AuditActivityGroup, count: number) =>
      groupCounts.set(group, (groupCounts.get(group) ?? 0) + count);
    for (const row of groups) addGroup(row.group, row.count);
    for (const bucket of raw) if (matches(bucket, "group")) addGroup(bucket.actionGroup, bucket.count);

    const roleCounts = new Map<AuditActorRoleFilter, number>();
    for (const row of roles) roleCounts.set(row.role, (roleCounts.get(row.role) ?? 0) + row.count);
    for (const bucket of raw) {
      if (matches(bucket, "actorRole")) roleCounts.set(bucket.actorKind, (roleCounts.get(bucket.actorKind) ?? 0) + bucket.count);
    }

    const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const row of heat) heatmap[row.dow - 1]![row.hour]! += row.count;
    for (const bucket of raw) {
      if (matches(bucket, "slot")) heatmap[vnIsoDow(bucket.bucketStart) - 1]![vnHour(bucket.bucketStart)]! += bucket.count;
    }

    const submitted = flow.get("JOB_POST_SUBMITTED") ?? 0;
    return {
      from,
      to,
      byDay: [...byDay].map(([date, counts]) => ({
        date,
        // Khoá theo thứ tự nhóm cố định, không theo thứ tự cộng vào.
        counts: Object.fromEntries(
          [...GROUP_ORDER, "OTHER" as const].flatMap((group) => (counts[group] ? [[group, counts[group]]] : [])),
        ),
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      })),
      byGroup: [
        ...GROUP_ORDER.map((group) => ({ group, count: groupCounts.get(group) ?? 0 })),
        ...((groupCounts.get("OTHER") ?? 0) > 0 ? [{ group: "OTHER" as const, count: groupCounts.get("OTHER")! }] : []),
      ],
      byRole: ROLE_ORDER.map((role) => ({ role, count: roleCounts.get(role) ?? 0 })),
      topActors,
      heatmap,
      securityAlerts,
      jobPostFlow: {
        submittedFirst: submitted - resubmitted,
        submittedResubmit: resubmitted,
        autoPublished: flow.get("JOB_POST_AUTO_PUBLISHED") ?? 0,
        approved: flow.get("JOB_POST_APPROVED") ?? 0,
        rejected: flow.get("JOB_POST_REJECTED") ?? 0,
        retracted: flow.get("JOB_POST_RETRACTED") ?? 0,
      },
    };
  }

  /**
   * Top người làm của bảng thống kê cộng phần đếm thẳng. Lấy `TOP_ACTORS + L`
   * người đứng đầu bảng thống kê (L = số người có trong phần đếm thẳng) cộng số
   * chính xác của L người đó: người ngoài danh sách không thể vượt lên top.
   */
  private async topActors(
    raw: StatBucket[],
    statsWhere: ((actors: StatsActorFilter) => Prisma.Sql) | null,
  ): Promise<AuditActivityStats["topActors"]> {
    const totals = new Map<string, { role: AuditActorRoleFilter; stats: number; raw: number }>();
    for (const bucket of raw) {
      if (!bucket.actorId) continue;
      const entry = totals.get(bucket.actorId) ?? { role: bucket.actorKind, stats: 0, raw: 0 };
      entry.raw += bucket.count;
      totals.set(bucket.actorId, entry);
    }
    if (statsWhere) {
      const rawIds = [...totals.keys()];
      const [top, known] = await Promise.all([
        this.auditLogRepository.sumStats(statsWhere("any"), ["actorId", "role"], TOP_ACTORS + rawIds.length),
        rawIds.length > 0
          ? this.auditLogRepository.sumStats(statsWhere(rawIds), ["actorId", "role"])
          : Promise.resolve([]),
      ]);
      for (const row of [...top, ...known]) {
        if (!row.actorId) continue;
        const entry = totals.get(row.actorId) ?? { role: row.role, stats: 0, raw: 0 };
        entry.stats = row.count;
        totals.set(row.actorId, entry);
      }
    }

    const ranked = [...totals]
      .map(([actorId, entry]) => ({ actorId, role: entry.role, count: entry.stats + entry.raw }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count || a.actorId.localeCompare(b.actorId))
      .slice(0, TOP_ACTORS);
    const emails = await this.userRepository.findEmailsByIds(ranked.map((entry) => entry.actorId));
    return ranked.map((entry) => ({
      actorId: entry.actorId,
      actorRole: entry.role === "SYSTEM" ? null : entry.role,
      email: emails.get(entry.actorId) ?? null,
      count: entry.count,
    }));
  }

  /** Tham số API ⇒ bộ lọc; `q` tra ra id người dùng (L8). */
  private async toFilter(query: FilterQuery): Promise<{ filter: ActivityFilter; searchTruncated: boolean }> {
    let qUserIds: string[] | undefined;
    let searchTruncated = false;
    if (query.q) {
      const ids = await this.userRepository.findIdsByEmailContains(query.q, MAX_SEARCH_USERS + 1);
      searchTruncated = ids.length > MAX_SEARCH_USERS;
      qUserIds = ids.slice(0, MAX_SEARCH_USERS);
    }

    const range = query.since || query.until
      ? {
          gte: query.since ? new Date(query.since) : undefined,
          // `until` là thời điểm của dòng cuối phiên ⇒ tính cả mốc đó.
          lt: query.until ? new Date(new Date(query.until).getTime() + 1) : undefined,
        }
      : {
          gte: query.from ? vnDayStart(query.from) : undefined,
          lt: query.to ? new Date(vnDayStart(query.to).getTime() + DAY_MS) : undefined,
        };

    const filter: ActivityFilter = {
      groups: query.group,
      actions: query.action,
      resubmit: query.resubmit,
      actorRoles: query.actor === "admin" ? ["ADMIN"] : query.actorRole,
      actorId: query.actorId,
      range,
      slot: query.dow !== undefined && query.hour !== undefined ? { dow: query.dow, hour: query.hour } : undefined,
      qUserIds,
      entity: query.entityType && query.entityId ? { type: query.entityType, id: query.entityId } : undefined,
    };
    return { filter, searchTruncated };
  }

  private async toItems(rows: AuditLog[]): Promise<AuditActivityItem[]> {
    const actorIds = [...new Set(rows.flatMap((row) => (row.actorId ? [row.actorId] : [])))];
    const subscriptionIds = [
      ...new Set(rows.flatMap((row) => (row.entityType === "Subscription" ? [row.entityId] : []))),
    ];
    const [emails, companyIds] = await Promise.all([
      this.userRepository.findEmailsByIds(actorIds),
      this.companySubscriptionRepository.findCompanyIdsByIds(subscriptionIds),
    ]);
    return rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      actorRole: row.actorRole,
      actorEmail: row.actorId ? (emails.get(row.actorId) ?? null) : null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      summary: row.summary,
      reason: readReason(row.metadata),
      createdAt: row.createdAt.toISOString(),
      group: groupOfAction(row.action, row.entityType),
      ip: readIp(row.action, row.metadata),
      resubmit: readResubmit(row.action, row.metadata),
      companyId: row.entityType === "Subscription" ? (companyIds.get(row.entityId) ?? null) : null,
    }));
  }

  /**
   * Có `tx`: ghi cùng transaction với thao tác nghiệp vụ, lỗi thì rollback cả hai.
   * Không có `tx` (thao tác đã commit riêng, vd. repository danh mục tự mở
   * transaction): ghi sau cùng và chỉ log lỗi — mất một dòng nhật ký không đáng
   * để báo thất bại cho một thao tác đã thành công.
   */
  async record(entry: AuditLogWriteData, tx?: Prisma.TransactionClient): Promise<void> {
    if (tx) {
      await this.auditLogRepository.create(entry, tx);
      return;
    }
    try {
      await this.auditLogRepository.create(entry);
    } catch (error) {
      this.logger.error("Không ghi được audit log", { error, action: entry.action, entityId: entry.entityId });
    }
  }
}

/** Bảng thống kê không có `action`/cờ gửi lại ⇒ hai bộ lọc này phải đếm thẳng. */
function filterNeedsRaw(query: ActivityStatsQuery): boolean {
  return query.action !== undefined || query.resubmit !== undefined;
}

/** Khoảng ngày của `/stats`: mặc định 30 ngày tới hôm nay (giờ Việt Nam), tối đa 366 ngày. */
export function statsDateRange(query: { from?: string | undefined; to?: string | undefined }, now: Date): { from: string; to: string } {
  const shift = (date: string, days: number) => vnDateOf(new Date(vnDayStart(date).getTime() + days * DAY_MS));
  const to = query.to ?? (query.from && query.from > vnDateOf(now) ? query.from : vnDateOf(now));
  const from = query.from ?? shift(to, -(DEFAULT_STATS_DAYS - 1));
  if ((vnDayStart(to).getTime() - vnDayStart(from).getTime()) / DAY_MS + 1 > MAX_RANGE_DAYS) {
    throw new AppError(400, `Date range must be at most ${MAX_RANGE_DAYS} days`);
  }
  return { from, to };
}

/**
 * Kiểm một dòng gộp của phần đếm thẳng theo nhóm, vai trò và ô giờ; `skip` bỏ
 * qua chiều của chính biểu đồ đang tính (L31).
 */
function rawMatcher(filter: ActivityFilter): (bucket: StatBucket, skip?: FilterDimension) => boolean {
  return (bucket, skip) =>
    (skip === "group" || !filter.groups || (filter.groups as string[]).includes(bucket.actionGroup)) &&
    (skip === "actorRole" || !filter.actorRoles || filter.actorRoles.includes(bucket.actorKind)) &&
    (skip === "slot" ||
      !filter.slot ||
      (vnIsoDow(bucket.bucketStart) === filter.slot.dow && vnHour(bucket.bucketStart) === filter.slot.hour));
}
