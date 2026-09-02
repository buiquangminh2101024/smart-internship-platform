// Port thuần TypeScript — không import Redis ở đây, chỉ implementation
// (infrastructure/redis-rate-limiter.ts) mới phụ thuộc ioredis.
export interface RateLimiter {
  /**
   * Tăng counter cho `key` trong cửa sổ `windowSeconds`.
   * Trả về true nếu request được phép (chưa vượt `limit`), false nếu bị chặn.
   */
  consume(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}
