# Phase 5 (Frontend) — Subscription & Payment cho đăng tin tuyển dụng — Kế hoạch triển khai

Tham chiếu: `docs/05-frontend/FRONTEND_PHASES.md` (Phase 5), `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-1 (URL structure), AD-4 (auth state theo area), AD-6 (free trial/Payment Gateway Adapter — quyết định nghiệp vụ, không lặp lại ở đây), `docs/06-backend/phase-05-subscription-payment/PLAN.md` (API contract), `docs/designs/SUBSCRIPTION_BILLING_DESIGN.md` (luồng nghiệp vụ đầy đủ).

**Đã implement** (2026-09-09) — xem tóm tắt deviation so với plan gốc ở `docs/01-project/PROJECT_STATUS.md` Phase 5.

---

## Phần 1 — Công nghệ / package / kiến trúc frontend sử dụng

**Không thêm dependency mới** — form chọn gói/cổng thanh toán đơn giản (radio/select + 1 nút submit), dùng `useState` như các form auth hiện có, không cần `react-hook-form`/`zod` (khác `CreateCompanyForm` ở Phase 4 vốn có 10+ field). Danh sách gói + trạng thái thanh toán dùng React Query (đã có sẵn từ Phase 1).

**Pattern áp dụng:**
- `apiFetch("employer", ...)` cho mọi call cần token (kể cả `GET /subscription-plans` — route backend public nhưng gọi qua context `employer` vẫn hoạt động bình thường, không cần `publicFetch` riêng vì trang này chỉ hiển thị trong portal đã đăng nhập).
- Trang "return" sau khi cổng thanh toán redirect về **không đọc trạng thái từ query param** (theo đúng nguyên tắc bảo mật ở AD-6/`API_CONVENTIONS.md` §12) — chỉ dùng `orderCode` trong query để gọi API backend lấy trạng thái thật, poll bằng React Query `refetchInterval` tới khi có kết quả cuối (`COMPLETED`/`FAILED`) hoặc hết timeout.

---

## Phần 2 — Kiến trúc & liên kết

### Routing & layout theo actor

| Route | Actor | Guard (`proxy.ts`) |
|---|---|---|
| `/employer/(portal)/subscription` | Employer, stage `active` | Không cần rule mới — đã nằm trong `/employer/(portal)/*` (yêu cầu stage `active`, tức company đã `VERIFIED`, theo AD-5) |
| `/employer/(portal)/subscription/return/vnpay` | Employer, stage `active` | Như trên |
| `/employer/(portal)/subscription/return/momo` | Employer, stage `active` | Như trên |

`/employer/(portal)/profile` (đã có từ Phase 4) được sửa, không thêm route mới.

### Component tree & tái sử dụng

- `components/employer/SubscriptionStatusCard.tsx` — dùng chung ở `/employer/profile` (bản rút gọn) và `/employer/subscription` (bản đầy đủ): hiển thị 1 trong 3 trạng thái theo `SubscriptionAccessStatus.mode` — `TRIAL` (badge "Đang dùng thử" + "còn X/2 tin đăng công khai, Y/10 tin nháp, hết hạn dùng thử ngày ..."), `SUBSCRIBED` (tên gói, quota còn lại, ngày hết hạn, nút "Nâng cấp gói"), `BLOCKED` (cảnh báo hết trial/hết gói + nút "Mua gói ngay"). Nút hành động chỉ hiện khi `employer.isCompanyAdmin` (cùng quy tắc gate đã áp dụng cho khối "Mời đồng nghiệp" ở `/employer/profile` từ Phase 4).
- `components/employer/PlanList.tsx` (+ `PlanCard.tsx`) — danh sách `SubscriptionPlan` (`isActive=true`), mỗi card có tên/giá/quota/thời hạn + chọn cổng thanh toán (radio `VNPAY`/`MOMO`) + nút "Thanh toán".
- `components/employer/PaymentReturnStatus.tsx` — nhận prop `provider: "vnpay" | "momo"`, đọc `orderCode` từ `useSearchParams()`, poll trạng thái, hiển thị 1 trong 3 state: đang xử lý (spinner) / thành công (link về `/employer/subscription`) / thất bại hoặc timeout (nút "Thử lại" quay về trang chọn gói). Dùng chung cho cả 2 trang return thay vì viết trùng logic.
- Tái dùng nguyên `Button`/`Card`/`Badge` từ Phase 2 — không cần primitive UI mới.

### State management & data fetching

- `useCompanySubscription()` (`hooks/useSubscription.ts`, `queryKey: ["companySubscription"]`) — `GET /employers/company/subscription`, dùng ở cả `SubscriptionStatusCard` lẫn để quyết định hiển thị nút "Nâng cấp" vs "Mua gói".
- `useSubscriptionPlans()` (`queryKey: ["subscriptionPlans"]`, `staleTime` 5 phút — cùng pattern `useCatalog.ts` ở Phase 4) — `GET /subscription-plans`.
- `useCheckout()` — `useMutation`, `POST /subscriptions/checkout {planId, provider}` → nhận `{ paymentUrl, orderCode }` → lưu `orderCode` vào `sessionStorage` (phòng khi return URL provider không giữ nguyên toàn bộ query) rồi `window.location.href = paymentUrl` (redirect toàn trang, không phải `fetch`/SPA navigation — khớp hành vi cổng thanh toán thật).
- `usePaymentStatus(orderCode)` (`queryKey: ["paymentStatus", orderCode]`) — `GET /subscriptions/payments/by-order-code/:orderCode`, `refetchInterval: (query) => query.state.data?.status === "PENDING" ? 2000 : false`, dừng poll khi `COMPLETED`/`FAILED`, giới hạn tối đa ~30 lần poll (~1 phút) rồi hiển thị trạng thái "chưa nhận được xác nhận, vui lòng tải lại trang" thay vì poll vô hạn.
- Sau khi `usePaymentStatus` trả `COMPLETED`, invalidate `["companySubscription"]` để `SubscriptionStatusCard` cập nhật ngay khi quay lại `/employer/subscription`.

### UI states & design system

- Badge trạng thái dùng lại tone đã có (`success`/`warning`/`danger`) — `TRIAL`/`ACTIVE` → success, `PENDING` (đang chờ thanh toán) → warning, `EXPIRED`/`BLOCKED`/`FAILED` → danger.
- Quota hiển thị dạng text đơn giản ("Còn 3/5 tin đăng") — không cần progress bar mới cho phạm vi MVP.
- Trang return: 3 UI state rõ ràng (đang xử lý / thành công / thất bại-timeout), không để trắng trang trong lúc poll.
- Danh sách gói trống (`SubscriptionPlan` chưa seed) → `EmptyState` sẵn có từ `docs/template_ui` nếu đã dùng ở phase trước, hoặc text đơn giản nếu chưa.

---

## Phần 3 — Các bước thực hiện

1. `packages/shared-types` — types mới (xem backend PLAN.md Phần 3 bước 11, dùng chung).
2. `hooks/useSubscription.ts` — `useCompanySubscription`, `useSubscriptionPlans`, `useCheckout`, `usePaymentStatus`.
3. `components/employer/SubscriptionStatusCard.tsx`.
4. `components/employer/{PlanList,PlanCard}.tsx`.
5. `components/employer/PaymentReturnStatus.tsx`.
6. `app/employer/(portal)/subscription/page.tsx` — ghép `SubscriptionStatusCard` (đầy đủ) + `PlanList` + lịch sử gói (bảng đơn giản từ `GET /subscriptions/history`).
7. `app/employer/(portal)/subscription/return/vnpay/page.tsx`, `app/employer/(portal)/subscription/return/momo/page.tsx` — mỗi trang chỉ render `<PaymentReturnStatus provider="vnpay|momo" />`.
8. `app/employer/(portal)/profile/page.tsx` — chèn `<SubscriptionStatusCard variant="compact" />` (Card mới) + link "Xem gói dịch vụ" → `/employer/subscription`, đặt cạnh khối công ty hiện có (trước khối "Thông tin cá nhân").
9. Kiểm thử: `next build` (xác nhận route tree đúng: `/employer/subscription`, `/employer/subscription/return/vnpay`, `/employer/subscription/return/momo`) + kiểm thử thủ công qua trình duyệt (trial hiển thị đúng trên company mới verified → mua gói qua VNPay sandbox thật → quay lại thấy trạng thái cập nhật đúng sau khi IPN xử lý xong → lặp lại với Momo → xác nhận nút mua/nâng cấp ẩn với employer không phải `isCompanyAdmin`) — **cần chủ dự án tự kiểm tra** (không có công cụ trình duyệt trong phiên triển khai, theo đúng ghi chú đã lặp lại ở Phase 2/Phase 4).

---

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
