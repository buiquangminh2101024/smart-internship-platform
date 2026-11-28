# Thêm cổng thanh toán SePay (Cổng thanh toán, sandbox) — Kế hoạch triển khai

Tham chiếu: `docs/06-backend/phase-05-subscription-payment/PLAN.md` (luồng thanh toán gốc), `docs/designs/SUBSCRIPTION_BILLING_DESIGN.md` §6 (Payment Gateway Adapter), `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-6, `docs/04-api/API_CONVENTIONS.md` §12 (response IPN). Tài liệu này chỉ ghi phần đặc thù của SePay.

**Trạng thái:** đã duyệt 2026-11-28. Bước 1–9 (backend) đã code xong 2026-11-28: `tsc` server/web sạch, `npm test` 844/844. Chủ dự án đã chạy migrate deploy + seed. Bước 10 (frontend) code xong 2026-11-28: `tsc` web sạch, eslint 4 file đã sửa sạch. Thêm so với plan: `result=error` cũng báo đóng đơn PENDING (như huỷ) nhưng hiện "không thành công". Bước 11: chủ dự án thử thành công trên sandbox 2026-11-28. Bước 12 xong (PROJECT_STATUS.md). **Hoàn tất.**

**Bối cảnh:** sandbox MoMo đang lỗi. Thêm SePay làm cổng thứ ba **bên cạnh** VNPay và MoMo. **Không sửa hay xoá phần MoMo.** Chỉ dùng sản phẩm **Cổng thanh toán** của SePay (gọi là "cách A": chuyển người dùng sang trang thanh toán của SePay, kết quả báo qua IPN). Không dùng sản phẩm Webhook theo dõi chuyển khoản ("cách B"), nên **không cần "cấu trúc mã thanh toán"**.

---

## Phần 1 — Công nghệ / package / kiến trúc sử dụng

### Dependency mới

**Không có.** SePay có SDK Node.js chính thức (`sepay-pg-node`), nhưng không dùng, vì:
- VNPay và MoMo đều tự viết bằng `node:crypto`. Tự viết SePay giữ cách làm thống nhất.
- Phần cần dùng rất nhỏ: một chữ ký HMAC-SHA256 base64 và một phép so sánh header.

### Tóm tắt kỹ thuật SePay (từ developer.sepay.vn, đọc ngày 2026-11-28)

| Mục | Giá trị |
|---|---|
| Checkout (sandbox) | `POST https://pay-sandbox.sepay.vn/v1/checkout/init`. Production là `https://pay.sepay.vn/v1/checkout/init` |
| Kiểu gọi | **Form HTML do trình duyệt POST.** Đây không phải API server-to-server, nên SePay không trả về link thanh toán như MoMo |
| Trường form | `order_amount`, `merchant`, `currency` (= `VND`), `operation` (= `PURCHASE`), `order_description`, `order_invoice_number`, `success_url`, `error_url`, `cancel_url`, `lang`, `signature`. Có thể thêm `payment_method`, `customer_id` |
| Chữ ký checkout | Ghép chuỗi `field=value` nối bằng `,` theo **đúng thứ tự** `order_amount, merchant, currency, operation, order_description, order_invoice_number, customer_id, payment_method, success_url, error_url, cancel_url`. **Bỏ trường rỗng, `0` hoặc `"0"`.** Giá trị để nguyên, không URL-encode. Ký bằng HMAC-SHA256 với **Merchant Secret Key**, rồi mã hoá **base64** (không phải hex) |
| IPN | `POST` JSON tới IPN URL. Xác thực bằng header **`X-Secret-Key`** (Auth Type = Secret Key), dùng **IPN Secret Key**, khác Merchant Secret Key. **Không có chữ ký trên payload** |
| Payload IPN | `notification_type` (`ORDER_PAID` \| `TRANSACTION_VOID`), `order.order_invoice_number` (= mã đơn của mình), `order.order_amount` (chuỗi, ví dụ `"50000.00"`), `order.order_status`, `transaction.id` (UUID), `transaction.transaction_status`, `transaction.payment_method` |
| Phản hồi IPN | **HTTP 200** để xác nhận đã nhận. Tài liệu không nói chính sách gửi lại |
| Return URL | SePay chuyển trình duyệt về `success_url`, `error_url` hoặc `cancel_url`. Tài liệu **không nói** query param kèm theo, và chúng không được ký, nên không được tin |

