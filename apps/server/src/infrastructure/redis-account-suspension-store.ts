import type { Redis } from "ioredis";
import type { AccountSuspensionStore } from "../shared/ports/AccountSuspensionStore";

export class RedisAccountSuspensionStore implements AccountSuspensionStore {
  private readonly redis: Redis;

  constructor({ redis }: { redis: Redis }) {
    this.redis = redis;
  }

  async markSuspended(userId: string): Promise<void> {
    await this.redis.set(`user-suspended:${userId}`, "1");
  }

  async clear(userId: string): Promise<void> {
    await this.redis.del(`user-suspended:${userId}`);
  }

  async isSuspended(userId: string): Promise<boolean> {
    const value = await this.redis.get(`user-suspended:${userId}`);
    return value !== null;
  }
}
