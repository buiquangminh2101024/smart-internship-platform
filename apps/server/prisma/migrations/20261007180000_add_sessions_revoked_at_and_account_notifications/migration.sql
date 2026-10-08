-- AD-18 — Quản lý người dùng Mở rộng 1, migration M2.
-- 1) Mốc thu hồi mọi phiên (buộc đăng xuất). Cho phép null, không backfill:
--    null = chưa từng bị thu hồi, mọi token cũ vẫn hợp lệ như trước.
-- 2) Hai loại thông báo mới. Các giá trị enum mới KHÔNG được dùng trong file này
--    (PostgreSQL không cho dùng giá trị enum vừa ADD VALUE trong cùng transaction).

-- AlterTable
ALTER TABLE "users" ADD COLUMN "sessionsRevokedAt" TIMESTAMP(3);

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_ACTIVATED';
ALTER TYPE "NotificationType" ADD VALUE 'PASSWORD_RESET_SUGGESTED';
