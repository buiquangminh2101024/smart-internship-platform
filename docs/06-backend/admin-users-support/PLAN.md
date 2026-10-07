# Quản lý người dùng (Admin) + Trang hỗ trợ bản A + sửa lỗi liên kết Google — Backend

Quyết định kiến trúc: `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-17. Câu hỏi đã chốt (U1–U7, U6a–c, G1–G2, H1–H6): `docs/temp/ADMIN_USERS_AND_SIMILAR_JOBS_DECISIONS.md`. Chủ dự án chấp nhận **toàn bộ khuyến nghị** ngày 2026-10-07. Không chép lại lập luận ở đây.

Song song: `docs/05-frontend/phases/admin-users-support/PLAN.md`. Phần "Việc làm tương tự" có plan riêng: `docs/06-backend/similar-jobs/PLAN.md`.

**Trạng thái: ĐÃ DUYỆT (2026-10-07, gồm P1–P4). Backend B0–B7 xong (2026-10-07); còn frontend.**

## Quyết định đã chốt (tóm tắt để code theo)

| # | Quyết định |
|---|---|
| U1 | Khoá có hiệu lực ngay: khoá Redis `user-suspended:{userId}` (không TTL), kiểm ở `authenticate` và handshake Socket.IO; khi khoá thì ngắt mọi socket của user. Mở khoá thì xoá khoá Redis. |
| U2 | Chỉ khoá được `CANDIDATE`/`EMPLOYER`. Khoá `ADMIN` (kể cả chính mình) ⇒ 403. |
| U3 | Bắt buộc lý do (1–500 ký tự), lưu `AuditLog.metadata.reason`. Màn hình đăng nhập chỉ hiện thông báo chung. |
| U4 | Mở khoá: `emailVerifiedAt != null` ⇒ `ACTIVE`, ngược lại ⇒ `PENDING_VERIFICATION`. |
| U5 | Đợt này **không** đụng tới tin tuyển dụng của Employer bị khoá. |
| U6 | Email + thông báo trong app qua `notify()` (cách 1): `ACCOUNT_SUSPENDED` (có lý do, có link `/support`), `ACCOUNT_REACTIVATED`. |
| U7 | Danh sách: email, tên (họ tên ứng viên / tên công ty), vai trò, trạng thái, ngày tạo; lọc vai trò/trạng thái, tìm theo email, phân trang cursor. Người đang `SUSPENDED` có thêm lý do, email Admin khoá, thời điểm (từ `AuditLog` mới nhất). |
| G1 | Liên kết Google vào tài khoản `PENDING_VERIFICATION` ⇒ kích hoạt tài khoản. *(Bổ sung sau B5: kèm xoá `passwordHash` và kiểm `email_verified`, xem AD-17 mục 6.)* |
| G2 | Đã kiểm Neon (chỉ đọc) ngày 2026-10-07: **0** tài khoản có `googleId` mà chưa xác thực ⇒ không cần câu cập nhật dữ liệu. |
| H1–H4 | Trang hỗ trợ **bản A**: `POST /support/contact` công khai, module riêng `support`, trường `email`/`category`/`message`, chống spam theo IP + email, gửi tới mọi user `ADMIN` lấy từ DB, mã lỗi `ACCOUNT_SUSPENDED`. Luôn trả "đã gửi", không tiết lộ email có tài khoản hay không. |

### Điểm bổ sung khi lập kế hoạch (cần chủ dự án xác nhận khi duyệt)

| # | Nội dung | Lý do |
|---|---|---|
| P1 | **Thêm giá trị thứ 3 `SUPPORT_CONTACT_RECEIVED`** vào `NotificationType` trong **cùng migration** với U6. Bản A gửi tới Admin bằng `notifyMany()` thay vì ghi thẳng `OutboxEvent`. | Đằng nào cũng chạy migration cho U6, thêm 1 giá trị không tốn gì. `outbox.job.ts` hiện chỉ xử lý `NOTIFICATION_EMAIL` kèm `notificationType` hợp lệ, nên ghi thẳng outbox phải sửa cả job (ngược AD-8). Được thêm: Admin thấy chuông thông báo, bấm vào mở `/admin/users?q=<email>`. Bản B dùng lại luôn giá trị này. Phương án thay thế (nếu không đồng ý): thêm `eventType` email chung vào `outbox.job.ts`, không thêm enum. |
| P2 | **Lỗi HTTP trả kèm `code`.** `errorHandler` hiện chỉ trả `{ success, error }`, bỏ mất `AppError.code` (chỉ socket mới gửi `code`). Thêm `code?` vào `ApiResponse` và vào body lỗi. | H3 cần mã lỗi để frontend không so chuỗi tiếng Anh. Thay đổi dùng chung cho mọi API ⇒ ghi ở AD-17. |
| P3 | Tài khoản bị khoá giữa phiên: `authenticate` trả **401** `code = ACCOUNT_SUSPENDED` (không phải 403). | Frontend gặp 401 sẽ thử refresh; `refresh()` từ chối vì `status !== ACTIVE` ⇒ tự đăng xuất về trang đăng nhập, tại đó người dùng thấy thông báo khoá + link hỗ trợ. Không phải sửa luồng refresh ở frontend. |
| P4 | Nhóm thông báo mới `ACCOUNT` cho cả 3 loại mới. | `NOTIFICATION_GROUP_BY_TYPE` là `Record<NotificationType, …>` ở cả server lẫn web, thiếu là lỗi biên dịch. |

## Phần 1 — Công nghệ / kiến trúc sử dụng

- Không thêm dependency. Dùng lại: Prisma transaction, `AuditLogService.record(entry, tx)`, `NotificationsService.notify/notifyMany`, `RedisRateLimiter`, Redis client (`infrastructure/redis.ts`), `SocketIoRealtimeNotifier`.
- Port mới `AccountSuspensionStore` (`shared/ports/`) + adapter `infrastructure/redis-account-suspension-store.ts`, đăng ký trong `container.ts` cạnh `tokenBlacklist`. Cùng mẫu với `TokenBlacklist`/`RedisTokenBlacklist`.
- Port `RealtimeNotifier` thêm `disconnectUser(userId)`: bản Socket.IO gọi `io.in("user:{id}").disconnectSockets(true)`, bản Noop không làm gì.
- Module mới `apps/server/src/modules/support/` (routes → controller → service, DTO Zod), đúng nguyên tắc 1 của bản A. API Admin quản lý người dùng nằm trong module `users` có sẵn (không tạo module `admin`, theo `PROJECT_STRUCTURE.md` §5).
- **Migration M1** `<timestamp>_add_account_notification_types`: chỉ 3 câu `ALTER TYPE "NotificationType" ADD VALUE ...` (`ACCOUNT_SUSPENDED`, `ACCOUNT_REACTIVATED`, `SUPPORT_CONTACT_RECEIVED`). Không dùng giá trị mới trong cùng file migration (AD-16 mục 8).

## Phần 2 — Liên kết giữa các phần

```text
Admin UI ─► GET  /admin/users ─────────────► UsersService.listForAdmin
                                              ├─ UserRepository.listForAdmin (lọc, cursor, kèm tên ứng viên / công ty)
                                              └─ AuditLogRepository.findLatestByEntities("User", ids, "USER_SUSPENDED") + findEmailsByIds  (U7)

