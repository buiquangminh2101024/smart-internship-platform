import type { PaymentProvider } from "@sip/shared-types";

// Strategy/Adapter pattern — 1 interface chung cho VNPay/Momo thay vì 2 lối
// tổ chức độc lập (điểm yếu quan sát được ở event-ticketing-platform/services/
// payment, xem ARCHITECTURE_DECISIONS.md AD-6 và SUBSCRIPTION_BILLING_DESIGN.md
// §6.1). PaymentsService chọn adapter theo PaymentMethod.processorType qua
// map `paymentGatewayAdapters: Record<PaymentProvider, PaymentGatewayAdapter>`
// đăng ký ở container.ts.

export interface CreateCheckoutParams {
  orderCode: string;
  /** VND, số nguyên chưa nhân 100 — từng adapter tự áp quy ước riêng của cổng mình. */
  amount: number;
  /** Mô tả đơn hàng — PHẢI là ASCII thuần (không dấu tiếng Việt), vì VNPay ký/verify bằng US-ASCII encoding. */
  orderInfo: string;
  clientIp: string;
}

export interface CreateCheckoutResult {
  paymentUrl: string;
}

export interface RawIpnPayload {
  /** VNPay: query params của GET callback. Momo: JSON body của POST callback. */
  data: Record<string, unknown>;
}

export interface IpnResult {
  /** false nếu chữ ký không hợp lệ — các field còn lại KHÔNG được tin khi valid=false. */
  valid: boolean;
  orderCode?: string;
  providerTransactionId?: string;
  success?: boolean;
  message?: string;
}

export type IpnAckOutcome =
  | "SUCCESS"
  | "ALREADY_PROCESSED"
  | "ORDER_NOT_FOUND"
  | "INVALID_SIGNATURE"
  | "UNKNOWN_ERROR";

export interface PaymentGatewayAdapter {
  readonly provider: PaymentProvider;
  createCheckoutUrl(params: CreateCheckoutParams): Promise<CreateCheckoutResult>;
  /** Verify chữ ký trước khi đọc bất kỳ field nào — không bao giờ tin payload chưa verify. */
  verifyAndParseIpn(payload: RawIpnPayload): IpnResult;
  /** Build response đúng format riêng của từng cổng (không phải ApiResponse — xem API_CONVENTIONS.md §12). */
  buildIpnAckResponse(outcome: IpnAckOutcome): { status: number; body: unknown };
}
