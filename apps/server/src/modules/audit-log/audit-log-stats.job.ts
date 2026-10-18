import cron from "node-cron";
import type { Role } from "@prisma/client";
import type { AuditActorRoleFilter } from "@sip/shared-types";
import type { Logger } from "../../shared/logger";
import { groupOfAction } from "./audit-log.actions";
import type { AuditLogRepository, StatBucket } from "./audit-log.repository";
import { HOUR_MS, floorHour } from "./audit-log.where";

/** Mỗi lần chạy gộp tối đa chừng này giờ mới; còn thiếu thì lần sau làm tiếp (L17). */
export const ROLLUP_MAX_HOURS = 24 * 31;
/** Tính lại thêm chừng này giờ trước giờ mới nhất đã gộp, để bắt dòng ghi muộn (L17). */
export const ROLLUP_LOOKBACK_HOURS = 2;

export interface AuditLogStatsDeps {
  auditLogRepository: AuditLogRepository;
  logger: Logger;
}

/** Dòng nhật ký không có người làm là "Hệ thống" (L7, L16). */
export function actorKindOf(actorId: string | null, actorRole: Role | null): AuditActorRoleFilter {
  return actorId === null || actorRole === null ? "SYSTEM" : actorRole;
}

/**
 * Gộp các dòng (đã đếm theo giờ × action, hoặc từng dòng với `count: 1`) thành
 * dòng của bảng thống kê: giờ × nhóm × người làm.
 */
export function toStatBuckets(
  rows: Iterable<{
    bucketStart: Date;
    action: string;
    entityType: string;
    actorRole: Role | null;
    actorId: string | null;
    count: number;
  }>,
): StatBucket[] {
  const buckets = new Map<string, StatBucket>();
  for (const row of rows) {
    const actionGroup = groupOfAction(row.action, row.entityType);
    const actorKind = actorKindOf(row.actorId, row.actorRole);
    const key = `${row.bucketStart.getTime()}|${actionGroup}|${actorKind}|${row.actorId ?? ""}`;
    const existing = buckets.get(key);
    if (existing) existing.count += row.count;
    else buckets.set(key, { bucketStart: row.bucketStart, actionGroup, actorKind, actorId: row.actorId, count: row.count });
  }
  return [...buckets.values()];
}

/**
 * Các khoảng giờ cần tính lại ở lần chạy này (L17):
 * - lùi `ROLLUP_LOOKBACK_HOURS` giờ trước giờ mới nhất đã gộp, tới hết giờ đó;
 * - tiếp theo, từ giờ của dòng nhật ký đầu tiên sau giờ mới nhất, tối đa
 *   `ROLLUP_MAX_HOURS` giờ. Nhảy qua quãng không có dòng nào nên luôn tiến lên,
 *   kể cả khi server tắt lâu.
 * Không bao giờ tính giờ đang chạy dở: phần đó `/stats` đếm thẳng (L18).
 */
export function planRollupRanges(
  latest: Date | null,
  nextRowAt: Date | null,
  now: Date,
): Array<{ gte: Date; lt: Date }> {
  const limit = floorHour(now);
  const clamp = (date: Date) => (date < limit ? date : limit);
  const ranges: Array<{ gte: Date; lt: Date }> = [];

  if (latest) {
    const lookback = { gte: new Date(latest.getTime() - ROLLUP_LOOKBACK_HOURS * HOUR_MS), lt: clamp(new Date(latest.getTime() + HOUR_MS)) };
    if (lookback.gte < lookback.lt) ranges.push(lookback);
  }

  if (nextRowAt) {
    const gte = floorHour(nextRowAt);
    const lt = clamp(new Date(gte.getTime() + ROLLUP_MAX_HOURS * HOUR_MS));
    const previous = ranges[ranges.length - 1];
    if (gte < lt) {
      // Liền với khoảng lùi ⇒ gộp thành một khoảng.
      if (previous && gte.getTime() <= previous.lt.getTime()) previous.lt = lt > previous.lt ? lt : previous.lt;
      else ranges.push({ gte, lt });
    }
  }
  return ranges;
}

/**
 * Cron gộp số (AD-20, L16–L17). Tính lại một giờ thì ra cùng kết quả, nên chạy
 * lại hay chạy trùng đều không sao. Trả số dòng thống kê đã ghi.
 */
export async function runAuditLogStatsRollup(deps: AuditLogStatsDeps, now: Date = new Date()): Promise<number> {
  const { auditLogRepository, logger } = deps;
  const latest = await auditLogRepository.findLatestStatBucket();
  const nextRowAt = await auditLogRepository.findFirstCreatedAt(
    latest ? new Date(latest.getTime() + HOUR_MS) : undefined,
  );
  const ranges = planRollupRanges(latest, nextRowAt, now);
  if (ranges.length === 0) return 0;

  const rows = (await Promise.all(ranges.map((range) => auditLogRepository.aggregateHours(range.gte, range.lt)))).flat();
  const buckets = toStatBuckets(rows);
  await auditLogRepository.replaceStats(ranges, buckets);

  const span = ranges.map((range) => `${range.gte.toISOString()}–${range.lt.toISOString()}`).join(", ");
  logger.info(`Audit log stats rollup: ${buckets.length} row(s) for ${span}`);
  return buckets.length;
}

export function startAuditLogStatsJob(deps: AuditLogStatsDeps): void {
  const run = () => {
    void runAuditLogStatsRollup(deps).catch((error: unknown) => {
      deps.logger.error("Audit log stats rollup failed", { error });
    });
  };
  // Server dev không chạy liên tục: chạy bù ngay khi khởi động, rồi phút 5 mỗi giờ.
  run();
  cron.schedule("5 * * * *", run, { timezone: "Asia/Ho_Chi_Minh" });
}
