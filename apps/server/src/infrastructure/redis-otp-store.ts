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

  async set(purpose: OtpPurpose, email: string, code: string): Promise<void> {
    await this.redis.set(this.key(purpose, email), code, "EX", OTP_TTL_SECONDS);
  }

  async get(purpose: OtpPurpose, email: string): Promise<string | null> {
    return this.redis.get(this.key(purpose, email));
  }

  async delete(purpose: OtpPurpose, email: string): Promise<void> {
    await this.redis.del(this.key(purpose, email));
  }
}