Admin UI ─► POST /admin/users/:id/suspend ─► UsersService.suspend
             { reason }                       ├─ $transaction:
                                              │    UserRepository.setStatus([ACTIVE, PENDING_VERIFICATION] → SUSPENDED)
                                              │    AuditLogService.record(USER_SUSPENDED, metadata {reason, previousStatus}, tx)
                                              │    NotificationsService.notify(ACCOUNT_SUSPENDED, userId, {reason}, tx) ─► outbox ─► email
                                              └─ sau commit: AccountSuspensionStore.markSuspended(id)
                                                             RealtimeNotifier.disconnectUser(id)

Admin UI ─► POST /admin/users/:id/reactivate ► UsersService.reactivate (đối xứng; status theo U4; ACCOUNT_REACTIVATED; store.clear)

Mọi request có token ─► authenticate ─► blacklist(jti) ─► AccountSuspensionStore.isSuspended(sub) ─► 401 ACCOUNT_SUSPENDED
Socket handshake      ─► io.use       ─► blacklist(jti) ─► isSuspended(sub) ─► từ chối kết nối

Đăng nhập (mật khẩu/Google) bị khoá ─► 403 code ACCOUNT_SUSPENDED ─► frontend hiện link /support

Khách ─► POST /support/contact ─► SupportService.submitContact
                                   ├─ RateLimiter: support:ip:{ip} 5/giờ, support:email:{email} 3/giờ ─► 429
                                   ├─ UserRepository.findAdminIds()
                                   └─ NotificationsService.notifyMany(SUPPORT_CONTACT_RECEIVED, adminIds, {email, category, message, accountStatus})
