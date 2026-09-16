import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Repo giữ một .env duy nhất ở root (xem .env.example). npm workspaces chạy
// script này với cwd = apps/server, nên root .env nằm ở "../../.env".
// dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
const envPath = path.resolve(process.cwd(), "../../.env");
console.log("👉 ĐANG ĐỌC FILE ENV TẠI:", envPath);
dotenv.config({ path: envPath });

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),

  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  JWT_ACCESS_EXPIRY: z.string().min(1).default("15m"),
  JWT_REFRESH_EXPIRY: z.string().min(1).default("7d"),

  OTP_HARDCODE: z.preprocess(
    (value) => (typeof value === "string" ? value === "true" : value),
    z.boolean().default(false)
  ),
  OTP_HARDCODE_VALUE: z.string().min(1).default("123456"),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  // DEV ONLY: thay ResendEmailSender bằng ConsoleEmailSender (in email ra
  // console, không gửi thật) — áp dụng cho MỌI email (OTP + notification).
  // Cùng pattern parse tường minh như DEV_SKIP_COMPANY_MANUAL_VERIFICATION;
  // superRefine bên dưới chặn cứng khi NODE_ENV=production.
  DEV_SKIP_EMAIL_SENDING: z.preprocess(
    (value) => (typeof value === "string" ? value === "true" : value),
    z.boolean().default(false),
  ),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Phase 4 — Employer & Company verification (xem employers/company-verification.service.ts)
  COMMON_EMAIL_DOMAINS: z
    .string()
    .min(1)
    .default("gmail.com,yahoo.com,outlook.com,hotmail.com,icloud.com,live.com,aol.com,protonmail.com")
    .transform((value) => value.split(",").map((domain) => domain.trim().toLowerCase()).filter(Boolean)),
  VIETQR_API_URL: z.string().url().default("https://api.vietqr.io/v2/business"),
  // Bỏ qua hàng đợi xác thực thủ công của Admin, tự động verify mọi công ty
  // cần review — CHỈ DÙNG KHI DEV. BẮT BUỘC đặt false khi triển khai thực tế;
  // superRefine bên dưới chặn cứng server khởi động nếu NODE_ENV=production
  // và giá trị này là true.
  // Cố tình KHÔNG dùng z.coerce.boolean(): nó gọi Boolean(input) của JS, nên
  // chuỗi "false" (falsy trong ý nghĩa business) vẫn coerce ra `true` (chuỗi
  // không rỗng luôn truthy) — nguy hiểm cho một cờ an toàn như thế này. Parse
  // tường minh: chỉ đúng chuỗi "true" mới bật.
  DEV_SKIP_COMPANY_MANUAL_VERIFICATION: z.preprocess(
    (value) => (typeof value === "string" ? value === "true" : value),
    z.boolean().default(false),
  ),

  // Phase 5 — Subscription & Payment (VNPay/Momo sandbox, xem
  // ARCHITECTURE_DECISIONS.md AD-6 và docs/06-backend/phase-05-subscription-payment/PLAN.md).
  // Credentials sandbox thật copy trực tiếp vào .env cục bộ, KHÔNG commit.
  VNPAY_TMN_CODE: z.string().optional(),
  VNPAY_HASH_SECRET: z.string().optional(),
  VNPAY_PAY_URL: z.string().url().default("https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"),
  VNPAY_RETURN_URL: z.string().url().default("http://localhost:3000/employer/subscription/return/vnpay"),

  MOMO_PARTNER_CODE: z.string().optional(),
  MOMO_ACCESS_KEY: z.string().optional(),
  MOMO_SECRET_KEY: z.string().optional(),
  MOMO_CREATE_ENDPOINT: z.string().url().default("https://test-payment.momo.vn/v2/gateway/api/create"),
  MOMO_RETURN_URL: z.string().url().default("http://localhost:3000/employer/subscription/return/momo"),
  // Bắt buộc là URL public lúc test IPN thật (VS Code port forwarding, xem AD-6) —
  // Momo gọi lại địa chỉ này để xác nhận thanh toán, localhost sẽ không nhận được callback.
  MOMO_IPN_URL: z.string().url().default("http://localhost:4000/api/payments/momo/ipn"),
  MOMO_REQUEST_TYPE: z.string().min(1).default("payWithATM"),

  // DEV ONLY: bỏ qua việc gọi cổng thanh toán thật (VNPay/Momo) khi checkout —
  // đánh dấu Payment/Transaction COMPLETED và kích hoạt CompanySubscription
  // ngay lập tức, dùng khi sandbox VNPay/Momo không dùng được (vd. tài khoản
  // sandbox mượn của dự án khác chưa được VNPay duyệt cho website này) mà vẫn
  // cần tiếp tục phát triển/test các phần phụ thuộc subscription (Phase 6+).
  // BẮT BUỘC đặt false khi triển khai thực tế — server sẽ TỪ CHỐI KHỞI ĐỘNG nếu
  // NODE_ENV=production và giá trị này là true (giống DEV_SKIP_COMPANY_MANUAL_VERIFICATION).
  DEV_SKIP_PAYMENT_GATEWAY: z.preprocess(
    (value) => (typeof value === "string" ? value === "true" : value),
    z.boolean().default(false),
  ),

  // JobPost Skill — Hướng B (xem docs/06-backend/jobpost-skill-huong-b/PLAN.md).
  // Cả hai đều optional: thiếu GEMINI_API_KEY thì cron bỏ qua bước xác nhận LLM,
  // skill vùng xám nằm lại PENDING chờ Admin duyệt tay (human-in-the-loop vẫn
  // chạy được, chỉ tốn công hơn). Thiếu EMBEDDING_MODEL_CACHE_DIR thì
  // @huggingface/transformers dùng cache mặc định trong node_modules — vẫn chạy,
  // chỉ làm phình thư mục dự án (đó là lý do nên trỏ sang ổ đĩa khác).
  GEMINI_API_KEY: z.string().optional(),
  // Đổi được qua .env khi Google gỡ model cũ (gemini-2.0-flash đã bị gỡ, API
  // trả 404 kèm tên bản thay thế) — không phải sửa code.
  GEMINI_MODEL: z.string().min(1).default("gemini-3.6-flash"),
  EMBEDDING_MODEL_CACHE_DIR: z.string().optional(),
  EMBEDDING_MODEL_ID: z.string().min(1).default("Xenova/paraphrase-multilingual-MiniLM-L12-v2"),
});

