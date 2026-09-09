import type { Prisma, PrismaClient, SubscriptionPlan } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface SubscriptionPlanWriteData {
  name?: string;
  description?: string | null;
  jobPostQuota?: number;
  durationDays?: number;
  price?: number;
  isActive?: boolean;
}

// Catalog do Admin quản lý — dùng chung 1 bảng cho cả public listing (chỉ
// isActive=true) lẫn CRUD của Admin (xem subscriptions.service.ts).
export class SubscriptionPlanRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  findActive(db: Db = this.prisma): Promise<SubscriptionPlan[]> {
    return db.subscriptionPlan.findMany({ where: { isActive: true }, orderBy: { price: "asc" } });
  }

  findById(id: string, db: Db = this.prisma): Promise<SubscriptionPlan | null> {
    return db.subscriptionPlan.findUnique({ where: { id } });
  }

  create(
    data: SubscriptionPlanWriteData & { name: string; jobPostQuota: number; durationDays: number; price: number },
    db: Db = this.prisma,
  ): Promise<SubscriptionPlan> {
    return db.subscriptionPlan.create({ data });
  }

  update(id: string, data: SubscriptionPlanWriteData, db: Db = this.prisma): Promise<SubscriptionPlan> {
    return db.subscriptionPlan.update({ where: { id }, data });
  }
}
