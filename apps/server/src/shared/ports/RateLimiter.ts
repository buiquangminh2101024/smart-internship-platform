// Port thuần TypeScript — không import Redis ở đây, chỉ implementation
// (infrastructure/redis-rate-limiter.ts) mới phụ thuộc ioredis.
export interface RateLimiter {
  /**
   * Tăng counter cho `key` trong cửa sổ `windowSeconds`.
   * Trả về true nếu request được phép (chưa vượt `limit`), false nếu bị chặn.
   */
  consume(key: string, limit: number, windowSeconds: number): Promise<boolean>;

  /**
   * Đọc counter của `key` mà không tăng (AD-31 D4). `count` = 0 nếu chưa có;
   * `ttlSeconds` = thời gian còn lại của cửa sổ (0 nếu chưa có, -1 nếu không có hạn).
   */
  peek(key: string): Promise<{ count: number; ttlSeconds: number }>;

  /** Xoá counter của `key` (đăng nhập đúng thì xoá bộ đếm sai). */
  reset(key: string): Promise<void>;
}
