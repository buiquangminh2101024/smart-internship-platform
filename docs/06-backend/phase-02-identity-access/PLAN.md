# Phase 2 — Identity & Access — Kế hoạch triển khai

Tham chiếu: `docs/01-project/PROJECT_PHASES.md` (Phase 2), `docs/02-architecture/INITIAL_ARCHITECTURE_PLAN.md` §6/§8/§8b/§10/§12b, `docs/03-database/DATABASE_DESIGN.md` (nhóm `Users & auth`). Tài liệu này chỉ ghi phần đặc thù Phase 2, không lặp lại nội dung đã chốt ở các file trên.

---

## Phần 1 — Công nghệ / package / kiến trúc sử dụng

### Dependency mới cho `apps/server`

| Package | Vai trò | Ghi chú |
|---|---|---|
| `jsonwebtoken` (+ `@types/jsonwebtoken`) | Sign/verify JWT access & refresh token | Thư viện phổ biến nhất cho JWT trên Node, đủ nhẹ, không cần thêm gì khác |
| `ioredis` | Redis client cho OTP store, rate-limit counter, JWT blacklist | Promise-based, hỗ trợ TLS (`rediss://`) cần cho Redis Cloud, type-safe qua TS built-in |
| `google-auth-library` | Verify Google ID token (`OAuth2Client.verifyIdToken`) | Đã được chỉ định cụ thể trong `INITIAL_ARCHITECTURE_PLAN.md` §8b |
| `resend` | Gửi email OTP qua Resend | Resend đã là dịch vụ chốt trong tech stack (`PROJECT_OVERVIEW.md` §9) — dùng SDK chính thức thay vì gọi REST thủ công |

Tái sử dụng (đã có sẵn từ Phase 0/1, không thêm mới): `bcryptjs` (hash password, dùng chung với `create-admin.ts`), `zod` (DTO validation qua middleware `validate()` có sẵn), `awilix`, `@prisma/client`.

### Pattern kiến trúc áp dụng riêng cho Phase 2

- **Port/adapter cho mọi thứ chạm Redis/external service**, đặt interface ở `shared/ports/`, implementation cụ thể ở `infrastructure/` — cùng tinh thần với boundary `ports/adapters` đã dùng cho AI (Phase 10) và đúng khuyến nghị trong `INITIAL_ARCHITECTURE_PLAN.md` §6 ("nên bọc qua interface mỏng... để unit test không cần Redis thật"):
  - `RateLimiter` (interface) → `RedisRateLimiter` (impl)
  - `TokenBlacklist` (interface) → `RedisTokenBlacklist` (impl)
  - `OtpStore` (interface) → `RedisOtpStore` (impl)
  - `EmailSender` (interface, đã nêu tên trong kiến trúc) → `ResendEmailSender` (impl)
- **awilix DI** theo đúng pattern demo của module `health` (`asValue` cho client/kết nối, `asClass` cho service/controller, singleton).
- **`auth` và `users` tách biệt tầng service** (đã chốt ở `PROJECT_STRUCTURE.md` §5) nhưng dùng chung một `UserRepository` (đặt trong `modules/users/`, `auth` inject vào qua DI) để tránh 2 nơi cùng viết Prisma query trên bảng `users`.
- **JWT payload tối thiểu:** `{ sub: userId, role, jti }` — không nhét thêm dữ liệu nhạy cảm/thay đổi thường xuyên (email) để tránh token cũ mang dữ liệu stale.
- **Refresh không rotate ở MVP:** `POST /auth/refresh` chỉ cấp access token mới từ refresh token còn hợp lệ (không phát hành refresh token mới) — giữ đơn giản cho phạm vi khoá luận; thu hồi refresh token vẫn thực hiện được qua `TokenBlacklist` ở logout. Rotate-on-refresh có thể cân nhắc ở Phase 11 (Security Hardening) nếu cần.
- **Rate-limit OTP** dùng hằng số cứng trong code (không thêm biến môi trường mới ngoài các key đã có sẵn trong `.env.example`): cooldown 60s giữa 2 lần gửi cùng email, tối đa 5 lần/email/giờ, tối đa 20 lần/IP/giờ. OTP TTL 5 phút.
- **`OTP_HARDCODE=true`:** `AuthService` bỏ qua gọi `EmailSender` hoàn toàn (không cần một implementation giả lập riêng) — chỉ log OTP ra console qua `logger`.

---

## Phần 2 — Liên kết giữa các phần

