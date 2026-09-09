import type { Prisma, PrismaClient, Transaction, TransactionStatus } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export class TransactionRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  create(
    data: { paymentId: string; paymentMethodId: string; orderCode: string; status: TransactionStatus },
    db: Db = this.prisma,
  ): Promise<Transaction> {
    return db.transaction.create({ data });
  }

  findByOrderCode(orderCode: string, db: Db = this.prisma): Promise<Transaction | null> {
    return db.transaction.findUnique({ where: { orderCode } });
  }

  findByProviderTransactionId(providerTransactionId: string, db: Db = this.prisma): Promise<Transaction | null> {
    return db.transaction.findUnique({ where: { providerTransactionId } });
  }

  updateStatus(
    id: string,
    data: { status: TransactionStatus; providerTransactionId?: string; rawResponse?: string },
    db: Db = this.prisma,
  ): Promise<Transaction> {
    return db.transaction.update({ where: { id }, data });
  }
}
