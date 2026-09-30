/**
 * Bảng màu chung của biểu đồ dashboard — chỉ token (sip-ui). `brand-*` đổi theo
 * khu vực; marigold = đang chờ người xử lý (đậm dần theo thời gian chờ);
 * `success` = bước cuối phễu. Màu không bao giờ là kênh duy nhất: component
 * nào dùng bảng này cũng phải có nhãn và số.
 *
 * Viết đủ tên class (không ghép chuỗi) để Tailwind quét được.
 */
export type ChartTone =
  | "brand-soft"
  | "brand"
  | "brand-strong"
  | "brand-darker"
  | "brand-deep"
  | "wait-short"
  | "wait-mid"
  | "wait-long"
  | "success"
  | "muted";

export const CHART_TONE_BG: Record<ChartTone, string> = {
  "brand-soft": "bg-brand-200",
  brand: "bg-brand-500",
  "brand-strong": "bg-brand-600",
  "brand-darker": "bg-brand-700",
  "brand-deep": "bg-brand-800",
  "wait-short": "bg-marigold-300",
  "wait-mid": "bg-marigold-500",
  "wait-long": "bg-marigold-700",
  success: "bg-success-600",
  muted: "bg-border-default",
};
