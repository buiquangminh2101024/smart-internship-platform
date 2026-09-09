import { createHmac } from "node:crypto";

// Module thuần (không phụ thuộc Express/Prisma) — dùng chung bởi
// vnpay-gateway-adapter.ts và momo-gateway-adapter.ts, test độc lập được.
// Xem ARCHITECTURE_DECISIONS.md AD-6 và SUBSCRIPTION_BILLING_DESIGN.md §6.

export function hmacSha512Hex(data: string, secret: string): string {
  return createHmac("sha512", secret).update(Buffer.from(data, "utf-8")).digest("hex");
}

export function hmacSha256Hex(data: string, secret: string): string {
  return createHmac("sha256", secret).update(Buffer.from(data, "utf-8")).digest("hex");
}

/**
 * Sort key theo alphabet, bỏ giá trị rỗng/undefined, encode kiểu
 * application/x-www-form-urlencoded (space -> "+") — khớp cách VNPay
 * (`java.net.URLEncoder.encode(value, US_ASCII)`) ký/verify chữ ký, dùng cho
 * cả hashData lẫn query string cuối cùng của URL redirect.
 */
export function buildSortedQueryString(params: Record<string, string | undefined>): string {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => `${key}=${encodeURIComponent(params[key]!).replace(/%20/g, "+")}`)
    .join("&");
}

/** VNPay yêu cầu vnp_Amount = số tiền VND x 100 (không có phần thập phân). */
export function formatVnpAmount(amount: number): number {
  return Math.round(amount) * 100;
}
