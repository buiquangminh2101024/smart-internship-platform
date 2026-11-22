# Đăng nhập, đăng ký bền và an toàn hơn — Backend

> **Trạng thái: ĐÃ DUYỆT, ĐANG LÀM (lập và duyệt 2026-11-22).** Bước 0 (đo trước), bước 1 (lỗi hạ tầng không thành 401), bước 2 (giới hạn nhập sai OTP), bước 3 (chặn đăng nhập sai nhiều lần), bước 4 (đăng ký lại email chờ xác thực) và bước 5 (worker băm mật khẩu) xong 2026-11-22, xem "Ghi chú triển khai". Quyết định kiến trúc: AD-31. Frontend: `docs/05-frontend/phases/auth-hardening/PLAN.md`. Làm trước khi viết báo cáo (hạn nộp cho giáo viên hướng dẫn trước 06/12/2026). Ước lượng backend ~0,5–0,75 ngày.

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

### Bước 1 — lỗi hạ tầng không thành 401 (2026-11-22)

- `shared/errors/AppError.ts`: thêm hằng `AUTH_STORE_UNAVAILABLE` và hàm `authStoreUnavailable()` (503), dùng chung cho `authenticate` và `refresh`.
- `authenticate.ts`: bọc riêng `checkAccessTokenState`; lỗi ⇒ log + 503. `verifyAccessToken` lỗi, thiếu header, `TOKEN_REVOKED` / `ACCOUNT_SUSPENDED` / `SESSION_REVOKED` vẫn 401. `optionalAuthenticate` (chatbot) bọc `authenticate` nên có cùng hành vi.
- `AuthService.refresh`: hàm riêng `readRefreshState` đọc blacklist (Redis) và user (DB) **song song** (trước đây tuần tự); lỗi ⇒ log + 503. Khác plan một chút: lỗi DB (Neon) cũng trả 503, vì cũng là lỗi tạm thời, không phải hết phiên.
- `infrastructure/redis.ts`: `commandTimeout: 3000`, `keepAlive: 30000`, `maxRetriesPerRequest: 3`.
- **Rà nơi dùng Redis:** không có lệnh chờ lâu (`BLPOP`, `subscribe`, `eval`, Socket.IO adapter Redis). Mọi chỗ còn lại (rate limit, OTP, blacklist, cờ khoá, mốc thu hồi, mã mời công ty, khoá lượt chạy nền, cache Gemini, hạn mức LLM) là lệnh ngắn `GET` / `SET` / `INCR` / `DEL`. Timeout 3 giây không ảnh hưởng.
- Handshake Socket.IO giữ nguyên như plan (lỗi Redis ⇒ `connect_error`, web chỉ thử refresh).
- **Test:** `tests/unit/auth-store-unavailable.test.ts`, 8 test (Redis lỗi ⇒ 503 ở `authenticate` và `refresh`, DB lỗi ⇒ 503 ở `refresh`, các trường hợp 401 giữ nguyên). Toàn bộ 765 / 765 qua, `tsc --noEmit` sạch.
- `live-rescore-marker.test.ts` ("sửa liên tiếp cùng một ứng viên…") thỉnh thoảng trượt khi chạy cả bộ, 1 trong 4 lần. Test này dùng hẹn giờ thật, có từ trước, không liên quan bước này. Chưa sửa.
- Kiểm qua 8080: đăng nhập, `/users/me` 200; token sai 401; refresh 200; refresh token sai 401. Kiểm 503 khi Redis hỏng để ở bước 8 (Redis local).

### Bước 2 — giới hạn nhập sai OTP (2026-11-22)

- `AppError` thêm tham số thứ tư `data` (tuỳ chọn); `errorHandler` trả ở `data` của body lỗi. Web (`ApiError.data`) đã đọc sẵn trường này, không cần đổi `api-client`.
- `OtpStore.recordFailure` (port + `RedisOtpStore`): `INCR otp:fail:<purpose>:<email>`, đặt `EXPIRE` 5 phút ở lần sai đầu. `set` ghi mã và xoá bộ đếm trong một `MULTI`; `delete` xoá cả mã lẫn bộ đếm.
- `AuthService.assertOtpMatches`, hằng `OTP_MAX_ATTEMPTS = 5`:
  - không có mã ⇒ 400 `OTP_INVALID`, không `attemptsLeft`, không đếm;
  - sai lần 1–4 ⇒ 400 `OTP_INVALID`, `data: { attemptsLeft: 4 → 1 }`;
  - sai lần 5 ⇒ xoá mã, 400 `OTP_ATTEMPTS_EXCEEDED` (message "Too many incorrect OTP attempts — please request a new code").
