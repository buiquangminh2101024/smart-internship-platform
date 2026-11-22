# Tăng hiển thị tin (nổi bật, tuyển gấp, làm mới) — Backend

> **Trạng thái: HOÃN — hướng phát triển sau khoá luận (lập 2026-11-22).** Chưa code, chưa migration. Q1–Q5 đã chốt cùng ngày (mục "Câu hỏi đã chốt"). Hoãn vì hạn hoàn thành báo cáo với GVHD là trước 06/12/2026. Khi làm lại: đọc lại mục "Hiện trạng" với code lúc đó (số dòng có thể đã đổi), rồi duyệt AD-30. Quyết định kiến trúc: AD-30 trong `docs/02-architecture/ARCHITECTURE_DECISIONS.md` (bản đề xuất). Frontend: `docs/05-frontend/phases/job-promotions/PLAN.md`. Backlog: dòng "Tin nổi bật / đẩy tin trả phí" ở mục 4 của `docs/01-project/FEATURE_BACKLOG.md`.

## Mục tiêu

1. Nhà tuyển dụng dùng **lượt tăng hiển thị** cho một tin đang hiển thị:
   - **Nổi bật** (`FEATURED`): tin vào khối "Việc làm nổi bật" ở trang chủ và đầu `/jobs` trong một số ngày, có nhãn "Nổi bật".
   - **Tuyển gấp** (`URGENT`): tin có huy hiệu "Tuyển gấp" trong một số ngày; ứng viên lọc được.
   - **Làm mới** (`REFRESH`): tin lên lại đầu danh sách "mới nhất" ở `/jobs`.
2. Lượt lấy từ **gói đang dùng** (hạn mức theo gói) hoặc **mua lẻ** qua VNPay / Momo sandbox.
3. Nhà tuyển dụng thấy **hiệu quả** của từng lần tăng hiển thị; Admin thấy **số liệu tổng** và cấu hình hạn mức / giá.
4. Tăng hiển thị **không ảnh hưởng** điểm phù hợp, gợi ý việc làm, việc làm tương tự, tự mời.

## Quyết định đã chốt với chủ dự án (2026-11-22)

- Phạm vi: nổi bật, tuyển gấp, làm mới, thống kê (Employer + Admin).
- Cách bán: lượt trong gói **và** mua lẻ. Mua lẻ phải đang có gói `ACTIVE`, lượt lẻ hết hạn cùng gói, công ty dùng thử không mua được. Admin đặt giá một lượt và số ngày mỗi lượt cho từng loại; nhà tuyển dụng chọn loại và số lượt.
- Tuyển gấp tính theo lượt của gói, như nổi bật.
- Khối nổi bật ở `/jobs` theo bộ lọc ngành / thành phố; tin nổi bật vẫn có trong danh sách bên dưới.
- Mặc định (chủ dự án không đổi): chỉ tin `PUBLISHED`; nổi bật cần điểm chất lượng đạt (AD-29); lượt đã dùng không hoàn; cắt thời hạn về ngày hết gói; không bật lại khi đang còn hiệu lực; làm mới cách nhau ≥ 24 giờ; dùng lượt gói trước, lượt lẻ sau; gói dùng thử 0 lượt; Admin không cộng lượt tay.

## Hiện trạng (đọc code 2026-11-22)

