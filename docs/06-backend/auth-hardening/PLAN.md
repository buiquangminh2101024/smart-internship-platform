# Đăng nhập, đăng ký bền và an toàn hơn — Backend

> **Trạng thái: ĐÃ DUYỆT, ĐANG LÀM (lập và duyệt 2026-11-22).** Bước 0 (đo trước) xong 2026-11-22, kết quả ở "Ghi chú triển khai". Quyết định kiến trúc: AD-31. Frontend: `docs/05-frontend/phases/auth-hardening/PLAN.md`. Làm trước khi viết báo cáo (hạn nộp cho giáo viên hướng dẫn trước 06/12/2026). Ước lượng backend ~0,5–0,75 ngày.

## Mục tiêu

1. Redis hoặc server trục trặc **không** làm người dùng bị đăng xuất (văng khỏi tài khoản).
2. Không dò được mã OTP: sai 5 lần thì mã bị huỷ.
3. Đăng nhập sai nhiều lần thì bị chặn tạm thời.
4. Đăng ký lại một email đã đăng ký nhưng chưa xác thực thì được dẫn sang bước nhập mã, thay vì lỗi tiếng Anh.
5. Băm mật khẩu không chặn luồng chính.

## Hiện trạng (đọc code 2026-11-22)

- `shared/middleware/authenticate.ts:66`: `catch` đổi **mọi** lỗi thành 401, kể cả lỗi Redis của `checkAccessTokenState` (blacklist, cờ khoá, mốc thu hồi).
  - Web nhận 401 thì gọi `/auth/refresh`. `AuthService.refresh` gọi `tokenBlacklist.isRevoked` (Redis), lỗi nên trả 500.
  - Web coi mọi lỗi refresh là hết phiên, nên `endSession` xoá localStorage, tức phiên của mọi tab cùng khu vực.
- `infrastructure/redis.ts`: `new Redis(REDIS_URL)` không đặt `commandTimeout`, `keepAlive`; `maxRetriesPerRequest` mặc định 20. Kết nối Redis Cloud chết ngầm thì lệnh treo một lúc rồi mới lỗi.
- `AuthService.assertOtpMatches` (`auth.service.ts:373`) không đếm lần sai. Không có giới hạn nào cho `/auth/verify-otp` và `/auth/reset-password`, cả ở server lẫn Nginx (`infra/nginx/nginx.conf` không có `limit_req`). Mã 6 số, sống 5 phút (`redis-otp-store.ts`), xin mã mới được sau 60 giây.
- `AuthService.login`: sai mật khẩu chỉ gọi `trackFailedLogin`. Hàm này đếm `login-fail:<userId>` 5 lần / 15 phút để **ghi nhật ký** `AUTH_LOGIN_FAILED_REPEATED`, không chặn. Email không tồn tại thì trả 401 ngay, không đếm.
- `AuthService.register`: email đã có thì luôn 409 `"Email already registered"`, không phân biệt tài khoản chưa xác thực. Lỗi 403 "Email not verified" của `login` không có `code`; web đang so chuỗi message.
- `bcryptjs` cost 12 ở 3 chỗ: `register` (:99), `login` (:132), `resetPassword` (:236). Đo 2026-11-14 (`docs/06-backend/live-rescore/PLAN.md`, bước 10): 8 người đăng nhập song song thì request khác chờ ~0,8–1,2 s (lúc rảnh ~5 ms).
- Script `create-admin.ts`, `seed-large-demo.ts`, `seed-match-demo.ts` dùng `bcryptjs` trực tiếp, không đổi.
- `RateLimiter` chỉ có `consume(key, limit, windowSeconds)` (INCR + EXPIRE), không đọc được số đếm hay thời gian còn lại.
- Socket.IO handshake (`infrastructure/socket/index.ts`) cũng gọi `checkAccessTokenState`. Lỗi Redis thành `connect_error`; web chỉ thử refresh, không xoá phiên. Không đổi.

## Các quyết định đã chốt (2026-11-22)

