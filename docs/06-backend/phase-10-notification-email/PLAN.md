# Phase 10 (Backend) — Notification & Email Module

Xem tổng quan roadmap ở `docs/01-project/PROJECT_PHASES.md` §Phase 10, kiến trúc Resend/EmailSender chung ở `docs/02-architecture/INITIAL_ARCHITECTURE_PLAN.md` §8, node-cron/`prisma.$transaction` pattern ở AD-6 (`docs/02-architecture/ARCHITECTURE_DECISIONS.md`). Không chép lại nội dung các file đó — chỉ ghi phần đặc thù/bổ sung của phase này.

> **Trạng thái: đã triển khai** (2026-09-14) — migration `20260914152913_phase10_notification_email_outbox`, module `apps/server/src/modules/notifications/`. Quyết định kiến trúc đã được ghi thành **AD-8** trong `docs/02-architecture/ARCHITECTURE_DECISIONS.md`; schema đã đồng bộ vào `docs/03-database/DATABASE_DESIGN.md`. Khác biệt so với kế hoạch ghi ở mục "Khác biệt khi triển khai" cuối file.

**Phụ thuộc Phase 9 (Socket.IO, đang làm song song, chưa xong):** phase này **không viết bất kỳ code Socket.IO nào**. Chỉ chuẩn bị sẵn một seam (`RealtimeNotifier`, no-op) để nối vào khi Phase 9 hoàn tất — xem Phần 1 mục 5 và Phần 3 bước 2.

## Quyết định mới chốt khi lên kế hoạch phase này

1. **Dùng Transactional Outbox pattern** cho email (model `OutboxEvent` mới + worker `node-cron` mỗi phút), khác với quyết định đã từ chối outbox cho payments ở AD-6/`docs/designs/SUBSCRIPTION_BILLING_DESIGN.md` (lý do từ chối ở đó: outbox/payout "thuộc pattern cho hệ microservices, không cần cho app monolith"). Lý do dùng ở đây khác: đảm bảo reliability của một lời gọi HTTP đồng bộ ra ngoài (Resend) không bị mất khi lỗi/crash giữa lúc xử lý — vấn đề này tồn tại y hệt trong monolith, không liên quan tới điều phối microservices. Đã ghi thành **AD-8** trong `ARCHITECTURE_DECISIONS.md`, nêu rõ điểm khác biệt này để không đọc như mâu thuẫn với AD-6.
2. Thêm `NotificationType.COMPANY_REJECTED` (company verification bị từ chối — `companies.service.ts` đã có `reject()` nhưng chưa có loại notification tương ứng) và `NotificationType.MESSAGE_RECEIVED` (chuẩn bị cho Phase 9, **chưa wire call site nào**).
3. Thêm `Notification.readAt: DateTime?` cạnh `isRead: Boolean` đã có.
4. Notify **tất cả** employer user của một company (không chỉ `isCompanyAdmin`) cho các sự kiện `JOB_POST_*`/`COMPANY_*` — vì bất kỳ employer nào cũng có thể thao tác trên job post.
5. Mở rộng call site notify `COMPANY_VERIFIED` sang cả luồng auto-verify (`employers.service.ts#createOrResubmitCompany`, nhánh tax-code/MX record khớp) — không chỉ luồng admin `verify()` thủ công, vì auto-verify là đường phổ biến hơn và hiện đang im lặng không gửi gì.
6. Thêm guard trạng thái vào `companies.service.ts#verify()`/`reject()` (hiện chưa có, khác với `job-posts.service.ts` đã có) để chặn gọi lại API gây gửi notification/email trùng.
7. **Không** lưu payload JSON thô trong `Notification` — chỉ lưu snapshot `title`/`body`/`link` đã render tại thời điểm tạo, tránh notification cũ tự đổi nội dung khi dữ liệu gốc (vd. tên job) đổi sau này.
8. **Không** wire notify cho `applications.service.ts#cancelApplication` (candidate huỷ đơn) — ngoài phạm vi roadmap Phase 10 đã duyệt.

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency mới. Tái dùng: `EmailSender`/`ResendEmailSender` (Phase 2, `apps/server/src/shared/ports/EmailSender.ts` + `apps/server/src/infrastructure/resend-email-sender.ts`), `node-cron` (Phase 5/6, đã dùng cho `subscription-expiry.job.ts`/`job-post-expiry.job.ts`).
- Module `notifications` theo convention chặt (giống `job-posts`/`companies`): `notifications.repository.ts`, `notification.mapper.ts`, `notification.types.ts`, `notifications.service.ts`, `notifications.controller.ts`, `notifications.dto.ts` (zod), `notifications.routes.ts`, cộng 2 thư mục con:
  - `templates/notification-templates.ts` — template registry (in-app + email).
  - `outbox/outbox.repository.ts` + `outbox/outbox.job.ts` — không có service layer riêng, giống `job-post-expiry.job.ts` không có service riêng.