- `SubscriptionPlan` (`schema.prisma:615`): `jobPostQuota`, `durationDays`, `price`, hạn mức tự mời. Admin tạo / sửa qua `POST /subscription-plans`, `PATCH /subscription-plans/:id`; **chưa có trang Admin** cho gói (gói được tạo bằng `scripts/seed.ts`).
- `SubscriptionsService.getCompanySubscriptionAccess` (`subscriptions.service.ts:90`) đếm tin trong khoảng của gói `ACTIVE`, trả `TRIAL` / `SUBSCRIBED` / `BLOCKED`.
- `SubscriptionsService.checkout` tạo `CompanySubscription` `PENDING` rồi gọi `PaymentsService.createCheckout({ companySubscriptionId, … })`. Chỉ `isCompanyAdmin` được mua.
- `PaymentsService` (`payments.service.ts`): `handleIpn` → `activateSubscriptionForPayment` + `recordCompletedPayment` (audit + thông báo `PAYMENT_COMPLETED` cho Admin, dùng tên gói). `findStatusByOrderCode` trả `companySubscriptionId`; `reportClientCancellation` huỷ gói `PENDING`. Cờ `DEV_SKIP_PAYMENT_GATEWAY` đi qua cùng các hàm này. `Payment.companySubscriptionId` **bắt buộc**.
- Trang return `/employer/subscription/return/{vnpay,momo}` gọi `GET /subscriptions/payments/by-order-code/:orderCode`, service kiểm quyền sở hữu qua `companySubscription.companyId`.
- Doanh thu dashboard Admin (`dashboard.repository.ts:255`) đọc thẳng `payments` `COMPLETED`, không join gói: tiền mua lẻ tự được cộng.
- Tìm kiếm công khai (`job-post.repository.ts:205`): `SEARCH_ORDER = publishedAt desc, id desc`, cursor theo id. `findPublishedIdsForSearch` (đường `sort=match`) dùng cùng thứ tự rồi sắp ổn định theo điểm. `publicSearchWhere` là một nguồn điều kiện cho cả hai đường.
- `publishedAt` được ghi ở 3 chỗ: `job-posts.service.ts:526` (công ty miễn duyệt tự đăng), `:585` (duyệt một tin), `:836` (duyệt hàng loạt).
- `incrementViewCount` (`job-post.repository.ts:614`) tăng `viewCount` và `job_post_daily_stats.views` của ngày (giờ VN) bằng `ON CONFLICT`.
- `JobQualityService.scoreAndStore` (AD-29) chấm và lưu điểm cho một tin; tin hiển thị trước AD-29 có thể chưa có điểm.

## Phần 1 — Công nghệ / kiến trúc

- **Không thêm dependency.** Xáo ngẫu nhiên tin nổi bật làm trong bộ nhớ (vài chục tin).
- **Module mới `job-promotions`** (`apps/server/src/modules/job-promotions`): repository, service, controller, routes, dto, mapper; đăng ký trong composition root như các module khác.
- 1 migration viết tay bằng `prisma migrate diff --from-schema-datamodel <HEAD> --to-schema-datamodel <mới>` (so hai file, không cần DB), thêm tay CHECK constraint và câu backfill. **Không** dùng `--shadow-database-url` trỏ vào DB thật. Xin xác nhận trước khi áp lên Neon.
- Không job định kỳ mới: hết hạn nổi bật / tuyển gấp tính bằng điều kiện `> now()` lúc đọc.

## Phần 2 — Liên kết giữa các phần

```
Employer "Tăng hiển thị" ──► POST /employer/job-posts/:id/promotions { type }
   JobPromotionsService.apply
     ├─ tin của công ty, PUBLISHED, đủ điều kiện loại (điểm chất lượng / còn hiệu lực / 24 giờ)
     └─ transaction:
          SELECT company_subscriptions … FOR UPDATE (gói ACTIVE)
          tính số dư theo loại (gói trước, lẻ cũ nhất sau)
          INSERT job_promotions
          UPDATE job_posts SET featuredUntil | urgentUntil | listedAt
          audit log

Employer mua lẻ ──► POST /employer/promotion-purchases { type, quantity, provider }
   JobPromotionsService.checkoutPurchase
     ├─ gói ACTIVE, sản phẩm đang bán, isCompanyAdmin
     ├─ INSERT job_promotion_purchases (PENDING, chụp đơn giá + số ngày)
     └─ PaymentsService.createCheckout({ promotionPurchaseId, amount })
IPN / DEV_SKIP ──► PaymentsService: Payment COMPLETED
     ├─ có companySubscriptionId    → activateSubscriptionForPayment (như cũ)
     └─ có promotionPurchaseId      → promotionPurchaseActivator(purchaseId) → ACTIVE
   recordCompletedPayment: nội dung theo loại thanh toán

Khách / ứng viên ──► GET /job-posts/featured?cityId&industryId&limit
   JobPostRepository.findFeatured → xáo → ghi featuredImpressions từng tin (1 câu SQL)
Bấm thẻ nổi bật ──► GET /job-posts/:id?src=featured → incrementViewCount(id, { featuredClick: true })
/jobs ──► SEARCH_ORDER = listedAt desc, id desc; bộ lọc urgent=1 → urgentUntil > now

Thống kê ──► GET /employer/job-posts/:id/promotions   (lịch sử + so trước / trong)
          GET /admin/job-promotions/stats            (số liệu tổng)
```