| # | Quyết định |
|---|---|
| D1 | Lỗi hạ tầng (Redis) khi kiểm token ⇒ **503** `AUTH_STORE_UNAVAILABLE`, không phải 401. Chỉ token sai / hết hạn / bị thu hồi mới là 401. Áp cho `authenticate` và `/auth/refresh`. |
| D2 | Redis client: `commandTimeout` 3 s, `keepAlive` 30 s, `maxRetriesPerRequest` 3 ⇒ lỗi nhanh thay vì treo. |
| D3 | OTP: sai **5 lần** thì huỷ mã (cả `register` và `reset-password`). Sai thì 400 `OTP_INVALID` kèm `attemptsLeft`; lần thứ 5 thì 400 `OTP_ATTEMPTS_EXCEEDED`. Xin mã mới thì bộ đếm về 0. |
| D4 | Đăng nhập: sai **5 lần trong 15 phút** với cùng cặp email + IP ⇒ chặn cặp đó 15 phút; một IP sai **30 lần trong 15 phút** (mọi email) ⇒ chặn IP đó 15 phút. Trả 429 `LOGIN_LOCKED` kèm `retryAfterSeconds`. Đăng nhập đúng thì xoá bộ đếm của cặp email + IP. Nhật ký `AUTH_LOGIN_FAILED_REPEATED` giữ nguyên. Google và Quên mật khẩu không bị ảnh hưởng. |
| D5 | Đăng ký: email đã kích hoạt (hoặc bị khoá) ⇒ 409 `EMAIL_TAKEN`; email chờ xác thực ⇒ 409 `EMAIL_PENDING_VERIFICATION`. **Không** ghi đè mật khẩu cũ (tránh kẻ xấu đặt trước mật khẩu cho email chờ xác thực). Web tự gọi `resend-otp`. `login` 403 chưa xác thực thêm code `EMAIL_NOT_VERIFIED`. |
| D6 | Băm mật khẩu chạy trong `worker_threads` (hướng b của backlog), vẫn dùng `bcryptjs`, không thêm dependency. Hash cũ dùng được nguyên. |
| D7 | Gợi ý gửi yêu cầu hỗ trợ khi nhập OTP mãi không được: chỉ làm ở frontend, dùng loại **"Vấn đề khác"** (`OTHER`) có sẵn của form `/support`. Server không đổi. |

## Phần 1 — Công nghệ / kiến trúc

- Không thêm dependency. `node:worker_threads` theo mẫu `infrastructure/embedding-worker.ts` + `embedding-worker-client.ts` (AD-27 mục 11).
- Port mới `shared/ports/PasswordHasher.ts` (`hash`, `compare`); adapter `infrastructure/worker-password-hasher.ts` + `password-hash-worker.ts`. Đăng ký trong `container.ts`.
- `RateLimiter` thêm `peek(key)` (số đếm + thời gian còn lại) và `reset(key)`.
- `OtpStore` thêm `recordFailure(purpose, email)` (đếm, cùng TTL với mã) và `set` xoá bộ đếm cũ.
- Mã lỗi mới trong `AppError.code` (AD-17): `AUTH_STORE_UNAVAILABLE`, `OTP_INVALID`, `OTP_ATTEMPTS_EXCEEDED`, `LOGIN_LOCKED`, `EMAIL_TAKEN`, `EMAIL_PENDING_VERIFICATION`, `EMAIL_NOT_VERIFIED`. Thêm vào shared types nếu web cần (bước 7).
- Không migration, không đổi schema.

## Phần 2 — Liên kết

```
web apiFetch ──401──► /auth/refresh ──► AuthService.refresh ──► tokenBlacklist (Redis)
        │                                   └─ Redis lỗi ⇒ 503 (D1) ⇒ web giữ phiên (FE F1)
        └──503 (authenticate: Redis lỗi, D1) ⇒ web báo lỗi tạm thời, không refresh

AuthService.login ──► RateLimiter.peek (khoá email+IP, IP) ──► 429 nếu đang khoá (D4)
                  ──► PasswordHasher.compare (worker, D6)
                  ──► sai: RateLimiter.consume ×2 + trackFailedLogin (nhật ký, giữ nguyên)
                  ──► đúng: RateLimiter.reset(email+IP)

AuthService.verifyOtp / resetPassword ──► OtpStore.get ──► sai: recordFailure ⇒ 400 / huỷ mã (D3)
AuthService.register ──► userRepository.findByEmail ──► 409 EMAIL_TAKEN / EMAIL_PENDING_VERIFICATION (D5)
                     ──► PasswordHasher.hash (worker)
```

## Phần 3 — Các bước

### Bước 0 — Đo trước

- Qua gateway 8080: 8 đăng nhập song song, đo trung vị / tối đa của một request khác (`GET /job-posts`) trong lúc đó. Ghi lại để so ở bước 8. Dùng lại cách đo của `live-rescore` bước 10.