### Biến môi trường

`SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY` và `SEPAY_AUTH_TYPE_SECRET` đã có trong `.env` và `.env.example` (chủ dự án tự thêm). Giữ nguyên tên. Bổ sung:

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `SEPAY_CHECKOUT_URL` | `https://pay-sandbox.sepay.vn/v1/checkout/init` | Đổi sang URL production khi lên thật |
| `SEPAY_RETURN_URL` | `http://localhost:3000/employer/subscription/return/sepay` | Dùng cho cả success, error và cancel, phân biệt bằng query `result` (xem Phần 2) |

Riêng `SEPAY_AUTH_TYPE_SECRET` là IPN Secret Key: ghi chú rõ trong `env.ts` và `.env.example` để khỏi nhầm với `SEPAY_SECRET_KEY`. Khi `NODE_ENV=production`, bắt buộc có đủ 3 secret (giống cách VNPay/MoMo đang kiểm tra). IPN URL **không** cần biến env, vì nó được cấu hình trên dashboard SePay chứ không gửi theo đơn.

### Pattern áp dụng

- Thêm `SepayGatewayAdapter` (`apps/server/src/infrastructure/sepay-gateway-adapter.ts`), implement `PaymentGatewayAdapter` và đăng ký vào map `paymentGatewayAdapters` ở `container.ts`.
- **Mở rộng port `PaymentGatewayAdapter`** ở mức tối thiểu và tương thích ngược:
  1. `CreateCheckoutResult` thêm `paymentForm?: { action: string; fields: Record<string, string> }`. VNPay và MoMo không đổi gì: vẫn chỉ trả `paymentUrl`. SePay trả `paymentUrl` = `action`, kèm `paymentForm`.
  2. `RawIpnPayload` thêm `headers?: Record<string, string | undefined>`. SePay cần header `X-Secret-Key`; VNPay và MoMo bỏ qua trường này.
  3. `IpnResult` thêm `amount?: number` và `ignored?: boolean`. Chỉ SePay điền; xem Phần 2 để biết service dùng chúng thế nào.
- `payment-signing.ts` thêm `hmacSha256Base64(data, secret)` và `buildSepaySigningString(fields)`. Cả hai là hàm thuần, test độc lập được.
- So sánh `X-Secret-Key` bằng `crypto.timingSafeEqual` (kiểm tra độ dài trước), không dùng `===`, để tránh tấn công dò theo thời gian.

---

## Phần 2 — Liên kết giữa các phần

### Luồng thanh toán

```
Employer chọn gói + "SePay" (PlanCard)
  → POST /subscriptions/checkout { planId, provider: "SEPAY" }
  → SubscriptionsService.checkout → PaymentsService.createCheckout
      → tạo Payment(PENDING)
      → SepayGatewayAdapter.createCheckoutUrl: dựng các trường form + signature
      → tạo Transaction(INIT, orderCode)
  ← { paymentUrl, orderCode, paymentForm }
Frontend: lưu sip_pending_order_code (như cũ)
  → có paymentForm: tạo <form method="POST" action=...> ẩn với các input, rồi submit
  → không có (VNPay/MoMo): window.location.href = paymentUrl (như cũ)
Trang SePay sandbox → người dùng bấm "Giả lập thanh toán"
  ├─ SePay POST IPN → /api/payments/sepay/ipn (qua dev tunnel public)
  │    → PaymentsController.sepayIpn → PaymentsService.handleIpn("SEPAY", { data: body, headers })
  │    → ghi PaymentCallbackLog → adapter verify X-Secret-Key → cập nhật Transaction/Payment → kích hoạt gói
  └─ trình duyệt về SEPAY_RETURN_URL?orderCode=…&result=success|error|cancel
       → PaymentReturnStatus provider="sepay" poll GET /subscriptions/payments/by-order-code/:orderCode (như cũ)
```

### Return URL do mình tự dựng theo từng đơn

Vì không biết SePay gắn thêm query gì, adapter **tự đặt sẵn** `orderCode` và `result` vào 3 URL. Ba URL này nằm trong chuỗi được ký:
- `success_url` = `${SEPAY_RETURN_URL}?orderCode=<code>&result=success`
- `error_url` = `…&result=error`
- `cancel_url` = `…&result=cancel`