- Payload notify type-safe theo từng `NotificationType` qua `NotificationPayloadMap` (server-local, đặt tại `notification.types.ts` — **không** đưa vào `packages/shared-types` vì đây là write-shape nội bộ, giống cách `CompanyWriteData`/`JobPostWriteData` ở các module khác đang ở lại server, chỉ DTO đọc/ghi qua API mới vào `shared-types`).
- `RealtimeNotifier` là port mới (`apps/server/src/shared/ports/RealtimeNotifier.ts`), implementation duy nhất hôm nay là `NoopRealtimeNotifier` (`apps/server/src/infrastructure/noop-realtime-notifier.ts`) — đăng ký ở `container.ts` như infra dùng chung, giống `EmailSender`. Khi Phase 9 xong, chỉ cần đổi registration này sang implementation dùng Socket.IO, không sửa `NotificationsService`.
- Migration Prisma: 1 migration duy nhất gộp cả 4 thay đổi additive (xem "Quyết định mới chốt" mục 2–3 và model `OutboxEvent` ở Phần 2) — không cần backfill dữ liệu.

## Phần 2 — Liên kết giữa các phần

- `NotificationsService.notify<T extends NotificationType>(type, recipientUserId, data: NotificationPayloadMap[T], tx?)`: nhận `tx` (Prisma transaction client) tuỳ chọn để business service gọi trong transaction sẵn có; tự mở transaction riêng nếu không truyền. Bên trong: lấy `user.email` của recipient (không có → `logger.warn`, bỏ qua, **không throw** để không làm rollback transaction của caller), render template (in-app + email), ghi `Notification`, ghi `OutboxEvent` (`status=PENDING`), gọi `RealtimeNotifier.pushToUser()` (no-op hôm nay).
- Schema `OutboxEvent`:
  ```prisma
  enum OutboxStatus { PENDING PROCESSING COMPLETED FAILED }

  model OutboxEvent {
    id            String       @id @default(cuid())
    eventType     String       // "NOTIFICATION_EMAIL" — String thay vì enum để tái dùng cho event khác sau này không cần migration
    aggregateType String       // "Notification"
    aggregateId   String
    payload       Json         // { to, subject, html, notificationType } — render đầy đủ lúc ghi
    status        OutboxStatus @default(PENDING)
    attempts      Int          @default(0)
    availableAt   DateTime     @default(now())
    processedAt   DateTime?
    lastError     String?
    createdAt     DateTime     @default(now())

    @@index([status, availableAt])
    @@map("outbox_events")
  }
  ```
- `outbox.job.ts` (cron `"* * * * *"`, khởi động trong `main.ts` cạnh 2 job đã có): claim batch 20 event `PENDING` có `availableAt<=now`, gửi qua `EmailSender.send()` (tuần tự, không song song — đủ cho quy mô đồ án). Lỗi → backoff `[1, 5, 15, 30]` phút theo số lần thử (`attempts`), sau 5 lần → `FAILED`, `lastError` lưu lại để debug thủ công. **Known gap chấp nhận ở MVP:** event kẹt ở `PROCESSING` nếu worker crash giữa batch — không xây cơ chế reclaim ngay, chỉ ghi chú lại.
- `EmployerRepository` (đã đăng ký sẵn ở `container.ts`, không cần sửa `container.ts` cho phần này) cần thêm method mới:
  ```ts
  findManyByCompanyId(companyId: string, db: Db = this.prisma): Promise<Pick<Employer, "id" | "userId" | "isCompanyAdmin">[]>
  ```