- `PaymentsService` không import `JobPromotionsService` (tránh vòng DI: `job-promotions` cần `PaymentsService` để tạo checkout). Đăng ký `promotionPurchaseActivator` bằng `asValue` và resolve service lúc gọi, giống `matchScoreTrigger`.
- `job-promotions` đọc / ghi cột `featuredUntil`, `urgentUntil`, `listedAt` của `job_posts` qua repository riêng của nó (chỉ ba cột này), không gọi ngược `JobPostsService`.
- `JobPostsService` không phụ thuộc `job-promotions`: khối nổi bật và bộ lọc tuyển gấp chỉ đọc cột của `job_posts`.

## Phần 3 — Mô hình dữ liệu

```prisma
enum JobPromotionType { FEATURED URGENT REFRESH }
enum JobPromotionSource { PLAN PURCHASE }
enum JobPromotionPurchaseStatus { PENDING ACTIVE FAILED CANCELLED }

model SubscriptionPlan {
  // … cột cũ
  featuredQuota Int @default(0)
  featuredDays  Int @default(7)
  urgentQuota   Int @default(0)
  urgentDays    Int @default(7)
  refreshQuota  Int @default(0)
}

// Catalog giá lẻ — đúng 1 dòng mỗi loại, seed sẵn, Admin chỉ sửa.
model JobPromotionProduct {
  type         JobPromotionType @id
  unitPrice    Int
  durationDays Int?             // null với REFRESH
  isActive     Boolean          @default(true)
  updatedAt    DateTime         @updatedAt
}

model JobPromotionPurchase {
  id                    String                     @id @default(cuid())
  companyId             String
  companySubscriptionId String                     // gói ACTIVE lúc mua, lượt hết hạn cùng gói
  employerId            String                     // người mua
  type                  JobPromotionType
  quantity              Int
  unitPrice             Int                        // chụp lúc mua
  durationDays          Int?                       // chụp lúc mua
  amount                Int
  status                JobPromotionPurchaseStatus @default(PENDING)
  activatedAt           DateTime?
  createdAt             DateTime                   @default(now())
  payment               Payment?
  promotions            JobPromotion[]
  @@index([companySubscriptionId, type, status])
}

model JobPromotion {
  id                    String             @id @default(cuid())
  jobPostId             String
  companyId             String
  companySubscriptionId String
  employerId            String             // người bấm
  type                  JobPromotionType
  source                JobPromotionSource
  purchaseId            String?            // khi source = PURCHASE
  startAt               DateTime           @default(now())
  endAt                 DateTime?          // null với REFRESH
  createdAt             DateTime           @default(now())
  @@index([companySubscriptionId, type, source])
  @@index([purchaseId])
  @@index([jobPostId, type, startAt])
  @@index([type, startAt])
}

model JobPost {
  // … cột cũ
  listedAt      DateTime?   // = publishedAt khi đăng, = lúc làm mới khi làm mới
  featuredUntil DateTime?
  urgentUntil   DateTime?
  @@index([status, listedAt])
  @@index([status, featuredUntil])
}

model JobPostDailyStat {
  // … cột cũ
  featuredImpressions Int @default(0)
  featuredClicks      Int @default(0)
}

model Payment {
  companySubscriptionId String?  // trước đây bắt buộc
  promotionPurchaseId   String?  @unique
  // CHECK (num_nonnulls("companySubscriptionId", "promotionPurchaseId") = 1) — viết tay trong migration
}
```

Tên quan hệ, FK (`onDelete`) và `@@map` theo quy ước hiện có (snake_case số nhiều) — chốt ở bước 1.

