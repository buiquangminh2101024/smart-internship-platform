export interface TokenBlacklist {
  /** Đưa `jti` vào blacklist cho tới khi hết `ttlSeconds` (thời gian còn lại của token). */
  revoke(jti: string, ttlSeconds: number): Promise<void>;

  /** true nếu `jti` đã bị thu hồi (logout/refresh cũ). */
  isRevoked(jti: string): Promise<boolean>;
}
