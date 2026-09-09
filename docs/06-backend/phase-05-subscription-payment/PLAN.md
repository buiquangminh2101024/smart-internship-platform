# Phase 5 — Subscription & Payment cho đăng tin tuyển dụng — Kế hoạch triển khai

Tham chiếu: `docs/01-project/PROJECT_PHASES.md` (Phase 5), `docs/designs/SUBSCRIPTION_BILLING_DESIGN.md` (model + luồng nghiệp vụ đầy đủ — không lặp lại ở đây), `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-6 (quyết định free trial/node-cron/Payment Gateway Adapter), `docs/03-database/DATABASE_DESIGN.md` (nhóm `Subscription & Billing`), `docs/04-api/API_CONVENTIONS.md` §12 (quy ước response IPN). Tài liệu này chỉ ghi phần thực thi đặc thù Phase 5.

**Đã implement** (2026-09-09) — xem tóm tắt deviation so với plan gốc ở `docs/01-project/PROJECT_STATUS.md` Phase 5.

---

## Phần 1 — Công nghệ / package / kiến trúc sử dụng

### Dependency mới cho `apps/server`

| Package | Vai trò |
|---|---|
| `node-cron` (+ `@types/node-cron`) | Chạy job sweep `CompanySubscription` hết hạn định kỳ, trong process Express — quyết định trực tiếp của chủ dự án (AD-6), đánh đổi 1 dependency nhỏ lấy cú pháp lịch chạy chuẩn |

Không cần SDK VNPay/Momo — cả hai cổng dùng REST/redirect thuần, tự build request/verify chữ ký bằng `node:crypto` (có sẵn), không có SDK Node.js chính thức đáng tin cậy để thêm.

### Pattern áp dụng

- **`PaymentGatewayAdapter`** (interface, `shared/ports/PaymentGatewayAdapter.ts`) — Strategy/Adapter pattern: `VnpayGatewayAdapter`/`MomoGatewayAdapter` (`infrastructure/`) cùng implement, `PaymentsService` chọn theo `PaymentMethod.processorType` qua map đăng ký ở `container.ts`. Khắc phục điểm yếu quan sát được ở dự án Java tham khảo (2 interface rời rạc, không phải Strategy thật — xem `SUBSCRIPTION_BILLING_DESIGN.md` mục 6.1).
- **`shared/utils/payment-signing.ts`** — module thuần (không phụ thuộc Express/Prisma) gom `hmacSha512Hex`, `hmacSha256Hex`, `buildSortedQueryString`, `formatVnpAmount` — dùng chung 2 adapter, test độc lập được.
- **`subscriptions`** (catalog `SubscriptionPlan`, vòng đời `CompanySubscription`, tính trial, orchestrate checkout, job sweep) và **`payments`** (`Payment`/`Transaction`/`PaymentCallbackLog`/`PaymentMethod`, 2 gateway adapter, xử lý IPN) tách 2 module theo đúng "Main modules" đã định ở `PROJECT_PHASES.md` Phase 5 — `subscriptions` gọi vào `PaymentsService.createCheckout(...)` khi employer bấm mua, `payments` gọi ngược `CompanySubscriptionRepository` khi IPN xác nhận thành công (2 module biết nhau, không qua message queue — đúng quyết định monolith đã chốt ở `INITIAL_ARCHITECTURE_PLAN.md` §12c).
- **Đọc trực tiếp `prisma.jobPost`** trong `SubscriptionsService` để đếm quota/trial (đếm theo `companyId`+`status`+`createdAt`) — module `job-posts` chưa tồn tại tới Phase 6, và đây chỉ là 1 câu `count()` đơn giản, không cần trừu tượng hoá qua repository riêng ở giai đoạn này.
- Bí mật cổng thanh toán sống trong biến môi trường (không dùng `PaymentMethod.configParams`) — nhất quán với Cloudinary/Resend/Google hiện có.

---

## Phần 2 — Liên kết giữa các phần

```text
apps/server/src/main.ts
  +-- /api/subscription-plans
  |        GET (public) / POST, PATCH /:id (ADMIN)
  |        → subscriptions.routes.ts → SubscriptionsController → SubscriptionsService → SubscriptionPlanRepository
  +-- /api/employers/company/subscription (EMPLOYER)          — trạng thái trial/quota + gói hiện tại
  +-- /api/subscriptions/history (EMPLOYER)                   — lịch sử CompanySubscription (cursor)
  +-- /api/subscriptions/checkout (EMPLOYER, isCompanyAdmin)  — tạo CompanySubscription(PENDING) + gọi PaymentsService
  |        SubscriptionsService phụ thuộc: SubscriptionPlanRepository, CompanySubscriptionRepository,
  |        CompanyRepository (đọc verifiedAt — dùng chung với employers/companies), prisma (đếm JobPost cho trial/quota),
  |        paymentsService (orchestrate checkout)
  +-- /api/subscriptions/payments/by-order-code/:orderCode (EMPLOYER) — poll trạng thái Payment thật (không tin return URL)
  +-- /api/payments/vnpay/ipn (public, GET)
  +-- /api/payments/momo/ipn (public, POST)
           → payments.routes.ts → PaymentsController → PaymentsService
           PaymentsService phụ thuộc: PaymentRepository, TransactionRepository, PaymentCallbackLogRepository,
           PaymentMethodRepository, paymentGatewayAdapters (Record<PaymentProvider, PaymentGatewayAdapter>),
           CompanySubscriptionRepository (cập nhật status khi IPN xác nhận thành công)