### Tính số dư lượt

Cho gói `ACTIVE` `S` và loại `T`:

- `planTotal` = hạn mức loại `T` của gói (`featuredQuota` / `urgentQuota` / `refreshQuota`).
- `planUsed` = số dòng `job_promotions` với `companySubscriptionId = S`, `type = T`, `source = PLAN`.
- Mỗi lần mua `ACTIVE` `P` của `S`, loại `T`: `purchaseUsed(P)` = số dòng `job_promotions` với `purchaseId = P`.
- Dùng lượt: nếu `planUsed < planTotal` → nguồn `PLAN`, số ngày = `featuredDays` / `urgentDays` của gói. Ngược lại, lần mua `ACTIVE` cũ nhất còn `purchaseUsed < quantity` → nguồn `PURCHASE`, số ngày = `durationDays` đã chụp. Không còn → 409 `PROMOTION_QUOTA_EXHAUSTED`.
- `endAt` = `min(now + số ngày, S.endDate)`; `REFRESH` không có `endAt`.

Không có gói `ACTIVE` (dùng thử hoặc `BLOCKED`) → số dư 0, không dùng / không mua được.

## Phần 4 — API

| Method | Đường dẫn | Ai | Ghi chú |
|---|---|---|---|
| GET | `/employers/company/promotions/balance` | Employer | Số dư từng loại: `planTotal`, `planUsed`, `purchased`, `purchasedUsed`, `remaining`, số ngày mỗi lượt theo nguồn kế tiếp, `subscriptionEndsAt`. |
| GET | `/job-promotion-products` | Employer, Admin | Giá lẻ, số ngày, đang bán. |
| POST | `/employer/job-posts/:id/promotions` | Employer | Body `{ type }`. 201 trả lần dùng + số dư mới. Lỗi: 404 tin; 409 `JOB_NOT_PUBLISHED`, `PROMOTION_ALREADY_ACTIVE`, `REFRESH_TOO_SOON` (kèm `availableAt`), `QUALITY_TOO_LOW`, `PROMOTION_QUOTA_EXHAUSTED`. |
| GET | `/employer/job-posts/:id/promotions` | Employer | Lịch sử lượt của tin + thống kê từng lần (Phần 5). |
| POST | `/employer/promotion-purchases` | Employer (`isCompanyAdmin`) | Body `{ type, quantity (1–20), provider }`. Trả `{ paymentUrl, orderCode }` như checkout gói. 409 `NO_ACTIVE_SUBSCRIPTION`, `PRODUCT_NOT_AVAILABLE`. |
| GET | `/employer/promotion-purchases` | Employer | Lịch sử mua lẻ (phân trang cursor). |
| GET | `/job-posts/featured` | Công khai | Query `cityId?`, `industryId?`, `limit` (mặc định 6, tối đa 12). Trả danh sách tin công khai (cùng DTO tìm kiếm). |
| GET | `/admin/job-promotions/stats` | Admin | Query `range` (7d / 30d / 90d). Phần 5. |
| PATCH | `/admin/job-promotion-products/:type` | Admin | `{ unitPrice?, durationDays?, isActive? }`. |
| PATCH | `/subscription-plans/:id` | Admin | Đã có; DTO thêm 5 cột hạn mức. `POST` tương tự. |

Thay đổi API cũ:

- `GET /job-posts` thêm `urgent=1`. `JobPostDto` (công khai và Employer) thêm `featuredUntil`, `urgentUntil` (chỉ trả khi còn hiệu lực, còn lại `null`), Employer thêm `listedAt`.
- `GET /job-posts/:id` nhận `src=featured`.
- `GET /subscriptions/payments/by-order-code/:orderCode` và `POST …/cancel`: trả thêm `kind: "SUBSCRIPTION" | "PROMOTION_PURCHASE"` và `promotionPurchaseStatus?`; kiểm quyền sở hữu theo nhánh tương ứng. Giữ đường dẫn cũ để dùng lại hai trang return.
- `SubscriptionPlanDto` thêm 5 cột hạn mức.

## Phần 5 — Thống kê

