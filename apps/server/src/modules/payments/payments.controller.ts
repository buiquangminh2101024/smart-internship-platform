import type { NextFunction, Request, Response } from "express";
import type { PaymentsService } from "./payments.service";

// Ngoại lệ duy nhất của quy tắc ApiResponse<T> — response IPN phải đúng format
// mà VNPay/Momo yêu cầu, không bọc envelope (API_CONVENTIONS.md §12).
export class PaymentsController {
  private readonly paymentsService: PaymentsService;

  constructor({ paymentsService }: { paymentsService: PaymentsService }) {
    this.paymentsService = paymentsService;
  }

  vnpayIpn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, body } = await this.paymentsService.handleIpn("VNPAY", { data: req.query as Record<string, unknown> });
      this.send(res, status, body);
    } catch (error) {
      next(error);
    }
  };

  momoIpn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, body } = await this.paymentsService.handleIpn("MOMO", { data: req.body as Record<string, unknown> });
      this.send(res, status, body);
    } catch (error) {
      next(error);
    }
  };

  private send(res: Response, status: number, body: unknown): void {
    if (body === undefined) {
      res.status(status).end();
    } else {
      res.status(status).json(body);
    }
  }
}
