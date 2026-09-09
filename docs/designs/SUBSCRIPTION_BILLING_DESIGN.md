# Subscription & Billing Design (Draft)

> **Trạng thái: Đã đưa vào `schema.prisma`** qua migration `20260907143624_add_subscription_billing`, đã đồng bộ `DATABASE_DESIGN.md`/`CLASS_DIAGRAM.md`/`ER_DIAGRAM.md`. Roadmap: `docs/01-project/PROJECT_PHASES.md` Phase 5 — Subscription & Payment cho đăng tin tuyển dụng. Free trial + Payment Gateway Adapter pattern + cơ chế sweep đã chốt ở `ARCHITECTURE_DECISIONS.md` AD-6 và mục 5/6/7 bên dưới. Kế hoạch implement chi tiết: `docs/06-backend/phase-05-subscription-payment/PLAN.md`, `docs/05-frontend/phases/phase-05-subscription-payment/PLAN.md`. Việc implement code Express thật vẫn ở ngoài phạm vi tài liệu này, để dành cho lúc chủ dự án cho phép triển khai.

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

## 5. Free trial (chốt ở AD-6, 2026-09-09)

Một `Company` vừa được Admin `verify()` (Phase 4) được dùng thử **miễn phí, không cần `CompanySubscription`**:

- Điều kiện: company **chưa từng có bất kỳ `CompanySubscription` nào** (mọi trạng thái, kể cả `CANCELLED`/`EXPIRED`) và hiện tại còn trong vòng **30 ngày kể từ `Company.verifiedAt`**.
- Hạn mức: tối đa **2 `JobPost` ở `PUBLISHED`** + tối đa **10 `JobPost` ở `DRAFT`** (2 hạn mức tách biệt, không dùng chung 1 con số như quota gói trả phí).
- Hết trial khi: (a) hết 30 ngày, HOẶC (b) chạm 1 trong 2 hạn mức, HOẶC (c) company mua `CompanySubscription` đầu tiên (dù đang còn hạn trial) — điều kiện nào tới trước.
- Sau khi hết trial: `submitForApproval()`/`publish()` bị chặn cho tới khi có `CompanySubscription` `ACTIVE` còn quota (logic gốc ở mục 3.3), **draft vẫn được tạo tự do** kể cả hết trial/hết quota (không đổi hành vi hiện có của `DRAFT` — chỉ hành động hướng-tới-công-khai mới bị chặn theo `Company.requiresApproval`/subscription).
- Không thêm cột schema — tính tại query-time: `verifiedAt`, đếm `JobPost` theo `companyId`+`status`+`createdAt ∈ [verifiedAt, verifiedAt + 30 ngày)`, và `NOT EXISTS CompanySubscription WHERE companyId = ...`.
- Service method dùng chung cho cả trial lẫn quota trả phí: `SubscriptionsService.getCompanySubscriptionAccess(companyId): { mode: "TRIAL" | "SUBSCRIBED" | "BLOCKED"; publishRemaining?: number; draftRemaining?: number; trialEndsAt?: Date; subscription?: CompanySubscriptionSummary }` — module `job-posts` (Phase 6) gọi hàm này để quyết định cho phép `publish()`/`submitForApproval()` hay không, và frontend Phase 5 gọi qua endpoint `GET /employers/company/subscription` để hiển thị banner trial/quota.

## 6. Payment Gateway Adapter — thiết kế tích hợp VNPay/Momo (chốt ở AD-6)

### 6.1 Vấn đề quan sát được ở `event-ticketing-platform/services/payment`

Đọc trực tiếp source Java (không copy code) để rút kinh nghiệm tổ chức lại cho sạch hơn:

