import type { PrismaClient } from "@prisma/client";
import type {
  CheckoutRequest,
  CheckoutResponse,
  CompanySubscriptionSummary,
  CreateSubscriptionPlanRequest,
  PaginatedResponse,
  PaymentStatusResponse,
  SubscriptionAccessStatus,
  SubscriptionPlan as SubscriptionPlanDto,
  UpdateSubscriptionPlanRequest,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { EmployerRepository } from "../employers/employer.repository";
import type { PaymentsService } from "../payments/payments.service";
import type { CompanySubscriptionRepository } from "./company-subscription.repository";
import type { SubscriptionPlanRepository } from "./subscription-plan.repository";
import { toCompanySubscriptionSummary, toSubscriptionPlanDto } from "./subscription.mapper";

// Free trial (chốt ở ARCHITECTURE_DECISIONS.md AD-6, SUBSCRIPTION_BILLING_DESIGN.md §5):
// company VERIFIED, CHƯA từng có CompanySubscription nào, trong vòng 30 ngày
// kể từ verifiedAt — tối đa 2 tin PUBLISHED + 10 tin DRAFT (2 hạn mức tách biệt).
const TRIAL_DAYS = 30;
const TRIAL_PUBLISH_LIMIT = 2;
const TRIAL_DRAFT_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export class SubscriptionsService {
  private readonly prisma: PrismaClient;
  private readonly subscriptionPlanRepository: SubscriptionPlanRepository;
  private readonly companySubscriptionRepository: CompanySubscriptionRepository;
  private readonly employerRepository: EmployerRepository;
  private readonly paymentsService: PaymentsService;

  constructor({
    prisma,
    subscriptionPlanRepository,
    companySubscriptionRepository,
    employerRepository,
    paymentsService,
  }: {
    prisma: PrismaClient;
    subscriptionPlanRepository: SubscriptionPlanRepository;
    companySubscriptionRepository: CompanySubscriptionRepository;
    employerRepository: EmployerRepository;
    paymentsService: PaymentsService;
  }) {
    this.prisma = prisma;
    this.subscriptionPlanRepository = subscriptionPlanRepository;
    this.companySubscriptionRepository = companySubscriptionRepository;
    this.employerRepository = employerRepository;
    this.paymentsService = paymentsService;
  }

  async listActivePlans(): Promise<SubscriptionPlanDto[]> {
    const plans = await this.subscriptionPlanRepository.findActive();
    return plans.map(toSubscriptionPlanDto);
  }

  async createPlan(dto: CreateSubscriptionPlanRequest): Promise<SubscriptionPlanDto> {
    const plan = await this.subscriptionPlanRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      jobPostQuota: dto.jobPostQuota,
      durationDays: dto.durationDays,
      price: dto.price,
    });
    return toSubscriptionPlanDto(plan);
  }

  async updatePlan(id: string, dto: UpdateSubscriptionPlanRequest): Promise<SubscriptionPlanDto> {
    const existing = await this.subscriptionPlanRepository.findById(id);
    if (!existing) {
      throw new AppError(404, "Subscription plan not found");
    }
    const plan = await this.subscriptionPlanRepository.update(id, dto);
    return toSubscriptionPlanDto(plan);
  }

  async getCompanySubscriptionAccessForUser(userId: string): Promise<SubscriptionAccessStatus> {
    const employer = await this.requireEmployer(userId);
    return this.getCompanySubscriptionAccess({ id: employer.companyId, verifiedAt: employer.company.verifiedAt });
  }

  /**
   * Dùng chung cho cả trial lẫn quota trả phí — export sẵn cho module
   * job-posts (Phase 6) gọi khi kiểm tra quyền publish()/submitForApproval()
   * (xem ARCHITECTURE_DECISIONS.md AD-6 mục 2).
   */
  async getCompanySubscriptionAccess(company: { id: string; verifiedAt: Date | null }): Promise<SubscriptionAccessStatus> {
    const activeSub = await this.companySubscriptionRepository.findActiveByCompany(company.id);
    if (activeSub) {
      const used = await this.prisma.jobPost.count({
        where: { companyId: company.id, createdAt: { gte: activeSub.startDate, lt: activeSub.endDate } },
      });
      return {
        mode: "SUBSCRIBED",
        publishRemaining: Math.max(0, activeSub.plan.jobPostQuota - used),
        subscription: toCompanySubscriptionSummary(activeSub),
      };
    }

    // Company đã từng mua gói (kể cả CANCELLED/EXPIRED) — trial đã kết thúc
    // vĩnh viễn, không quay lại trial dù hiện tại không có gói ACTIVE nào.
    const everHadSubscription = (await this.companySubscriptionRepository.countForCompany(company.id)) > 0;
    if (everHadSubscription) {
      const latest = await this.companySubscriptionRepository.findLatestForCompany(company.id);
      return { mode: "BLOCKED", ...(latest ? { subscription: toCompanySubscriptionSummary(latest) } : {}) };
    }

    if (!company.verifiedAt) {
      return { mode: "BLOCKED" };
    }

    const trialEndsAt = new Date(company.verifiedAt.getTime() + TRIAL_DAYS * DAY_MS);
    if (new Date() >= trialEndsAt) {
      return { mode: "BLOCKED", trialEndsAt: trialEndsAt.toISOString() };
    }

    const [publishedCount, draftCount] = await Promise.all([
      this.prisma.jobPost.count({
        where: { companyId: company.id, status: "PUBLISHED", createdAt: { gte: company.verifiedAt, lt: trialEndsAt } },
      }),
      this.prisma.jobPost.count({
        where: { companyId: company.id, status: "DRAFT", createdAt: { gte: company.verifiedAt, lt: trialEndsAt } },
      }),
    ]);

    const publishRemaining = Math.max(0, TRIAL_PUBLISH_LIMIT - publishedCount);
    const draftRemaining = Math.max(0, TRIAL_DRAFT_LIMIT - draftCount);
    // Chạm 1 trong 2 hạn mức là hết trial (AD-6) — draft vẫn được tạo tự do ở
    // tầng job-posts (Phase 6) kể cả khi mode=BLOCKED, chỉ publish bị chặn.
    const mode = publishRemaining > 0 && draftRemaining > 0 ? "TRIAL" : "BLOCKED";

    return { mode, publishRemaining, draftRemaining, trialEndsAt: trialEndsAt.toISOString() };
  }

  async history(userId: string, cursor: string | undefined): Promise<PaginatedResponse<CompanySubscriptionSummary>> {
    const employer = await this.requireEmployer(userId);
    const { items, hasMore, nextCursor } = await this.companySubscriptionRepository.listByCompany(
      employer.companyId,
      cursor,
    );
    return { items: items.map(toCompanySubscriptionSummary), hasMore, ...(nextCursor ? { nextCursor } : {}) };
  }

  async checkout(userId: string, dto: CheckoutRequest, clientIp: string): Promise<CheckoutResponse> {
    const employer = await this.requireEmployer(userId);
    if (!employer.isCompanyAdmin) {
      throw new AppError(403, "Only a company admin can purchase a subscription");
    }

    const plan = await this.subscriptionPlanRepository.findById(dto.planId);
    if (!plan || !plan.isActive) {
      throw new AppError(404, "Subscription plan not found");
    }

    // startDate/endDate thật sự chỉ được set khi IPN xác nhận thành công
    // (PaymentsService#activateSubscriptionForPayment) — ở đây chỉ là giá trị
    // placeholder cho bản ghi PENDING (schema NOT NULL), xem SUBSCRIPTION_BILLING_DESIGN.md §6.3.
    const now = new Date();
    const companySubscription = await this.prisma.$transaction(async (tx) => {
      await this.companySubscriptionRepository.cancelActiveOrPending(employer.companyId, tx);
      return this.companySubscriptionRepository.create(
        { companyId: employer.companyId, planId: plan.id, startDate: now, endDate: now, status: "PENDING" },
        tx,
      );
    });

    // ASCII thuần — chữ ký VNPay yêu cầu US-ASCII encoding, tránh dấu tiếng Việt.
    const orderInfo = `Thanh toan goi dich vu ${companySubscription.id}`;

    return this.paymentsService.createCheckout({
      provider: dto.provider,
      companySubscriptionId: companySubscription.id,
      amount: plan.price,
      orderInfo,
      clientIp,
    });
  }

  async getPaymentStatusByOrderCode(userId: string, orderCode: string): Promise<PaymentStatusResponse> {
    const employer = await this.requireEmployer(userId);
    const result = await this.paymentsService.findStatusByOrderCode(orderCode);
    if (!result) {
      throw new AppError(404, "Order not found");
    }

    const companySubscription = await this.companySubscriptionRepository.findById(result.companySubscriptionId);
    // Không tiết lộ sự tồn tại của đơn hàng thuộc company khác — trả 404 giống hệt trường hợp không tìm thấy.
    if (!companySubscription || companySubscription.companyId !== employer.companyId) {
      throw new AppError(404, "Order not found");
    }

    return { status: result.status, companySubscriptionStatus: companySubscription.status };
  }

  /**
   * Trang return gọi khi query param của cổng thanh toán báo huỷ (Momo
   * resultCode=1006 / VNPay vnp_ResponseCode=24) nhưng IPN chưa xác nhận gì —
   * xem PaymentsService.reportClientCancellation. Kiểm tra quyền sở hữu
   * company giống hệt getPaymentStatusByOrderCode ở trên.
   */
  async reportPaymentCancellation(userId: string, orderCode: string): Promise<PaymentStatusResponse> {
    const employer = await this.requireEmployer(userId);
    const result = await this.paymentsService.findStatusByOrderCode(orderCode);
    if (!result) {
      throw new AppError(404, "Order not found");
    }

    const companySubscription = await this.companySubscriptionRepository.findById(result.companySubscriptionId);
    if (!companySubscription || companySubscription.companyId !== employer.companyId) {
      throw new AppError(404, "Order not found");
    }

    const status = await this.paymentsService.reportClientCancellation(orderCode);
    return { status, companySubscriptionStatus: companySubscription.status };
  }

  private async requireEmployer(userId: string) {
    const employer = await this.employerRepository.findByUserId(userId);
    if (!employer) {
      throw new AppError(404, "Employer profile not found");
    }
    return employer;
  }
}
