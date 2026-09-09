import type { PaymentCallbackLog, PaymentProvider, Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export class PaymentCallbackLogRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  // Log MỌI callback nhận được, kể cả khi chưa verify được chữ ký — cố tình
  // không có FK để không phụ thuộc việc parse thành công (API_CONVENTIONS.md §12).
  create(
    data: { provider: PaymentProvider; rawQueryString?: string; rawPayload?: string },
    db: Db = this.prisma,
  ): Promise<PaymentCallbackLog> {
    return db.paymentCallbackLog.create({ data });
  }
}
