import type { PaymentMethod, PaymentProvider, Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export class PaymentMethodRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  findByProcessorType(processorType: PaymentProvider, db: Db = this.prisma): Promise<PaymentMethod | null> {
    return db.paymentMethod.findFirst({ where: { processorType, isAvailable: true } });
  }
}