```text
apps/web (chưa làm UI ở phase này, chỉ chuẩn bị type dùng chung)
        |
        v  gọi API qua Nginx (hoặc thẳng :4000 khi dev)
apps/server/src/main.ts
        |
        +-- /api/auth/*  → auth.routes.ts → AuthController → AuthService
        |                                                        |
        +-- /api/users/* → users.routes.ts → UsersController     |
        |                     (GET /me, qua middleware           |
        |                      `authenticate`)                   |
        |                                                        v
        |                                              UserRepository (Prisma → users table)
        |
   AuthService phụ thuộc (qua DI):
        - UserRepository        (đọc/ghi User)
        - JwtService             (sign/verify access+refresh)
        - OtpStore                (Redis, TTL 5 phút)
        - RateLimiter             (Redis, giới hạn gửi OTP)
        - EmailSender             (Resend, bỏ qua nếu OTP_HARDCODE=true)
        - GoogleAuthClient        (verify Google id_token)
        - TokenBlacklist          (Redis, dùng khi logout/refresh)

   middleware `authenticate` (shared/middleware/) phụ thuộc:
        - JwtService    (verify access token)
        - TokenBlacklist (kiểm tra jti đã bị thu hồi chưa)
   → gắn req.user = { id, role } cho route phía sau (dùng từ Phase 3 trở đi)

   middleware `authorize(...roles)` — role guard, dùng req.user.role,
   đặt cạnh `authenticate`, sẵn sàng cho route cần giới hạn role ở phase sau.
```

### Luồng nghiệp vụ chính

- **Register (email/password):** `AuthController.register` → `AuthService.register` → check `RateLimiter` (email + IP) → tạo `User(status=PENDING_VERIFICATION, passwordHash, role)` qua `UserRepository` (chặn `role=ADMIN` ngay ở Zod DTO trước khi tới đây) → sinh OTP, lưu `OtpStore` → gửi qua `EmailSender` (trừ khi `OTP_HARDCODE=true`).
- **Verify OTP:** `AuthService.verifyOtp` → so khớp `OtpStore` → cập nhật `status=ACTIVE`, `emailVerifiedAt` → xoá OTP key → `JwtService` phát access+refresh token.
- **Resend OTP:** `AuthService.resendOtp` → check `RateLimiter` → sinh OTP mới, ghi đè `OtpStore`.
- **Login (password):** `AuthService.login` → `UserRepository.findByEmail` → `bcrypt.compare` → chặn nếu `status != ACTIVE` (báo lỗi rõ "cần xác thực OTP" nếu đang `PENDING_VERIFICATION`) → phát token.
- **Forgot/Reset password:** `AuthService.forgotPassword` → check `RateLimiter` → sinh OTP (dùng chung `OtpStore`, namespace riêng `otp:reset:{email}`) → gửi email. `AuthService.resetPassword` → so khớp OTP → cập nhật `passwordHash` mới. (Bổ sung theo `INITIAL_ARCHITECTURE_PLAN.md` §8, liệt kê Resend dùng cho "OTP đăng ký/đăng nhập/quên mật khẩu" — không có trong DoD gốc của Phase 2 nhưng đã được xác nhận trong tài liệu kiến trúc, nên đưa vào cùng đợt thay vì tách phase riêng.)
- **Google OAuth:** `AuthController.googleAuth` nhận `{ idToken, role }` → `GoogleAuthClient.verifyIdToken` xác thực với Google → `AuthService.loginOrRegisterWithGoogle`: tìm theo `googleId` trước → fallback tìm theo `email` (nếu có, gắn `googleId` vào `User` sẵn có, giữ nguyên `role` cũ, bỏ qua `role` client gửi) → không tìm thấy thì tạo mới (`role` bắt buộc từ client, DTO chỉ nhận `CANDIDATE`/`EMPLOYER`) → phát token.
- **Refresh:** `AuthService.refresh` → `JwtService.verifyRefresh` → check `TokenBlacklist` theo `jti` → phát access token mới.
- **Logout:** `AuthService.logout` → đưa `jti` của access token hiện tại (từ middleware `authenticate`) và refresh token gửi kèm vào `TokenBlacklist` với TTL = thời gian còn lại của từng token.
- **`GET /users/me`:** qua `authenticate` → `UsersController.me` → trả `{ id, email, role, status }` — vừa là API thật cho frontend lấy session, vừa dùng để kiểm chứng middleware auth hoạt động đúng (không có test suite riêng tới Phase 12).

---

## Phần 3 — Các bước thực hiện

