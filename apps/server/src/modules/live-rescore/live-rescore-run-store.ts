import type { Redis } from "ioredis";

/** Tóm tắt một lượt chấm theo ứng viên (Q6), cho thẻ "Hệ thống tự động" của Admin (bước 8). */
export interface LiveRescoreRunSummary {
  /** ISO, lúc lượt kết thúc. */
  finishedAt: string;
  durationMs: number;
  /** Lối gọi: hết hẹn giờ / danh mục đổi (`request`) hay cron 15 phút (`cron`). */
  trigger: "request" | "cron";
  batches: number;
  /** Số ứng viên đã chấm và ghi bảng (kể cả người giữ dấu vì vượt giới hạn embedding). */
  candidates: number;
  rows: number;
  marksCleared: number;
  /** Ứng viên giữ dấu: lô lỗi, không nạp được hồ sơ, hoặc vượt giới hạn embedding. */
  kept: number;
  embedded: number;
  /** Lượt dừng vì hết thời gian (còn dấu thì chạy tiếp lượt sau). */
  timedOut: boolean;
  /** Số ứng viên còn dấu khi lượt kết thúc. */
  remaining: number;
  /** Việc kéo theo (bước 4). Không có ở tóm tắt lưu trước bước 4. */
  followUps?: {
    /** Cặp (ứng viên, tin) vừa đạt ngưỡng. */
    reached: number;
    /** Công ty được kích hoạt tự mời. */
    outreachCompanies: number;
    /** Ứng viên gửi sang tự chuyển "Đang xem xét". */
    reviewCandidates: number;
    /** Ứng viên lần đầu có điểm (gửi sang job alert). */
    firstScored: number;
    /** Công ty nhận sự kiện `match-scores:updated` (trước khi chặn 15 giây). */
    matchUpdateCompanies: number;
  };
}

const LAST_RUN_KEY = "live-rescore:last-run";
/** Đủ dài để còn sau khi server khởi động lại; lượt chạy ít nhất mỗi 15 phút ghi đè. */
const LAST_RUN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Lượt gần nhất lưu ở Redis (Q6): dấu bị xoá sau khi chấm nên DB không cho biết lượt gần
 * nhất lúc nào, chấm bao nhiêu người. Theo mẫu `AutoOutreachRunStore`.
 */
export class LiveRescoreRunStore {
  private readonly redis: Redis;

  constructor({ redis }: { redis: Redis }) {
    this.redis = redis;
  }

  async saveLastRun(summary: LiveRescoreRunSummary): Promise<void> {
    await this.redis.set(LAST_RUN_KEY, JSON.stringify(summary), "EX", LAST_RUN_TTL_SECONDS);
  }

  async getLastRun(): Promise<LiveRescoreRunSummary | null> {
    const value = await this.redis.get(LAST_RUN_KEY);
    if (!value) return null;
    try {
      return JSON.parse(value) as LiveRescoreRunSummary;
    } catch {
      return null;
    }
  }
}
