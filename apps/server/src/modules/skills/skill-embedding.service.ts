import { Prisma, type PrismaClient } from "@prisma/client";
import { config } from "../../shared/config/env";
import { applyEmbeddingEnv } from "../../shared/ai/embedding-env";
import type { Logger } from "../../shared/logger";
import type { SkillSimilarity } from "./skill-token-match.util";

// Bậc 2 của pipeline dedupe: embedding local (không gọi API ngoài, không tốn
// token) để bắt các cặp tên khác hẳn về mặt chữ nhưng cùng nghĩa — "lập trình
// hướng đối tượng" vs "OOP", "kỹ năng thuyết trình" vs "Presentation Skills".
//
// Model tải về lần đầu (~100-500MB) rồi cache lại ở EMBEDDING_MODEL_CACHE_DIR;
// load lazy + singleton nên server khởi động không phải chờ.

type FeatureExtractor = (
  text: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: ArrayLike<number> }>;

export class SkillEmbeddingService {
  private readonly prisma: PrismaClient;
  private readonly logger: Logger;
  private extractorPromise: Promise<FeatureExtractor> | null = null;
  // Một lần load hỏng (mất mạng, thiếu dung lượng đĩa) thì mọi lần gọi sau đều
  // trả null luôn thay vì thử tải lại model ở từng request.
  private unavailable = false;

  constructor({ prisma, logger }: { prisma: PrismaClient; logger: Logger }) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /** Vector 384 chiều đã chuẩn hoá độ dài, hoặc null nếu model không dùng được. */
  async embed(text: string): Promise<number[] | null> {
    const extractor = await this.getExtractor();
    if (!extractor) return null;

    try {
      const output = await extractor(text, { pooling: "mean", normalize: true });
      return Array.from(output.data);
    } catch (error) {
      this.logger.error("Failed to compute skill embedding", { error });
      return null;
    }
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

  private async getExtractor(): Promise<FeatureExtractor | null> {
    if (this.unavailable) return null;

    if (!this.extractorPromise) {
      this.logger.info(`Loading embedding model ${config.EMBEDDING_MODEL_ID} (first run downloads it)`);
      // import động: tránh kéo ~45 package của transformers vào lúc khởi động
      // server, chỉ nạp khi thực sự có người gõ tên skill mới.
      this.extractorPromise = import("@huggingface/transformers").then((module) => {
        // Phải cấu hình trên chính `env` của module vừa nạp — xem chú thích
        // trong embedding-env.ts về chuyện CJS/ESM là hai instance khác nhau.
        applyEmbeddingEnv(module.env);
        return module.pipeline("feature-extraction", config.EMBEDDING_MODEL_ID) as unknown as Promise<FeatureExtractor>;
      });
    }

    try {
      return await this.extractorPromise;
    } catch (error) {
      // Không có embedding thì pipeline vẫn chạy được bằng token-match + Admin
      // duyệt tay, chỉ kém tinh hơn — không để hỏng cả endpoint vì việc này.
      this.unavailable = true;
      this.extractorPromise = null;
      this.logger.error("Embedding model unavailable — falling back to token matching only", { error });
      return null;
    }
  }
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
