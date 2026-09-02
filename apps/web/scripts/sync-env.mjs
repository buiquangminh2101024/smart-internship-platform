// apps/web không có .env riêng — biến môi trường dùng chung ở .env tại gốc
// monorepo (xem .env.example). Next.js/Turbopack chỉ inline NEXT_PUBLIC_* khi
// file .env nằm ngay trong thư mục app (đã kiểm chứng: qua next.config.ts
// (loadEnvConfig + config.env) KHÔNG đủ — Turbopack cần thấy .env vật lý ở
// đây để thay giá trị lúc biên dịch), nên copy .env gốc vào đây trước mỗi lần
// dev/build/start. Không cần khi chạy CI chỉ build type/lint, không cần env thật.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.join(__dirname, "..", "..", "..", ".env");
const targetEnvPath = path.join(__dirname, "..", ".env.local");

if (fs.existsSync(rootEnvPath)) {
  fs.copyFileSync(rootEnvPath, targetEnvPath);
  console.log(`[sync-env] Copied ${rootEnvPath} -> ${targetEnvPath}`);
} else {
  console.log(`[sync-env] ${rootEnvPath} không tồn tại — bỏ qua (dùng giá trị mặc định trong code nếu có).`);
}