```

Ghi chú thứ tự trong `suspend`: ghi Redis và ngắt socket **sau** khi transaction commit. Nếu ghi trước mà transaction lỗi thì người dùng `ACTIVE` bị chặn oan. Nếu Redis lỗi sau commit thì chỉ log lỗi: `refresh()` vẫn chặn theo DB, nên kẽ hở tối đa vẫn là 15 phút như hiện nay, không tệ hơn.

## Phần 3 — Các bước thực hiện

Thứ tự ưu tiên trong ngày (H1): **B1–B6 (quản lý người dùng) → B7 (hỗ trợ bản A) → plan "Việc làm tương tự"**. Thiếu thời gian thì bỏ "Việc làm tương tự" trước.

### B0 — Migration M1 (~20 phút, cần chủ dự án đồng ý trước khi áp Neon) — ✅ xong 2026-10-07

> Tiến độ 2026-10-07: đã sửa `schema.prisma` và tạo `20261007120000_add_account_notification_types/migration.sql`. Máy không có shadow DB tạm (Docker không chạy), nên kiểm bằng `prisma migrate diff --from-schema-datamodel <schema HEAD> --to-schema-datamodel prisma/schema.prisma --script`. Cách này không kết nối DB, và SQL sinh ra khớp đúng 3 câu trong file. `prisma validate` sạch. `prisma migrate status` (chỉ đọc) cho thấy Neon chỉ còn thiếu migration này. Sau khi chủ dự án đồng ý: đã chạy `npm run db:deploy` (áp lên Neon) và `prisma generate` ngày 2026-10-07.

1. Sửa `schema.prisma`: thêm 3 giá trị vào `enum NotificationType`, mỗi dòng có chú thích `// AD-17`.
2. Tạo thư mục migration và viết tay `migration.sql` (3 câu `ALTER TYPE ... ADD VALUE`).
3. Kiểm chứng với **shadow DB tạm riêng** (không bao giờ là `DATABASE_URL`, theo D6 dashboard và memory dự án):
   `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <URL_DB_TAM>` phải ra rỗng.
4. Hỏi chủ dự án, rồi mới chạy `npm run db:deploy` (`migrate deploy`, không dùng shadow DB) và `prisma generate`.

### B1 — Mã lỗi trong response (P2) (~15 phút) — ✅ xong 2026-10-07

> `tsc --noEmit` sạch ở shared-types, server, web. Lưu ý: server đọc `@sip/shared-types` từ `dist/`, nên mỗi khi sửa shared-types phải chạy `npm run build` trong `packages/shared-types`.

- `packages/shared-types`: `ApiResponse` thêm `code?: string`.
- `shared/middleware/errorHandler.ts`: body lỗi thêm `code` khi `err.code` có giá trị.
- `auth.service.ts`: 2 chỗ `throw new AppError(403, "Account is suspended")` (đăng nhập mật khẩu, Google) thêm tham số `"ACCOUNT_SUSPENDED"`.