**Theo tin (Employer)** — với mỗi lần `FEATURED` / `URGENT` / `REFRESH` của tin:

- *Trước:* trung bình mỗi ngày trong `min(7, số ngày tin đã hiển thị trước startAt)` ngày trước `startAt`: lượt xem (`views`), hồ sơ ứng tuyển (đếm `applications.createdAt`).
- *Trong:* trung bình mỗi ngày từ `startAt` tới `min(endAt, now)` (`REFRESH`: 3 ngày sau lúc làm mới): lượt xem, hồ sơ, và với `FEATURED`: lượt xuất hiện, lượt bấm, tỉ lệ bấm.
- Tin hiển thị chưa đủ 1 ngày trước `startAt` → không có "trước", giao diện ghi "chưa đủ dữ liệu để so sánh".
- Trả số liệu thô; không tự kết luận "hiệu quả / không hiệu quả".

**Tổng (Admin)** trong khoảng chọn: số lượt dùng theo loại và nguồn; số lần mua lẻ và doanh thu lẻ (`payments` `COMPLETED` có `promotionPurchaseId`); lượt xuất hiện / bấm / tỉ lệ bấm của khối nổi bật; trung bình lượt xem mỗi ngày của tin trong lúc nổi bật so với trước (gộp mọi lần); số tin đang nổi bật / tuyển gấp lúc này.

Hạn chế ghi lại: lượt xuất hiện tính theo phản hồi API, không trừ bot hay tải lại trang; lượt xem chỉ đếm khi xem trang chi tiết công khai (như hiện nay).

## Phần 6 — Các bước

### Bước 1 — AD-30 và schema

- Chủ dự án duyệt AD-30.
- Sửa `schema.prisma` theo Phần 3. Migration `202611xx_add_job_promotions`: enum, bảng, cột, index; `ALTER payments` bỏ NOT NULL + cột mới + CHECK; backfill `UPDATE job_posts SET "listedAt" = "publishedAt" WHERE "publishedAt" IS NOT NULL`; seed 3 dòng `job_promotion_products` (giá / số ngày mặc định chốt ở Q1).
- `prisma generate`, `tsc`. `scripts/seed.ts`: thêm hạn mức tăng hiển thị cho các gói mẫu (Q1).
- Cập nhật `docs/designs/SUBSCRIPTION_BILLING_DESIGN.md` (mục 2 và 3) và `docs/03-database/DATABASE_DESIGN.md`.

### Bước 2 — `listedAt` và thứ tự tìm kiếm

- Ghi `listedAt = publishedAt` ở 3 chỗ đang ghi `publishedAt` (`job-posts.service.ts:526`, `:585`, `:836`).
- `SEARCH_ORDER` → `[{ listedAt: "desc" }, { id: "desc" }]` (dùng chung cho `findPublishedForSearch` và `findPublishedIdsForSearch`).
- Không đổi: huy hiệu "Mới" (`publishedAt`), `job-recommendation.repository.ts:164`, job alert.
- Ghi chú: làm mới giữa lúc người dùng cuộn có thể làm tin lặp ở trang sau; frontend bỏ trùng theo id (frontend F2).

### Bước 3 — Module `job-promotions`: số dư và dùng lượt

- Repository: đếm theo Phần 3, khoá dòng gói (`$queryRaw … FOR UPDATE` trong `tx`), insert lượt, cập nhật 3 cột của tin.
- `JobPromotionsService.getBalance(companyId)`, `apply(userId, jobPostId, type)`.
- Điều kiện `FEATURED`: `qualityBand !== "SUGGEST_REJECT"` và không cờ chặn; `qualityScore` null → `JobQualityService.scoreAndStore` trước rồi xét (ngoài transaction).
- Audit log `JOB_PROMOTION_APPLIED` (entityType `JobPost`), summary tiếng Việt. Thêm hằng vào `audit-log.actions.ts`; không thuộc nhóm "thao tác nguy hiểm".
- Routes + DTO (zod) + guard Employer (mọi thành viên công ty được dùng lượt; chỉ `isCompanyAdmin` được mua — Q3).

### Bước 4 — Mua lẻ và thanh toán

