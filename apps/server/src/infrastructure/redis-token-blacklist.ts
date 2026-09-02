import type { Redis } from "ioredis";
import type { TokenBlacklist } from "../shared/ports/TokenBlacklist";

export class RedisTokenBlacklist implements TokenBlacklist {
  private readonly redis: Redis;

  constructor({ redis }: { redis: Redis }) {
    this.redis = redis;
  }

  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.redis.set(`jwt:blacklist:${jti}`, "1", "EX", ttlSeconds);
  }

  async isRevoked(jti: string): Promise<boolean> {
    const value = await this.redis.get(`jwt:blacklist:${jti}`);
    return value !== null;
  }
}