- `resetPassword` với email không tồn tại: thêm code `OTP_INVALID` vào lỗi sẵn có, vẫn không đếm (P2 của AD-18).
- `verifyOtp` với email không tồn tại vẫn 404 "User not found" như cũ (ngoài phạm vi).
- **Test:** `tests/unit/auth-otp-attempts.test.ts`, 8 test. Cả bộ 772 / 773, test trượt là `live-rescore-marker` (hẹn giờ thật, đã ghi ở bước 1). `tsc --noEmit` sạch.
- **Kiểm qua 8080** (tài khoản ứng viên `@large-demo.local`, `OTP_HARDCODE=true`): `forgot-password` ⇒ 5 lần `reset-password` sai mã trả `attemptsLeft` 4, 3, 2, 1 rồi `OTP_ATTEMPTS_EXCEEDED`; lần 6 ⇒ `OTP_INVALID` không `attemptsLeft` (mã đã bị huỷ). Mật khẩu cũ vẫn đăng nhập được. Không thử nhập mã đúng sau khi bị huỷ trên tài khoản thật (nếu lỗi sẽ đổi mật khẩu tài khoản demo); unit test đã phủ trường hợp này.

### Bước 3 — chặn đăng nhập sai nhiều lần (2026-11-22)

- `RateLimiter` thêm `peek(key)` (`GET` + `TTL` trong một pipeline; khoá chưa có ⇒ `count` 0, `ttlSeconds` 0) và `reset(key)` (`DEL`). Khoá Redis vẫn có tiền tố `ratelimit:`.
- `auth.service.ts`: hằng `LOGIN_LOCK_THRESHOLD = 5`, `LOGIN_IP_THRESHOLD = 30`, `LOGIN_LOCK_WINDOW_MINUTES = 15` (export cho test). Khoá `login-lock:<email>:<ip>` (email `trim` + chữ thường) và `login-lock-ip:<ip>`.
- `login`:
  1. `assertLoginNotLocked`: đọc hai khoá; khoá nào đạt ngưỡng ⇒ 429 `LOGIN_LOCKED`, `data: { retryAfterSeconds }` (TTL lớn hơn; TTL -1 thì coi còn đủ 15 phút). Không tìm user, không so mật khẩu.
  2. Sai mật khẩu, email không tồn tại, hoặc tài khoản chỉ có Google ⇒ `trackFailedLogin` (nhật ký L4, chỉ khi có mật khẩu, như cũ) rồi `recordLoginFailure`: `consume` hai khoá, đọc lại; đạt ngưỡng ⇒ 429 ngay (Q1); còn ≤ 2 lần ⇒ 401 kèm `data: { attemptsLeft }` (lấy số nhỏ hơn giữa hai khoá); còn lại ⇒ 401 như cũ.
  3. Đúng mật khẩu ⇒ `reset` khoá cặp, trước khi xét trạng thái chờ xác thực / bị khoá. Khoá IP để tự hết hạn.
  4. Redis lỗi ở bất kỳ bước nào ⇒ log và cho qua (Q3).
- `tests/unit/auth-security-log.test.ts` (test cũ của nhật ký L4): bản giả `RateLimiter` thêm `peek` / `reset`; `failLogin` chấp nhận 401 hoặc 429; test "email không có tài khoản" chỉ kiểm khoá `login-fail:*` không bị đếm (khoá chặn mới thì có, theo Q2); test "RateLimiter lỗi" kiểm có log của nhật ký thay vì đúng 1 log. Hành vi nhật ký không đổi.
- **Test mới:** `tests/unit/auth-login-lock.test.ts`, 10 test. Cả bộ 783 / 783 qua, `tsc --noEmit` sạch.
- **Kiểm qua 8080** (một ứng viên `@large-demo.local`): sai lần 1–2 ⇒ 401; lần 3, 4 ⇒ `attemptsLeft` 2, 1; lần 5 ⇒ 429 `retryAfterSeconds` 898; đúng mật khẩu ngay sau ⇒ vẫn 429. Sau đó xoá đúng hai khoá vừa tạo trong Redis; đăng nhập lại ⇒ 200.
- **IP mà server thấy khi chạy dev là `172.19.0.1`** (cổng mạng Docker; request từ máy Windows vào Nginx trong Docker bị NAT). Vì vậy ở máy dev, mọi trình duyệt trên máy (và máy khác trong LAN nếu truy cập qua máy này) dùng chung một khoá IP: tổng 30 lần sai trong 15 phút thì chặn cả máy. Với demo trên một laptop thì không sao (cũng chỉ một IP thật). Khi deploy (Phase 14) phải kiểm IP thật đi tới Express, cùng mục `trust proxy` ở bước 3.
- Lỡ tự khoá khi demo: chờ hết thời gian, hoặc xoá khoá `ratelimit:login-lock:*` / `ratelimit:login-lock-ip:*` trong Redis.

### Bước 4 — đăng ký lại email chờ xác thực (2026-11-22)

- `register`: email chờ xác thực ⇒ 409 `EMAIL_PENDING_VERIFICATION` ("Email already registered but not verified"); đã kích hoạt hoặc bị khoá ⇒ 409 `EMAIL_TAKEN` (message cũ "Email already registered"). Không đổi mật khẩu, vai trò, không tự gửi mã.
- `login`: 403 chưa xác thực thêm code `EMAIL_NOT_VERIFIED`, message giữ nguyên (web hiện tại vẫn so chuỗi "not verified" nên chạy tiếp được tới khi làm frontend F3).
- **Sửa thêm, ngoài plan — lỗ hổng có từ trước:** `resendOtp` chỉ chặn tài khoản `ACTIVE`, nên tài khoản bị Admin khoá (`SUSPENDED`) vẫn xin được mã đăng ký; `verifyOtp` rồi gọi `markVerified` đặt lại `ACTIVE` và cấp token, tức người bị khoá tự mở khoá được. Nay `resendOtp` và `verifyOtp` chỉ nhận tài khoản `PENDING_VERIFICATION`:
  - `resendOtp` trạng thái khác ⇒ 400 "Email already verified" (cùng message cũ cho mọi trạng thái, không lộ tài khoản đang bị khoá);
  - `verifyOtp` trạng thái khác ⇒ 400 `OTP_INVALID`, không đọc mã.