// Resend/Google chỉ optional khi OTP_HARDCODE=true hoặc DEV_SKIP_EMAIL_SENDING=true
// (dev bypass gửi email thật). Ở production luôn bắt buộc phải có đủ để OTP
// thật + Google OAuth hoạt động.
const envSchema = baseSchema.superRefine((data, ctx) => {
  const requireInProd = data.NODE_ENV === "production" || (!data.OTP_HARDCODE && !data.DEV_SKIP_EMAIL_SENDING);

  if (requireInProd && !data.RESEND_API_KEY) {
    ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "RESEND_API_KEY is required" });
  }
  if (requireInProd && !data.RESEND_FROM_EMAIL) {
    ctx.addIssue({ code: "custom", path: ["RESEND_FROM_EMAIL"], message: "RESEND_FROM_EMAIL is required" });
  }
  if (data.NODE_ENV === "production" && !data.GOOGLE_CLIENT_ID) {
    ctx.addIssue({ code: "custom", path: ["GOOGLE_CLIENT_ID"], message: "GOOGLE_CLIENT_ID is required" });
  }
  if (data.NODE_ENV === "production" && !data.GOOGLE_CLIENT_SECRET) {
    ctx.addIssue({ code: "custom", path: ["GOOGLE_CLIENT_SECRET"], message: "GOOGLE_CLIENT_SECRET is required" });
  }
  if (data.NODE_ENV === "production" && !data.CLOUDINARY_CLOUD_NAME) {
    ctx.addIssue({ code: "custom", path: ["CLOUDINARY_CLOUD_NAME"], message: "CLOUDINARY_CLOUD_NAME is required" });
  }
  if (data.NODE_ENV === "production" && !data.CLOUDINARY_API_KEY) {
    ctx.addIssue({ code: "custom", path: ["CLOUDINARY_API_KEY"], message: "CLOUDINARY_API_KEY is required" });
  }
  if (data.NODE_ENV === "production" && !data.CLOUDINARY_API_SECRET) {
    ctx.addIssue({ code: "custom", path: ["CLOUDINARY_API_SECRET"], message: "CLOUDINARY_API_SECRET is required" });
  }
  if (data.NODE_ENV === "production" && data.DEV_SKIP_COMPANY_MANUAL_VERIFICATION) {
    ctx.addIssue({
      code: "custom",
      path: ["DEV_SKIP_COMPANY_MANUAL_VERIFICATION"],
      message: "DEV_SKIP_COMPANY_MANUAL_VERIFICATION must be false in production",
    });
  }
  if (data.NODE_ENV === "production" && !data.VNPAY_TMN_CODE) {
    ctx.addIssue({ code: "custom", path: ["VNPAY_TMN_CODE"], message: "VNPAY_TMN_CODE is required" });
  }
  if (data.NODE_ENV === "production" && !data.VNPAY_HASH_SECRET) {
    ctx.addIssue({ code: "custom", path: ["VNPAY_HASH_SECRET"], message: "VNPAY_HASH_SECRET is required" });
  }
  if (data.NODE_ENV === "production" && !data.MOMO_PARTNER_CODE) {
    ctx.addIssue({ code: "custom", path: ["MOMO_PARTNER_CODE"], message: "MOMO_PARTNER_CODE is required" });
  }
  if (data.NODE_ENV === "production" && !data.MOMO_ACCESS_KEY) {
    ctx.addIssue({ code: "custom", path: ["MOMO_ACCESS_KEY"], message: "MOMO_ACCESS_KEY is required" });
  }
  if (data.NODE_ENV === "production" && !data.MOMO_SECRET_KEY) {
    ctx.addIssue({ code: "custom", path: ["MOMO_SECRET_KEY"], message: "MOMO_SECRET_KEY is required" });
  }
  if (data.NODE_ENV === "production" && data.DEV_SKIP_PAYMENT_GATEWAY) {
    ctx.addIssue({
      code: "custom",
      path: ["DEV_SKIP_PAYMENT_GATEWAY"],
      message: "DEV_SKIP_PAYMENT_GATEWAY must be false in production",
    });
  }
  if (data.NODE_ENV === "production" && data.DEV_SKIP_EMAIL_SENDING) {
    ctx.addIssue({
      code: "custom",
      path: ["DEV_SKIP_EMAIL_SENDING"],
      message: "DEV_SKIP_EMAIL_SENDING must be false in production",
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const config = parsed.data;
