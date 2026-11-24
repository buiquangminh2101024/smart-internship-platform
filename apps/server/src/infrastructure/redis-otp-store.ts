import type { Redis } from "ioredis";
import type { OtpPurpose, OtpStore } from "../shared/ports/OtpStore";

const OTP_TTL_SECONDS = 5 * 60;

export class RedisOtpStore implements OtpStore {
  private readonly redis: Redis;

  constructor({ redis }: { redis: Redis }) {
    this.redis = redis;
  }

  private key(purpose: OtpPurpose, email: string): string {
    return `otp:${purpose}:${email.toLowerCase()}`;
  }

  private failKey(purpose: OtpPurpose, email: string): string {
    return `otp:fail:${purpose}:${email.toLowerCase()}`;
  }

  async set(purpose: OtpPurpose, email: string, code: string): Promise<void> {
    await this.redis
      .multi()
      .set(this.key(purpose, email), code, "EX", OTP_TTL_SECONDS)
      .del(this.failKey(purpose, email))
      .exec();
  }

  async get(purpose: OtpPurpose, email: string): Promise<string | null> {
    return this.redis.get(this.key(purpose, email));
  }

  async delete(purpose: OtpPurpose, email: string): Promise<void> {
    await this.redis.del(this.key(purpose, email), this.failKey(purpose, email));
  }

  async recordFailure(purpose: OtpPurpose, email: string): Promise<number> {
    const key = this.failKey(purpose, email);
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, OTP_TTL_SECONDS);
    return count;
  }
}
