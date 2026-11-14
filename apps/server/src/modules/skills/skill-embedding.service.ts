import { Prisma, type PrismaClient } from "@prisma/client";
import { config } from "../../shared/config/env";
import { resolveEmbeddingCacheDir } from "../../shared/ai/embedding-env";
import type { Logger } from "../../shared/logger";
import { createEmbeddingWorker, EmbeddingWorkerClient } from "../../infrastructure/embedding-worker-client";
import type { SkillSimilarity } from "./skill-token-match.util";

// Bậc 2 của pipeline dedupe: embedding local (không gọi API ngoài, không tốn
// token) để bắt các cặp tên khác hẳn về mặt chữ nhưng cùng nghĩa — "lập trình
// hướng đối tượng" vs "OOP", "kỹ năng thuyết trình" vs "Presentation Skills".
//
// Model tải về lần đầu (~100-500MB) rồi cache lại ở EMBEDDING_MODEL_CACHE_DIR;
// load lazy + singleton nên server khởi động không phải chờ. Model chạy trong một
// worker_threads (0.6, AD-27 mục 11): luồng chính chỉ gửi văn bản và nhận vector, không
// bị chặn ~24 ms mỗi lần embed.

export class SkillEmbeddingService {
  private readonly prisma: PrismaClient;
  private readonly embeddingWorker: EmbeddingWorkerClient;

  constructor({ prisma, logger }: { prisma: PrismaClient; logger: Logger }) {
    this.prisma = prisma;
    this.embeddingWorker = new EmbeddingWorkerClient({
      logger,
      createWorker: () => {
        logger.info(`Loading embedding model ${config.EMBEDDING_MODEL_ID} (first run downloads it)`);
        return createEmbeddingWorker({ modelId: config.EMBEDDING_MODEL_ID, cacheDir: resolveEmbeddingCacheDir() });
      },
    });
  }

  /**
   * Vector 384 chiều đã chuẩn hoá độ dài, hoặc null nếu model không dùng được (nạp hỏng
   * thì nhớ luôn, không thử nạp lại ở từng request), lỗi hoặc quá thời gian chờ.
   */
  embed(text: string): Promise<number[] | null> {
    return this.embeddingWorker.embed(text);
  }

  /** Dừng worker embedding (script, test, khi dừng server). */
  close(): Promise<void> {
    return this.embeddingWorker.close();
  }

  /**
   * Skill APPROVED gần nhất theo cosine similarity.
   * Cột embedding là Unsupported("vector(384)") — Prisma Client không đọc/ghi
   * được, nên toàn bộ truy vấn ở đây đi qua raw SQL với toán tử `<=>` (khoảng
   * cách cosine) của pgvector. Vector đã normalize nên similarity = 1 - distance.
   */
  async findNearestApproved(vector: number[], limit = 5): Promise<SkillSimilarity[]> {
    const literal = toVectorLiteral(vector);
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; score: number }>>(Prisma.sql`
      SELECT id, name, 1 - (embedding <=> ${literal}::vector) AS score
      FROM skills
      WHERE embedding IS NOT NULL AND status = 'APPROVED'
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${limit}
    `);
    return rows.map((row) => ({ skillId: row.id, name: row.name, score: Number(row.score) }));
  }

  /** Ghi vector cho một skill (dùng lúc tạo skill mới và khi backfill). */
  async saveEmbedding(skillId: string, vector: number[]): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE skills SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${skillId}
    `);
  }

  /** Skill chưa có embedding — đầu vào của bước backfill trong cron. */
  async findWithoutEmbedding(limit: number): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
      SELECT id, name FROM skills WHERE embedding IS NULL LIMIT ${limit}
    `);
  }
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