`result=cancel` chỉ được dùng đúng như cơ chế huỷ hiện có (`reportClientCancellation`: chỉ chuyển PENDING sang FAILED). Không bao giờ dùng nó để kết luận thành công. Trạng thái thật vẫn chỉ đến từ IPN.

### Xử lý IPN của SePay trong adapter và service

| Trường hợp | Adapter trả | Service làm | HTTP trả cho SePay |
|---|---|---|---|
| Thiếu hoặc sai `X-Secret-Key` | `valid: false` | ghi log, dừng | 401 |
| `notification_type = ORDER_PAID` | `valid`, `success: true`, `orderCode = order.order_invoice_number`, `providerTransactionId = transaction.id`, `amount = Number(order.order_amount)` | như VNPay/MoMo, cộng thêm **kiểm tra số tiền** (bên dưới) | 200 |
| `notification_type` khác (ví dụ `TRANSACTION_VOID`) | `valid`, `ignored: true` | chỉ ghi log, **không đổi trạng thái** (ngoài phạm vi: hoàn tiền/huỷ sau khi đã trả) | 200 |
| Không tìm thấy `orderCode` | — | như cũ | 404 |
| Đã xử lý rồi (trùng `providerTransactionId`) | — | như cũ (idempotent) | 200 |

**Kiểm tra số tiền:** khi `result.amount` có giá trị (hiện chỉ SePay có), service so với `Payment.amount`. Nếu lệch thì **không kích hoạt gói**: Transaction và Payment chuyển FAILED, ghi `logger.error`, trả 200 để SePay khỏi gửi lại. Vì IPN của SePay không có chữ ký trên payload, đây là lớp bảo vệ thêm. VNPay và MoMo không điền `amount`, nên hành vi của chúng giữ nguyên.

### Các nơi khác bị ảnh hưởng

- **Prisma:** enum `PaymentProvider` thêm `SEPAY`.
- **Seed:** `scripts/seed.ts` thêm `{ displayName: "SePay", processorType: "SEPAY" }` (upsert theo `displayName`, chạy lại an toàn).
- **`packages/shared-types`:** `PaymentProvider` thêm `"SEPAY"`; `CheckoutResponse` thêm `paymentForm?`.
- **`subscriptions.dto.ts`:** `z.enum(["VNPAY", "MOMO", "SEPAY"])`.
- **`payments.service.ts`:** nhánh `DEV_SKIP_PAYMENT_GATEWAY` chọn return URL theo provider (thêm SePay); `logCallback` không phải sửa (SePay ghi `rawPayload` giống MoMo). `buildOrderCode` **giữ nguyên** (xem Rủi ro 1).

---

## Phần 3 — Các bước thực hiện

Mỗi bước nhỏ, chạy được và test được độc lập.

1. **Ghi tài liệu kiến trúc trước** (bắt buộc theo `CLAUDE.md`):
   - `ARCHITECTURE_DECISIONS.md`: thêm **AD-32** "Thêm SePay làm cổng thứ ba; port `PaymentGatewayAdapter` hỗ trợ checkout dạng form POST và IPN xác thực bằng header (bổ sung AD-6)".
   - `API_CONVENTIONS.md` §12: thêm `POST /payments/sepay/ipn` (trả 200, xác thực bằng `X-Secret-Key` thay vì chữ ký HMAC).
   - `SUBSCRIPTION_BILLING_DESIGN.md` §6: thêm một đoạn ngắn về adapter SePay.
2. **Schema + seed:**
   - Viết migration tay `prisma/migrations/<timestamp>_add_sepay_provider/migration.sql` gồm `ALTER TYPE "PaymentProvider" ADD VALUE 'SEPAY';`. Áp dụng bằng `prisma migrate deploy`. **Không dùng `migrate dev` hay shadow DB trỏ vào DB Neon thật.**
   - Sửa `seed.ts`. Chủ dự án tự chạy migrate và seed.