- 7 call site tích hợp `notify()`:

  | # | File | Function | Type | Recipient |
  |---|------|----------|------|-----------|
  | 1 | `applications/applications.service.ts` | `updateApplicationStatus` | `APPLICATION_STATUS_CHANGED` | `application.candidate.user.id` |
  | 2 | `job-posts/job-posts.service.ts` | `approve` | `JOB_POST_APPROVED` | tất cả employer của company |
  | 3 | `job-posts/job-posts.service.ts` | `reject` | `JOB_POST_REJECTED` | tất cả employer của company |
  | 4 | `job-posts/job-posts.service.ts` | `retract` | `JOB_POST_TAKEN_DOWN` | tất cả employer của company |
  | 5 | `companies/companies.service.ts` | `verify` | `COMPANY_VERIFIED` | tất cả employer của company |
  | 6 | `companies/companies.service.ts` | `reject` | `COMPANY_REJECTED` | tất cả employer của company |
  | 7 | `employers/employers.service.ts` | `createOrResubmitCompany` (nhánh auto-verified/`devBypass`) | `COMPANY_VERIFIED` | user vừa tạo/resubmit company |

  Chi tiết thay đổi từng file:
  - **`applications.service.ts#updateApplicationStatus`**: hiện **chưa** bọc `prisma.$transaction` — cần bọc lại. `applicationsRepository.update()` cần thêm tham số `db: Db = this.prisma` (các repository khác đã có pattern này, `ApplicationsRepository` hiện chưa có). Constructor nhận thêm `notificationsService`. Dữ liệu recipient/jobPost đã có sẵn trong `ApplicationWithEmployerRelations` (từ `findEmployerApplicationById`), không cần query thêm.
  - **`job-posts.service.ts` (`approve`/`reject`/`retract`)**: đã có `prisma.$transaction` sẵn — chỉ thêm bước notify (lặp qua `employerRepository.findManyByCompanyId(jobPost.companyId, tx)`) bên trong transaction hiện có. Constructor nhận thêm `notificationsService`.
  - **`companies.service.ts` (`verify`/`reject`)**: hiện **chưa** bọc transaction — cần bọc lại, đồng thời thêm guard (vd. `if (company.verificationStatus === "VERIFIED") throw new AppError(409, "Company đã được xác minh");`) trước khi update, theo đúng pattern `job-posts.service.ts`. Constructor nhận thêm `employerRepository`, `notificationsService`.
  - **`employers.service.ts#createOrResubmitCompany`**: đã có `prisma.$transaction` — thêm notify trong nhánh auto-verified. Constructor nhận thêm `notificationsService`.
  - `MESSAGE_RECEIVED`: chỉ thêm enum + entry template registry (comment trỏ Phase 9), không wire call site (module `messaging` chưa tồn tại).
- `packages/shared-types/src/index.ts`: cập nhật union `NotificationType` (thêm `COMPANY_REJECTED`, `MESSAGE_RECEIVED`), thêm `Notification` DTO (`id, type, title, body, link, isRead, readAt, createdAt`) và `UnreadCountResponse` (`{ count: number }`).

## Phần 3 — Các bước thực hiện

1. Prisma: sửa `schema.prisma` theo Phần 2 (enum mới, `readAt`, `OutboxEvent`/`OutboxStatus`), chạy migration (`npm run db:migrate --workspace=apps/server`). Cập nhật `packages/shared-types` theo Phần 2.
2. Module core (bao gồm outbox ngay từ đầu, không có bước "gửi đồng bộ tạm thời" trước khi có outbox):
   - `notification.types.ts`, `templates/notification-templates.ts`, `notifications.repository.ts` (`create`, `findByUser` cursor-paginated, `countUnread`, `markRead` — `updateMany` scoped theo `userId` để chặn IDOR, `markAllRead`).
   - `outbox/outbox.repository.ts` (`create`, `claimBatch`, `markCompleted`, `markRetry`, `markFailed`), `outbox/outbox.job.ts` (`runOutboxSweep` + `startOutboxJob`, theo Phần 2).
   - `notifications.service.ts` (`notify()` theo Phần 2, cộng use case đọc/đánh dấu đã đọc cho controller).
   - `apps/server/src/shared/ports/RealtimeNotifier.ts` + `apps/server/src/infrastructure/noop-realtime-notifier.ts`.
   - Đăng ký `realtimeNotifier` vào `Cradle`/`container.ts` (infra dùng chung, như `emailSender`).
