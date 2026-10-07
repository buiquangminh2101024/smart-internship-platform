-- AD-17 — Quản lý người dùng (khoá/mở khoá) + trang hỗ trợ bản A, migration M1.
-- Chỉ thêm giá trị enum. Các giá trị mới KHÔNG được dùng trong file này
-- (PostgreSQL không cho dùng giá trị enum vừa ADD VALUE trong cùng transaction).

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_SUSPENDED';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_REACTIVATED';
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_CONTACT_RECEIVED';
