import type { Redis } from "ioredis";

/** Khoá tự hết hạn nếu process chết giữa lượt. Lượt chạy bị chặn bởi mốc dừng 60 giây (Q4). */
const LOCK_TTL_SECONDS = 5 * 60;
/** Mốc lần chạy gần nhất chỉ để xếp thứ tự công ty; công ty tắt hết tự mời thì tự xoá sau 7 ngày. */
const LAST_RUN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Trạng thái của lượt tự động mời trên Redis (AD-23, bước 5):
 * - khoá theo công ty: mỗi công ty chỉ một lượt chạy cùng lúc, dù lượt đến từ cron, lúc
 *   đăng tin, lúc ứng viên từ chối hay lúc đổi cài đặt;
 * - mốc `last-run`: cron xử lý công ty chạy lâu nhất trước (Q4).
 */
export class AutoOutreachRunStore {
  private readonly redis: Redis;

  constructor({ redis }: { redis: Redis }) {
    this.redis = redis;
  }

  /** true nếu lấy được khoá; false nếu công ty đang có lượt khác chạy. */
  async tryLock(companyId: string): Promise<boolean> {
    return (await this.redis.set(lockKey(companyId), "1", "EX", LOCK_TTL_SECONDS, "NX")) === "OK";
  }

  async unlock(companyId: string): Promise<void> {
    await this.redis.del(lockKey(companyId));
  }

  async setLastRun(companyId: string, at: Date): Promise<void> {
    await this.redis.set(lastRunKey(companyId), String(at.getTime()), "EX", LAST_RUN_TTL_SECONDS);
  }

  /** Mốc (ms) theo công ty; công ty chưa chạy bao giờ không có trong Map. */
  async getLastRuns(companyIds: string[]): Promise<Map<string, number>> {
    if (companyIds.length === 0) return new Map();
    const values = await this.redis.mget(...companyIds.map(lastRunKey));
    const result = new Map<string, number>();
    companyIds.forEach((companyId, index) => {
      const value = values[index];
      if (value) result.set(companyId, Number(value));
    });
    return result;
  }
}

function lockKey(companyId: string): string {
  return `auto-outreach:lock:${companyId}`;
}

function lastRunKey(companyId: string): string {
  return `auto-outreach:last-run:${companyId}`;
}