3. Wire 7 call site theo bảng ở Phần 2: sửa `applications.repository.ts` (+`db` param cho `update`), `applications.service.ts`, `job-posts.service.ts`, `companies.service.ts` (+guard), `employer.repository.ts` (+`findManyByCompanyId`), `employers.service.ts`.
4. API endpoints (actor-agnostic, chỉ cần `authenticate`, tự scope theo `req.user!.id`):
   - `GET /notifications` — query `cursor?`, `unreadOnly?` (dùng `z.preprocess((v) => v === "true", z.boolean())`, **không** `z.coerce.boolean()` — tránh lỗi `Boolean("false")===true` đã ghi nhận ở AD-5); response `ApiResponse<T>` cursor-paginated theo đúng envelope `API_CONVENTIONS.md`.
   - `GET /notifications/unread-count` — `ApiResponse<UnreadCountResponse>`.
   - `PATCH /notifications/:id/read` — scoped theo owner, 404 nếu không thuộc user.
   - `PATCH /notifications/read-all`.
   - `notifications.controller.ts` + `notifications.dto.ts` + `notifications.routes.ts`, mount `app.use("/api", notificationsRouter(container))` trong `main.ts`, khởi động `startOutboxJob(...)` cạnh 2 cron job đã có.

## Cách test (không cần frontend — Postman/curl)

- Employer đổi trạng thái application (`PATCH /employer/applications/:id/status`) → có `Notification` mới cho candidate + `OutboxEvent` `PENDING`; sau ≤1 phút → `OutboxEvent` chuyển `COMPLETED`, email thực tới hộp thư qua Resend (cần xác nhận cách test không tốn quota Resend thật khi tới lúc implement, vd. dùng địa chỉ test riêng).
- Admin duyệt/từ chối/thu hồi 1 job post → tất cả employer của company nhận đúng loại notification + email; công ty verify/reject (cả thủ công lẫn auto-verify) tương tự.
- Gọi `PATCH /companies/:id/verify` 2 lần liên tiếp → lần 2 trả 409, không tạo thêm `Notification`/`OutboxEvent`.
- Giả lập `EmailSender.send()` throw lỗi (vd. tạm sai `RESEND_API_KEY`) → `OutboxEvent.attempts` tăng, `availableAt` dời theo backoff, không mất event; sau 5 lần → `FAILED`.
- `GET /notifications`, `/notifications/unread-count`, `PATCH /notifications/:id/read`, `/read-all` — đúng scope theo user, không rò rỉ notification của user khác; `read-all` khi không có gì chưa đọc vẫn trả 200.
- Notification cho company không có employer nào (edge case) → `findManyByCompanyId` trả `[]`, vòng lặp no-op, có `logger.warn` cảnh báo trạng thái bất thường.

## Khác biệt khi triển khai (so với kế hoạch ở trên)

- **`MESSAGE_RECEIVED` không gửi email**, chỉ hiển thị in-app (entry template trả `email: null`). Mỗi tin nhắn một email sẽ thành spam, trong khi tin nhắn vốn đã có realtime + in-app. Enum/template vẫn được khai báo sẵn như kế hoạch, chỉ chưa có call site (chờ Phase 9).
- **Không tạo `docs/designs/NOTIFICATION_EMAIL_DESIGN.md`** như kế hoạch ban đầu dự tính: sau khi AD-8 (lý do + outbox + seam realtime), `DATABASE_DESIGN.md` (model) và chính file này (module/API/call site) đã đủ, một file design riêng sẽ gần như chép lại cả ba — trái với nguyên tắc "không chép lại nội dung đã có" ở `docs/06-backend/README.md`.
- **URL gốc của web app trong email lấy từ `CORS_ORIGIN`** (đã là origin của frontend, xem `shared/config/env.ts`) thay vì thêm một biến môi trường mới trùng nghĩa.
- **Template escape HTML** mọi chuỗi do người dùng nhập (tên công ty, tiêu đề tin, lý do từ chối) trước khi nhúng vào email — phần này kế hoạch chưa nêu.
- `NotificationsService` có thêm **`notifyMany()`** (lặp `notify()` cho danh sách user) vì 5/7 call site đều gửi cho toàn bộ employer của một company.
- `ApplicationsRepository.update()` được thêm tham số `db: Db = this.prisma` đúng như kế hoạch; ngoài ra `applications.service.ts#updateApplicationStatus` nay bọc `prisma.$transaction`.

