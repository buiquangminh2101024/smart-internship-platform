import { randomBytes } from "node:crypto";
import type { PaymentMethod, PaymentProvider, PaymentStatus, PrismaClient, TransactionStatus } from "@prisma/client";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { PaymentGatewayAdapter, RawIpnPayload } from "../../shared/ports/PaymentGatewayAdapter";
import type { AuditLogService } from "../audit-log/audit-log.service";
import type { CompanyRepository } from "../companies/company.repository";
import type { NotificationsService } from "../notifications/notifications.service";
import type { CompanySubscriptionRepository } from "../subscriptions/company-subscription.repository";
import type { UserRepository } from "../users/user.repository";
import type { PaymentCallbackLogRepository } from "./payment-callback-log.repository";
import type { PaymentMethodRepository } from "./payment-method.repository";
import type { PaymentRepository } from "./payment.repository";
import type { TransactionRepository } from "./transaction.repository";

interface PaymentsConfig {
  DEV_SKIP_PAYMENT_GATEWAY: boolean;
  VNPAY_RETURN_URL: string;
  MOMO_RETURN_URL: string;
}

// Module `payments` sở hữu Payment/Transaction/PaymentCallbackLog/PaymentMethod
// và cả 2 gateway adapter. Gọi ngược CompanySubscriptionRepository (thuộc
// module `subscriptions`) khi IPN xác nhận thành công — 2 module biết nhau
// trực tiếp trong cùng process, không qua message queue (đúng quyết định
// monolith đã chốt, xem ARCHITECTURE_DECISIONS.md AD-6 và PLAN.md Phần 2).
export class PaymentsService {
  private readonly paymentRepository: PaymentRepository;
  private readonly transactionRepository: TransactionRepository;
  private readonly paymentMethodRepository: PaymentMethodRepository;
  private readonly paymentCallbackLogRepository: PaymentCallbackLogRepository;
  private readonly companySubscriptionRepository: CompanySubscriptionRepository;
  private readonly paymentGatewayAdapters: Record<PaymentProvider, PaymentGatewayAdapter>;
  private readonly logger: Logger;
  private readonly paymentsConfig: PaymentsConfig;
  private readonly prisma: PrismaClient;
  private readonly companyRepository: CompanyRepository;
  private readonly userRepository: UserRepository;
  private readonly notificationsService: NotificationsService;
  private readonly auditLogService: AuditLogService;

  constructor({
    paymentRepository,
    transactionRepository,
    paymentMethodRepository,
    paymentCallbackLogRepository,
    companySubscriptionRepository,
    paymentGatewayAdapters,
    logger,
    config,
    prisma,
    companyRepository,
    userRepository,
    notificationsService,
    auditLogService,
  }: {
    paymentRepository: PaymentRepository;
    transactionRepository: TransactionRepository;
    paymentMethodRepository: PaymentMethodRepository;
    paymentCallbackLogRepository: PaymentCallbackLogRepository;
    companySubscriptionRepository: CompanySubscriptionRepository;
    paymentGatewayAdapters: Record<PaymentProvider, PaymentGatewayAdapter>;
    logger: Logger;
    config: PaymentsConfig;
    prisma: PrismaClient;
    companyRepository: CompanyRepository;
    userRepository: UserRepository;
    notificationsService: NotificationsService;
    auditLogService: AuditLogService;
  }) {
    this.paymentRepository = paymentRepository;
    this.transactionRepository = transactionRepository;
    this.paymentMethodRepository = paymentMethodRepository;
    this.paymentCallbackLogRepository = paymentCallbackLogRepository;
    this.companySubscriptionRepository = companySubscriptionRepository;
    this.paymentGatewayAdapters = paymentGatewayAdapters;
    this.logger = logger;
    this.paymentsConfig = config;
    this.prisma = prisma;
    this.companyRepository = companyRepository;
    this.userRepository = userRepository;
    this.notificationsService = notificationsService;
    this.auditLogService = auditLogService;
  }