### Bước 1 — Lỗi hạ tầng không thành 401 (D1, D2)

- `authenticate.ts`: tách hai khối `try`:
  - `verifyAccessToken` lỗi ⇒ 401 như cũ;
  - `checkAccessTokenState` ném lỗi ⇒ log + `AppError(503, "Authentication service temporarily unavailable", "AUTH_STORE_UNAVAILABLE")`.
  - Các trường hợp từ chối (`TOKEN_REVOKED`, `ACCOUNT_SUSPENDED`, `SESSION_REVOKED`) vẫn 401.
- `AuthService.refresh`: bọc `tokenBlacklist.isRevoked` và `userRepository.findById`; lỗi không phải `AppError` ⇒ 503 cùng code. JWT sai / bị thu hồi / tài khoản không hoạt động vẫn 401.
- `redis.ts`: thêm `commandTimeout: 3000`, `keepAlive: 30000`, `maxRetriesPerRequest: 3`.
  - Rà các nơi dùng Redis (rate limit, OTP, cache, cờ khoá, hạn mức LLM) xem có chỗ nào đang dựa vào việc lệnh chờ lâu không. Ghi kết quả rà vào phần ghi chú triển khai.

### Bước 2 — Giới hạn nhập sai OTP (D3)

- `OtpStore`: thêm `recordFailure(purpose, email): Promise<number>` (INCR `otp:fail:<purpose>:<email>`, EXPIRE 5 phút như mã). `set` xoá luôn khoá đếm. `delete` xoá cả hai.
- `assertOtpMatches`:
  - không có mã ⇒ 400 `OTP_INVALID` (giữ message cũ "Invalid or expired OTP", không `attemptsLeft`);
  - sai ⇒ `recordFailure`; `< 5` ⇒ 400 `OTP_INVALID`, `data: { attemptsLeft }`; `= 5` ⇒ `delete` + 400 `OTP_ATTEMPTS_EXCEEDED`;
  - đúng ⇒ `delete` như cũ.
- Áp cho `verifyOtp` và `resetPassword`. `resetPassword` với email không tồn tại vẫn trả giống sai mã (P2 của AD-18), không đếm.

### Bước 3 — Chặn đăng nhập sai nhiều lần (D4)

- `RateLimiter`: thêm `peek(key): Promise<{ count: number; ttlSeconds: number }>` và `reset(key)`. `RedisRateLimiter` cài bằng `GET` + `TTL` (pipeline), `DEL`.
- Hằng số trong `auth.service.ts`: `LOGIN_LOCK_THRESHOLD = 5`, `LOGIN_IP_THRESHOLD = 30`, `LOGIN_LOCK_WINDOW_MINUTES = 15`.
- Khoá:
  - `login-lock:<email>:<ip>`
  - `login-lock-ip:<ip>`
- `login`:
  1. Trước khi tìm user: `peek` cả hai khoá. Khoá nào đạt ngưỡng ⇒ 429 `LOGIN_LOCKED`, `data: { retryAfterSeconds }` (lấy TTL lớn hơn). Không băm mật khẩu khi đang bị chặn.
  2. Sai (kể cả email không tồn tại, để không lộ email nào có tài khoản) ⇒ `consume` cả hai khoá. Nếu lần sai này làm đạt ngưỡng ⇒ trả luôn 429; chưa đạt ⇒ 401 như cũ, kèm `data: { attemptsLeft }` khi còn ≤ 2 lần.
  3. `trackFailedLogin` (nhật ký) giữ nguyên, chỉ chạy khi có user.
  4. Đúng mật khẩu ⇒ `reset(login-lock:<email>:<ip>)`. Khoá theo IP không xoá (để hết hạn tự nhiên).
- Redis lỗi ở bước đếm / đọc ⇒ log, **cho qua** (không chặn đăng nhập vì Redis hỏng), giống rate limit duyệt hàng loạt.
- Kiểm: `req.ip` sau Nginx là IP thật của khách (AD-17 mục 7). Hiện đúng: Nginx gửi `X-Forwarded-For $remote_addr`, Express `trust proxy` = `loopback, uniquelocal` (`main.ts:91`).
- **Khi deploy (Phase 14) phải kiểm lại `trust proxy`.** Đứng sau proxy khác mà cấu hình sai thì mọi người dùng chung một IP, và 30 lần sai của bất kỳ ai sẽ khoá đăng nhập cả trang.

