# Quản lý người dùng — Mở rộng 1 (Backend)

Nối tiếp `docs/06-backend/admin-users-support/PLAN.md` (bản đầu, AD-17). Quyết định kiến trúc mới: `docs/02-architecture/ARCHITECTURE_DECISIONS.md` **AD-18** (thu hồi mọi phiên bằng mốc thời gian). Lộ trình gốc: `docs/temp/ADMIN_USERS_AND_SIMILAR_JOBS_DECISIONS.md`, mục "Lộ trình mở rộng trang quản lý người dùng".

Song song: `docs/05-frontend/phases/admin-users-ext1/PLAN.md`.

**Trạng thái: ĐÃ DUYỆT (2026-10-07).** Xong cả 4 đợt backend (B0–B7, B9; B8 chạy theo từng đợt). Tiếp theo: frontend, bắt đầu F1 + F2.

## Khác lộ trình gốc

Lộ trình ghi Mở rộng 1 "không migration, ~1 ngày". Khi lập kế hoạch thì khác ở 3 điểm:

| Lộ trình ghi | Thực tế | Hệ quả |
|---|---|---|
| Buộc đăng xuất "dùng lại cơ chế Redis của U1" | Refresh token không lưu trạng thái, nên cờ khoá U1 không dùng được. Cần mốc thời gian so với `iat` của token. Chủ dự án chọn lưu mốc trong **DB + Redis** (2026-10-07). | **Có migration**: cột `User.sessionsRevokedAt` |
| "Gửi link đặt lại mật khẩu" | Luồng quên mật khẩu dùng OTP 5 phút, không có link. Frontend chưa có trang quên mật khẩu. | Làm trang `/forgot-password` (E1). Email của Admin chỉ dẫn tới trang đó. |
| "Gửi lại OTP" cho Admin | Người dùng đã tự gửi lại được (`LoginForm`, `OtpForm`). | Bỏ, chỉ giữ "Kích hoạt thủ công" (E3). |

Thêm 2 giá trị `NotificationType` (E1, E3) vào cùng migration, vì đằng nào cũng chạy migration. Xuất CSV đã chuyển sang "Để sau".

Ước lượng mới: backend ~8 giờ, frontend ~11 giờ, tổng **khoảng 2,5 ngày** (lộ trình ghi 1 ngày).

## Quyết định đã chốt (2026-10-07)

| # | Quyết định |
|---|---|
| E1 | Trang công khai `/forgot-password` 2 bước, dùng API có sẵn (`/auth/forgot-password`, `/auth/reset-password`). Nút Admin "Gửi hướng dẫn đặt lại mật khẩu" chỉ gửi thông báo + email có link tới trang này; người dùng tự xin OTP. Không gửi OTP thay người dùng (OTP chỉ sống 5 phút). |
| E2 | **Buộc đăng xuất** mọi thiết bị, không khoá. Giữ cả nút Admin lẫn phần tự động khi người dùng đặt lại mật khẩu. Lý do không bắt buộc. Ghi `AuditLog`, ngắt socket, không gửi thông báo. Cách làm: mốc `sessionsRevokedAt` trong DB (nguồn sự thật, `refresh()` đọc) + khoá Redis TTL bằng thời hạn access token (`authenticate`, socket đọc). Chi tiết ở AD-18. |
| E3 | **Kích hoạt thủ công** tài khoản `PENDING_VERIFICATION`, dùng sau khi người dùng liên hệ `/support`. Lý do bắt buộc, hộp xác nhận có cảnh báo, ghi `AuditLog`, báo người dùng (thông báo + email). Không làm nút gửi lại OTP. |
| E4 | Trang chi tiết **Ứng viên**: tài khoản + lịch sử thao tác của Admin; hồ sơ chỉ xem (họ tên, học vấn, kỹ năng, có bật "cho phép tìm thấy" không); đơn ứng tuyển (tin, công ty, trạng thái); lời mời đã nhận; CV chỉ tên file và ngày tải, **không** cho tải. |
| E5 | Trang chi tiết **Employer**: tài khoản + lịch sử; công ty (link `/admin/companies/[id]`); có phải quản trị công ty không; số tin theo trạng thái. |
| E6 | Danh sách đổi sang **phân trang theo số trang** (20 dòng/trang, có tổng số). Sắp xếp: mới nhất (mặc định), cũ nhất, email A–Z. |
| E7 | **Khoá / mở khoá hàng loạt**, tối đa 20 người mỗi lần, chung một lý do. Thành công từng phần: mỗi người một transaction, trả kết quả theo từng người. |
| E8 | Admin là đối tượng: xem được trang chi tiết, mọi thao tác bị tắt (backend 403), cùng quy tắc U2. |
| E9 | **Đổi mật khẩu khi đang đăng nhập** (thêm 2026-10-08): thẻ "Đổi mật khẩu" trên trang Cài đặt (cả 3 vai trò) dùng lại luồng OTP có sẵn (`/auth/forgot-password` + `/auth/reset-password`) với email của chính người đó. **Không** thêm API `change-password` (nhập mật khẩu cũ). Lý do: backend không phải sửa, không thêm chỗ phải chống dò mật khẩu cũ; ai cầm được phiên đăng nhập cũng không đổi được mật khẩu nếu không vào được email. Cái giá: người dùng phải mở email lấy mã. Đổi xong thì mọi thiết bị, kể cả thiết bị đang dùng, bị đăng xuất (như `resetPassword`). Backend chỉ thêm `hasPassword` vào `GET /users/me` (B9) để ẩn thẻ với tài khoản chỉ dùng Google. |
| — | Thêm bộ lọc: phương thức đăng nhập (mật khẩu / Google / cả hai), đã xác thực email hay chưa, khoảng ngày tạo. Ô tìm kiếm tìm cả email, họ tên ứng viên, tên công ty. |

