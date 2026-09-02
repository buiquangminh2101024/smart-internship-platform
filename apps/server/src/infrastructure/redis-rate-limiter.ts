import type { Redis } from "ioredis";
import type { RateLimiter } from "../shared/ports/RateLimiter";

export class RedisRateLimiter implements RateLimiter {
  private readonly redis: Redis;

  constructor({ redis }: { redis: Redis }) {
    this.redis = redis;
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const redisKey = `ratelimit:${key}`;
    const count = await this.redis.incr(redisKey);

    if (count === 1) {
      await this.redis.expire(redisKey, windowSeconds);
    }

    return count <= limit;
  }
}
