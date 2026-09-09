import type { Redis } from "ioredis";
import { randomInt } from "node:crypto";
import type { CompanyInviteCodeStore } from "../shared/ports/CompanyInviteCodeStore";

const INVITE_TTL_SECONDS = 2 * 60;

function codeKey(code: string): string {
  return `company-invite:code:${code}`;
}

function activeKey(companyId: string): string {
  return `company-invite:active:${companyId}`;
}

export class RedisCompanyInviteCodeStore implements CompanyInviteCodeStore {
  private readonly redis: Redis;

  constructor({ redis }: { redis: Redis }) {
    this.redis = redis;
  }

  async issue(companyId: string): Promise<string> {
    const previousCode = await this.redis.get(activeKey(companyId));
    if (previousCode) {
      await this.redis.del(codeKey(previousCode));
    }

    const code = randomInt(100000, 1000000).toString();
    await this.redis.set(codeKey(code), companyId, "EX", INVITE_TTL_SECONDS);
    await this.redis.set(activeKey(companyId), code, "EX", INVITE_TTL_SECONDS);
    return code;
  }

  async consume(code: string): Promise<string | null> {
    const companyId = await this.redis.get(codeKey(code));
    if (!companyId) return null;

    await this.redis.del(codeKey(code));
    await this.redis.del(activeKey(companyId));
    return companyId;
  }
}