### Điểm bổ sung khi lập kế hoạch (cần chủ dự án xác nhận khi duyệt)

| # | Nội dung | Lý do |
|---|---|---|
| P1 | Kích hoạt thủ công đặt cả `status = ACTIVE` **và** `emailVerifiedAt = now`, `AuditLog.metadata.verifiedBy = "ADMIN"`. Hộp xác nhận ghi rõ: chỉ kích hoạt khi bạn đã trao đổi qua email với **chính địa chỉ này**. | Không ghi `emailVerifiedAt` thì lần khoá rồi mở khoá sau sẽ đưa người đó về `PENDING_VERIFICATION` (U4). Cảnh báo cần thiết vì ô email của form `/support` không được xác minh: kẻ xấu đăng ký trước bằng email nạn nhân (AD-17 mục 6) rồi nhờ Admin kích hoạt hộ. Admin trả lời qua email thì chỉ chủ thật của địa chỉ nhận được. |
| P2 | `resetPassword` với email không có tài khoản trả **400 "Invalid or expired OTP"** như sai mã, thay vì 404. | Hiện 404 cho biết email có tài khoản hay không. Trang `/forgot-password` sắp mở công khai nên phải bịt. `forgotPassword` đã không tiết lộ. |
| P3 | Buộc đăng xuất chỉ cho tài khoản `ACTIVE` (khác ⇒ 409). | `PENDING_VERIFICATION` chưa đăng nhập được; `SUSPENDED` đã bị chặn bằng cờ khoá và `refresh()`. |
| P4 | "Gửi hướng dẫn đặt lại mật khẩu": tài khoản không có mật khẩu (chỉ Google) ⇒ 409 `USER_HAS_NO_PASSWORD`; tối đa 3 lần/giờ cho mỗi người nhận ⇒ 429. | `forgotPassword` bỏ qua tài khoản chỉ có Google, gửi hướng dẫn cũng vô ích. Giới hạn để không spam hộp thư người dùng. |
| P5 | Thao tác hàng loạt chỉ gồm khoá và mở khoá, không có buộc đăng xuất / kích hoạt hàng loạt. | E7 chỉ nêu khoá; hai thao tác kia hiếm và cần xem từng người. |
| P6 | Trang chi tiết ứng viên trả tối đa 20 đơn / 20 lời mời / 20 dòng lịch sử mới nhất, kèm tổng số. | Đủ để Admin nắm tình hình mà không cần phân trang thêm. |
| P7 | Token bị thu hồi ⇒ 401 mã `SESSION_REVOKED` (ở `authenticate` và `refresh()`). Frontend đợt này không hiện thông báo riêng: vẫn rơi vào luồng refresh thất bại ⇒ về trang chủ, như khi bị khoá. | Mã có sẵn để sau này hiện "Phiên đăng nhập đã kết thúc" mà không phải sửa backend. |
| P8 | Mốc lưu tới giây; từ chối token có `iat <= mốc`. | `iat` của JWT tính bằng giây. Chọn `<=` để token cấp cùng giây với lúc thu hồi cũng bị chặn; cái giá là người dùng đăng nhập lại trong đúng giây đó phải đăng nhập lần nữa (gần như không xảy ra). |

## Phần 1 — Công nghệ / kiến trúc sử dụng

- Không thêm dependency. Dùng lại: Prisma transaction, `AuditLogService.record(entry, tx)`, `NotificationsService.notify`, `RedisRateLimiter`, `RealtimeNotifier.disconnectUser` (AD-17), mẫu port + adapter Redis như `AccountSuspensionStore`.
- **Port mới `SessionRevocationStore`** (`shared/ports/`) + adapter `infrastructure/redis-session-revocation-store.ts`: khoá `sessions-revoked-at:{userId}`, giá trị epoch giây, TTL = `JWT_ACCESS_EXPIRY` đổi ra giây. Đăng ký trong `container.ts` cạnh `accountSuspensionStore`.
- **`SessionRevocationService`** (`modules/auth/session-revocation.service.ts`), đăng ký trong `container.ts` vì cả `auth` (đặt lại mật khẩu) lẫn `users` (nút Admin) đều dùng:
  - `revokeInTx(userId, tx): Promise<number>` — ghi `User.sessionsRevokedAt = now` trong transaction của bên gọi, trả mốc (giây).
  - `propagate(userId, revokedAtSec)` — gọi **sau commit**: ghi Redis rồi `disconnectUser`. Lỗi chỉ log (kẽ hở tối đa = thời hạn access token, như U1).