- **Test:** `tests/unit/auth-register-pending.test.ts`, 7 test (gồm 2 test cho lỗ hổng trên). Cả bộ 790 / 790 qua, `tsc --noEmit` sạch.
- **Kiểm qua 8080:** tạo tài khoản thử `auth-hardening-test@example.invalid` ⇒ 201; đăng ký lại với mật khẩu và vai trò khác ⇒ 409 `EMAIL_PENDING_VERIFICATION`; đăng nhập mật khẩu cũ ⇒ 403 `EMAIL_NOT_VERIFIED`; mật khẩu "mới" ⇒ 401 (không bị ghi đè); đăng ký email Mây Xanh ⇒ 409 `EMAIL_TAKEN`; `resend-otp` email Mây Xanh ⇒ 400. Sau đó xoá tài khoản thử trên Neon và 5 khoá Redis của nó (mã OTP, hạn mức gửi mã, bộ đếm đăng nhập sai); đếm lại còn 0.
- Chưa kiểm thật trường hợp tài khoản bị khoá (cần khoá một tài khoản demo); unit test đã phủ.

### Bước 5 — worker băm mật khẩu (2026-11-22)

- Port `shared/ports/PasswordHasher.ts`: `hash(password, rounds)`, `compare(password, hash)`. Khác plan một chút: `hash` nhận `rounds` để `AuthService` giữ `SALT_ROUNDS = 12` ở một chỗ.
- `infrastructure/password-hash-worker.ts`: nhận `{ id, op, … }`, chạy `bcryptjs` bản đồng bộ, trả `{ id, result }` hoặc `{ id, error }`.
- `infrastructure/worker-password-hasher.ts` (`WorkerPasswordHasher`):
  - pool **2 worker** (`PASSWORD_HASH_POOL_SIZE`), tạo lười, mỗi worker một việc một lúc, việc thừa xếp hàng;
  - quá 10 giây (tính từ lúc giao việc) hoặc worker chết ⇒ việc đó **ném lỗi** (đăng nhập trả 500, không coi là sai mật khẩu), worker bị bỏ, lần sau tạo mới; việc đang xếp hàng chạy tiếp;
  - `ref` khi có việc, `unref` khi rảnh; `close()` cho test.
- `container.ts`: đăng ký bằng `asFunction` (chế độ PROXY của awilix sẽ báo lỗi nếu constructor đọc tuỳ chọn không đăng ký). `AuthService` nhận `passwordHasher`, không còn import `bcryptjs`. Các script seed / tạo admin vẫn dùng `bcryptjs` trực tiếp (không đổi).
- **Test:** `tests/unit/worker-password-hasher.test.ts`, 8 test (3 với worker thật: hash / compare, hash cũ của bcryptjs, 8 việc song song; 5 với worker giả: xếp hàng, `ref` / `unref`, quá giờ, worker chết, lỗi việc, không tạo được worker). Ba test auth có băm mật khẩu thêm bản giả `passwordHasher` (bcryptjs cost 4 trên luồng test). Cả bộ 797 / 798, test trượt là `live-rescore-marker` đã ghi ở bước 1. `tsc --noEmit` sạch.
- Build `.js` (tsc ra thư mục tạm, chạy bằng `node`): worker `.js` nạp được, hash / compare đúng.
- **Đo lại ngay** (cùng script bước 0, nhãn `after-step5`), độ trễ tính bằng ms:

| Pha | 404 (event loop) p50 / p95 / p99 / max | `/health` p50 / p95 | `/job-posts` p50 / p95 |
|---|---|---|---|
| Nền | 5 / 7 / 9 / 18 | 52 / 60 | 541 / 977 |
| 200 đăng nhập (26,2 s) | **5 / 7 / 8 / 25** | 57 / 96 | 580 / 1.096 |
| Nền | 5 / 8 / 10 / 12 | 56 / 62 | 582 / 609 |

  - So với bước 0 (pha đăng nhập 404 p99 1.736 ms, `/health` p50 973 ms, `/job-posts` p50 1.964 ms): request khác giờ như lúc nền. **Đạt mục tiêu của bước 8** (404 p99 < 100 ms, API không chậm quá 2 lần).
  - Bản thân đăng nhập cũng nhanh hơn: 200 lần trong 26,2 s thay vì 49,4 s, p50 1.025 ms thay vì 1.967 ms (2 luồng băm song song).

## Phần 4 — Ghi chú của chủ dự án

<!-- Dành cho chủ dự án. -->