### B2 — Chặn ngay khi khoá (U1) (~1 giờ) — ✅ xong 2026-10-07

> `tsc --noEmit` ở server không có lỗi trong các file B2. Lỗi còn lại chỉ ở `modules/notifications/*` (thiếu payload/template/group cho 3 giá trị enum mới), sẽ hết khi làm xong B3. Lúc này chưa có code nào ghi cờ khoá; B4 sẽ gọi `markSuspended`/`clear` và `disconnectUser` sau khi transaction commit.

- `shared/ports/AccountSuspensionStore.ts`: `markSuspended(userId)`, `clear(userId)`, `isSuspended(userId)`.
- `infrastructure/redis-account-suspension-store.ts`: khoá `user-suspended:{userId}`, giá trị `"1"`, không TTL.
- `container.ts`: đăng ký `accountSuspensionStore` (singleton) và thêm vào kiểu `Cradle`.
- `authenticate.ts`: sau kiểm blacklist, `isSuspended(payload.sub)` ⇒ `AppError(401, "Account is suspended", "ACCOUNT_SUSPENDED")`.
- `infrastructure/socket/index.ts`: trong `io.use`, kiểm thêm `isSuspended(decoded.sub)` ⇒ `next(new Error("Authentication error: Account suspended"))`.
- `RealtimeNotifier` + 2 adapter: thêm `disconnectUser(userId)`.

### B3 — Thông báo/email khoá, mở khoá (U6) (~45 phút) — ✅ xong 2026-10-07

> `tsc --noEmit` ở server và shared-types sạch (đã build lại `dist`). `SupportCategory` được thêm vào shared-types ngay ở bước này vì payload `SUPPORT_CONTACT_RECEIVED` cần đến; B7 chỉ còn thêm `SupportContactRequest`. Nhóm `ACCOUNT` được thêm vào `NOTIFICATION_GROUPS_BY_ROLE` của cả 3 vai trò (cuối danh sách tab). Web hiện lỗi biên dịch ở `lib/notifications.ts` cho tới khi làm mục 8 của plan frontend.

- `notification.types.ts`:
  - `ACCOUNT_SUSPENDED: { reason: string }`
  - `ACCOUNT_REACTIVATED: { requiresEmailVerification: boolean }`
  - `SUPPORT_CONTACT_RECEIVED: { email: string; category: SupportCategory; message: string; accountStatus: UserStatus | null }`
- `templates/notification-templates.ts` (escape nội dung người dùng nhập như các template hiện có):
  - `ACCOUNT_SUSPENDED`: tiêu đề "Tài khoản của bạn đã bị khoá", nội dung kèm lý do (U6a), nút "Liên hệ hỗ trợ" → `/support?category=ACCOUNT_SUSPENDED`. `link` trong app là `/support`.
  - `ACCOUNT_REACTIVATED`: "Tài khoản của bạn đã được mở khoá"; nếu `requiresEmailVerification` thì thêm câu nhắc xác thực email khi đăng nhập. Nút → `/login`.
  - `SUPPORT_CONTACT_RECEIVED`: tiêu đề "Yêu cầu hỗ trợ mới từ {email}", nội dung gồm loại vấn đề, trạng thái tài khoản (nếu email khớp tài khoản), trích đoạn lời nhắn; email gửi Admin có toàn văn lời nhắn. `link` → `/admin/users?q={email}`.
- `notification-groups.ts`: thêm nhóm `ACCOUNT` cho 3 loại. `packages/shared-types`: thêm 3 giá trị vào union `NotificationType`, `"ACCOUNT"` vào `NotificationGroup`.

### B4 — API quản lý người dùng (~1,5 giờ) — ✅ xong 2026-10-07

