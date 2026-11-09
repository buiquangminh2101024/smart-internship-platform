import type { OutreachInvitationSource } from "@prisma/client";
import type { Redis } from "ioredis";

const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;

/** Số lời mời công ty đã gửi hôm nay. `auto` là phần do tự động mời gửi, đã nằm trong `total`. */
export interface OutreachUsage {
  total: number;
  auto: number;
}

/**
 * Ngưỡng/ngày áp cho một lần gửi. `daily` là tổng hạn mức của gói. `auto` là phần tự
 * động được dùng (= daily × outreachAutoSharePercent / 100, AD-23 mục 5); chỉ xét khi
 * gửi tự động, bỏ trống thì coi như 0.
 */
export interface OutreachDailyLimit {
  daily: number;
  auto?: number;
}

/**
 * Còn lượt gửi hôm nay không. Mời tay dùng được mọi lượt còn lại của tổng hạn mức (kể
 * cả phần dành cho tự động); tự động phải còn lượt ở cả tổng lẫn phần tự động.
 */
export function hasDailyRoom(usage: OutreachUsage, limit: OutreachDailyLimit, source: OutreachInvitationSource): boolean {
  if (usage.total >= limit.daily) return false;
  return source === "MANUAL" || usage.auto < (limit.auto ?? 0);
}

/**
 * Hạn mức gửi lời mời/ngày (D4) — tính chung cho cả công ty, khoá theo
 * `companyId`. Cùng khuôn kiểm trước/tăng sau với RequirementExtractionRateLimitService;
 * khác ở chỗ ngưỡng không cố định mà do service truyền vào theo gói Subscription.
 * Kiểm trước/tăng sau không nguyên tử: 2 lời mời gửi đúng cùng lúc có thể vượt
 * ngưỡng 1 lượt — chấp nhận được với hạn mức hằng ngày.
 *
 * AD-23 mục 5 — mời tay và tự động dùng chung bộ đếm `total`. Thêm bộ đếm `auto`
 * để giới hạn phần tự động theo `Company.outreachAutoSharePercent`.
 */
export class CandidateOutreachRateLimitService {
  private readonly redis: Redis;

  constructor({ redis }: { redis: Redis }) {
    this.redis = redis;
  }

  /** Số lời mời công ty đã gửi hôm nay — chỉ đọc (dashboard AD-16, trang "Lời mời", lượt tự động mời). */
  async getUsage(companyId: string): Promise<OutreachUsage> {
    const day = today();
    const [total, auto] = await this.redis.mget(companyDayKey(companyId, day), companyAutoDayKey(companyId, day));
    return { total: total ? Number(total) : 0, auto: auto ? Number(auto) : 0 };
  }

  /** Gọi sau khi lời mời đã được tạo. Lời mời tự động tăng cả hai bộ đếm. */
  async recordUsage(companyId: string, source: OutreachInvitationSource): Promise<void> {
    const day = today();
    await this.increment(companyDayKey(companyId, day));
    if (source === "AUTO") await this.increment(companyAutoDayKey(companyId, day));
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

function companyDayKey(companyId: string, day: string): string {
  return `candidate-outreach-quota:company:${companyId}:day:${day}`;
}

function companyAutoDayKey(companyId: string, day: string): string {
  return `candidate-outreach-quota:company:${companyId}:auto:day:${day}`;
}
