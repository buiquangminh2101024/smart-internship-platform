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

  async peek(key: string): Promise<{ count: number; ttlSeconds: number }> {
    const redisKey = `ratelimit:${key}`;
    const [getResult, ttlResult] = (await this.redis.pipeline().get(redisKey).ttl(redisKey).exec()) ?? [];
    if (!getResult || !ttlResult) throw new Error("Redis pipeline returned no result");
    if (getResult[0]) throw getResult[0];
    if (ttlResult[0]) throw ttlResult[0];
    const count = Number(getResult[1] ?? 0);
    const ttl = Number(ttlResult[1]);
    // TTL: -2 = không có khoá, -1 = có khoá nhưng chưa đặt hạn (giữa INCR và EXPIRE).
    return { count: Number.isFinite(count) ? count : 0, ttlSeconds: ttl === -2 ? 0 : ttl };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`ratelimit:${key}`);
  }
}
