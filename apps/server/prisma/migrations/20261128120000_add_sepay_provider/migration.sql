-- Thêm SePay làm cổng thanh toán thứ ba (AD-32). Chỉ thêm một giá trị enum,
-- không đổi bảng / cột nào. Bản ghi PaymentMethod "SePay" do scripts/seed.ts tạo.
-- docs/06-backend/sepay-payment-gateway/PLAN.md (Bước 2)

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'SEPAY';
