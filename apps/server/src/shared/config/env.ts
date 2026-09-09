import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Repo giữ một .env duy nhất ở root (xem .env.example). npm workspaces chạy
// script này với cwd = apps/server, nên root .env nằm ở "../../.env".
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

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

  OTP_HARDCODE: z.coerce.boolean().default(false),
  OTP_HARDCODE_VALUE: z.string().min(1).default("123456"),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

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
});

// Resend/Google chỉ optional khi OTP_HARDCODE=true (dev bypass gửi email thật).
// Ở production luôn bắt buộc phải có đủ để OTP thật + Google OAuth hoạt động.
const envSchema = baseSchema.superRefine((data, ctx) => {
  const requireInProd = data.NODE_ENV === "production" || !data.OTP_HARDCODE;

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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const config = parsed.data;
