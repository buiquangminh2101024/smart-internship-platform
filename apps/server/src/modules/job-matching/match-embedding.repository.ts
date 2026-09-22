import { Prisma, type PrismaClient } from "@prisma/client";

// Bảng candidate_embeddings / job_post_embeddings có cột Unsupported("vector(384)")
// nên Prisma Client không đọc/ghi được — toàn bộ đi qua raw SQL (cùng cách với
// skill-embedding.service.ts). Tên bảng/cột lấy từ hằng số dưới đây, không bao giờ
// từ đầu vào người dùng, nên Prisma.raw an toàn.

export type EmbeddingKind = "candidate" | "job";

const TARGETS = {
  candidate: { table: "candidate_embeddings", idColumn: "candidateId" },
  job: { table: "job_post_embeddings", idColumn: "jobPostId" },
} as const;

export interface EmbeddingRecord {
  id: string;
  vector: number[];
  contentHash: string;
  model: string;
  templateVersion: number;
}

export class MatchEmbeddingRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  /** contentHash đã lưu theo id — chỉ so hash, không kéo vector về. */
  async findHashes(kind: EmbeddingKind, ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const { table, idColumn } = TARGETS[kind];
    const rows = await this.prisma.$queryRaw<Array<{ id: string; hash: string }>>(Prisma.sql`
      SELECT ${identifier(idColumn)} AS id, "contentHash" AS hash
      FROM ${identifier(table)}
      WHERE ${identifier(idColumn)} IN (${Prisma.join(ids)})
    `);
    return new Map(rows.map((row) => [row.id, row.hash]));
  }

  /** Một câu lệnh cho cả lô. `records` không được trùng id (ON CONFLICT không xử lý hai lần một dòng). */
  async upsertMany(kind: EmbeddingKind, records: EmbeddingRecord[]): Promise<void> {
    if (records.length === 0) return;
    const { table, idColumn } = TARGETS[kind];
    const values = records.map(
      (record) =>
        Prisma.sql`(${record.id}, ${toVectorLiteral(record.vector)}::vector, ${record.contentHash}, ${record.model}, ${record.templateVersion})`,
    );
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO ${identifier(table)} (${identifier(idColumn)}, "embedding", "contentHash", "model", "templateVersion")
      VALUES ${Prisma.join(values)}
      ON CONFLICT (${identifier(idColumn)}) DO UPDATE SET
        "embedding" = EXCLUDED."embedding",
        "contentHash" = EXCLUDED."contentHash",
        "model" = EXCLUDED."model",
        "templateVersion" = EXCLUDED."templateVersion",
        "embeddedAt" = CURRENT_TIMESTAMP
    `);
  }

  /** Cosine của một tin với nhiều hồ sơ, một truy vấn. Hồ sơ thiếu vector không có trong Map. */
  async cosinesForJob(jobPostId: string, candidateIds: string[]): Promise<Map<string, number>> {
    if (candidateIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ id: string; cosine: number }>>(Prisma.sql`
      SELECT c."candidateId" AS id, 1 - (c."embedding" <=> j."embedding") AS cosine
      FROM candidate_embeddings c
      JOIN job_post_embeddings j ON j."jobPostId" = ${jobPostId}
      WHERE c."candidateId" IN (${Prisma.join(candidateIds)})
    `);
    return new Map(rows.map((row) => [row.id, Number(row.cosine)]));
  }
}

function identifier(name: string): Prisma.Sql {
  return Prisma.raw(`"${name}"`);
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