3. **Shared types + DTO:** `PaymentProvider`, `CheckoutResponse.paymentForm`, zod enum.
4. **Hàm ký thuần:** thêm `hmacSha256Base64` và `buildSepaySigningString` vào `payment-signing.ts`, viết unit test, bao gồm việc dựng lại đúng chuỗi ví dụ trong tài liệu SePay (`order_amount=100000,merchant=MERCHANT_123,…`) và việc bỏ trường rỗng.
5. **Mở rộng port** `PaymentGatewayAdapter` (ba trường tuỳ chọn ở Phần 1). Chạy `tsc` và toàn bộ test để chắc VNPay và MoMo không đổi.
6. **`SepayGatewayAdapter`:** `createCheckoutUrl` (dựng form + chữ ký + 3 return URL), `verifyAndParseIpn` (so `X-Secret-Key` an toàn, đọc `order`/`transaction`), `buildIpnAckResponse` (bảng ở Phần 2). Thêm config vào `env.ts` (2 biến mới + kiểm tra production) và `.env.example`.
7. **DI + route + controller:** đăng ký adapter trong `container.ts`; thêm `POST /payments/sepay/ipn` vào `payments.routes.ts`; thêm `sepayIpn` vào controller, truyền `req.body` và các header cần thiết.
8. **Service:** kiểm tra số tiền khi có `amount`; xử lý `ignored`; return URL cho nhánh DEV_SKIP.
9. **Unit test** (thư mục mới `apps/server/tests/unit/payments/`):
   - adapter: các trường form đúng, chữ ký đúng; sai/thiếu `X-Secret-Key` → invalid; `ORDER_PAID` parse đúng; `TRANSACTION_VOID` → ignored;
   - service `handleIpn("SEPAY")`: thành công kích hoạt gói; lệch tiền không kích hoạt; trùng IPN chỉ xử lý một lần; ignored không đổi trạng thái.
   - Chạy `npm test` toàn bộ và báo đúng số test pass/fail.
10. **Frontend:**
    - `PlanCard.tsx`: thêm lựa chọn "SePay".
    - `subscription/page.tsx`: nếu checkout trả `paymentForm` thì tạo form ẩn và submit, ngược lại giữ `location.href`.
    - Trang mới `app/employer/(standalone)/subscription/return/sepay/page.tsx`, giống trang momo.
    - `PaymentReturnStatus.tsx`: thêm `"sepay"` (nhãn "SePay"; huỷ khi `result=cancel`; `orderCode` đọc từ query như hiện có).
    - Theo skill `sip-ui` cho phần giao diện.
11. **Chạy thử end-to-end trên sandbox** (chủ dự án chạy server; mở app qua `localhost:8080`):
    - Dev tunnel port 4000 để Public; IPN URL trên dashboard đúng với tunnel hiện tại.
    - Mua gói bằng SePay, đến trang sandbox, bấm **Giả lập thanh toán**. Kiểm tra *Nhật ký IPN* trên SePay (200), bảng `payment_callback_logs`, và trang return báo thành công, gói ACTIVE.
    - Thử thêm: bấm huỷ trên trang SePay (→ FAILED); bấm **Gửi test** IPN trên dashboard; gửi IPN bằng `curl` với secret sai (→ 401).
12. **Cập nhật** `docs/01-project/PROJECT_STATUS.md` và soạn commit message cho chủ dự án tự commit.

---

## Rủi ro và câu hỏi còn mở

1. **Định dạng `order_invoice_number`:** tài liệu chỉ nói "phải duy nhất", không nêu độ dài tối đa hay ký tự cho phép. `orderCode` hiện tại có dạng `SEPAY-<cuid>-<8 hex>` (khoảng 40 ký tự, có `-`); ví dụ trong tài liệu `INV-1759134677` cũng có `-`. Kế hoạch: giữ nguyên `buildOrderCode`; ở bước 11, nếu SePay từ chối thì chuyển sang mã ngắn hơn chỉ cho SePay (ví dụ `SP` + 12 ký tự in hoa) và cập nhật plan.
2. **Trường nào là mã giao dịch SePay:** payload có cả `transaction.id` (UUID) và `transaction.transaction_id` (mã ngắn). Chọn `transaction.id` để chống xử lý trùng; payload thô vẫn lưu đủ trong `rawResponse`.
3. **Chính sách gửi lại IPN của SePay** không có trong tài liệu. Nhờ idempotency theo `providerTransactionId`, nhận trùng vẫn an toàn.
4. **Không làm trong phạm vi này:** hoàn tiền/`TRANSACTION_VOID`, API tra cứu đơn (`pgapi-sandbox`), cách B (webhook + cấu trúc mã thanh toán), sửa lỗi MoMo.

---

## Phần 4 — Ghi chú của chủ dự án

<!-- Dành cho chủ dự án. Claude Code không tự ghi vào đây. -->