## Bổ sung (2026-09-16) — Dev email bypass cho notification email

> **Trạng thái: đã triển khai (2026-09-16).** Khác mô tả ban đầu ở mục 5: vì `emailSender` là 1 registration dùng chung, cờ này áp dụng cho **mọi** email (cả OTP ở `auth.service.ts` lẫn outbox notification) — xem ghi chú dưới mục 5. `RESEND_*` cũng không còn bắt buộc ở dev khi bật cờ.

Vấn đề: khi test bằng email giả (đăng ký thử candidate/employer), `outbox.job.ts` vẫn cố gửi qua Resend thật cho địa chỉ không tồn tại — cần cách tắt gửi email thật ở dev mà **không thể vô tình để sót khi lên production**.

Đề xuất, theo đúng pattern `DEV_SKIP_COMPANY_MANUAL_VERIFICATION`/`DEV_SKIP_PAYMENT_GATEWAY` đã có sẵn trong `apps/server/src/shared/config/env.ts` (dùng `z.preprocess` parse tường minh chuỗi `"true"`, không dùng `z.coerce.boolean()`, cộng ràng buộc chặn cứng production trong `superRefine`):

1. Thêm biến `DEV_SKIP_EMAIL_SENDING` (boolean, cùng pattern `z.preprocess`, default `false`) vào `env.ts` — đặt cạnh nhóm `RESEND_*`.
2. Thêm nhánh trong `superRefine` hiện có (cạnh nhánh `DEV_SKIP_PAYMENT_GATEWAY`, dòng ~153): nếu `NODE_ENV === "production"` và `DEV_SKIP_EMAIL_SENDING === true` → `ctx.addIssue(...)`, server **từ chối khởi động** thay vì chỉ dựa vào việc nhớ xoá biến khỏi `.env` production.
3. Thêm `ConsoleEmailSender implements EmailSender` (`apps/server/src/infrastructure/console-email-sender.ts`, mới) — log `to`/`subject`/`html` qua `logger.info`, không gọi Resend, không throw.
4. `container.ts:72`: đăng ký `emailSender` có điều kiện theo `config.DEV_SKIP_EMAIL_SENDING` — `asClass(ConsoleEmailSender)` hoặc `asClass(ResendEmailSender)`, giữ `.singleton()`.
5. **Không đổi** `OTP_HARDCODE` hiện có — đây là flag riêng cho luồng OTP (`auth.service.ts`), đã hoạt động đúng và độc lập. `DEV_SKIP_EMAIL_SENDING` chỉ ảnh hưởng `outbox.job.ts`/email notification (Phase 10), hai flag không chồng lấn nhau: bật `OTP_HARDCODE` mà tắt `DEV_SKIP_EMAIL_SENDING` vẫn gửi email notification thật (chỉ OTP được bypass), và ngược lại.
   - *Ghi chú khi triển khai:* tắt `OTP_HARDCODE` + bật `DEV_SKIP_EMAIL_SENDING` → OTP sinh ngẫu nhiên như thật nhưng email OTP chỉ được in ra console server (đọc mã OTP ở đó) — hai cờ vẫn độc lập về cách sinh OTP.

### Phạm vi KHÔNG làm

- Không đổi interface `EmailSender`.
- Không thêm UI/admin toggle — chỉ qua `.env`, giống các cờ `DEV_SKIP_*` khác.
- Không ảnh hưởng `ResendEmailSender` hiện có — chỉ thêm 1 implementation mới song song.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