  /**
   * Tạo Payment(PENDING) + gọi gateway để lấy URL redirect + tạo Transaction(INIT).
   * `companySubscriptionId` do SubscriptionsService.checkout() tạo trước và truyền vào.
   */
  async createCheckout(params: {
    provider: PaymentProvider;
    companySubscriptionId: string;
    amount: number;
    orderInfo: string;
    clientIp: string;
  }): Promise<{ paymentUrl: string; orderCode: string }> {
    const paymentMethod = await this.requirePaymentMethod(params.provider);
    const payment = await this.paymentRepository.create({
      companySubscriptionId: params.companySubscriptionId,
      amount: params.amount,
      status: "PENDING",
    });

    if (this.paymentsConfig.DEV_SKIP_PAYMENT_GATEWAY) {
      return this.completeDevSkippedCheckout(params.provider, payment.id, paymentMethod.id);
    }

    const adapter = this.paymentGatewayAdapters[params.provider];
    const orderCode = this.buildOrderCode(params.provider, payment.id);

    const { paymentUrl } = await adapter.createCheckoutUrl({
      orderCode,
      amount: params.amount,
      orderInfo: params.orderInfo,
      clientIp: params.clientIp,
    });

    await this.transactionRepository.create({
      paymentId: payment.id,
      paymentMethodId: paymentMethod.id,
      orderCode,
      status: "INIT",
    });

    return { paymentUrl, orderCode };
  }

  // DEV ONLY (DEV_SKIP_PAYMENT_GATEWAY=true) — bỏ qua redirect sang VNPay/Momo
  // thật, đánh dấu Payment/Transaction COMPLETED và kích hoạt CompanySubscription
  // ngay lập tức. paymentUrl trỏ thẳng về trang return của app (kèm orderCode),
  // frontend poll GET .../by-order-code/:orderCode thấy COMPLETED ngay — không
  // cần đổi gì ở frontend. Chặn cứng ở production (env.ts).
  private async completeDevSkippedCheckout(
    provider: PaymentProvider,
    paymentId: string,
    paymentMethodId: string,
  ): Promise<{ paymentUrl: string; orderCode: string }> {
    this.logger.warn("DEV_SKIP_PAYMENT_GATEWAY bypass applied — never enable this in production", {
      paymentId,
      provider,
    });

    const orderCode = this.buildOrderCode(provider, paymentId);
    await this.transactionRepository.create({ paymentId, paymentMethodId, orderCode, status: "SUCCESS" });
    await this.paymentRepository.updateStatus(paymentId, "COMPLETED");
    await this.activateSubscriptionForPayment(paymentId);
    await this.recordCompletedPayment(paymentId);

    const returnUrl = provider === "VNPAY" ? this.paymentsConfig.VNPAY_RETURN_URL : this.paymentsConfig.MOMO_RETURN_URL;
    return { paymentUrl: `${returnUrl}?orderCode=${encodeURIComponent(orderCode)}`, orderCode };
  }

  async handleIpn(provider: PaymentProvider, raw: RawIpnPayload): Promise<{ status: number; body: unknown }> {
    // Ghi log TRƯỚC khi xử lý, kể cả khi chữ ký sai — để tra soát sau này.
    await this.logCallback(provider, raw);

    const adapter = this.paymentGatewayAdapters[provider];
    const result = adapter.verifyAndParseIpn(raw);

    if (!result.valid || !result.orderCode) {
      this.logger.warn("Payment IPN signature invalid", { provider });
      return adapter.buildIpnAckResponse("INVALID_SIGNATURE");
    }

    const transaction = await this.transactionRepository.findByOrderCode(result.orderCode);
    if (!transaction) {
      return adapter.buildIpnAckResponse("ORDER_NOT_FOUND");
    }

    // Idempotency: cổng có thể gọi lại IPN nhiều lần cho cùng 1 giao dịch.
    if (result.providerTransactionId) {
      const existing = await this.transactionRepository.findByProviderTransactionId(result.providerTransactionId);
      if (existing) {
        return adapter.buildIpnAckResponse("ALREADY_PROCESSED");
      }
    }

    const transactionStatus: TransactionStatus = result.success ? "SUCCESS" : "FAILED";
    const paymentStatus: PaymentStatus = result.success ? "COMPLETED" : "FAILED";

    await this.transactionRepository.updateStatus(transaction.id, {
      status: transactionStatus,
      rawResponse: JSON.stringify(raw.data),
      ...(result.providerTransactionId ? { providerTransactionId: result.providerTransactionId } : {}),
    });
    await this.paymentRepository.updateStatus(transaction.paymentId, paymentStatus);

    if (result.success) {
      await this.activateSubscriptionForPayment(transaction.paymentId);
      await this.recordCompletedPayment(transaction.paymentId);
    }

    return adapter.buildIpnAckResponse("SUCCESS");
  }

  /** Dùng bởi SubscriptionsService cho GET /subscriptions/payments/by-order-code/:orderCode — không tin return URL. */
  async findStatusByOrderCode(orderCode: string): Promise<{ status: PaymentStatus; companySubscriptionId: string } | null> {
    const transaction = await this.transactionRepository.findByOrderCode(orderCode);
    if (!transaction) return null;

    const payment = await this.paymentRepository.findById(transaction.paymentId);
    if (!payment) return null;

    return { status: payment.status, companySubscriptionId: payment.companySubscriptionId };
  }