- `PaymentRepository.create` nhận `companySubscriptionId` **hoặc** `promotionPurchaseId`. `createCheckout` nhận một trong hai; `orderInfo` ASCII (`Thanh toan luot tang hien thi <id>`).
- `handleIpn` / `completeDevSkippedCheckout`: rẽ nhánh kích hoạt. `promotionPurchaseActivator`: chuyển `PENDING → ACTIVE` có điều kiện (`updateMany where status = PENDING`, idempotent), ghi `activatedAt`. Nếu gói của lần mua không còn `ACTIVE` lúc IPN về (vừa đổi gói): vẫn `ACTIVE` nhưng lượt không dùng được; ghi log cảnh báo (Q4).
- `reportClientCancellation`: nhánh lẻ chuyển `PENDING → CANCELLED`.
- `findStatusByOrderCode` trả `{ status, kind, companySubscriptionId?, promotionPurchaseId? }`; `SubscriptionsService.getPaymentStatusByOrderCode` / `reportPaymentCancellation` kiểm quyền theo nhánh.
- `recordCompletedPayment`: summary / payload theo nhánh (`… mua 3 lượt nổi bật (150.000đ)`). Thông báo `PAYMENT_COMPLETED` giữ type, thêm trường mô tả vào payload; cập nhật template nếu đang ghép tên gói.
- `JobPromotionsService.checkoutPurchase`, `listPurchases`.

### Bước 5 — Hiển thị công khai

- `JobPostRepository.findFeatured(filter, limit)`: `status = PUBLISHED`, chưa quá `expiresAt`, `featuredUntil > now`, `cityId` / `industryId` nếu có; lấy tối đa 50 tin mới làm nổi bật trước, xáo, cắt `limit`.
- Ghi `featuredImpressions` cho các tin trả về: một câu `INSERT … ON CONFLICT` nhiều dòng; lỗi chỉ log, không làm hỏng phản hồi.
- `incrementViewCount(id, { featuredClick })`: thêm `featuredClicks + 1` cùng câu upsert khi `src=featured`.
- Bộ lọc `urgent=1` trong `publicSearchWhere` (`urgentUntil > now`) — áp cho cả hai đường tìm kiếm.
- Mapper: `featuredUntil` / `urgentUntil` chỉ trả khi `> now`.
- Rate limit `GET /job-posts/featured` theo middleware sẵn có của route công khai (nếu có) — không thêm cơ chế mới.

### Bước 6 — Thống kê

- `GET /employer/job-posts/:id/promotions`: lịch sử + số liệu Phần 5 (đọc `job_post_daily_stats` và đếm `applications` theo ngày giờ VN).
- `GET /admin/job-promotions/stats`, `PATCH /admin/job-promotion-products/:type`.
- `SubscriptionPlan` DTO / schema validate thêm 5 cột; `featuredDays`, `urgentDays` 1–60; hạn mức 0–100.

### Bước 7 — shared-types

`JobPromotionType`, `JobPromotionBalanceDto`, `JobPromotionDto`, `JobPromotionProductDto`, `JobPromotionPurchaseDto`, `ApplyJobPromotionRequest`, `PromotionCheckoutRequest`, `JobPromotionStatsDto` (theo tin), `AdminJobPromotionStatsDto`; `JobPostDto` + `featuredUntil`, `urgentUntil`, `listedAt`; `JobPostSearchQuery` + `urgent`; `PaymentStatusResponse` + `kind`; `SubscriptionPlanDto` + 5 cột.

### Bước 8 — Test

Unit (`node:test` + `tsx`, file trong `apps/server/tests/unit/`, repository giả như các test hiện có):