> `tsc --noEmit` ở server sạch. Đã chạy thử chỉ đọc trên Neon: `listForAdmin` (tìm `q` không phân biệt hoa thường, kèm tên) và câu `DISTINCT ON` của `findLatestByEntities` (bảng `audit_logs` hiện trống nên mới kiểm được cú pháp). Khác plan ban đầu:
> - `setStatus(id, from[], to, tx)` dùng `updateMany` có điều kiện trạng thái hiện tại, trả `boolean`. Hai Admin thao tác cùng lúc thì người sau nhận 409, không ghi trùng nhật ký/thông báo.
> - `AdminUserListItem` thêm `emailVerifiedAt`, để dialog "Mở khoá" ở frontend biết người dùng sẽ về `PENDING_VERIFICATION` (U4). Thêm `SuspendUserRequest`.
> - `suspend`/`reactivate` trả về `AdminUserListItem` của người dùng sau khi đổi.
> - Trang 20 dòng cố định (không có tham số `limit`). `readReason` của `audit-log.service.ts` được export để dùng lại.

- `audit-log.actions.ts`: thêm `USER_SUSPENDED`, `USER_REACTIVATED`; `AuditEntityType` thêm `"User"`.
- `audit-log.repository.ts`: `findLatestByEntities(entityType, entityIds, action)` → `Map<entityId, AuditLog>` (một truy vấn, `DISTINCT ON ("entityId") ... ORDER BY "entityId", "createdAt" DESC`).
- `user.repository.ts`:
  - `listForAdmin({ role?, status?, q?, cursor?, limit })`: `email contains q` (không phân biệt hoa thường), sắp `createdAt desc, id desc`, select kèm `candidate.fullName`, `employer.company { id, name }`.
  - `setStatus(id, from[], to, tx)` → `boolean` (chỉ đổi khi trạng thái hiện tại thuộc `from`).
  - `findForAdmin(id, tx?)`: một dòng cùng cột với danh sách.
- `users.dto.ts` (mới): `adminListUsersQuerySchema` (`role`, `status`, `q` tối đa 100 ký tự, `cursor`), `suspendUserSchema` (`reason` trim 1–500).
- `users.service.ts`: `listForAdmin`, `suspend(adminId, userId, reason)`, `reactivate(adminId, userId)`.
  - 404 nếu không có user; 403 nếu đích là `ADMIN` (U2); 409 nếu khoá người đã `SUSPENDED` hoặc mở khoá người không `SUSPENDED`.
  - `summary` audit tiếng Việt, ví dụ "Khoá tài khoản {email}" / "Mở khoá tài khoản {email}".
- `users.routes.ts`: đăng ký 3 route với `authenticate` + `authorize("ADMIN")`:
  - `GET /admin/users`
  - `POST /admin/users/:id/suspend`
  - `POST /admin/users/:id/reactivate`
- `packages/shared-types`: `AdminUserListItem` (`id`, `email`, `role`, `status`, `name`, `companyId`, `emailVerifiedAt`, `createdAt`, `suspension: { reason, byEmail, at } | null`), `AdminUserListQuery`, `SuspendUserRequest`. `suspend`/`reactivate` trả về `AdminUserListItem`.

### B5 — Sửa lỗi liên kết Google (G1) (~10 phút) — ✅ xong 2026-10-07

> Bản đầu làm đúng plan (gọi `markVerified`). Khi rà lại phát hiện 2 lỗ hổng; đã vá ngay sau khi chủ dự án đồng ý (AD-17 mục 6):
> - **Chiếm tài khoản trước:** kẻ xấu đăng ký trước bằng email nạn nhân, rồi nạn nhân đăng nhập Google ⇒ G1 kích hoạt ⇒ mật khẩu của kẻ xấu dùng được. Sửa: `UserRepository.linkGoogleToUnverified` gộp liên kết + kích hoạt + **xoá `passwordHash`** trong một `updateMany` có điều kiện `PENDING_VERIFICATION`. Nếu trạng thái vừa đổi (bị khoá) thì chỉ liên kết. `markVerified` không còn dùng ở luồng Google.
> - **Không kiểm `email_verified`:** `GoogleAuthClient` giờ từ chối khi `email_verified !== true` (401 `GOOGLE_EMAIL_UNVERIFIED`).
>
> Kiểm thử tích hợp tạm (Neon thật, `GoogleAuthClient` thật với `OAuth2Client` giả, user tạm đã dọn): **12/12 PASS**. Gồm `email_verified` false hoặc thiếu ⇒ 401 và không tạo user; kịch bản chiếm tài khoản trước bị chặn (mật khẩu cũ ⇒ 401 sau G1); `ACTIVE` giữ mật khẩu; `SUSPENDED` ⇒ 403 không đổi gì; đăng ký Google mới vẫn chạy.
>
> Hộp thoại xác nhận liên kết Google: để sau, cùng đợt với trang hỗ trợ bản B và gói mở rộng (xem "Ngoài phạm vi").