  /**
   * Được gọi từ trang return khi phát hiện gateway báo huỷ qua query param
   * (Momo resultCode=1006 / VNPay vnp_ResponseCode=24) nhưng IPN có thể sẽ
   * không bao giờ gọi tới cho giao dịch bị huỷ trước khi ngân hàng xử lý —
   * tránh Payment/Transaction kẹt PENDING vĩnh viễn. CHỈ chuyển
   * PENDING -> FAILED, không bao giờ ghi đè COMPLETED/FAILED đã có (idempotent,
   * không tin tưởng tuyệt đối query param — xem findStatusByOrderCode ở trên).
   */
  async reportClientCancellation(orderCode: string): Promise<PaymentStatus> {
    const transaction = await this.transactionRepository.findByOrderCode(orderCode);
    if (!transaction) {
      throw new AppError(404, "Order not found");
    }

    const payment = await this.paymentRepository.findById(transaction.paymentId);
    if (!payment) {
      throw new AppError(404, "Order not found");
    }

    if (payment.status !== "PENDING") {
      return payment.status;
    }

    await this.transactionRepository.updateStatus(transaction.id, {
      status: "FAILED",
      rawResponse: JSON.stringify({ clientReported: "USER_CANCELLED" }),
    });
    await this.paymentRepository.updateStatus(payment.id, "FAILED");
    return "FAILED";
  }

  private async activateSubscriptionForPayment(paymentId: string): Promise<void> {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment) return;

    const companySubscription = await this.companySubscriptionRepository.findById(payment.companySubscriptionId);
    if (!companySubscription) return;

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + companySubscription.plan.durationDays * 24 * 60 * 60 * 1000);
    await this.companySubscriptionRepository.activate(companySubscription.id, { startDate, endDate });
  }

  /**
   * AD-16 — nhật ký + thông báo PAYMENT_COMPLETED cho Admin (chỉ trong app, D8).
   * Chạy sau khi Payment đã COMPLETED và gói đã kích hoạt (luồng thanh toán vốn
   * không nằm trong transaction), nên lỗi ở đây chỉ được log: không được làm
   * hỏng phản hồi IPN của một giao dịch đã thành công.
   */
  private async recordCompletedPayment(paymentId: string): Promise<void> {
    try {
      const payment = await this.paymentRepository.findById(paymentId);
      if (!payment) return;
      const subscription = await this.companySubscriptionRepository.findById(payment.companySubscriptionId);
      if (!subscription) return;
      const company = await this.companyRepository.findById(subscription.companyId);
      const companyName = company?.name ?? "Một công ty";
      const planName = subscription.plan.name;

      await this.prisma.$transaction(async (tx) => {
        await this.auditLogService.record(
          {
            actorId: null,
            actorRole: null,
            action: "PAYMENT_COMPLETED",
            entityType: "Subscription",
            entityId: subscription.id,
            summary: `${companyName} thanh toán gói "${planName}" (${payment.amount.toLocaleString("vi-VN")}đ)`,
            metadata: { paymentId, amount: payment.amount },
          },
          tx,
        );
        const adminIds = await this.userRepository.findAdminIds(tx);
        await this.notificationsService.notifyMany(
          "PAYMENT_COMPLETED",
          adminIds,
          { paymentId, companyId: subscription.companyId, companyName, planName, amount: payment.amount },
          tx,
        );
      });
    } catch (error) {
      this.logger.error("Không ghi được nhật ký/thông báo cho thanh toán thành công", { error, paymentId });
    }
  }

  private async logCallback(provider: PaymentProvider, raw: RawIpnPayload): Promise<void> {
    const serialized = JSON.stringify(raw.data);
    await this.paymentCallbackLogRepository.create(
      provider === "VNPAY" ? { provider, rawQueryString: serialized } : { provider, rawPayload: serialized },
    );
  }

  private async requirePaymentMethod(provider: PaymentProvider): Promise<PaymentMethod> {
    const paymentMethod = await this.paymentMethodRepository.findByProcessorType(provider);
    if (!paymentMethod) {
      throw new AppError(400, "Selected payment method is not available");
    }
    return paymentMethod;
  }

  private buildOrderCode(provider: PaymentProvider, paymentId: string): string {
    return `${provider}-${paymentId}-${randomBytes(4).toString("hex").toUpperCase()}`;
  }
}
