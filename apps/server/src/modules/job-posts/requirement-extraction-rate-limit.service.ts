import type { Redis } from "ioredis";
import { AppError } from "../../shared/errors/AppError";

const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;

/**
 * Hạn mức lượt gọi LLM của "Phân tích yêu cầu bằng AI" (Job Matcher GĐ3).
 *
 * Không tái dùng CatalogRateLimitService: service đó đếm lượt TẠO mục PENDING
 * theo tuần/tháng với thông báo "đề xuất … mới", còn đây đếm lượt GỌI model theo
 * ngày — khác ngữ nghĩa lẫn cửa sổ. Cùng khuôn kiểm trước/tăng sau với
 * cv-extraction-rate-limit.service.ts.
 */
export class RequirementExtractionRateLimitService {
  private readonly redis: Redis;
  private readonly perUserLimit: number;
  private readonly globalLimit: number;

  constructor({
    redis,
    config,
  }: {
    redis: Redis;
    config: { REQUIREMENT_EXTRACTION_DAILY_LIMIT_PER_USER: number; REQUIREMENT_EXTRACTION_DAILY_LIMIT_GLOBAL: number };
  }) {
    this.redis = redis;
    this.perUserLimit = config.REQUIREMENT_EXTRACTION_DAILY_LIMIT_PER_USER;
    this.globalLimit = config.REQUIREMENT_EXTRACTION_DAILY_LIMIT_GLOBAL;
  }

  async assertWithinQuota(userId: string): Promise<void> {
    const [user, global] = await Promise.all([this.count(userDayKey(userId)), this.count(globalDayKey())]);
    if (user >= this.perUserLimit) {
      throw new AppError(
        429,
        `Bạn đã dùng hết ${this.perUserLimit} lượt phân tích yêu cầu bằng AI trong hôm nay. Bạn vẫn có thể nhập kỹ năng, số năm và ngành học bằng tay.`,
      );
    }
    if (global >= this.globalLimit) {
      throw new AppError(
        429,
        "Hệ thống đang nhận quá nhiều yêu cầu phân tích bằng AI trong hôm nay. Bạn vẫn có thể nhập kỹ năng, số năm và ngành học bằng tay.",
      );
    }
  }

  async recordUsage(userId: string): Promise<void> {
    await Promise.all([this.increment(userDayKey(userId)), this.increment(globalDayKey())]);
  }

  private async count(key: string): Promise<number> {
    const value = await this.redis.get(key);
    return value ? Number(value) : 0;
  }

  private async increment(key: string): Promise<void> {
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

function userDayKey(userId: string): string {
  return `requirement-extract-quota:user:${userId}:day:${today()}`;
}

function globalDayKey(): string {
  return `requirement-extract-quota:global:day:${today()}`;
}