- Hàm thuần `isIssuedBeforeRevocation(iat, revokedAtSec)` (P8) dùng chung cho `authenticate`, socket và `refresh()`.
- `shared/config/duration.ts`: `durationToSeconds("15m")` cho các dạng `<số>`, `<số>s|m|h|d`. `env.ts` thêm kiểm định dạng cho `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY`, sai thì server không khởi động (thay vì TTL sai lặng lẽ).
- API mới vẫn nằm trong module `users` (AD-17 mục 3).
- **Migration M2** `<timestamp>_add_sessions_revoked_at_and_account_notifications`:
  ```sql
  ALTER TABLE "users" ADD COLUMN "sessionsRevokedAt" TIMESTAMP(3);
  ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_ACTIVATED';
  ALTER TYPE "NotificationType" ADD VALUE 'PASSWORD_RESET_SUGGESTED';
  ```
  Cột cho phép null, không backfill. Không dùng giá trị enum mới trong cùng file (AD-16 mục 8).

## Phần 2 — Liên kết giữa các phần

```text
Buộc đăng xuất (Admin) ─► POST /admin/users/:id/revoke-sessions { reason? }
                           UsersService.revokeSessions
                           ├─ $transaction: SessionRevocationService.revokeInTx (cột sessionsRevokedAt)
                           │                AuditLog USER_SESSIONS_REVOKED {reason?}
                           └─ sau commit: SessionRevocationService.propagate ─► Redis (TTL 15') + disconnectUser

Đặt lại mật khẩu (người dùng) ─► POST /auth/reset-password
                           AuthService.resetPassword
                           ├─ $transaction: updatePassword + revokeInTx
                           └─ sau commit: propagate

Mọi request  ─► authenticate ─► blacklist(jti) ─► suspended? ─► revokedAt(sub) ≥ iat? ─► 401 SESSION_REVOKED
Socket       ─► io.use       ─► blacklist(jti) ─► suspended? ─► revokedAt(sub) ≥ iat? ─► từ chối
/auth/refresh ─► blacklist(jti) ─► findById (đã có) ─► status ACTIVE? ─► sessionsRevokedAt ≥ iat? ─► 401 SESSION_REVOKED

Kích hoạt thủ công ─► POST /admin/users/:id/activate { reason }
                      $transaction: setStatus(PENDING_VERIFICATION → ACTIVE) + emailVerifiedAt
                                    AuditLog USER_ACTIVATED + notify(ACCOUNT_ACTIVATED)

Gửi hướng dẫn đặt lại mật khẩu ─► POST /admin/users/:id/send-password-reset-guide
                      rateLimiter (3/giờ/người nhận) ─► $transaction: AuditLog USER_PASSWORD_RESET_GUIDE_SENT
                                                                      notify(PASSWORD_RESET_SUGGESTED) ─► email link /forgot-password

Hàng loạt ─► POST /admin/users/bulk/suspend { userIds, reason } ─► lặp UsersService.suspend từng người
             POST /admin/users/bulk/reactivate { userIds }      ─► lặp UsersService.reactivate
             ⇒ { results: [{ userId, ok, status?, message? }] }

Chi tiết ─► GET /admin/users/:id ─► UserRepository.findDetailForAdmin (1 truy vấn lồng + _count)
                                   + groupBy tin theo trạng thái (Employer)
                                   + AuditLogRepository.listByEntity("User", id, 20) + email người thao tác
```

**Vì sao Redis chỉ cần TTL 15 phút** (AD-18): refresh token cũ luôn bị `refresh()` chặn bằng cột DB. Redis chỉ phải chặn access token còn sống, mà access token cấp trước mốc sẽ tự hết hạn sau tối đa `JWT_ACCESS_EXPIRY`. Khi khoá Redis không còn, `authenticate` **không** hỏi lại DB: thiếu khoá nghĩa là không còn gì cần chặn.

**Tải DB:** `refresh()` đã đọc user từ DB để kiểm `status`; đọc thêm một cột trong cùng truy vấn, không phát sinh truy vấn mới. `authenticate` thêm một lệnh `GET` Redis (tổng 3, cùng loại với 2 lệnh đang có).

## Phần 3 — Các bước thực hiện

**Gộp đợt (chủ dự án chọn 2026-10-07).** Mỗi đợt xong dừng báo cáo, chạy `tsc`, và chạy phần kịch bản B8 của đợt đó.

