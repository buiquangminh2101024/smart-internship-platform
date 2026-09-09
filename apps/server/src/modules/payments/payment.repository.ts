import type { Payment, PaymentStatus, Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export class PaymentRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  create(
    data: { companySubscriptionId: string; amount: number; status: PaymentStatus },
    db: Db = this.prisma,
  ): Promise<Payment> {
    return db.payment.create({ data });
  }

  findById(id: string, db: Db = this.prisma): Promise<Payment | null> {
    return db.payment.findUnique({ where: { id } });
  }

  updateStatus(id: string, status: PaymentStatus, db: Db = this.prisma): Promise<Payment> {
    return db.payment.update({ where: { id }, data: { status } });
  }
}
