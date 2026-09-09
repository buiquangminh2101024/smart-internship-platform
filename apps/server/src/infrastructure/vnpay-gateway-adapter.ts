import type {
  CreateCheckoutParams,
  CreateCheckoutResult,
  IpnAckOutcome,
  IpnResult,
  PaymentGatewayAdapter,
  RawIpnPayload,
} from "../shared/ports/PaymentGatewayAdapter";
import { buildSortedQueryString, formatVnpAmount, hmacSha512Hex } from "../shared/utils/payment-signing";

interface VnpayConfig {
  VNPAY_TMN_CODE?: string;
  VNPAY_HASH_SECRET?: string;
  VNPAY_PAY_URL: string;
  VNPAY_RETURN_URL: string;
}

const EXPIRE_MINUTES = 15;

function formatVnpDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

// Tham khảo kỹ thuật (đọc trực tiếp source, không copy code):
// event-ticketing-platform/services/payment/.../providers/vnpay/services/impl/VnPayPaymentServiceImpl.java
// — build URL redirect hoàn toàn phía server (VNPay không có API "tạo giao
// dịch" để gọi), IPN là GET server-to-server verify bằng HMAC-SHA512.
export class VnpayGatewayAdapter implements PaymentGatewayAdapter {
  readonly provider = "VNPAY" as const;
  private readonly config: VnpayConfig;

  constructor({ config }: { config: VnpayConfig }) {
    this.config = config;
  }

  async createCheckoutUrl({ orderCode, amount, orderInfo, clientIp }: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const tmnCode = this.requireSecret(this.config.VNPAY_TMN_CODE, "VNPAY_TMN_CODE");
    const hashSecret = this.requireSecret(this.config.VNPAY_HASH_SECRET, "VNPAY_HASH_SECRET");

    const now = new Date();
    const expire = new Date(now.getTime() + EXPIRE_MINUTES * 60 * 1000);

    const params: Record<string, string> = {
      vnp_Version: "2.1.0",
      vnp_Command: "pay",
      vnp_TmnCode: tmnCode,
      vnp_Amount: String(formatVnpAmount(amount)),
      vnp_CurrCode: "VND",
      vnp_TxnRef: orderCode,
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: "other",
      vnp_Locale: "vn",
      vnp_ReturnUrl: this.config.VNPAY_RETURN_URL,
      vnp_IpAddr: clientIp || "127.0.0.1",
      vnp_CreateDate: formatVnpDate(now),
      vnp_ExpireDate: formatVnpDate(expire),
    };

    const hashData = buildSortedQueryString(params);
    const secureHash = hmacSha512Hex(hashData, hashSecret);

    return {
      paymentUrl: `${this.config.VNPAY_PAY_URL}?${hashData}&vnp_SecureHashType=HmacSHA512&vnp_SecureHash=${secureHash}`,
    };
  }

  verifyAndParseIpn({ data }: RawIpnPayload): IpnResult {
    const params = data as Record<string, string>;
    const secureHash = params.vnp_SecureHash;
    const orderCode = params.vnp_TxnRef;
    const providerTransactionId = params.vnp_TransactionNo;
    const responseCode = params.vnp_ResponseCode;

    if (!secureHash || !orderCode || !providerTransactionId || !responseCode || !this.config.VNPAY_HASH_SECRET) {
      return { valid: false };
    }

    const toVerify: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (key === "vnp_SecureHash" || key === "vnp_SecureHashType") continue;
      toVerify[key] = value;
    }

    const calculated = hmacSha512Hex(buildSortedQueryString(toVerify), this.config.VNPAY_HASH_SECRET);
    if (calculated.toLowerCase() !== secureHash.toLowerCase()) {
      return { valid: false };
    }

    return {
      valid: true,
      orderCode,
      providerTransactionId,
      success: responseCode === "00",
      message: responseCode === "00" ? "Confirm Success" : `VNPay responseCode ${responseCode}`,
    };
  }

  // Format response theo đúng tài liệu chính thức VNPay yêu cầu cho IPN
  // (field RspCode/Message, HTTP 200 luôn) — xác nhận lại tên field chính xác
  // qua sandbox tool VNPay lúc test thật (xem PLAN.md).
  buildIpnAckResponse(outcome: IpnAckOutcome): { status: number; body: unknown } {
    const responses: Record<IpnAckOutcome, { RspCode: string; Message: string }> = {
      SUCCESS: { RspCode: "00", Message: "Confirm Success" },
      ALREADY_PROCESSED: { RspCode: "00", Message: "Confirm Success" },
      ORDER_NOT_FOUND: { RspCode: "01", Message: "Order not found" },
      INVALID_SIGNATURE: { RspCode: "97", Message: "Invalid signature" },
      UNKNOWN_ERROR: { RspCode: "99", Message: "Unknown error" },
    };
    return { status: 200, body: responses[outcome] };
  }

  private requireSecret(value: string | undefined, name: string): string {
    if (!value) throw new Error(`${name} is not configured`);
    return value;
  }
}