| Đợt | Bước | Lý do | Kiểm (mục B8) | Ước lượng |
|---|---|---|---|---|
| 1 | B0 | Để riêng: kết thúc ở chỗ chờ chủ dự án đồng ý áp Neon. Các bước sau cần cột và enum mới trong Prisma Client. | `migrate diff`, `validate`, `status` | ~40 phút |
| 2 | B1 + B2 | Cùng cơ chế thu hồi phiên; B2 chỉ gọi lại `SessionRevocationService`. | 1, 2 | ~2 giờ |
| 3 | B3 + B6 + B7 | Thao tác ghi trong `users.service`; B6 cần thông báo của B3, B7 lặp `suspend`/`reactivate`. | 3, 4, 7 | ~2,5 giờ |
| 4 | B4 + B5 + B9 | API chỉ đọc, cùng sửa `user.repository` và kiểu `AdminUser*`. Để cuối vì B4 (cursor → số trang) làm web lỗi biên dịch; xong thì chuyển ngay sang F2 frontend. | 5, 6 | ~2,5 giờ |

Không gộp B0 vào đợt 2 (migration lẫn vào code, khó dừng đúng chỗ để duyệt) và không đưa B4 lên trước (web lỗi biên dịch suốt đợt 2–3).

### B0 — AD-18 + Migration M2 (~40 phút, cần chủ dự án đồng ý trước khi áp Neon)

1. AD-18 đã viết ở trạng thái "CHỜ DUYỆT"; đổi sang "ĐÃ DUYỆT" khi chủ dự án duyệt plan.
2. `schema.prisma`: `User.sessionsRevokedAt DateTime?` (chú thích `// AD-18`), 2 giá trị `NotificationType`.
3. Viết tay `migration.sql` (3 câu ở Phần 1).
4. Kiểm chứng **không** dùng `DATABASE_URL` làm shadow (memory dự án, D6 dashboard): nếu có shadow DB tạm riêng thì `prisma migrate diff --from-migrations ... --shadow-database-url <URL_DB_TAM>` phải ra rỗng; nếu không (như lần AD-17) thì `prisma migrate diff --from-schema-datamodel <schema HEAD> --to-schema-datamodel prisma/schema.prisma --script` phải ra đúng 3 câu trên. `prisma validate`, `prisma migrate status` (chỉ đọc).
5. Hỏi chủ dự án, rồi mới `npm run db:deploy` và `prisma generate`.

**Kết quả đợt 1 (2026-10-07):** migration `20261007180000_add_sessions_revoked_at_and_account_notifications`. Không có shadow DB tạm nên kiểm bằng `migrate diff` từ schema HEAD sang schema mới: ra đúng 3 câu. `prisma validate` đạt. Không chạy `prisma format` vì lệnh này căn lại cả các model không liên quan. `migrate status` đọc Neon nên chủ dự án tự chạy.

### B1 — Lõi thu hồi phiên (~1,5 giờ)

- `shared/config/duration.ts` + kiểm định dạng trong `env.ts`.
- `shared/ports/SessionRevocationStore.ts`: `markRevoked(userId, revokedAtSec)`, `getRevokedAt(userId): Promise<number | null>`.
- `infrastructure/redis-session-revocation-store.ts`: `SET key value EX <ttl>`; TTL tính một lần trong constructor từ `config.JWT_ACCESS_EXPIRY`.
- `modules/auth/session-revocation.service.ts`: `revokeInTx`, `propagate`, `isIssuedBeforeRevocation`.
- `user.repository.ts`: `markSessionsRevoked(id, at, tx)`.
- `container.ts`: đăng ký `sessionRevocationStore`, `sessionRevocationService`; thêm vào `Cradle`.
- `authenticate.ts`: sau cờ khoá, `getRevokedAt(payload.sub)` ⇒ `AppError(401, "Session has been revoked", "SESSION_REVOKED")` nếu token cấp trước mốc.
- `infrastructure/socket/index.ts`: kiểm tương tự trong `io.use` (đọc `decoded.iat`).
- `auth.service.ts` `refresh()`: sau kiểm `status`, so `payload.iat` với `user.sessionsRevokedAt` ⇒ 401 `SESSION_REVOKED`.

### B2 — Đặt lại mật khẩu tự buộc đăng xuất + bịt dò email (~20 phút)

- `resetPassword`: `updatePassword` + `revokeInTx` trong một transaction (`updatePassword` nhận thêm `tx?`), sau commit `propagate`.
- P2: thay `requireUserByEmail` (404) bằng lỗi 400 giống sai OTP.

**Kết quả đợt 2 (2026-10-08):** B1 + B2 xong. Script tạm (Express + Socket.IO thật, Neon + Redis thật) đạt 19/19 mục của B8 mục 1–2, đã dọn user/khoá tạm và xoá script. Khác plan:

