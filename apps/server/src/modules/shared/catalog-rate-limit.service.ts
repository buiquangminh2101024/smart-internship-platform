import type { Redis } from "ioredis";
import { AppError } from "../../shared/errors/AppError";
import type { CatalogDomain } from "../../shared/ports/CatalogMatchVerifier";

// Chống spam catalog: một người gõ bừa vài chục tên rác sẽ làm ngập hàng đợi
// duyệt của Admin. Ngưỡng chốt ở docs/06-backend/jobpost-skill-huong-b/PLAN.md
// mục 3, dùng chung cho Skill/University/Major (docs/06-backend/cv-ai-extraction-phase2/PLAN.md
// Quyết định #4) — để thành hằng số ở đây, không rải số ra các file khác.
//
// Khác cv-extraction-rate-limit.service.ts: service đó bảo vệ quota LLM dùng
// chung, còn đây là chống rác trong catalog PENDING — hai lý do khác nhau.
export const PER_USER_WEEKLY_LIMIT = 10;
export const PER_USER_MONTHLY_LIMIT = 40;
export const GLOBAL_WEEKLY_LIMIT = 150;

const WEEK_TTL_SECONDS = 8 * 24 * 60 * 60;
const MONTH_TTL_SECONDS = 32 * 24 * 60 * 60;

const DOMAIN_NOUNS: Record<CatalogDomain, string> = {
  skill: "kỹ năng",
  university: "trường",
  major: "ngành học",
};

/**
 * Bộ đếm KHÔNG tự tăng khi kiểm tra: pipeline gọi `assertWithinQuota()` trước,
 * rồi chỉ gọi `recordCreation()` khi thực sự sinh ra một mục PENDING mới. Các
 * lần gõ trúng mục đã có (alias/token match/LLM nói MATCH) không tạo dữ liệu
 * gì nên không bị trừ quota — đúng quyết định 3 trong PLAN Skill.
 *
 * Mỗi `domain` có bộ đếm riêng: đề xuất 10 kỹ năng mới không làm hết lượt đề
 * xuất tên trường.
 *
 * Dùng thẳng Redis thay vì port RateLimiter có sẵn vì port đó gộp
 * "kiểm tra + tăng" trong một lệnh consume(), không tách được hai thời điểm này.
 */
export class CatalogRateLimitService {
  private readonly redis: Redis;

  constructor({ redis }: { redis: Redis }) {
    this.redis = redis;
  }

  async assertWithinQuota(domain: CatalogDomain, userId: string): Promise<void> {
    const [userWeek, userMonth, globalWeek] = await Promise.all([
      this.count(userWeekKey(domain, userId)),
      this.count(userMonthKey(domain, userId)),
      this.count(globalWeekKey(domain)),
    ]);
    const noun = DOMAIN_NOUNS[domain];

    if (userWeek >= PER_USER_WEEKLY_LIMIT) {
      throw new AppError(
        429,
        `Bạn đã đề xuất tối đa ${PER_USER_WEEKLY_LIMIT} ${noun} mới trong tuần này. Hãy chọn ${noun} có sẵn hoặc thử lại vào tuần sau.`,
      );
    }
    if (userMonth >= PER_USER_MONTHLY_LIMIT) {
      throw new AppError(
        429,
        `Bạn đã đề xuất tối đa ${PER_USER_MONTHLY_LIMIT} ${noun} mới trong tháng này. Hãy chọn ${noun} có sẵn hoặc thử lại vào tháng sau.`,
      );
    }
    if (globalWeek >= GLOBAL_WEEKLY_LIMIT) {
      throw new AppError(
        429,
        `Hệ thống đang nhận quá nhiều ${noun} mới trong tuần này. Vui lòng chọn ${noun} có sẵn hoặc thử lại sau.`,
      );
    }
  }

  async recordCreation(domain: CatalogDomain, userId: string): Promise<void> {
    await Promise.all([
      this.increment(userWeekKey(domain, userId), WEEK_TTL_SECONDS),
      this.increment(userMonthKey(domain, userId), MONTH_TTL_SECONDS),
      this.increment(globalWeekKey(domain), WEEK_TTL_SECONDS),
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
// Prefix `${domain}-quota` giữ nguyên key cũ `skill-quota:*` của Skill — đổi tên
// service không làm reset bộ đếm đang chạy.
function userWeekKey(domain: CatalogDomain, userId: string): string {
  return `${domain}-quota:user:${userId}:week:${isoWeek(new Date())}`;
}

function userMonthKey(domain: CatalogDomain, userId: string): string {
  const now = new Date();
  return `${domain}-quota:user:${userId}:month:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
}

function globalWeekKey(domain: CatalogDomain): string {
  return `${domain}-quota:global:week:${isoWeek(new Date())}`;
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
