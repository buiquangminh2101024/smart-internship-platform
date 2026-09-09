import { randomUUID } from "node:crypto";
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
import { hmacSha256Hex } from "../shared/utils/payment-signing";

interface MomoConfig {
  MOMO_PARTNER_CODE?: string;
  MOMO_ACCESS_KEY?: string;
  MOMO_SECRET_KEY?: string;
  MOMO_CREATE_ENDPOINT: string;
  MOMO_RETURN_URL: string;
  MOMO_IPN_URL: string;
  MOMO_REQUEST_TYPE: string;
}

interface MomoCreateResponse {
  resultCode?: number;
  payUrl?: string;
  message?: string;
}

function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

// Tham khảo kỹ thuật (đọc trực tiếp source, không copy code):
// event-ticketing-platform/services/payment/.../providers/momo/services/impl/MoMoPaymentServiceImpl.java
// — khác VNPay, Momo có API tạo giao dịch thật (POST MOMO_CREATE_ENDPOINT).
// IPN là POST JSON, ký/verify bằng HMAC-SHA256 trên thứ tự field CỐ ĐỊNH
// (không sort alphabet như VNPay). Amount gửi NGUYÊN, không nhân 100.
export class MomoGatewayAdapter implements PaymentGatewayAdapter {
  readonly provider = "MOMO" as const;
  private readonly config: MomoConfig;
  private readonly logger: Logger;

  constructor({ config, logger }: { config: MomoConfig; logger: Logger }) {
    this.config = config;
    this.logger = logger;
  }

  async createCheckoutUrl({ orderCode, amount, orderInfo }: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const partnerCode = this.requireSecret(this.config.MOMO_PARTNER_CODE, "MOMO_PARTNER_CODE");
    const accessKey = this.requireSecret(this.config.MOMO_ACCESS_KEY, "MOMO_ACCESS_KEY");
    const secretKey = this.requireSecret(this.config.MOMO_SECRET_KEY, "MOMO_SECRET_KEY");

    const requestId = randomUUID();
    const requestType = this.config.MOMO_REQUEST_TYPE;
    const extraData = "";
    // Momo KHÔNG nhân 100 (khác VNPay) — gửi nguyên số VND.
    const amountStr = String(Math.round(amount));

    // Thứ tự field CỐ ĐỊNH theo spec Momo v2 createPayment — không sort alphabet.
    const signatureData =
      `accessKey=${accessKey}` +
      `&amount=${amountStr}` +
      `&extraData=${extraData}` +
      `&ipnUrl=${this.config.MOMO_IPN_URL}` +
      `&orderId=${orderCode}` +
      `&orderInfo=${orderInfo}` +
      `&partnerCode=${partnerCode}` +
      `&redirectUrl=${this.config.MOMO_RETURN_URL}` +
      `&requestId=${requestId}` +
      `&requestType=${requestType}`;

    const signature = hmacSha256Hex(signatureData, secretKey);

    const body = {
      partnerCode,
      accessKey,
      requestId,
      amount: amountStr,
      orderId: orderCode,
      orderInfo,
      redirectUrl: this.config.MOMO_RETURN_URL,
      ipnUrl: this.config.MOMO_IPN_URL,
      requestType,
      extraData,
      lang: "vi",
      autoCapture: true,
      signature,
    };

    let result: MomoCreateResponse;
    try {
      const res = await fetch(this.config.MOMO_CREATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      result = (await res.json()) as MomoCreateResponse;
    } catch (error) {
      this.logger.error("Momo createPayment call failed", { error });
      throw new AppError(502, "Could not reach Momo payment gateway");
    }

    if (result.resultCode !== 0 || !result.payUrl) {
      throw new AppError(502, `Momo checkout failed: ${result.message ?? "unknown error"}`);
    }

    return { paymentUrl: result.payUrl };
  }

  verifyAndParseIpn({ data }: RawIpnPayload): IpnResult {
    const accessKey = this.config.MOMO_ACCESS_KEY;
    const secretKey = this.config.MOMO_SECRET_KEY;
    const signature = str(data.signature);
    if (!signature || !accessKey || !secretKey) {
      return { valid: false };
    }

    // Thứ tự field CỐ ĐỊNH riêng cho IPN (khác thứ tự field lúc tạo giao dịch).
    const signatureData =
      `accessKey=${accessKey}` +
      `&amount=${str(data.amount)}` +
      `&extraData=${str(data.extraData)}` +
      `&message=${str(data.message)}` +
      `&orderId=${str(data.orderId)}` +
      `&orderInfo=${str(data.orderInfo)}` +
      `&orderType=${str(data.orderType)}` +
      `&partnerCode=${str(data.partnerCode)}` +
      `&payType=${str(data.payType)}` +
      `&requestId=${str(data.requestId)}` +
      `&responseTime=${str(data.responseTime)}` +
      `&resultCode=${str(data.resultCode)}` +
      `&transId=${str(data.transId)}`;

    const calculated = hmacSha256Hex(signatureData, secretKey);
    if (calculated.toLowerCase() !== signature.toLowerCase()) {
      return { valid: false };
    }

    const resultCode = Number(data.resultCode);
    const providerTransactionId = str(data.transId);
    return {
      valid: true,
      orderCode: str(data.orderId),
      success: resultCode === 0,
      message: str(data.message),
      ...(providerTransactionId ? { providerTransactionId } : {}),
    };
  }

  // Momo chỉ cần ack 2xx nhanh — không strict-check nội dung body như VNPay.
  buildIpnAckResponse(outcome: IpnAckOutcome): { status: number; body: unknown } {
    switch (outcome) {
      case "INVALID_SIGNATURE":
        return { status: 400, body: undefined };
      case "ORDER_NOT_FOUND":
        return { status: 404, body: undefined };
      case "UNKNOWN_ERROR":
        return { status: 500, body: undefined };
      default:
        return { status: 204, body: undefined };
    }
  }

  private requireSecret(value: string | undefined, name: string): string {
    if (!value) throw new AppError(500, `${name} is not configured`);
    return value;
  }
}