- Không có interface chung cho 2 cổng — `VnPayPaymentService`/`MoMoPaymentService` là 2 interface độc lập, controller nào biết controller đó. Chia thư mục theo provider nhưng không phải Strategy pattern thật.
- Hàm tiện ích (`isBlank`, ký HMAC, format ngày, validate thủ công) bị copy-paste giữa 2 impl thay vì gom vào 1 module dùng chung.
- Logic ký chữ ký nằm lẫn trong service orchestration — khó test riêng phần crypto.
- VNPay có 2 endpoint IPN (1 `GET` đúng chuẩn thật, 1 `POST` JSON không ai gọi) — dễ nhầm khi đọc lại.
- 2 nguồn cấu hình song song cho cùng một thứ (`application.properties` VÀ bảng `payment_method_config_params` trong DB) — không rõ nguồn nào là sự thật.

### 6.2 Thiết kế cho `apps/server` (TypeScript + awilix)

```ts
// shared/ports/PaymentGatewayAdapter.ts
interface PaymentGatewayAdapter {
  readonly provider: PaymentProvider; // "VNPAY" | "MOMO"
  createCheckoutUrl(params: CreateCheckoutParams): Promise<{ paymentUrl: string; orderCode: string }>;
  verifyAndParseIpn(raw: RawIpnPayload): IpnResult; // { orderCode, providerTransactionId, success, resultMessage }
  buildIpnAckResponse(result: IpnResult): unknown; // payload phản hồi đúng format từng cổng yêu cầu
}
```

- 2 implementation: `infrastructure/vnpay-gateway-adapter.ts`, `infrastructure/momo-gateway-adapter.ts` — cùng implement 1 interface, đăng ký ở `container.ts` dưới dạng `paymentGatewayAdapters: Record<PaymentProvider, PaymentGatewayAdapter>`. `PaymentsService` chọn adapter theo `PaymentMethod.processorType` đọc từ DB, không hardcode `if/else` theo string ở tầng service.
- `shared/utils/payment-signing.ts` — module thuần (`hmacSha512Hex`, `hmacSha256Hex`, `buildSortedQueryString`, `formatVnpAmount`), test độc lập được, dùng chung 2 adapter — giải quyết đúng vấn đề trùng lặp code nêu ở 6.1.
- **Nguồn sự thật duy nhất cho secret**: biến môi trường (`.env`), theo đúng convention đã dùng cho mọi external service khác trong dự án (`CLOUDINARY_*`, `RESEND_API_KEY`, `GOOGLE_CLIENT_*`) — **không** dùng `PaymentMethod.configParams` để lưu secret (tránh vấn đề "2 nguồn cấu hình song song" ở 6.1). `configParams` (đã có sẵn trong schema) để trống/dự trữ cho nhu cầu phi-secret sau này (vd. thứ tự hiển thị, logo override).
- Chỉ giữ đúng 1 kiểu IPN endpoint mỗi provider, khớp đúng contract thật: VNPay = `GET` query params (`GET /payments/vnpay/ipn`), Momo = `POST` JSON (`POST /payments/momo/ipn`).

### 6.3 Luồng nghiệp vụ

**VNPay** — build URL redirect hoàn toàn ở phía server (không có API "tạo giao dịch" để gọi):
1. `POST /subscriptions/checkout {planId, provider: "VNPAY"}` → tạo `CompanySubscription(PENDING)` + `Payment(PENDING)` + `orderCode` (`VNPAY-{paymentId}-{random}`) → build params (`vnp_Version, vnp_Command, vnp_TmnCode, vnp_Amount×100, vnp_CurrCode, vnp_TxnRef=orderCode, vnp_OrderInfo, vnp_OrderType, vnp_Locale, vnp_ReturnUrl, vnp_IpAddr, vnp_CreateDate, vnp_ExpireDate` — bỏ null/blank) → sort alphabet (key) → `hashData` encode US-ASCII → `vnp_SecureHash = HMAC-SHA512(hashData, VNPAY_HASH_SECRET)` → query string cuối + `vnp_SecureHashType=HmacSHA512&vnp_SecureHash=...` → tạo `Transaction(INIT)` → trả `{ paymentUrl }`.
2. FE `window.location.href = paymentUrl` (redirect toàn trang).
3. VNPay redirect browser về `vnp_ReturnUrl` (trang **frontend**, không phải backend) — chỉ dùng hiển thị UI tạm, không set trạng thái.
4. VNPay gọi `GET /payments/vnpay/ipn` (server-to-server) — verify chữ ký (loại `vnp_SecureHash`/`vnp_SecureHashType` khỏi tập ký lại, so sánh), check idempotency qua `Transaction.providerTransactionId` (`vnp_TransactionNo`), cập nhật `Transaction→SUCCESS/FAILED`, `Payment→COMPLETED/FAILED`, nếu thành công `CompanySubscription→ACTIVE` (`startDate=now`, `endDate=now+durationDays` của plan) → trả response đúng format VNPay yêu cầu (không phải `ApiResponse`, xem `API_CONVENTIONS.md`).

