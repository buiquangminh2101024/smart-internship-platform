import type { Redis } from "ioredis";
import { AppError } from "../../shared/errors/AppError";

// Mỗi lượt phân tích tốn 1 lần gọi Vision LLM — chặn spam để không cháy quota
// free. Ngưỡng chốt ở docs/temp/CV_JSON_TO_CANDIDATE_PROFILE_PROPOSAL.md mục
// 9.4 / docs/06-backend/cv-ai-extraction-phase1/PLAN.md Quyết định #6.
export const PER_USER_WEEKLY_LIMIT = 5;
export const PER_USER_MONTHLY_LIMIT = 15;
export const GLOBAL_WEEKLY_LIMIT = 50;

const WEEK_TTL_SECONDS = 8 * 24 * 60 * 60;
const MONTH_TTL_SECONDS = 32 * 24 * 60 * 60;

/**
 * Cùng khuôn SkillRateLimitService: kiểm tra trước (`assertWithinQuota`), tăng
 * bộ đếm sau (`recordUsage`). Mọi lượt đã chạy tới bước gọi AI đều bị trừ —
 * kể cả phân tích lại cùng một CV, kể cả khi kết quả là "không phải CV".
 */
export class CvExtractionRateLimitService {
  private readonly redis: Redis;

  constructor({ redis }: { redis: Redis }) {
    this.redis = redis;
  }

  async assertWithinQuota(userId: string): Promise<void> {
    const [userWeek, userMonth, globalWeek] = await Promise.all([
      this.count(userWeekKey(userId)),
      this.count(userMonthKey(userId)),
      this.count(globalWeekKey()),
    ]);

    if (userWeek >= PER_USER_WEEKLY_LIMIT) {
      throw new AppError(
        429,
        `Bạn đã dùng hết ${PER_USER_WEEKLY_LIMIT} lượt phân tích CV trong tuần này. Vui lòng thử lại vào tuần sau.`,
      );
    }
    if (userMonth >= PER_USER_MONTHLY_LIMIT) {
      throw new AppError(
        429,
        `Bạn đã dùng hết ${PER_USER_MONTHLY_LIMIT} lượt phân tích CV trong tháng này. Vui lòng thử lại vào tháng sau.`,
      );
    }
    if (globalWeek >= GLOBAL_WEEKLY_LIMIT) {
      throw new AppError(429, "Hệ thống đang nhận quá nhiều yêu cầu phân tích CV trong tuần này. Vui lòng thử lại sau.");
    }
  }

  async recordUsage(userId: string): Promise<void> {
    await Promise.all([
      this.increment(userWeekKey(userId), WEEK_TTL_SECONDS),
      this.increment(userMonthKey(userId), MONTH_TTL_SECONDS),
      this.increment(globalWeekKey(), WEEK_TTL_SECONDS),
    ]);
  }

  private async count(key: string): Promise<number> {
    const value = await this.redis.get(key);
    return value ? Number(value) : 0;
  }

  private async increment(key: string, ttlSeconds: number): Promise<void> {
    const count = await this.redis.incr(key);
    // Chỉ đặt TTL ở lần đầu — xem giải thích trong skill-rate-limit.service.ts.
    if (count === 1) {
      await this.redis.expire(key, ttlSeconds);
    }
  }
}

function userWeekKey(userId: string): string {
  return `cv-extract-quota:user:${userId}:week:${isoWeek(new Date())}`;
}

function userMonthKey(userId: string): string {
  const now = new Date();
  return `cv-extract-quota:user:${userId}:month:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
}

function globalWeekKey(): string {
  return `cv-extract-quota:global:week:${isoWeek(new Date())}`;
}

function isoWeek(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${week}`;
}
