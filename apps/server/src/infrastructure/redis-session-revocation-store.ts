import type { Redis } from "ioredis";
import { durationToSeconds } from "../shared/config/duration";
import type { SessionRevocationStore } from "../shared/ports/SessionRevocationStore";

export class RedisSessionRevocationStore implements SessionRevocationStore {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;

  constructor({ redis, config }: { redis: Redis; config: { JWT_ACCESS_EXPIRY: string } }) {
    this.redis = redis;
    // Khoá được ghi sau mốc nên hết hạn muộn hơn mọi access token cấp trước mốc (AD-18).
    this.ttlSeconds = durationToSeconds(config.JWT_ACCESS_EXPIRY);
  }

  async markRevoked(userId: string, revokedAtSec: number): Promise<void> {
    await this.redis.set(`sessions-revoked-at:${userId}`, String(revokedAtSec), "EX", this.ttlSeconds);
  }

  async getRevokedAt(userId: string): Promise<number | null> {
    const value = await this.redis.get(`sessions-revoked-at:${userId}`);
    if (value === null) return null;
    const revokedAtSec = Number(value);
    return Number.isFinite(revokedAtSec) ? revokedAtSec : null;
  }
}