- `durationToSeconds` **bắt buộc có đơn vị** (`s|m|h|d`), không nhận số trơn: jsonwebtoken đọc chuỗi bằng `ms`, nên `"60"` là 60 mili giây chứ không phải 60 giây; nhận số trơn thì TTL Redis sẽ lệch với thời hạn token thật.
- `npx tsc --noEmit` còn lỗi ở `modules/notifications` (bảng template/nhóm thiếu `ACCOUNT_ACTIVATED`, `PASSWORD_RESET_SUGGESTED`, và `shared-types` chưa có 2 giá trị này). Nguyên nhân: Prisma Client đã sinh lại sau M2. Hết lỗi khi làm B3 ở đợt 3. `tsx` (dev server) không kiểm kiểu nên vẫn chạy được. Ngoài `notifications` không còn lỗi nào.
- P2 chỉ sửa `resetPassword`. `resendOtp` / `verifyOtp` vẫn trả 404 khi không có email (luồng đăng ký, ngoài phạm vi).

### B3 — Thông báo `ACCOUNT_ACTIVATED`, `PASSWORD_RESET_SUGGESTED` (~30 phút)

- `notification.types.ts`: `ACCOUNT_ACTIVATED: Record<string, never>`, `PASSWORD_RESET_SUGGESTED: Record<string, never>` (dạng cụ thể theo cách các payload rỗng đang khai báo, nếu đã có).
- `templates/notification-templates.ts`:
  - `ACCOUNT_ACTIVATED`: "Tài khoản của bạn đã được kích hoạt", nút "Đăng nhập" → `/login`.
  - `PASSWORD_RESET_SUGGESTED`: "Hướng dẫn đặt lại mật khẩu", nội dung: quản trị viên gửi hướng dẫn theo yêu cầu hỗ trợ; mật khẩu hiện tại chưa thay đổi; nếu không yêu cầu thì bỏ qua. Nút "Đặt lại mật khẩu" → `/forgot-password` (không đưa email lên URL).
- `notification-groups.ts`: cả 2 vào nhóm `ACCOUNT`. `packages/shared-types`: thêm 2 giá trị vào union `NotificationType`.
- `audit-log.actions.ts`: `USER_SESSIONS_REVOKED`, `USER_ACTIVATED`, `USER_PASSWORD_RESET_GUIDE_SENT`.

**Kết quả đợt 3 (2026-10-08):** B3 + B6 + B7 xong. `npx tsc --noEmit` ở `apps/server` sạch (hết lỗi `notifications` của đợt 2); `packages/shared-types` đã build lại `dist`. Script tạm (Express thật, Neon + Redis thật, Socket.IO no-op) đạt 32/32: B8 mục 3, 4, 7 và route buộc đăng xuất của Admin (không body, có lý do, `SUSPENDED` ⇒ 409, không gửi thông báo). Đã dọn user / `AuditLog` / `OutboxEvent` / khoá Redis tạm và xoá script. Khác plan:

- Ba route B6 trả `AdminUserListItem` (như `suspend`), không phải `AdminUserDetail["account"]`: kiểu này thuộc B5 (đợt 4). Khi làm B5 sẽ quyết có đổi hay không; frontend tải lại trang chi tiết sau thao tác nên không phụ thuộc.
- `send-password-reset-guide` đọc thêm `findById` để biết có `passwordHash` hay không (`AdminUserRow` chưa có). B4 thêm `hasPassword` vào danh sách thì có thể bỏ lần đọc này.
- Hàng loạt: lỗi không phải `AppError` (vd. mất kết nối DB) cũng ghi vào `results` với `status: 500` và log, thay vì ném 500 cả request, vì những người trước đó đã xử lý xong.
- Route `bulk/*` đăng ký **trước** `/:id/*` (nếu không `:id` khớp chữ `bulk`).
- `revoke-sessions` nhận request không có body (Express 5 để `req.body` là `undefined`); chuỗi lý do rỗng sau trim coi như không nhập, khi đó `AuditLog.metadata` là `null`.
- `packages/shared-types` thêm `RevokeSessionsRequest`, `ActivateUserRequest`, `BulkSuspendUsersRequest`, `BulkReactivateUsersRequest`, `AdminBulkActionResult`, `AdminBulkActionResponse`.
- **Đổi tên sau khi báo cáo (2026-10-08, chủ dự án duyệt):** `send-password-reset` → `send-password-reset-guide`, `USER_PASSWORD_RESET_SENT` → `USER_PASSWORD_RESET_GUIDE_SENT`, khoá rate limit `admin-pw-reset-guide:{userId}`. Lý do: tên cũ dễ hiểu nhầm là Admin đặt lại mật khẩu hộ. Loại thông báo `PASSWORD_RESET_SUGGESTED` giữ nguyên (đã nằm trong enum DB).
- `apps/web` lỗi biên dịch ở `lib/notifications.ts` (2 map `Record<NotificationType, …>` thiếu 2 loại mới). Đã có trong plan frontend; sửa cùng đợt frontend.