`auth.service.ts` `loginOrRegisterWithGoogle`, nhánh `existingByEmail`: sau `linkGoogleId`, nếu `user.status === "PENDING_VERIFICATION"` thì `user = await markVerified(user.id)`.

⚠️ Chỉ áp cho `PENDING_VERIFICATION`. **Không** gọi `markVerified` khi `SUSPENDED`, vì hàm này đặt `status = ACTIVE` và sẽ vô tình mở khoá.

### B6 — Kiểm tra quản lý người dùng (~30 phút) — ✅ xong 2026-10-07

> `tsc --noEmit` sạch ở server và shared-types. Web còn đúng 3 lỗi đã biết ở `lib/notifications.ts` (mục 8 plan frontend).
>
> Khác plan: không dùng tài khoản ứng viên demo. Thay vào đó chạy một script tích hợp tạm (đã xoá), gồm:
> - dựng Express + Socket.IO thật với router `auth`/`users`/`notifications`/`audit-log`, trên Neon + Redis thật;
> - tạo user tạm `@b6-check.invalid`; token ký bằng `jwtService`;
> - G1 kiểm bằng `googleAuthClient` giả;
> - email không gửi thật, chỉ kiểm nội dung trong `OutboxEvent`;
> - dọn sạch ở cuối: user, outbox, audit log, cờ Redis.
>
> Kết quả **28/28 PASS**, gồm:
> - 2 socket bị ngắt;
> - 401/403 `ACCOUNT_SUSPENDED`; khoá Admin ⇒ 403; khoá/mở khoá lặp ⇒ 409; lý do rỗng ⇒ 400;
> - lý do được escape trong email, link `/support?category=ACCOUNT_SUSPENDED`;
> - U4 về đúng `ACTIVE`/`PENDING_VERIFICATION`;
> - `/admin/activity` có 2 hành động;
> - G1 cả 2 nhánh (`PENDING_VERIFICATION` ⇒ `ACTIVE`; `SUSPENDED` ⇒ 403, vẫn khoá).
>
> Chưa kiểm trên giao diện (chờ frontend).

- `npx tsc --noEmit` ở `apps/server`, `apps/web`, `packages/shared-types` sạch (repo chưa có script `typecheck`).
- Thử bằng tài khoản ứng viên demo:
  - Đang đăng nhập (2 tab) → Admin khoá → request kế tiếp nhận 401 `ACCOUNT_SUSPENDED`, socket bị ngắt.
  - Đăng nhập lại → 403 `ACCOUNT_SUSPENDED`.
  - Email báo khoá có lý do và link hỗ trợ (dev: `ConsoleEmailSender` in ra log, hoặc Resend).
  - Mở khoá → về đúng trạng thái theo U4, có email mở khoá, đăng nhập lại được.
- Khoá Admin ⇒ 403; khoá lặp ⇒ 409.
- Bản ghi `AuditLog` hiện trong "Hoạt động gần đây" của dashboard Admin.

### B7 — Trang hỗ trợ bản A (~1,5 giờ) — ✅ xong 2026-10-07

