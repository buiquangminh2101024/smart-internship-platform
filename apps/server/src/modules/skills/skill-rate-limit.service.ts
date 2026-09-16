import type { Redis } from "ioredis";
import { AppError } from "../../shared/errors/AppError";

// Chống spam catalog: một người gõ bừa vài chục tên rác sẽ làm ngập hàng đợi
// duyệt của Admin. Ngưỡng chốt ở docs/06-backend/jobpost-skill-huong-b/PLAN.md
// mục 3 — để thành hằng số ở đây, không rải số ra các file khác.
export const PER_USER_WEEKLY_LIMIT = 10;
export const PER_USER_MONTHLY_LIMIT = 40;
export const GLOBAL_WEEKLY_LIMIT = 150;

const WEEK_TTL_SECONDS = 8 * 24 * 60 * 60;
const MONTH_TTL_SECONDS = 32 * 24 * 60 * 60;

/**
 * Bộ đếm KHÔNG tự tăng khi kiểm tra: pipeline gọi `assertWithinQuota()` trước,
 * rồi chỉ gọi `recordCreation()` khi thực sự sinh ra một Skill PENDING mới. Các
 * lần gõ trúng skill đã có (alias/token match/LLM nói MATCH) không tạo dữ liệu
 * gì nên không bị trừ quota — đúng quyết định 3 trong PLAN.
 *
 * Dùng thẳng Redis thay vì port RateLimiter có sẵn vì port đó gộp
 * "kiểm tra + tăng" trong một lệnh consume(), không tách được hai thời điểm này.
 */
export class SkillRateLimitService {
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
        `Bạn đã đề xuất tối đa ${PER_USER_WEEKLY_LIMIT} kỹ năng mới trong tuần này. Hãy chọn kỹ năng có sẵn hoặc thử lại vào tuần sau.`,
      );
    }
    if (userMonth >= PER_USER_MONTHLY_LIMIT) {
      throw new AppError(
        429,
        `Bạn đã đề xuất tối đa ${PER_USER_MONTHLY_LIMIT} kỹ năng mới trong tháng này. Hãy chọn kỹ năng có sẵn hoặc thử lại vào tháng sau.`,
      );
    }
    if (globalWeek >= GLOBAL_WEEKLY_LIMIT) {
      throw new AppError(
        429,
        "Hệ thống đang nhận quá nhiều kỹ năng mới trong tuần này. Vui lòng chọn kỹ năng có sẵn hoặc thử lại sau.",
      );
    }
  }

  async recordCreation(userId: string): Promise<void> {
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
    // Chỉ đặt TTL ở lần đầu, nếu không mỗi lần tăng lại đẩy hạn cửa sổ về sau và
    // bộ đếm không bao giờ hết hạn (lỗi kinh điển của INCR+EXPIRE).
    if (count === 1) {
      await this.redis.expire(key, ttlSeconds);
    }
  }
}

// Khoá theo mốc lịch (tuần ISO / tháng dương lịch) thay vì cửa sổ trượt: người
// dùng hiểu được "tuần này còn mấy lượt", và bộ đếm tự reset đúng đầu tuần.
function userWeekKey(userId: string): string {
  return `skill-quota:user:${userId}:week:${isoWeek(new Date())}`;
}

function userMonthKey(userId: string): string {
  const now = new Date();
  return `skill-quota:user:${userId}:month:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
}

function globalWeekKey(): string {
  return `skill-quota:global:week:${isoWeek(new Date())}`;
}

function isoWeek(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Dời về thứ Năm cùng tuần rồi đếm — cách chuẩn để số tuần ISO không lệch ở
  // các năm mà 1/1 rơi vào cuối tuần.
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${week}`;
}
