import type { CompanySubscription, Prisma, PrismaClient, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type CompanySubscriptionWithPlan = CompanySubscription & { plan: SubscriptionPlan };

const PAGE_SIZE = 20;

export class CompanySubscriptionRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  findActiveByCompany(companyId: string, db: Db = this.prisma): Promise<CompanySubscriptionWithPlan | null> {
    return db.companySubscription.findFirst({
      where: { companyId, status: "ACTIVE", endDate: { gt: new Date() } },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });
  }

  countForCompany(companyId: string, db: Db = this.prisma): Promise<number> {
    return db.companySubscription.count({ where: { companyId } });
  }

  findLatestForCompany(companyId: string, db: Db = this.prisma): Promise<CompanySubscriptionWithPlan | null> {
    return db.companySubscription.findFirst({
      where: { companyId },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: string, db: Db = this.prisma): Promise<CompanySubscriptionWithPlan | null> {
    return db.companySubscription.findUnique({ where: { id }, include: { plan: true } });
  }

  async listByCompany(
    companyId: string,
    cursor: string | undefined,
    db: Db = this.prisma,
  ): Promise<{ items: CompanySubscriptionWithPlan[]; nextCursor?: string; hasMore: boolean }> {
    const rows = await db.companySubscription.findMany({
      where: { companyId },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    return { items, hasMore, ...(nextCursor ? { nextCursor } : {}) };
  }

  create(
    data: { companyId: string; planId: string; startDate: Date; endDate: Date; status: SubscriptionStatus },
    db: Db = this.prisma,
  ): Promise<CompanySubscription> {
    return db.companySubscription.create({ data });
  }

  activate(id: string, data: { startDate: Date; endDate: Date }, db: Db = this.prisma): Promise<CompanySubscription> {
    return db.companySubscription.update({ where: { id }, data: { ...data, status: "ACTIVE" } });
  }

  // Huỷ mọi CompanySubscription đang ACTIVE/PENDING của company trước khi tạo
  // bản ghi PENDING mới — đảm bảo tại một thời điểm chỉ có tối đa 1 subscription
  // không-terminal (áp dụng cho cả nâng cấp giữa kỳ lẫn checkout lại sau khi
  // bỏ dở lần trước, xem subscriptions.service.ts#checkout).
  cancelActiveOrPending(companyId: string, db: Db = this.prisma): Promise<Prisma.BatchPayload> {
    return db.companySubscription.updateMany({
      where: { companyId, status: { in: ["ACTIVE", "PENDING"] } },
      data: { status: "CANCELLED" },
    });
  }

  async expireOverdue(db: Db = this.prisma): Promise<number> {
    const result = await db.companySubscription.updateMany({
      where: { status: "ACTIVE", endDate: { lt: new Date() } },
      data: { status: "EXPIRED" },
    });
    return result.count;
  }
}