> Tiến độ 2026-10-07: làm đúng như dưới. `tsc` server sạch, đã build lại `dist` của shared-types. Kiểm thử tích hợp bằng script tạm (Neon + Redis thật, Admin tạm thay cho Admin thật, đã dọn sạch): **23/23 PASS**. Kết quả: DTO sai ⇒ 400 và không tiêu lượt rate limit; cùng email lần 4 ⇒ 429 (email viết hoa tính chung); cùng IP lần 6 ⇒ 429; phản hồi cho email có/không có tài khoản giống hệt nhau; Admin nhận thông báo + push realtime + email trong outbox, ghi đúng trạng thái tài khoản, lời nhắn được escape HTML.
>
> Khác plan một chút: lỗi DB khi gửi thông báo không bị nuốt mà trả 500 (người gửi biết là chưa gửi được); "luôn trả 200" chỉ áp dụng cho việc không tiết lộ email có tài khoản hay không.
>
> **Lưu ý (đã sửa cùng ngày, AD-17 mục 7):** khi đi qua gateway Nginx, Express không bật `trust proxy` và Nginx không gửi `X-Forwarded-For`, nên `req.ip` là IP của Nginx với mọi khách ⇒ giới hạn 5 lần/giờ theo IP thành giới hạn chung cho cả hệ thống. Lỗi này có sẵn từ trước (giới hạn OTP theo IP cũng bị, nên mới đặt 1000/giờ). Cách sửa: thêm `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` vào `infra/nginx/nginx.conf` và `app.set("trust proxy", 1)` trong `main.ts` — cần chủ dự án duyệt vì ảnh hưởng mọi rate limit.
>
> **Đã sửa 2026-10-07** (chủ dự án đồng ý), khác đề xuất ở hai điểm: Nginx dùng `X-Forwarded-For $remote_addr` (ghi đè, bỏ header khách tự gửi) thay vì `$proxy_add_x_forwarded_for`; Express dùng `trust proxy` = `["loopback", "uniquelocal"]` thay vì `1`, để người gọi thẳng cổng 4000 từ Internet không giả được IP. Kiểm bằng script tạm cho Express (4/4 PASS). Chưa chạy `nginx -t` vì Docker không chạy — cần khởi động lại container Nginx để nhận cấu hình mới.


- `modules/support/`:
  - `support.constants.ts`: `SUPPORT_CATEGORIES = ["ACCOUNT_SUSPENDED", "OTHER"]`.
  - `support.dto.ts`: `email` (email hợp lệ), `category`, `message` (trim 20–2000 ký tự).
  - `support.service.ts`, `support.controller.ts`, `support.routes.ts`.
- `submitContact({ email, category, message }, ip)`:
  1. `rateLimiter.consume("support:ip:{ip}", 5, 3600)` và `consume("support:email:{email}", 3, 3600)`; vượt ⇒ 429 "Bạn đã gửi quá nhiều yêu cầu, vui lòng thử lại sau".
  2. Tra `findByEmail(email)` chỉ để ghi `accountStatus` vào nội dung gửi Admin. **Không** trả thông tin này cho người gửi.
  3. `findAdminIds()` → `notifyMany(SUPPORT_CONTACT_RECEIVED, ...)`.
  4. Luôn trả 200 `{ message: "Đã gửi yêu cầu" }`.
- `shared-types`: `SupportContactRequest` (`SupportCategory` đã thêm ở B3).
- `main.ts`: `app.use("/api", supportRouter(container))`.
- Lấy IP giống `auth.controller.ts` (`req.ip ?? "unknown"`).
- Kiểm thử: gửi form 6 lần liên tiếp từ cùng IP ⇒ lần 6 bị 429. Admin nhận thông báo trong app (realtime) và email.

### Ước lượng tổng

B0–B6 khoảng 4,5 giờ, B7 khoảng 1,5 giờ. Frontend tương ứng xem plan frontend.

## Ngoài phạm vi đợt này

U5 (ẩn tin khi khoá Employer), trang chi tiết người dùng, bản B/C trang hỗ trợ, các gói "Mở rộng 1–3", và hộp thoại xác nhận liên kết Google (cùng đợt bản B). Lộ trình xem file quyết định (mục "Lộ trình mở rộng trang quản lý người dùng") và `docs/01-project/FEATURE_BACKLOG.md`.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