### B4 — Danh sách: phân trang số trang, sắp xếp, bộ lọc, tìm theo tên (~1 giờ)

- `users.dto.ts` `adminListUsersQuerySchema`:
  - giữ `role`, `status`, `q` (tối đa 100);
  - thêm `loginMethod` (`PASSWORD` | `GOOGLE` | `BOTH`), `emailVerified` (`"true"` | `"false"`), `createdFrom`, `createdTo` (`YYYY-MM-DD`, theo giờ Việt Nam như các module khác), `sort` (`newest` | `oldest` | `email`, mặc định `newest`), `page` (số nguyên ≥ 1, mặc định 1);
  - bỏ `cursor`.
- `user.repository.ts` `listForAdmin`: `q` khớp `email` **hoặc** `candidate.fullName` **hoặc** `employer.company.name` (không phân biệt hoa thường); `loginMethod`: `PASSWORD` = có `passwordHash`, không `googleId`; `GOOGLE` = ngược lại; `BOTH` = có cả hai. `orderBy` theo `sort`, luôn thêm `id` để thứ tự ổn định. `skip/take` + `count` trong `$transaction([...])`.
- `packages/shared-types`: `AdminUserListResponse { items, total, page, pageSize }`; `AdminUserListQuery` cập nhật theo DTO. `AdminUserListItem` thêm `hasPassword`, `hasGoogle` (frontend tắt nút "Gửi hướng dẫn đặt lại mật khẩu" theo P4).
- **Thay đổi không tương thích ngược** (cursor → page): frontend sửa cùng đợt (F2 plan frontend). Link `/admin/users?q=<email>` trong thông báo `SUPPORT_CONTACT_RECEIVED` vẫn chạy.

### B5 — Trang chi tiết (~1,5 giờ)

`GET /admin/users/:id` → `AdminUserDetail`:

- `account`: các cột của `AdminUserListItem` + `sessionsRevokedAt`.
- `history`: tối đa 20 bản ghi `AuditLog` (`entityType = "User"`, `entityId = id`) mới nhất: `action`, `summary`, `reason` (`readReason`), `actorEmail`, `at`. Cần `AuditLogRepository.listByEntity(entityType, entityId, limit)`.
- `candidate` (chỉ khi `role = CANDIDATE`, ngược lại `null`):
  - `profile`: `fullName`, `headline`, `isOpenToOutreach`, `educations` (tên trường, tên ngành, `degree`, `startYear`, `endYear`, `isCurrent`), `skills` (tên).
  - `cvs`: `id`, `fileName`, `uploadedAt`, `isDefault`, `isHidden`. **Không** trả `fileUrl`.
  - `applications`: `{ total, items }`, mỗi dòng: `id`, tin (`id`, `title`), công ty (`id`, `name`), `status`, `createdAt`.
  - `invitations`: `{ total, items }`, mỗi dòng: `id`, tin, công ty, `status`, `createdAt`, `expiresAt`.
  - Không trả `phone`, `dateOfBirth` (Admin không cần để kiểm duyệt; giống cách AD-15 ẩn thông tin liên hệ).
- `employer` (chỉ khi `role = EMPLOYER`): `company { id, name, verificationStatus }`, `isCompanyAdmin`, `title`, `jobPostCounts: Record<JobPostStatus, number>` (`groupBy` theo `employerId`, trạng thái không có tin = 0).
- Admin xem Admin (E8): trả `account` + `history`, hai khối kia `null`.
- 404 nếu không có user.
- **Truy vấn chéo bảng nằm trong `user.repository`** (chủ dự án chọn giữ, 2026-10-07): `findDetailForAdmin` đọc thẳng `Application`, `CandidateOutreachInvitation`, `JobPost`, `Cv` qua quan hệ Prisma thay vì gọi module khác, giống module `dashboard`. Đặt chú thích đầu hàm giải thích lý do: API chỉ đọc cho Admin, không ghi bảng của module khác, nên không cần đi qua service của module đó; nếu module kia đổi cấu trúc bảng thì sửa ở đây.

### B9 — `hasPassword` cho `GET /users/me` (E9, ~10 phút, làm cùng đợt 4)

- `packages/shared-types` `UserProfile`: thêm `hasPassword: boolean` (tài khoản có `passwordHash`).
- `UsersService.getProfile`: `hasPassword: user.passwordHash !== null` (đã đọc đủ cột qua `findById`, không thêm truy vấn). Không trả hash.
- Thêm trường, không đổi trường cũ ⇒ web không lỗi biên dịch.

**Kết quả đợt 4 (2026-10-08):** B4 + B5 + B9 xong. `npx tsc --noEmit` ở `apps/server` sạch; `packages/shared-types` đã build lại `dist`. Script tạm (Express thật, Neon + Redis thật, Socket.IO no-op) đạt 59/59: B8 mục 5, 6 và B9 (`/users/me`), kèm lại "gửi hướng dẫn" sau khi bỏ lần đọc `findById`. Đã dọn user / danh mục / công ty / `AuditLog` / `OutboxEvent` / khoá Redis tạm và xoá script. Khác plan:

- **Web vẫn biên dịch được** (plan dự đoán sẽ lỗi): hook danh sách tự khai kiểu `PaginatedResponse` phía client. Hệ quả lúc chạy, từ giờ tới khi xong F2: trang danh sách chỉ hiện 20 người đầu, nút "Tải thêm" biến mất (không còn `nextCursor`); bộ lọc cũ vẫn chạy. `apps/web` chỉ còn 2 lỗi cũ ở `lib/notifications.ts` (F1).
- `ADMIN_LIST_SELECT` đọc thêm `passwordHash`, `googleId` để tính `hasPassword` / `hasGoogle`; hàm chuyển đổi chỉ trả hai giá trị boolean (script kiểm không có chuỗi `passwordHash` / `googleId` trong response). Nhờ vậy `send-password-reset-guide` bỏ được lần đọc `findById` (ghi chú ở đợt 3).
- Ba route B6 vẫn trả `AdminUserListItem`. `AdminUserDetail.account` có kiểu `AdminUserAccount` = `AdminUserListItem` + `sessionsRevokedAt`; frontend tải lại chi tiết sau thao tác nên không cần đổi.
- `candidate.profile` là `null` khi ứng viên chưa có dòng `Candidate` (dòng này chỉ được tạo khi người dùng mở hồ sơ, tải CV hoặc lưu tin); khi đó các danh sách rỗng, `total` = 0. `employer` là `null` khi tài khoản Employer chưa gắn công ty (chưa có dòng `Employer`). Plan chưa nói hai trường hợp này.
- `history` trả `{ total, items }` như đơn ứng tuyển / lời mời (P6). CV không giới hạn 20 (mỗi ứng viên ít CV). Học vấn: đang học trước, rồi năm bắt đầu giảm dần; kỹ năng theo tên A–Z.
- DTO: `page` tối đa 10.000 (tránh `skip` vượt kiểu Int của Prisma ⇒ 500); `q` rỗng sau trim coi như không lọc; ngày không có thật (vd. `2026-02-31`) hoặc `createdFrom` sau `createdTo` ⇒ 400; `cursor` do web cũ gửi bị bỏ qua (zod loại trường lạ) ⇒ trả trang 1. Trang vượt quá tổng ⇒ 200, `items` rỗng, `total` thật.
- `AdminUserListQuery.emailVerified` là `boolean` (trên URL là `"true"` / `"false"`).
- Thêm `AuditLogRepository.listByEntity(entityType, entityId, limit)` (dùng index `[entityType, entityId]` có sẵn); `UserRepository.findDetailForAdmin`, `countJobPostsByStatus`.
- `packages/shared-types` thêm `AdminUserLoginMethod`, `AdminUserSort`, `AdminUserListResponse`, `AdminLimitedList`, `AdminUserAccount`, `AdminUserHistoryEntry`, `AdminUserEducation`, `AdminUserCandidateProfile`, `AdminUserCv`, `AdminUserJobRef`, `AdminUserCompanyRef`, `AdminUserApplication`, `AdminUserInvitation`, `AdminUserCandidateDetail`, `AdminUserEmployerDetail`, `AdminUserDetail`; `AdminUserListItem` thêm `hasPassword`, `hasGoogle`; `UserProfile` thêm `hasPassword`. `PaginatedResponse` giữ nguyên (module khác vẫn dùng).

### B6 — Thao tác trên một người (~1 giờ)

Tất cả dùng `requireManageableUser` (404 / 403 với Admin, E8). Đổi message 403 thành chung: "Admin accounts cannot be managed here".

| Route | Body | Kiểm | Làm |
|---|---|---|---|
| `POST /admin/users/:id/revoke-sessions` | `{ reason?: string }` (trim, tối đa 500) | `ACTIVE`, ngược lại 409 (P3) | Phần 2. Trả `AdminUserDetail["account"]`. |
| `POST /admin/users/:id/activate` | `{ reason: string }` (1–500) | `PENDING_VERIFICATION`, ngược lại 409 | `setStatus` có điều kiện + `emailVerifiedAt = now` (P1) trong `updateMany`; `AuditLog USER_ACTIVATED {reason, verifiedBy: "ADMIN"}`; `notify(ACCOUNT_ACTIVATED)`. Cùng transaction. |
| `POST /admin/users/:id/send-password-reset-guide` | — | có `passwordHash` (409 `USER_HAS_NO_PASSWORD`); không `SUSPENDED` (409); rate limit `admin-pw-reset-guide:{userId}` 3/giờ (429) | `AuditLog USER_PASSWORD_RESET_GUIDE_SENT` + `notify(PASSWORD_RESET_SUGGESTED)` trong transaction. |

`summary` tiếng Việt: "Buộc đăng xuất {email}", "Kích hoạt thủ công {email}", "Gửi hướng dẫn đặt lại mật khẩu cho {email}".