**Momo** — có gọi API thật để tạo giao dịch:
1. `POST /subscriptions/checkout {planId, provider: "MOMO"}` → tạo `CompanySubscription(PENDING)` + `Payment(PENDING)`, `orderCode` (`MOMO-{paymentId}-{random}`), `requestId` (uuid) → build raw signature string theo **thứ tự field cố định** (`accessKey&amount&extraData&ipnUrl&orderId&orderInfo&partnerCode&redirectUrl&requestId&requestType`) → `HMAC-SHA256` → `POST` sang `MOMO_CREATE_ENDPOINT` → Momo trả `{resultCode, payUrl,...}` → tạo `Transaction(INIT)` → trả `{ paymentUrl: payUrl }` cho FE. **Amount gửi nguyên, không nhân 100.**
2. FE redirect `payUrl`.
3. Momo `POST /payments/momo/ipn` (JSON) — verify chữ ký theo field IPN riêng của Momo, check idempotency, `resultCode === 0` → `COMPLETED`/`ACTIVE`, khác 0 → `FAILED` (giữ nguyên `CompanySubscription` ở `PENDING`, cho phép FE gọi lại checkout để thử lại — tạo `Transaction` mới trên cùng `Payment`).

**Endpoint tra cứu trạng thái cho FE** (không tin return URL — xem AD-6): `GET /subscriptions/payments/by-order-code/:orderCode` — trả `Payment.status` hiện tại (đã được IPN cập nhật), FE poll endpoint này ở trang return.

### 6.4 Env vars (đặt tên theo convention UPPER_SNAKE_CASE hiện có của dự án)

| Biến | Ghi chú |
|---|---|
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` | Sandbox credentials, copy từ `.env` cục bộ lúc implement (không commit) |
| `VNPAY_PAY_URL` | Default `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html` |
| `VNPAY_RETURN_URL` | Trỏ về route **frontend**, vd. `http://localhost:3000/employer/subscription/return/vnpay` |
| `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY` | Sandbox credentials |
| `MOMO_CREATE_ENDPOINT` | Default `https://test-payment.momo.vn/v2/gateway/api/create` |
| `MOMO_RETURN_URL` | Trỏ về route frontend, vd. `http://localhost:3000/employer/subscription/return/momo` |
| `MOMO_IPN_URL` | Bắt buộc URL public lúc dev — dùng VS Code port forward (xem AD-6) |

Không có `VNPAY_IPN_URL` — VNPay không nhận URL này qua request, phải điền thủ công trên trang quản trị sandbox VNPay (trỏ tới `{public-url}/api/payments/vnpay/ipn`).

## 7. Sweep hết hạn gói (chốt ở AD-6)

`node-cron` (dependency mới), job `subscription-expiry.job.ts` trong module `subscriptions`, chạy mỗi giờ (`0 * * * *`): `UPDATE company_subscriptions SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND end_date < now()`. Chỉ đổi `CompanySubscription.status` — **không** đụng tới `JobPost` (việc đóng tin `PUBLISHED` tương ứng là deliverable Phase 6, xem AD-6 mục 2 và `PROJECT_PHASES.md` Phase 6).