subscription-expiry.job.ts (node-cron "0 * * * *", khởi động trong main.ts cùng lúc Socket.IO)
  → CompanySubscriptionRepository.expireOverdue()  — UPDATE ... SET status='EXPIRED' WHERE status='ACTIVE' AND endDate < now()

Middleware chain:
  - Public catalog:        (không authenticate) → validate(schema) → controller
  - Employer actions:      authenticate(container) → authorize("EMPLOYER") → controller (check isCompanyAdmin trong service cho checkout, giống POST /employers/invite-code ở Phase 4)
  - Admin CRUD plan:       authenticate(container) → authorize("ADMIN") → validate(schema) → controller
  - IPN callback:          (không authenticate — xác thực bằng chữ ký HMAC riêng của từng cổng) → controller
```

Điểm tích hợp để lại cho Phase 6 (`job-posts`, chưa xây ở phase này): `SubscriptionsService.getCompanySubscriptionAccess(companyId)` — trả `{ mode: "TRIAL" | "SUBSCRIBED" | "BLOCKED", publishRemaining?, draftRemaining?, trialEndsAt?, subscription? }`, đăng ký sẵn trong `Cradle` (`subscriptionsService`) để module `job-posts` inject qua awilix khi implement Phase 6 (cùng cách `companyRepository` đang được dùng chéo `employers`/`companies` hiện nay).

---

## Phần 3 — Các bước thực hiện

1. **Schema:** không cần migration mới — `SubscriptionPlan`/`CompanySubscription`/`Payment`/`Transaction`/`PaymentCallbackLog`/`PaymentMethod` đã có từ migration `20260907143624_add_subscription_billing`. Xác nhận lại bằng `npx prisma migrate status --schema=apps/server/prisma/schema.prisma` trước khi bắt đầu code.
2. **Env** (`shared/config/env.ts`, theo pattern optional + bắt buộc khi `NODE_ENV=production`, giống `RESEND_API_KEY`/`CLOUDINARY_*`):
   - `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` (secret, optional dev).
   - `VNPAY_PAY_URL` (default `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`).
   - `VNPAY_RETURN_URL` (default `http://localhost:3000/employer/subscription/return/vnpay`).
   - `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY` (secret, optional dev).
   - `MOMO_CREATE_ENDPOINT` (default `https://test-payment.momo.vn/v2/gateway/api/create`).
   - `MOMO_RETURN_URL` (default `http://localhost:3000/employer/subscription/return/momo`).
   - `MOMO_IPN_URL` (bắt buộc là URL public lúc test thật — xem mục "Test IPN cục bộ" ở `ARCHITECTURE_DECISIONS.md` AD-6, dùng VS Code port forwarding).
   - Sandbox credentials (test, không phải secret production) đã có sẵn — copy trực tiếp vào `.env` cục bộ lúc bắt đầu bước này, lấy từ `event-ticketing-platform/services/payment/src/main/resources/config/{vnpay,momo}-secrets.properties` (không copy vào file commit git).
