import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import { ROLLUP_LOOKBACK_HOURS } from "./audit-log-stats.job";
import type { AuditLogRepository } from "./audit-log.repository";
import { DAY_MS, HOUR_MS, floorHour } from "./audit-log.where";

/** Số dòng mỗi lô chuyển sang bảng lưu trữ (L20). */
export const ARCHIVE_BATCH_SIZE = 1000;
/** Cron mỗi đêm chuyển tối đa chừng này lô; còn thì đêm sau làm tiếp (L21). */
export const ARCHIVE_MAX_BATCHES_PER_RUN = 50;
/** `AUDIT_RETENTION_DAYS` nhỏ nhất (L21); script tay chỉ được nhỏ hơn trên branch đo (L22). */
export const MIN_RETENTION_DAYS = 30;

export interface AuditLogArchiveDeps {
  auditLogRepository: AuditLogRepository;
  logger: Logger;
}

export interface ArchiveRunResult {
  /** null ⇒ bảng thống kê còn rỗng, không chuyển gì. */
  cutoff: Date | null;
  moved: number;
  batches: number;
  /** false ⇒ dừng vì hết số lô, còn dòng cũ hơn mốc. */
  done: boolean;
}

/**
 * Mốc chuyển lưu trữ: dòng có `createdAt` nhỏ hơn mốc thì chuyển. Cắt tròn
 * theo giờ để không giờ nào chỉ còn một phần dòng trong bảng chính (AD-20 mục 6).
 *
 * Không vượt quá phần cron gộp số không bao giờ tính lại (trước giờ mới nhất đã
 * gộp, lùi `ROLLUP_LOOKBACK_HOURS`): chuyển dòng của giờ chưa gộp thì biểu đồ mất
 * số của giờ đó. Bảng thống kê còn rỗng ⇒ null, không chuyển gì.
 */
export function archiveCutoff(now: Date, retentionDays: number, latestStatBucket: Date | null): Date | null {
  if (!latestStatBucket) return null;
  const wanted = floorHour(new Date(now.getTime() - retentionDays * DAY_MS));
  const rolledUp = new Date(latestStatBucket.getTime() - ROLLUP_LOOKBACK_HOURS * HOUR_MS);
  return wanted < rolledUp ? wanted : rolledUp;
}

/**
 * Chuyển dòng cũ hơn `retentionDays` ngày sang `audit_logs_archive` theo lô
 * (L20–L22). Dùng chung cho cron và script tay. Mỗi lô là một câu lệnh, nên
 * dừng giữa chừng cũng không mất dòng nào.
 */
export async function archiveOldAuditLogs(
  deps: AuditLogArchiveDeps,
  options: { retentionDays: number; now?: Date; maxBatches?: number; batchSize?: number },
): Promise<ArchiveRunResult> {
  const now = options.now ?? new Date();
  const maxBatches = options.maxBatches ?? ARCHIVE_MAX_BATCHES_PER_RUN;
  const batchSize = options.batchSize ?? ARCHIVE_BATCH_SIZE;

  const cutoff = archiveCutoff(now, options.retentionDays, await deps.auditLogRepository.findLatestStatBucket());
  if (!cutoff) return { cutoff: null, moved: 0, batches: 0, done: true };

  let moved = 0;
  let batches = 0;
  while (batches < maxBatches) {
    const count = await deps.auditLogRepository.archiveBatch(cutoff, batchSize, now);
    batches += 1;
    moved += count;
    if (count < batchSize) return { cutoff, moved, batches, done: true };
  }
  return { cutoff, moved, batches, done: false };
}

export function startAuditLogRetentionJob(deps: AuditLogArchiveDeps & { retentionDays: number }): void {
  const run = async () => {
    try {
      const result = await archiveOldAuditLogs(deps, { retentionDays: deps.retentionDays });
      if (!result.cutoff) {
        deps.logger.warn("Audit log archive skipped: hourly stats table is empty");
        return;
      }
      deps.logger.info(
        `Audit log archive: moved ${result.moved} row(s) older than ${result.cutoff.toISOString()} in ${result.batches} batch(es)` +
          (result.done ? "" : ", more left for the next run"),
      );
    } catch (error) {
      deps.logger.error("Audit log archive failed", { error });
    }
  };
  cron.schedule("0 3 * * *", () => void run(), { timezone: "Asia/Ho_Chi_Minh" });
}
