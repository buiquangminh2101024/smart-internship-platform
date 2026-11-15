import type { Redis } from "ioredis";

/** Tóm tắt lượt đêm gần nhất của bảng điểm (AD-24), cho thẻ "Hệ thống tự động" của Admin (0.6 bước 8). */
export interface MatchScoreNightlySummary {
  /** ISO, lúc lượt kết thúc. */
  finishedAt: string;
  durationMs: number;
  jobsTotal: number;
  jobsScored: number;
  jobsFailed: number;
  /** Tin chưa kịp chấm vì hết thời gian. */
  jobsDeferred: number;
}

const NIGHTLY_KEY = "match-scores:nightly-last-run";
/** Lượt đêm chạy mỗi ngày; giữ 7 ngày để vẫn thấy lượt cuối khi cron dừng vài đêm. */
const NIGHTLY_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Lượt đêm gần nhất lưu ở Redis, theo mẫu `LiveRescoreRunStore`. `job_posts.matchScoresAt`
 * không cho biết lượt đêm chạy lúc nào: chấm theo tin khi đăng tin hay khi danh mục đổi
 * cũng ghi cột này. Chỉ cron ghi; script `rescore-match-scores` không ghi.
 */
export class MatchScoreRunStore {
  private readonly redis: Redis;

  constructor({ redis }: { redis: Redis }) {
    this.redis = redis;
  }

  async saveNightly(summary: MatchScoreNightlySummary): Promise<void> {
    await this.redis.set(NIGHTLY_KEY, JSON.stringify(summary), "EX", NIGHTLY_TTL_SECONDS);
  }

  async getNightly(): Promise<MatchScoreNightlySummary | null> {
    const value = await this.redis.get(NIGHTLY_KEY);
    if (!value) return null;
    try {
      return JSON.parse(value) as MatchScoreNightlySummary;
    } catch {
      return null;
    }
  }
}