1. **Dependencies:** thêm `jsonwebtoken`, `@types/jsonwebtoken`, `ioredis`, `google-auth-library`, `resend` vào `apps/server/package.json`, `npm install`.
2. **Env config:** mở rộng `envSchema` trong `apps/server/src/shared/config/env.ts` để parse thêm (tất cả key đã có sẵn trong `.env.example`, chỉ chưa được đọc type-safe): `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY`, `OTP_HARDCODE` (coerce boolean), `OTP_HARDCODE_VALUE`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Các key liên quan Resend/Google có thể để optional ở schema khi `OTP_HARDCODE=true` (dev), nhưng bắt buộc khi `NODE_ENV=production`.
3. **Redis client:** tạo `apps/server/src/infrastructure/redis.ts` — khởi tạo `ioredis` singleton từ `config.REDIS_URL`, cùng pattern với `infrastructure/prisma.ts`.
4. **Ports (interfaces):** tạo `apps/server/src/shared/ports/` gồm `RateLimiter.ts`, `TokenBlacklist.ts`, `OtpStore.ts`, `EmailSender.ts`.
5. **Adapters (Redis/Resend/Google):** tạo trong `apps/server/src/infrastructure/`:
   - `redis-rate-limiter.ts` (impl `RateLimiter`, dùng `INCR` + `EXPIRE`)
   - `redis-token-blacklist.ts` (impl `TokenBlacklist`, key `jwt:blacklist:{jti}`)
   - `redis-otp-store.ts` (impl `OtpStore`, key `otp:{purpose}:{email}`, TTL 300s)
   - `resend-email-sender.ts` (impl `EmailSender` qua SDK `resend`)
   - `google-auth-client.ts` (wrapper `OAuth2Client.verifyIdToken`)
6. **Module `users`** (tạo trước vì `auth` phụ thuộc vào nó): `apps/server/src/modules/users/`
   - `user.repository.ts` — `findByEmail`, `findByGoogleId`, `findById`, `create`, `updatePassword`, `linkGoogleId`, `markVerified`
   - `users.service.ts`, `users.controller.ts` (`GET /me`), `users.routes.ts`
7. **Module `auth`:** `apps/server/src/modules/auth/`
   - `auth.dto.ts` — Zod schemas: `registerSchema` (role chỉ nhận `CANDIDATE`/`EMPLOYER`), `loginSchema`, `verifyOtpSchema`, `resendOtpSchema`, `googleAuthSchema` (role chỉ nhận `CANDIDATE`/`EMPLOYER`), `refreshSchema`, `forgotPasswordSchema`, `resetPasswordSchema`
   - `jwt.service.ts` — sign/verify access & refresh, sinh `jti` qua `crypto.randomUUID()`
   - `auth.service.ts` — toàn bộ logic ở Phần 2
   - `auth.controller.ts`, `auth.routes.ts`
8. **Middleware:** `apps/server/src/shared/middleware/authenticate.ts` (verify access token + check blacklist, gắn `req.user`), `authorize.ts` (role guard, export factory `authorize(...roles: Role[])`).
9. **Container:** mở rộng `Cradle` trong `apps/server/src/container.ts` với toàn bộ service/repository/client mới ở bước 3–8, đăng ký theo đúng pattern `asValue`/`asClass` hiện có.
10. **`main.ts`:** mount `authRouter(container)` và `usersRouter(container)` dưới `/api`, giữ nguyên thứ tự middleware hiện tại (`cors` → `express.json()` → routers → `errorHandler`).
11. **`packages/shared-types/src/index.ts`:** bổ sung type request/response cho auth (`RegisterRequest`, `LoginRequest`, `VerifyOtpRequest`, `GoogleAuthRequest`, `AuthTokensResponse`, `UserProfile`, ...) để dùng lại khi làm UI `(auth)` ở `apps/web` sau này.
12. **Kiểm thử thủ công theo Definition of Done** (chưa có test suite thật tới Phase 12 — dùng REST client/curl):
    - Đăng ký + verify OTP + login bằng email/password cho cả Candidate và Employer.
    - Test cả hai chế độ `OTP_HARDCODE=true` và `=false` (cần `RESEND_API_KEY` thật cho trường hợp `false`).
    - Rate-limit OTP: gửi liên tiếp vượt ngưỡng → nhận lỗi 429.
    - `POST /auth/register` với `role=ADMIN` → bị từ chối (400, lỗi từ Zod).
    - `POST /auth/google` tạo mới + trường hợp email trùng với user password có sẵn → verify field `googleId` được gắn đúng, `role` giữ nguyên.
    - Đăng nhập bằng tài khoản Admin đã tạo qua `npm run create-admin` qua `/auth/login`.
    - `GET /users/me` với access token hợp lệ / hết hạn / đã logout (nằm trong blacklist).
13. **Cập nhật tài liệu sau khi hoàn thành implement:** đổi trạng thái Phase 2 trong `docs/01-project/PROJECT_STATUS.md` thành ✅, ghi chú ngắn gọn deviation nếu có so với kế hoạch này.

---

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
