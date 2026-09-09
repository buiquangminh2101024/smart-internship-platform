import type { NextFunction, Request, Response } from "express";
import type {
  ApiResponse,
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
import type { SubscriptionsService } from "./subscriptions.service";

// Node HTTP server nghe trên "::" (dual-stack IPv4/IPv6 mặc định khi
// app.listen(PORT) không chỉ định host, xem main.ts) trả về địa chỉ IPv4 cục
// bộ dạng "::ffff:127.0.0.1" thay vì "127.0.0.1" cho req.ip — VNPay sandbox từ
// chối vnp_IpAddr dạng IPv4-mapped này (quan sát được: trả lỗi chung "Website
// chưa được phê duyệt" thay vì báo lỗi IP rõ ràng). Bóc tiền tố trước khi gửi.
function normalizeClientIp(ip: string): string {
  const ipv4Mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(ip);
  return ipv4Mapped ? ipv4Mapped[1]! : ip;
}

export class SubscriptionsController {
  private readonly subscriptionsService: SubscriptionsService;

  constructor({ subscriptionsService }: { subscriptionsService: SubscriptionsService }) {
    this.subscriptionsService = subscriptionsService;
  }

  listPlans = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.subscriptionsService.listActivePlans();
      const body: ApiResponse<SubscriptionPlanDto[]> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  createPlan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CreateSubscriptionPlanRequest;
      const result = await this.subscriptionsService.createPlan(dto);
      const body: ApiResponse<SubscriptionPlanDto> = { success: true, data: result };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  updatePlan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as UpdateSubscriptionPlanRequest;
      const result = await this.subscriptionsService.updatePlan(req.params.id as string, dto);
      const body: ApiResponse<SubscriptionPlanDto> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  getMyCompanyAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.subscriptionsService.getCompanySubscriptionAccessForUser(req.user!.id);
      const body: ApiResponse<SubscriptionAccessStatus> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  history = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cursor } = req.query as { cursor?: string };
      const result = await this.subscriptionsService.history(req.user!.id, cursor);
      const body: ApiResponse<PaginatedResponse<CompanySubscriptionSummary>> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };

  checkout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = req.body as CheckoutRequest;
      const clientIp = normalizeClientIp(req.ip ?? "127.0.0.1");
      const result = await this.subscriptionsService.checkout(req.user!.id, dto, clientIp);
      const body: ApiResponse<CheckoutResponse> = { success: true, data: result };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  };

  paymentStatusByOrderCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.subscriptionsService.getPaymentStatusByOrderCode(req.user!.id, req.params.orderCode as string);
      const body: ApiResponse<PaymentStatusResponse> = { success: true, data: result };
      res.json(body);
    } catch (error) {
      next(error);
    }
  };
}