- Số dư: gói trước rồi lẻ cũ nhất; hết lượt → 409; số ngày theo nguồn; cắt về `endDate`; dùng thử / không gói → 0.
- Điều kiện: tin không `PUBLISHED`; `FEATURED` vùng từ chối / có cờ chặn; đang còn hiệu lực; `REFRESH` < 24 giờ (mép đúng 24 giờ).
- Hai lần dùng song song với 1 lượt còn lại → đúng một lần thành công: test unit không kiểm được khoá dòng, nên kiểm tay trên Neon ở bước 9.
- Thanh toán: IPN thành công nhánh lẻ → `ACTIVE`; gọi lại IPN → không đổi; huỷ → `CANCELLED`; nhánh gói không đổi hành vi (chạy lại test cũ của `payments` / `subscriptions`).
- Tìm kiếm: `listedAt` đổi thứ tự; `urgent=1`; `sort=match` không bị ảnh hưởng ngoài thứ tự hoà.
- Khối nổi bật: chỉ tin còn hạn, theo bộ lọc, không quá `limit`.
- Thống kê: trung bình trước / trong; thiếu dữ liệu "trước".

### Bước 9 — Kiểm thật và tài liệu

- Qua gateway 8080 với `DEV_SKIP_PAYMENT_GATEWAY=true` trên Neon: dùng lượt gói, mua lẻ, dùng lượt lẻ, hết lượt, làm mới đổi thứ tự `/jobs`, khối nổi bật theo bộ lọc, lượt xuất hiện / bấm tăng, thống kê.
- Cập nhật AD-30 (trạng thái), PLAN này, backlog, `PROJECT_STATUS.md`.

## Câu hỏi đã chốt (2026-11-22)

Q1–Q4 chốt theo đề xuất. Q5 chốt **làm đầy đủ**.


- **Q1 — Con số mặc định.** **Theo đề xuất:** giá lẻ nổi bật 50.000đ / lượt 7 ngày, tuyển gấp 20.000đ / lượt 7 ngày, làm mới 10.000đ / lượt. Gói mẫu: gói thấp nhất 0 / 1 / 3 (nổi bật / tuyển gấp / làm mới), gói giữa 2 / 3 / 10, gói cao nhất 5 / 5 / 20. Số khối nổi bật: trang chủ 6, `/jobs` 3.
- **Q2 — Khối nổi bật ở `/jobs` theo những bộ lọc nào?** Đề xuất chỉ `cityId`, `industryId` (đủ để không lệch ngành / nơi). Theo cả từ khoá / kỹ năng thì khối thường trống. **Chốt: chỉ `cityId`, `industryId`.**
- **Q3 — Ai được dùng lượt?** **Chốt:** mọi thành viên công ty được dùng; chỉ `isCompanyAdmin` được mua (giống mua gói).
- **Q4 — Lần mua lẻ được xác nhận sau khi công ty vừa đổi gói** (hiếm): **chốt** vẫn ghi `ACTIVE`, lượt mất cùng gói cũ, log cảnh báo; không tự hoàn tiền (chưa có luồng hoàn tiền, `SUBSCRIPTION_BILLING_DESIGN.md` §2.7).
- **Q5 — Trang Admin cho gói:** hiện chưa có. **Chốt làm đầy đủ:** trang `/admin/subscription-plans` gồm danh sách gói (sửa hạn mức tăng hiển thị, giá, số tin, thời hạn, bật / tắt), giá lẻ và số liệu tổng. (Phương án gọn hơn — chỉ sửa hạn mức tăng hiển thị và giá lẻ — không chọn.)

## Bản rút gọn (nếu cần làm gấp)

Đã cân nhắc 2026-11-22, chưa chọn: chỉ `FEATURED` + `URGENT`, lượt lấy từ gói (hạn mức đặt bằng seed), khối nổi bật + huy hiệu + nút dùng lượt ở trang tin. Bỏ mua lẻ (không sửa `payments`), làm mới, thống kê, trang Admin. Ước tính 1–1,5 ngày.

## Hướng phát triển (không làm trong đợt này)

- Thông báo cho nhà tuyển dụng khi lượt nổi bật sắp hết / đã hết.
- Hoàn lượt khi Admin gỡ tin do lỗi hệ thống.
- Gợi ý "nên làm nổi bật tin này" dựa trên lượt xem thấp so với tin cùng ngành.
- Chống lượt xuất hiện ảo (bỏ trùng theo phiên / IP).

## Phần 7 — Ghi chú của chủ dự án

<!-- Dành cho chủ dự án. -->
