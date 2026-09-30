import type { Redis } from "ioredis";
import { AppError } from "../../shared/errors/AppError";

const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;

/**
 * Hạn mức gửi lời mời/ngày (D4) — tính chung cho cả công ty, khoá theo
 * `companyId`. Cùng khuôn kiểm trước/tăng sau với RequirementExtractionRateLimitService;
 * khác ở chỗ ngưỡng không cố định mà do service truyền vào theo gói Subscription.
 * Kiểm trước/tăng sau không nguyên tử: 2 lời mời gửi đúng cùng lúc có thể vượt
 * ngưỡng 1 lượt — chấp nhận được với hạn mức hằng ngày.
 */
export class CandidateOutreachRateLimitService {
  private readonly redis: Redis;

  constructor({ redis }: { redis: Redis }) {
    this.redis = redis;
  }

  async assertWithinQuota(companyId: string, dailyQuota: number): Promise<void> {
    const value = await this.redis.get(companyDayKey(companyId));
    const used = value ? Number(value) : 0;
    if (used >= dailyQuota) {
      throw new AppError(
        429,
        `Công ty đã gửi đủ ${dailyQuota} lời mời trong hôm nay. Hạn mức được làm mới vào 7h sáng mai.`,
      );
    }
  }

  /** Số lời mời công ty đã gửi hôm nay — chỉ đọc (dashboard, AD-16). */
  async getUsedToday(companyId: string): Promise<number> {
    const value = await this.redis.get(companyDayKey(companyId));
    return value ? Number(value) : 0;
  }

  async recordUsage(companyId: string): Promise<void> {
    const key = companyDayKey(companyId);
    const count = await this.redis.incr(key);
    // Chỉ đặt TTL ở lần đầu — xem giải thích trong catalog-rate-limit.service.ts.
    if (count === 1) {
      await this.redis.expire(key, DAY_TTL_SECONDS);
    }
  }
}

// Khoá theo ngày UTC: bộ đếm tự reset lúc 7h sáng giờ Việt Nam.
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function companyDayKey(companyId: string): string {
  return `candidate-outreach-quota:company:${companyId}:day:${today()}`;
}
