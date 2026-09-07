# Subscription & Billing Design (Draft)

> **Trạng thái: Đã đưa vào `schema.prisma`** qua migration `20260907143624_add_subscription_billing`, đã đồng bộ `DATABASE_DESIGN.md`/`CLASS_DIAGRAM.md`/`ER_DIAGRAM.md`. Roadmap: `docs/01-project/PROJECT_PHASES.md` Phase 5 — Subscription & Payment cho đăng tin tuyển dụng. Việc implement code Express thật (`apps/server/src/modules/subscriptions`, `payments`, tích hợp VNPay/Momo) vẫn ở ngoài phạm vi, để dành cho lúc thực hiện Phase 5.

## 1. Mục tiêu tính năng

Nhà tuyển dụng (company) phải **trả tiền để đăng một số lượng `JobPost` nhất định** trong một khoảng thời gian, và có thể **nâng cấp gói** để tăng số lượng/thời hạn. Thanh toán qua **VNPay và Momo**, toàn bộ trên web (redirect + IPN/webhook callback, không dùng SDK mobile).

## 2. Các model đề xuất

### 2.1 `SubscriptionPlan` (catalog)

Danh sách gói do Admin quản lý (giống các bảng catalog hiện có: `Skill`, `Industry`...).

- `name`, `jobPostQuota` (số bài đăng tối đa), `price` (`Int`, đơn vị VND — không dùng `Decimal` vì tiền tệ chỉ VND, không có phần thập phân, nhất quán với `JobPost.salaryMin/salaryMax`), `durationDays`, `description`, `isActive`.

### 2.2 `CompanySubscription`

Gói mà một `Company` đang/đã dùng.

- `companyId`, `planId`, `startDate`, `endDate`, `status` (enum `PENDING | ACTIVE | EXPIRED | CANCELLED`).
- Nâng cấp gói = tạo record mới (hoặc gia hạn), giữ lại lịch sử các gói đã mua — không overwrite.

### 2.3 `Payment` — ý định thanh toán

Tham khảo `Payment.java` trong dự án Java `event-ticketing-platform` (`services/payment/.../entities/Payment.java`): 1 record cho mỗi lần công ty cần trả tiền (mua gói mới hoặc nâng cấp).

- `companySubscriptionId`, `amount` (`Int`, VND), `status` (enum `PENDING | COMPLETED | FAILED`).
- Không đổi nhiều lần — là "ý định", khác với `Transaction` (mỗi lần gọi cổng).

### 2.4 `Transaction` — mỗi lần gọi cổng thanh toán

Tham khảo `Transaction.java`/`TransactionStatus.java` cùng dự án trên: N–1 với `Payment`.

- `paymentId`, `paymentMethodId` (→ `PaymentMethod`, xem §2.6 — thay cho enum `provider` trực tiếp trên `Transaction`), `orderCode` (`String @unique`, mã đơn do hệ thống tự sinh để khớp lại khi IPN callback trả về), `providerTransactionId` (`String?`, mã cổng trả về sau khi thành công — dùng đối soát/hoàn tiền), `rawResponse` (`String?`, JSON thô), `status` (enum `INIT | SUCCESS | FAILED`), `createdAt`.
- Lý do tách khỏi `Payment`: nếu 1 lần gọi cổng thất bại (timeout, user huỷ giữa đường), hệ thống cho phép thử lại mà vẫn giữ lịch sử các lần thất bại trước — trả lời đúng câu hỏi "cần báo các giai đoạn/thành công/thất bại của giao dịch không" đã đặt ra.

### 2.5 `PaymentCallbackLog` — log thô IPN/webhook

Tham khảo `PaymentCallbackLog.java` cùng dự án trên.

- `provider`, `rawQueryString`, `rawPayload`, `receivedAt`.
- Log **mọi** callback nhận được từ VNPay/Momo, kể cả khi không khớp được `Transaction` nào (sai chữ ký, gọi trùng lặp...) — tách biệt khỏi luồng xử lý nghiệp vụ để tra soát sau này.

### 2.6 `PaymentMethod` (catalog)

Tham khảo `PaymentMethod.java` cùng dự án trên. Generic hoá cổng thanh toán thay vì hardcode enum, để sau này thêm cổng mới (ví dụ ZaloPay) chỉ cần thêm record catalog, không cần sửa code/migration.

- `id`, `displayName`, `logoUrl`, `isAvailable`, `processorType` (enum `VNPAY | MOMO`), `configParams` (key-value config riêng theo cổng, ví dụ `payUrl`, `ipnUrl`... để tách config runtime khỏi biến môi trường khi cần override theo từng method).
- `Transaction.paymentMethodId` tham chiếu tới đây thay vì enum `provider` trực tiếp trên `Transaction`.

### 2.7 Không đưa vào (ngoài phạm vi hiện tại)

- `PaymentOutboxEvent`, `Payout` — thuộc pattern outbox/payout cho hệ microservices, không cần cho app monolith Express hiện tại.
- `RefundRequest`/`RefundStatus` — chỉ cần nếu về sau làm luồng hoàn tiền khi huỷ gói; chưa có yêu cầu nghiệp vụ rõ ràng nên chưa thêm.

## 3. Các quyết định đã chốt

1. **Đếm quota còn lại**: đếm số `JobPost` được tạo trong khoảng `startDate`–`endDate` của `CompanySubscription` hiện tại (query mỗi lần check, không lưu counter riêng) — đơn giản, không lo lệch dữ liệu.
2. **Nâng cấp gói giữa kỳ**: huỷ `CompanySubscription` cũ (chuyển `CANCELLED`) và tạo `CompanySubscription` mới với quota/thời hạn đầy đủ của gói mới, `startDate` = thời điểm thanh toán thành công — không cộng dồn/quy đổi phần còn lại của gói cũ.
3. **Company không có gói active**: chặn hoàn toàn việc tạo `JobPost` mới (kể cả trạng thái `DRAFT`) cho đến khi có `CompanySubscription` ở trạng thái `ACTIVE` còn quota.
4. **Generic hoá cổng thanh toán**: có, dùng bảng catalog `PaymentMethod` (xem mục 2.6) thay vì chỉ 1 enum `provider` trên `Transaction`.

## 4. Tài liệu tham khảo

Các entity Java trong `event-ticketing-platform/services/payment` và `services/booking` (đọc trực tiếp, không copy nguyên field — chỉ tham khảo cách tách trách nhiệm giữa `Payment`/`Transaction`/`PaymentCallbackLog`).
