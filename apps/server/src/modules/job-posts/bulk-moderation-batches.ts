// AD-29 bước 7 — chạy một lô duyệt / từ chối hàng loạt và giữ kết quả trong bộ nhớ
// (docs/06-backend/job-quality-moderation/PLAN.md, bước 7, mục "Chốt thêm trước khi làm").
import type { BulkModerationResult, BulkModerationSkipReason } from "@sip/shared-types";

/**
 * Số tin xử lý cùng lúc. Mỗi tin một transaction, giữ một kết nối DB; Prisma mặc định mở
 * (số nhân vật lý × 2 + 1) kết nối (máy dev: 13). 5 vẫn chừa chỗ cho request khác, kể cả
 * khi hai Admin cùng chạy lô. Đo trên Neon: 50 tin ≈ 5,9 s (10 tin cùng lúc ≈ 3,3 s).
 */
export const BULK_MODERATION_CONCURRENCY = 5;
/** Chờ tối đa chừng này rồi trả phần đã xong; phần còn lại chạy tiếp ở nền. */
export const BULK_MODERATION_SYNC_MS = 7_000;
/** Kết quả lô giữ chừng này sau khi lô chạy xong. */
export const BULK_BATCH_TTL_MS = 10 * 60 * 1000;

export type BulkItemOutcome = "OK" | BulkModerationSkipReason;

interface BatchState {
  adminId: string;
  action: BulkModerationResult["action"];
  ids: string[];
  outcomes: Map<string, BulkItemOutcome>;
  /** null = còn tin đang chạy. */
  finishedAt: number | null;
}

export interface BulkModerationBatchesOptions {
  concurrency?: number;
  syncMs?: number;
  ttlMs?: number;
  now?: () => number;
}

export class BulkModerationBatches {
  private readonly batches = new Map<string, BatchState>();
  private readonly concurrency: number;
  private readonly syncMs: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: BulkModerationBatchesOptions = {}) {
    this.concurrency = options.concurrency ?? BULK_MODERATION_CONCURRENCY;
    this.syncMs = options.syncMs ?? BULK_MODERATION_SYNC_MS;
    this.ttlMs = options.ttlMs ?? BULK_BATCH_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /**
   * Chạy `worker` cho từng id, tối đa `concurrency` id cùng lúc, chờ tối đa `syncMs`.
   * `worker` tự bắt lỗi của từng tin; lỗi lọt ra vẫn chỉ tính là `FAILED` cho tin đó.
   * Hết giờ chờ thì trả ảnh chụp hiện tại; các tin chưa xong nằm ở `pending` và tiếp tục chạy.
   */
  async run(input: {
    batchId: string;
    adminId: string;
    action: BulkModerationResult["action"];
    ids: string[];
    worker: (id: string) => Promise<BulkItemOutcome>;
    /** Gọi một lần khi mọi tin đã xong (kể cả phần chạy nền), với kết quả cuối. Lỗi bị nuốt. */
    onSettled?: (result: BulkModerationResult) => void;
  }): Promise<BulkModerationResult> {
    this.purgeExpired();
    const state: BatchState = {
      adminId: input.adminId,
      action: input.action,
      ids: input.ids,
      outcomes: new Map(),
      finishedAt: null,
    };
    this.batches.set(input.batchId, state);

    let next = 0;
    const lane = async (): Promise<void> => {
      while (next < input.ids.length) {
        const id = input.ids[next++]!;
        const outcome = await input.worker(id).catch((): BulkItemOutcome => "FAILED");
        state.outcomes.set(id, outcome);
      }
    };
    const done = Promise.all(Array.from({ length: Math.min(this.concurrency, input.ids.length) }, lane)).then(() => {
      state.finishedAt = this.now();
      try {
        input.onSettled?.(this.snapshot(input.batchId, state));
      } catch {
        // Việc kéo theo không được làm hỏng kết quả lô (người gọi tự ghi log trong callback).
      }
    });

    let timer: NodeJS.Timeout | undefined;
    const waited = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.syncMs);
    });
    await Promise.race([done, waited]);
    clearTimeout(timer);
    return this.snapshot(input.batchId, state);
  }

  /** Kết quả mới nhất của lô; null nếu không có, đã hết hạn, hoặc lô của Admin khác. */
  get(batchId: string, adminId: string): BulkModerationResult | null {
    this.purgeExpired();
    const state = this.batches.get(batchId);
    if (!state || state.adminId !== adminId) return null;
    return this.snapshot(batchId, state);
  }

  private snapshot(batchId: string, state: BatchState): BulkModerationResult {
    const result: BulkModerationResult = { batchId, action: state.action, succeeded: [], skipped: [], pending: [] };
    // Giữ thứ tự id Admin gửi lên, không theo thứ tự chạy xong.
    for (const id of state.ids) {
      const outcome = state.outcomes.get(id);
      if (outcome === undefined) result.pending.push(id);
      else if (outcome === "OK") result.succeeded.push(id);
      else result.skipped.push({ id, reason: outcome });
    }
    return result;
  }

  private purgeExpired(): void {
    const now = this.now();
    for (const [batchId, state] of this.batches) {
      if (state.finishedAt !== null && now - state.finishedAt > this.ttlMs) this.batches.delete(batchId);
    }
  }
}