### Bước 4 — Đăng ký lại email chờ xác thực (D5)

- `register`: `existing.status === "PENDING_VERIFICATION"` ⇒ 409 `EMAIL_PENDING_VERIFICATION`; còn lại ⇒ 409 `EMAIL_TAKEN`. Không đổi mật khẩu, không đổi role, không tự gửi OTP.
- `login`: 403 chưa xác thực thêm code `EMAIL_NOT_VERIFIED` (message giữ nguyên để web cũ vẫn chạy).

### Bước 5 — Worker băm mật khẩu (D6)

- `password-hash-worker.ts`: nhận `{ id, op: "hash" | "compare", password, hash? }`, chạy `bcryptjs` (bản đồng bộ, vì đã ở luồng riêng), trả `{ id, result }` hoặc `{ id, error }`.
- `WorkerPasswordHasher`:
  - pool **2 worker**, tạo lười, giao việc cho worker rảnh, xếp hàng khi cả hai bận;
  - timeout 10 s mỗi việc ⇒ ném lỗi (đăng nhập trả 500, không âm thầm coi là sai mật khẩu);
  - worker chết ⇒ việc đang chạy lỗi, lần sau tạo worker mới;
  - `unref` khi rảnh (như `EmbeddingWorkerClient`).
- `AuthService` nhận `passwordHasher` thay cho gọi `bcrypt` trực tiếp; `SALT_ROUNDS` giữ 12.
- Đường dẫn file worker theo `extname(__filename)` như embedding (chạy được với `tsx` và bản build).

### Bước 6 — Test

Thêm vào `apps/server/tests/unit/` (`node:test` + `tsx`):

- `authenticate`: Redis ném lỗi ⇒ 503 `AUTH_STORE_UNAVAILABLE`; token sai ⇒ 401; bị thu hồi ⇒ 401.
- `refresh`: blacklist ném lỗi ⇒ 503; token bị thu hồi ⇒ 401.
- OTP: sai 1–4 lần ⇒ `attemptsLeft` 4 → 1; lần 5 ⇒ `OTP_ATTEMPTS_EXCEEDED` và mã bị xoá (nhập đúng sau đó vẫn lỗi); xin mã mới ⇒ đếm lại từ 0; `resetPassword` cùng hành vi.
- Đăng nhập:
  - sai 5 lần cùng email + IP ⇒ lần 5 trả 429;
  - IP khác vẫn đăng nhập được;
  - 30 lần sai từ một IP với nhiều email ⇒ 429;
  - đúng mật khẩu xoá bộ đếm cặp;
  - đang khoá thì không gọi `compare`;
  - email không tồn tại cũng bị đếm;
  - Redis lỗi ⇒ vẫn đăng nhập được;
  - nhật ký `AUTH_LOGIN_FAILED_REPEATED` không đổi (test cũ `auth-security-log.test.ts` vẫn qua).
- Đăng ký: chờ xác thực ⇒ `EMAIL_PENDING_VERIFICATION`, mật khẩu cũ không đổi; đã kích hoạt ⇒ `EMAIL_TAKEN`.
- `WorkerPasswordHasher`: hash rồi compare đúng / sai; hash do `bcryptjs` cũ tạo vẫn compare đúng; worker giả chết / quá giờ ⇒ ném lỗi; nhiều việc song song không lẫn kết quả.
- Thêm script `"test": "tsx --test tests/unit/*.test.ts"` vào `apps/server/package.json` (hiện là `echo … exit 1`), để báo cáo ghi một lệnh chạy test.

### Bước 7 — Shared types

- Nếu web cần kiểu cho `data` của lỗi (`attemptsLeft`, `retryAfterSeconds`): thêm `AuthErrorCode` và kiểu `data` vào `packages/shared-types`.

### Bước 8 — Kiểm thật và tài liệu

- Đo lại như bước 0: mục tiêu là request khác về gần mức lúc rảnh khi 8 người đăng nhập song song.
- Qua gateway 8080:
  - sai OTP 5 lần;
  - sai mật khẩu 5 lần, rồi đăng nhập đúng từ IP khác (hoặc xoá khoá) để kiểm;
  - đăng ký lại email chờ xác thực.
