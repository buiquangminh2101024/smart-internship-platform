import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Repo giữ một .env duy nhất ở root (xem .env.example). npm workspaces chạy
// script này với cwd = apps/server, nên root .env nằm ở "../../.env".
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const config = parsed.data;