### B7 — Hàng loạt (~45 phút)

- `bulkSuspendSchema`: `userIds` mảng chuỗi 1–20 phần tử, không trùng; `reason` như `suspendUserSchema`. `bulkReactivateSchema`: `userIds`.
- `UsersService.bulkSuspend(adminId, userIds, reason)` / `bulkReactivate`: lặp **tuần tự** gọi `suspend` / `reactivate` có sẵn (mỗi người một transaction, thông báo, cờ Redis, ngắt socket như cũ); bắt `AppError` từng người.
- Trả 200 `AdminBulkActionResponse { results: { userId, ok: boolean, status?: number, message?: string }[] }`. Không có người nào thành công vẫn trả 200 (kết quả nằm trong `results`).
- Route: `POST /admin/users/bulk/suspend`, `POST /admin/users/bulk/reactivate`.

### B8 — Kiểm tra (~1 giờ, chia theo đợt ở bảng "Gộp đợt")

- `npx tsc --noEmit` ở `apps/server`, `packages/shared-types` (build lại `dist`), `apps/web` (sẽ lỗi ở chỗ dùng cursor cho tới F2 frontend — ghi rõ khi báo cáo).
- Script tích hợp tạm như B6 đợt trước (Express + Socket.IO thật, Neon + Redis thật, user tạm `@ext1-check.invalid`, email chỉ kiểm trong `OutboxEvent`, dọn sạch cuối script, xoá script sau khi chạy):
  1. Buộc đăng xuất: access token cũ ⇒ 401 `SESSION_REVOKED`; refresh token cũ ⇒ 401 `SESSION_REVOKED`; socket bị ngắt và kết nối lại bằng token cũ bị từ chối; đăng nhập lại (sau ít nhất 1 giây, P8) ⇒ token mới dùng được; TTL khoá Redis ≈ `JWT_ACCESS_EXPIRY`; xoá khoá Redis bằng tay ⇒ refresh token cũ vẫn bị chặn (nhờ cột DB).
  2. Đặt lại mật khẩu ⇒ token cũ bị chặn như trên; email không tồn tại ⇒ 400 giống sai OTP (P2).
  3. Kích hoạt thủ công: `ACTIVE` + `emailVerifiedAt`; lần 2 ⇒ 409; Admin ⇒ 403; có thông báo + email.
  4. Gửi hướng dẫn: tài khoản chỉ Google ⇒ 409; lần 4 trong giờ ⇒ 429; email có link `/forgot-password`.
  5. Danh sách: từng bộ lọc, `q` theo tên ứng viên và tên công ty, 3 kiểu sắp xếp, `total` đúng, trang 2.
  6. Chi tiết: ứng viên (không có `fileUrl`, `phone`), Employer (đếm tin), Admin (2 khối `null`).
  7. Hàng loạt: 3 người, trong đó 1 đã khoá và 1 Admin ⇒ 1 `ok`, 1 409, 1 403; 21 người ⇒ 400.

## Ước lượng tổng

B0 40 phút · B1 1,5 giờ · B2 20 phút · B3 30 phút · B4 1 giờ · B5 1,5 giờ · B6 1 giờ · B7 45 phút · B8 1 giờ · B9 10 phút ⇒ **khoảng 8 giờ**.

## Ngoài phạm vi

- Thông báo riêng "Phiên đăng nhập đã kết thúc" khi bị buộc đăng xuất (mã `SESSION_REVOKED` đã có sẵn, P7).
- API `change-password` (đổi bằng mật khẩu cũ, không cần OTP): E9 chọn dùng luồng OTP. Nếu sau này cần nhanh hơn thì thêm được mà không ảnh hưởng phần đã làm (cùng gọi `updatePassword` + `revokeInTx`), nhớ giới hạn số lần nhập sai mật khẩu cũ.
- Danh sách phiên / đăng xuất từng thiết bị: cần lưu từng refresh token, làm cùng đợt bỏ `localStorage` (xem dưới).
- Mở rộng 2, 3 và xuất CSV: theo lộ trình.

## Liên quan backlog: bỏ token khỏi `localStorage`

Mục "Bỏ token khỏi `localStorage`" trong `docs/01-project/FEATURE_BACKLOG.md` **không** làm hỏng cơ chế của đợt này: việc kiểm `iat` với `sessionsRevokedAt` không phụ thuộc token nằm ở đâu. Khi làm đợt đó:

- `refresh()` đọc refresh token từ cookie thay vì body; khi trả 401 `SESSION_REVOKED` thì kèm lệnh xoá cookie.
- Nếu thêm quản lý phiên (lưu từng refresh token, xoay vòng), buộc đăng xuất = xoá mọi phiên của user; vẫn giữ khoá Redis của AD-18 để chặn access token còn sống. Chỉ thay phần bên trong `SessionRevocationService`, API Admin không đổi.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