- Giả lập Redis hỏng: chạy Redis local của `infra/docker-compose`, trỏ `REDIS_URL` tạm sang đó, đăng nhập, rồi dừng container ⇒ request trả 503, phiên trên web còn nguyên; bật lại ⇒ dùng tiếp. **Không đụng Redis Cloud thật.** Trả `REDIS_URL` về như cũ sau khi kiểm.
- Cập nhật AD-31, backlog (dòng "Phiên đăng nhập bền hơn", "Khoá đăng nhập tạm thời", "Băm mật khẩu không chặn luồng chính"), `PROJECT_STATUS.md` (Phase 12 / 13), FAQ trợ lý nếu có mục nói về đăng nhập / OTP.

## Câu hỏi đã chốt (2026-11-22)

- Ngưỡng chặn đăng nhập: 5 lần / 15 phút theo email + IP, 30 lần / 15 phút theo IP, chặn 15 phút — chủ dự án đồng ý.
- Đăng ký dở dang: cách B (gửi lại mã ngay tại form, không ghi đè mật khẩu) — chủ dự án đồng ý.
- Gộp worker băm mật khẩu vào đợt này — chủ dự án đồng ý.
- Gợi ý hỗ trợ ở form OTP: chỉ frontend, loại "Vấn đề khác" — chủ dự án đồng ý.
- Q1: lần sai thứ 5 trả 429 ngay — chủ dự án đồng ý.
- Q3: Redis lỗi thì bộ đếm đăng nhập cho qua, không chặn mọi người đăng nhập — chủ dự án đồng ý.
- Q4: pool 2 worker băm mật khẩu — chủ dự án đồng ý.

- Q2: email không tồn tại cũng đếm vào khoá, để không lộ email nào có tài khoản — chủ dự án đồng ý. Đã xét: kẻ xấu không khoá được người khác (khoá gắn với email + IP, chỉ IP của họ bị chặn), không làm đầy Redis đáng kể (mỗi IP tối đa 30 khoá / 15 phút, tự hết hạn).

## Không làm trong đợt này

- Cookie httpOnly cho refresh token (backlog mục 6; để sau khoá luận).
- Gia hạn refresh token khi người dùng còn hoạt động (hiện phiên luôn hết sau 7 ngày kể từ lúc đăng nhập). Khi demo: đăng nhập lại mọi tài khoản demo sáng 23/12.
- Thu hồi refresh token cũ khi đăng nhập tài khoản khác cùng vai trò.
- Cân bằng thời gian trả lời giữa email có / không có tài khoản ở `/auth/login`.
- Loại yêu cầu hỗ trợ riêng "Không xác thực được email".

## Ghi chú triển khai

### Bước 0 — đo trước (2026-11-22)

**Cách đo:** server dev thật, qua gateway 8080, script tạm `.claude-workspace/scratch/auth-hardening-step0.ts` (không commit; chạy lại ở bước 8 với nhãn `after`). 200 lần đăng nhập đúng mật khẩu, 8 song song, bằng 8 tài khoản ứng viên `@large-demo.local`. Pha nền 20 giây trước và sau. Ba vòng gọi liên tục: `GET /api/__probe-404` mỗi 50 ms (thay cho event loop), `/api/health` mỗi 100 ms, `/api/job-posts?page=1&limit=20` mỗi 200 ms. Độ trễ tính bằng ms.

| Pha | 404 (event loop) p50 / p95 / p99 / max | `/health` p50 / p95 | `/job-posts` p50 / p95 |
|---|---|---|---|
| Nền | 5 / 8 / 13 / 18 | 53 / 58 | 531 / 988 |
| 200 đăng nhập (49,4 s) | **470 / 1.608 / 1.736 / 1.736** | 973 / 1.505 | 1.964 / 2.215 |
| Nền | 5 / 8 / 10 / 16 | 54 / 60 | 541 / 599 |

- Đăng nhập: p50 1.967 ms / p95 2.064 ms, không lỗi.
- Khớp lần đo 2026-11-14 (`live-rescore` bước 10): khi 8 người đăng nhập cùng lúc, request không liên quan chờ 0,5–1,7 giây thay vì ~5 ms.
- **Mục tiêu bước 8:** pha đăng nhập có 404 p99 < 100 ms, `/health` và `/job-posts` không chậm quá 2 lần lúc nền. Bản thân đăng nhập có thể vẫn chậm (2 worker xử lý 8 việc), không tính vào mục tiêu.

## Phần 4 — Ghi chú của chủ dự án

<!-- Dành cho chủ dự án. -->
