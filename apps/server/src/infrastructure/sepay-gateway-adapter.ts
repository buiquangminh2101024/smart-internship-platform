import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "../shared/errors/AppError";
import type { Logger } from "../shared/logger";
import type {
  CreateCheckoutParams,
  CreateCheckoutResult,
  IpnAckOutcome,
  IpnResult,
  PaymentGatewayAdapter,
  RawIpnPayload,
} from "../shared/ports/PaymentGatewayAdapter";
import { buildSepaySigningString, hmacSha256Base64 } from "../shared/utils/payment-signing";

interface SepayConfig {
  SEPAY_MERCHANT_ID?: string;
  /** Merchant Secret Key — ký form checkout. */
  SEPAY_SECRET_KEY?: string;
  /** IPN Secret Key — SePay gửi trong header `X-Secret-Key` của IPN. Khác SEPAY_SECRET_KEY. */
  SEPAY_AUTH_TYPE_SECRET?: string;
  SEPAY_CHECKOUT_URL: string;
  SEPAY_RETURN_URL: string;
}

type ReturnResult = "success" | "error" | "cancel";

function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** So sánh không lộ thời gian: băm hai phía về cùng độ dài rồi timingSafeEqual. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided, "utf-8").digest();
  const b = createHash("sha256").update(expected, "utf-8").digest();
  return timingSafeEqual(a, b);
}

// SePay "Cổng thanh toán" (AD-32, docs/06-backend/sepay-payment-gateway/PLAN.md).
// Khác VNPay/MoMo: checkout là form HTML do TRÌNH DUYỆT POST tới
// SEPAY_CHECKOUT_URL, nên adapter trả `paymentForm` để frontend submit. IPN là
// POST JSON, xác thực bằng header X-Secret-Key — payload KHÔNG có chữ ký, nên
// adapter trả thêm `amount` để PaymentsService đối chiếu với Payment.amount.
export class SepayGatewayAdapter implements PaymentGatewayAdapter {
  readonly provider = "SEPAY" as const;
  private readonly config: SepayConfig;
  private readonly logger: Logger;

  constructor({ config, logger }: { config: SepayConfig; logger: Logger }) {
    this.config = config;
    this.logger = logger;
  }

  async createCheckoutUrl({ orderCode, amount, orderInfo }: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const merchant = this.requireSecret(this.config.SEPAY_MERCHANT_ID, "SEPAY_MERCHANT_ID");
    const secretKey = this.requireSecret(this.config.SEPAY_SECRET_KEY, "SEPAY_SECRET_KEY");

    // SePay nhận số VND nguyên, không nhân 100 (giống MoMo).
    const signedFields: Record<string, string> = {
      order_amount: String(Math.round(amount)),
      merchant,
      currency: "VND",
      operation: "PURCHASE",
      order_description: orderInfo,
      order_invoice_number: orderCode,
      success_url: this.buildReturnUrl(orderCode, "success"),
      error_url: this.buildReturnUrl(orderCode, "error"),
      cancel_url: this.buildReturnUrl(orderCode, "cancel"),
    };

    const signature = hmacSha256Base64(buildSepaySigningString(signedFields), secretKey);
    const action = this.config.SEPAY_CHECKOUT_URL;

    return {
      paymentUrl: action,
      paymentForm: { action, fields: { ...signedFields, lang: "vi", signature } },
    };
  }

  verifyAndParseIpn({ data, headers }: RawIpnPayload): IpnResult {
    const expected = this.config.SEPAY_AUTH_TYPE_SECRET;
    const provided = headers?.["x-secret-key"];
    if (!expected || !provided || !secretsMatch(provided, expected)) {
      return { valid: false };
    }

    const order = asRecord(data.order);
    const transaction = asRecord(data.transaction);
    const notificationType = str(data.notification_type);
    const orderCode = str(order.order_invoice_number);

    // Chỉ xử lý ORDER_PAID. TRANSACTION_VOID (huỷ/hoàn sau khi đã trả) nằm ngoài
    // phạm vi — ghi log rồi ack, không đổi trạng thái.
    if (notificationType !== "ORDER_PAID") {
      return { valid: true, ignored: true, message: notificationType, ...(orderCode ? { orderCode } : {}) };
    }

    const providerTransactionId = str(transaction.id);
    return {
      valid: true,
      orderCode,
      success: true,
      message: str(transaction.transaction_status) || str(order.order_status),
      // Thiếu hoặc sai định dạng thì Number(...) = NaN ⇒ service coi là lệch tiền (an toàn).
      amount: Number(str(order.order_amount) || Number.NaN),
      ...(providerTransactionId ? { providerTransactionId } : {}),
    };
  }

  // SePay chỉ cần HTTP 200 để coi IPN đã được nhận.
  buildIpnAckResponse(outcome: IpnAckOutcome): { status: number; body: unknown } {
    switch (outcome) {
      case "INVALID_SIGNATURE":
        return { status: 401, body: undefined };
      case "ORDER_NOT_FOUND":
        return { status: 404, body: undefined };
      case "UNKNOWN_ERROR":
        return { status: 500, body: undefined };
      default:
        return { status: 200, body: undefined };
    }
  }

  private buildReturnUrl(orderCode: string, result: ReturnResult): string {
    const base = this.config.SEPAY_RETURN_URL;
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}orderCode=${encodeURIComponent(orderCode)}&result=${result}`;
  }

  private requireSecret(value: string | undefined, name: string): string {
    if (!value) {
      // Tên biến env là chi tiết cấu hình nội bộ — không forward ra client.
      this.logger.error(`${name} is not configured`);
      throw new AppError(500, "Payment gateway error, please try again later");
    }
    return value;
  }
}