3. **`shared/utils/payment-signing.ts`**: `hmacSha512Hex`, `hmacSha256Hex`, `buildSortedQueryString` (sort key alphabet, encode US-ASCII cho VNPay), `formatVnpAmount` (×100).
4. **`shared/ports/PaymentGatewayAdapter.ts`**, **`infrastructure/vnpay-gateway-adapter.ts`**, **`infrastructure/momo-gateway-adapter.ts`** — theo đúng luồng ký/verify mô tả ở `SUBSCRIPTION_BILLING_DESIGN.md` mục 6.3. VNPay: build URL redirect thuần (không gọi API ngoài). Momo: gọi thật `POST MOMO_CREATE_ENDPOINT`.
5. **Module `payments`**: `PaymentRepository`, `TransactionRepository`, `PaymentCallbackLogRepository`, `PaymentMethodRepository`, `payments.service.ts` (`createCheckout(provider, params)`, `handleIpn(provider, rawPayload)` — luôn ghi `PaymentCallbackLog` trước khi xử lý, check idempotency qua `Transaction.providerTransactionId`), `payments.controller.ts`, `payments.routes.ts` (`GET /payments/vnpay/ipn`, `POST /payments/momo/ipn`, response theo `API_CONVENTIONS.md` §12 — không bọc `ApiResponse`), `payments.dto.ts`.
6. **Module `subscriptions`**: `SubscriptionPlanRepository`, `CompanySubscriptionRepository` (+ `expireOverdue()`), `subscriptions.service.ts` (`getCompanySubscriptionAccess`, `checkout`, CRUD `SubscriptionPlan` cho Admin), `subscriptions.controller.ts`, `subscriptions.routes.ts`, `subscriptions.dto.ts`.
7. **`subscription-expiry.job.ts`**: `node-cron` `0 * * * *` gọi `companySubscriptionRepository.expireOverdue()`, `logger.info` số lượng đã chuyển mỗi lần chạy.
8. **`container.ts`**: đăng ký `subscriptionPlanRepository`, `companySubscriptionRepository`, `paymentRepository`, `transactionRepository`, `paymentCallbackLogRepository`, `paymentMethodRepository`, `vnpayGatewayAdapter`, `momoGatewayAdapter`, `paymentGatewayAdapters` (map từ 2 adapter trên), `paymentsService`, `subscriptionsService`.
9. **`main.ts`**: mount `subscriptionsRouter`, `paymentsRouter`; khởi động `subscription-expiry.job.ts`.
10. **`apps/server/scripts/seed.ts`**: thêm seed `PaymentMethod` (VNPAY, MOMO — `displayName`, `processorType`, `isAvailable=true`, `configParams: null`) và 3 `SubscriptionPlan` mẫu (Cơ bản: quota 3-5/30 ngày; Tiêu chuẩn: quota 15-20/30 ngày; Doanh nghiệp: quota lớn/30-90 ngày — giá cụ thể chủ dự án tự điền lúc seed, tài liệu này không chốt giá VND).
11. **`packages/shared-types`**: `SubscriptionPlanDto`, `CompanySubscriptionSummary`, `SubscriptionAccessStatus` (`mode: "TRIAL"|"SUBSCRIBED"|"BLOCKED"`, `publishRemaining?`, `draftRemaining?`, `trialEndsAt?`, `subscription?`), `CheckoutRequest` (`{ planId, provider: PaymentProvider }`), `CheckoutResponse` (`{ paymentUrl, orderCode }`), `PaymentStatusResponse` (`{ status: PaymentStatus, companySubscriptionStatus?: SubscriptionStatus }`), `CreateSubscriptionPlanRequest`/`UpdateSubscriptionPlanRequest`.
12. **Kiểm thử thủ công** (chưa có test suite thật tới Phase 12 — REST client/curl + sandbox thật):
    - Company mới `VERIFIED` → `GET /employers/company/subscription` trả `mode: "TRIAL"`, `publishRemaining: 2`, `draftRemaining: 10`.
    - Checkout VNPay → redirect sandbox thật → thanh toán thử → IPN cập nhật đúng `Payment/Transaction/CompanySubscription` → `GET .../by-order-code/:orderCode` phản ánh đúng.
    - Checkout Momo → tương tự, xác nhận `amount` KHÔNG bị nhân 100 (khác VNPay).
    - Test IPN cục bộ qua VS Code port forwarding (xem AD-6) — xác nhận cả 2 cổng gọi được `MOMO_IPN_URL`/URL điền thủ công trên trang VNPay sandbox.
    - Giả lập hết hạn: set `CompanySubscription.endDate` về quá khứ thủ công trong DB → chờ/trigger cron → `status` chuyển `EXPIRED`.
    - Company đã mua gói lần đầu (dù đang còn hạn trial) → `getCompanySubscriptionAccess` không còn trả `TRIAL` nữa.
    - Nâng cấp gói giữa kỳ → gói cũ `CANCELLED`, gói mới `PENDING` → `ACTIVE` sau thanh toán, không cộng dồn quota/thời hạn cũ.
    - Role guard: `POST /subscriptions/checkout` bởi Employer không phải `isCompanyAdmin` → 403; `POST/PATCH /subscription-plans` bởi role khác `ADMIN` → 403.
13. **Cập nhật tài liệu sau khi implement:** `PROJECT_STATUS.md`, và `ARCHITECTURE_DECISIONS.md` nếu phát sinh deviation so với plan này (theo đúng thói quen đã áp dụng ở Phase 4/AD-5).

---

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
