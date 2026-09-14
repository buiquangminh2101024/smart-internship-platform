import type { OutboxEvent, Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface OutboxWriteData {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
}

export class OutboxRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  create(data: OutboxWriteData, db: Db = this.prisma): Promise<OutboxEvent> {
    return db.outboxEvent.create({ data });
  }

  /**
   * Chuyển một lô PENDING đã tới hạn sang PROCESSING rồi trả về chính lô đó.
   * updateMany có điều kiện `status: PENDING` nên hai lần quét chồng nhau không
   * thể claim trùng một event.
   */
  async claimPendingBatch(limit: number): Promise<OutboxEvent[]> {
    const candidates = await this.prisma.outboxEvent.findMany({
      where: { status: "PENDING", availableAt: { lte: new Date() } },
      orderBy: { availableAt: "asc" },
      take: limit,
      select: { id: true },
    });
    if (candidates.length === 0) return [];

    const ids = candidates.map((row) => row.id);
    await this.prisma.outboxEvent.updateMany({
      where: { id: { in: ids }, status: "PENDING" },
      data: { status: "PROCESSING" },
    });

    return this.prisma.outboxEvent.findMany({ where: { id: { in: ids }, status: "PROCESSING" } });
  }

  async markCompleted(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: "COMPLETED", processedAt: new Date(), lastError: null },
    });
  }

  async markRetry(id: string, attempts: number, availableAt: Date, lastError: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: "PENDING", attempts, availableAt, lastError },
    });
  }

  async markFailed(id: string, attempts: number, lastError: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: "FAILED", attempts, processedAt: new Date(), lastError },
    });
  }
}
