# Initial Architecture Plan

Trạng thái: Bản kế hoạch ban đầu (Phase 0 discovery). Các quyết định dưới đây đã được xác nhận với chủ dự án; phần "Architecture decisions that still need approval" liệt kê những gì còn lại cần chốt trước khi implement.

## 1. Proposed architecture

```text
Next.js Frontend (apps/web)
        |
        v
Nginx API Gateway (infra/docker-compose, reverse proxy config)
   route "/api/*"  -> apps/server (Express)
   route "/*"       -> apps/web (Next.js)
        |
        v
Express Backend API (apps/server)
   └── Socket.IO gateway (apps/server/src/socket, chạy chung process)
        |
   +----+-----------------------+
   |            |               |
   v            v               v
PostgreSQL    Redis         External Services
(Neon, qua    Cloud          (Cloudinary, Resend)
 Prisma)
```

Khác với gợi ý mặc định ban đầu (API Gateway/Redis "cân nhắc thêm sau"), dự án đã quyết định **thiết lập Nginx và Redis sớm** (từ Phase 0/2) — xem rationale ở mục 4 và 6.

## 2. Frontend responsibilities

- Render UI theo 4 nhóm actor (route groups `(public)/(auth)/(candidate)/(employer)/(admin)`).
- Gọi API qua Nginx gateway (không gọi thẳng `apps/server` trong môi trường có Nginx chạy), dùng React Query cho data fetching, Zustand cho state client-side cần thiết (auth session, UI state).
- Kết nối Socket.IO client cho tính năng nhắn tin realtime (Phase 9).
- Không chứa business logic (validate nghiệp vụ, tính toán trạng thái...) — chỉ hiển thị và gọi API.

## 3. Backend responsibilities

- Xử lý toàn bộ business logic theo module domain (`apps/server/src/modules/*`).
- Xác thực/phân quyền theo Role (Candidate/Employer/Admin) — Guest không cần token cho các endpoint public.
- Vòng đời JobPost và cơ chế duyệt/thu hồi tin (chi tiết mục 12).
- Phát Socket.IO event cho tin nhắn, thông báo realtime.
- Gọi ra external services (Cloudinary, Resend) qua service boundary riêng, không để module nghiệp vụ phụ thuộc trực tiếp SDK.

## 4. API Gateway (Nginx) responsibilities

**Quyết định:** Nginx được thiết lập sớm, chạy với cấu hình reverse proxy tĩnh (`infra/nginx/nginx.conf`) trong `infra/docker-compose.yaml`, ngay từ Phase 0 — không phải đợi tới giai đoạn triển khai/production như gợi ý mặc định ban đầu.

- Route `/api/*` → `apps/server` (Express).
- Route còn lại → `apps/web` (Next.js) — cho phép demo một entry point duy nhất giống môi trường production.
- Vai trò trong dev: routing tập trung; rate-limit cơ bản qua `limit_req_zone`/`limit_req`; CORS qua `add_header` khi cần demo capability của gateway ở Phase 12. **Lưu ý:** Nginx không có hệ plugin JWT/key-auth như Kong — xác thực/phân quyền vẫn hoàn toàn nằm ở tầng backend Express, Nginx chỉ đóng vai trò reverse proxy + rate-limit/CORS cơ bản.

**Rủi ro cần lưu ý (ghi rõ theo yêu cầu):** Next.js dev server dùng HMR qua WebSocket. Nếu proxy toàn bộ `apps/web` qua Nginx, cần đảm bảo Nginx forward đúng WebSocket upgrade request (`proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`), nếu không HMR sẽ không hoạt động hoặc chậm — quy tắc này áp dụng tương tự cho việc proxy Socket.IO. Giải pháp dự phòng: cho phép developer truy cập thẳng port Next.js khi cần iterate UI nhanh, và dùng đường qua Nginx chủ yếu để test luồng API end-to-end + demo gateway capability. Việc này sẽ được xác nhận thực tế khi implement Phase 0.

## 5. Socket.IO architecture direction

**Quyết định:** Socket.IO chạy **chung process** với Express trong `apps/server` (`new Server(httpServer)` cạnh app Express), không tách thành service riêng.

Lý do: dự án triển khai single-instance cho phạm vi khoá luận — một service realtime riêng chỉ có giá trị khi cần scale ngang độc lập hoặc deploy cadence khác backend chính, cả hai điều kiện đều không áp dụng ở đây. Nếu sau này cần scale ngang, có thể thêm Redis adapter cho Socket.IO (Redis đã sẵn có từ Phase 2).

## 6. Redis responsibilities

**Quyết định:** Redis được thiết lập sớm, dùng từ Phase 2 — không trì hoãn tới khi có nhu cầu cụ thể mới thêm.

Vai trò cụ thể:
- Rate-limit OTP (theo IP + theo identifier) — thay thế in-memory limiter.
- JWT blacklist/revocation khi logout hoặc thu hồi phiên.
- (Tuỳ chọn, Phase 6+) Cache kết quả tìm kiếm tin tuyển dụng nếu cần.
- (Tuỳ chọn, nếu scale ngang) Socket.IO adapter cho multi-instance realtime.

Ngay cả khi dùng Redis thật từ đầu, nên bọc qua interface mỏng (`RateLimiter`, `TokenBlacklist`) để unit test không cần Redis thật chạy.

## 7. Cloudinary integration direction

Bọc qua một service interface duy nhất (ví dụ `MediaStorageService` trong `apps/server/src/infrastructure/`), expose các thao tác: upload, lấy URL, xoá. Các module nghiệp vụ (`students` cho avatar, `companies` cho logo/banner, `cv` cho file CV) chỉ gọi qua interface này, không import trực tiếp SDK Cloudinary — cho phép đổi provider lưu trữ sau này mà không sửa business logic.

## 8. Resend integration direction

Bọc qua interface `EmailSender` dùng chung cho:
- OTP đăng ký/đăng nhập/quên mật khẩu (Phase 2), có `OTP_HARDCODE`/`OTP_HARDCODE_VALUE` để bỏ qua gửi email thật khi dev.
- Email giao dịch (Phase 10): cập nhật trạng thái ứng tuyển, tin tuyển dụng được duyệt/bị thu hồi, công ty được xác minh.

## 8b. Google OAuth integration direction (chỉ Candidate/Employer)

**Quyết định:** Candidate/Employer đăng ký & đăng nhập được bằng 2 cách — email/password (mục 8) hoặc Google OAuth. Admin **không** dùng Google OAuth, xem mục "Admin bootstrap" bên dưới.

- Luồng Authorization Code / One Tap: frontend nhận `id_token` (hoặc `code`) từ Google, gửi lên `POST /auth/google` kèm `role` mong muốn (`CANDIDATE` | `EMPLOYER` — bắt buộc, chỉ dùng khi tạo mới).
- Backend verify token bằng `google-auth-library` (`OAuth2Client.verifyIdToken`), lấy `email`/`sub` (Google user id) đã xác thực từ Google, không tin payload client tự gửi.
- Tìm `User` theo `googleId` trước; nếu không có, tìm theo `email`:
  - Email trùng với `User` đã đăng ký bằng password → gắn `googleId` vào `User` đó (liên kết tài khoản), không tạo bản ghi mới, giữ nguyên `role` hiện có (bỏ qua `role` client gửi trong trường hợp này).
  - Không tìm thấy → tạo `User` mới với `googleId`, `email`, `role` theo giá trị client gửi (chỉ nhận `CANDIDATE`/`EMPLOYER`), `passwordHash = null`, `status = ACTIVE` (email đã được Google xác thực nên bỏ qua bước OTP).
- **Không có route nào chấp nhận `role=ADMIN`** qua luồng này, kể cả khi email trùng với một Admin đã tồn tại — trường hợp đó bị từ chối tường minh (Admin chỉ đăng nhập bằng password, xem mục Admin bootstrap).

## 9. AI integration boundary

Module `apps/server/src/modules/ai/` chia hai lớp:

- **`ports/`** — interface thuần TypeScript, không import bất kỳ SDK AI nào: `CvAnalyzer.analyze(cvText)`, `JobMatcher.matchScore(studentProfile, jobPost)`, `CandidateRanker.rank(applications)`, `CvImprover.suggestImprovements(cvText)`.
- **`adapters/`** — implementation cụ thể (ví dụ Gemini, OpenRouter), đăng ký qua `awilix` container.

Các module nghiệp vụ (`students`, `job-posts`, `applications`) chỉ được phép phụ thuộc vào port interface qua dependency injection, **không bao giờ** phụ thuộc trực tiếp vào adapter cụ thể hoặc SDK AI. Type `AIProvider`/`AIProviderType` (`'gemini' | 'openrouter'`) sẽ tái sử dụng đúng shape đã tồn tại trong `packages/shared-types/src/index.ts` hiện tại (dù hiện là leftover của dự án khác, shape này là một pattern hợp lý để tái dùng khi build AI thật ở Phase 11).

Một feature flag (`AI_FEATURES_ENABLED` hoặc theo từng feature) phải cho phép tắt hoàn toàn AI mà không ảnh hưởng các module nghiệp vụ khác — đây là tiêu chí Definition-of-Done của Phase 11.

## 10. Security considerations

- JWT cho access/refresh token, blacklist qua Redis khi logout/revoke.
- Rate-limit OTP và các endpoint nhạy cảm (login, register) qua Redis.
- Input validation ở mọi module (nên dùng một schema validation library thống nhất — quyết định cụ thể để lại cho Phase 1).
- Role-based authorization ở tầng middleware, kiểm tra trước khi vào route group tương ứng cả ở frontend (`middleware.ts`) lẫn backend (route guard).
- Không có endpoint nào (kể cả `/auth/register`, `/auth/google`) chấp nhận `role=ADMIN` — validation ở tầng DTO (Zod) chặn cứng giá trị này; tài khoản Admin chỉ tồn tại nếu được tạo qua script bootstrap (xem mục dưới).
- Không log secrets/token/OTP thật ra log thông thường.
- Nginx có thể đóng vai trò lớp bảo mật bổ sung (rate-limit/CORS ở tầng reverse proxy) ở Phase 12, không thay thế cho auth ở tầng backend.

## 11. Potential risks

- Next.js dev HMR qua Nginx (mục 4) — cần xác nhận sớm, không để tới gần deadline.
- Redis là single point of failure cho rate-limit/blacklist nếu không có fallback — chấp nhận được ở quy mô khoá luận, nhưng nên ghi rõ trong tài liệu triển khai (Phase 14).
- Schema chưa chốt (`JobPost.jobType` enum, `WorkExperience.company` typing) có thể gây phải migrate lại nếu không quyết định sớm ở Phase 1.
- Cơ chế duyệt/thu hồi tin (mục 12) là delta mới so với Class Diagram gốc — cần cập nhật chính thức diagram trước khi đưa vào báo cáo khoá luận, tránh mâu thuẫn tài liệu.

## 12. Cơ chế duyệt tin & thu hồi bài đăng (quyết định nghiệp vụ đã xác nhận)

Yêu cầu gốc từ chủ dự án: *"Admin có thể đánh dấu bật/tắt một công ty có cần duyệt bài khi đăng tin hay không. Admin có thể rút bài và đánh dấu số lần rút bài để đưa ra quyết định."*

### Model bổ sung (delta so với Class Diagram gốc — cần cập nhật diagram chính thức sau)

- `Company.requiresApproval: boolean` — mặc định `true` khi công ty được Admin `verify()`; Admin có thể bật/tắt riêng cho từng công ty.
- `JobPostStatus` bổ sung giá trị **`TAKEN_DOWN`** — tách biệt với `CLOSED` (employer tự đóng) và `EXPIRED` (tự động hết hạn), để không tính nhầm việc employer tự đóng tin vào số lần bị thu hồi.
- Entity mới `JobPostModerationAction` (id, jobPost, action: `SUBMITTED | APPROVED | REJECTED | RETRACTED`, actor: User | null, reason?, createdAt) — log đầy đủ mọi hành động; `Company.retractionCount` là giá trị **derive** từ số action `RETRACTED` (không phải counter rời rạc không có audit trail).

### Luồng nghiệp vụ

1. Employer tạo `JobPost` → `DRAFT`.
2. Employer gọi `submitForApproval()`/`publish()`:
   - Nếu `Company.requiresApproval == true` → `PENDING`. Admin duyệt (`APPROVED` → `PUBLISHED`, log action) hoặc từ chối (`REJECTED` → về `DRAFT` kèm lý do, employer sửa và nộp lại).
   - Nếu `Company.requiresApproval == false` → `publish()` chuyển thẳng `DRAFT` → `PUBLISHED`, log action `APPROVED` với `actor = null` (tự động, không qua Admin).
3. Bất kể publish qua đường nào, Admin luôn có quyền thu hồi (`TAKEN_DOWN`) một tin đang `PUBLISHED` bất kỳ lúc nào, **bắt buộc kèm lý do** → log action `RETRACTED`, `Company.retractionCount` tăng.
4. Admin xem `retractionCount` (và chi tiết log) trong màn "Quản lý nhà tuyển dụng" để **tự quyết định thủ công** có bật lại `requiresApproval = true` cho công ty đó hay không.
5. `close()` (employer tự đóng tin, ví dụ đã tuyển đủ) **không** ảnh hưởng `retractionCount`.

### Giới hạn phạm vi MVP

Không xây dựng ngưỡng tự động hoá (auto-threshold — ví dụ tự động bật `requiresApproval` khi `retractionCount` vượt X) ở giai đoạn MVP. Giữ quyết định hoàn toàn thủ công bởi Admin để đơn giản và dễ giải trình trong khoá luận. Tự động hoá ngưỡng được ghi nhận như một hướng cải tiến tương lai (xem Open Questions trong `PROJECT_OVERVIEW.md`).

## 12b. Admin bootstrap (không qua API)

**Quyết định:** Admin không phải là một luồng người dùng — không có UI đăng ký, không có route API tạo Admin. Tài khoản Admin được tạo bằng một script chạy thủ công:

- `apps/server/scripts/create-admin.ts` — đọc `ADMIN_EMAIL`/`ADMIN_PASSWORD` từ biến môi trường (`.env`, xem `.env.example`), hash password bằng `bcryptjs`, rồi `upsert` thẳng vào bảng `users` (Prisma Client) với `role = ADMIN`, `status = ACTIVE`, `passwordHash` đã hash.
- Chạy bằng `npm run create-admin` (script mới trong `apps/server/package.json`), tương tự cách chạy `npm run db:seed` — không khởi động Express, không đi qua bất kỳ route/middleware nào.
- Dùng `upsert` (không phải `create`) để script idempotent — chạy lại nhiều lần với cùng email chỉ cập nhật password/role, không tạo trùng.
- Admin đăng nhập bằng route đăng nhập chung (`/auth/login`, email/password) — không dùng Google OAuth (mục 8b).

## 12c. Payment/Subscription integration boundary

**Quyết định:** Không dùng message queue (RabbitMQ/Redpanda/Kafka) cho luồng thanh toán. Xử lý IPN callback từ VNPay/Momo trực tiếp trong 1 Prisma transaction (verify chữ ký → update `Payment`/`Transaction`/`CompanySubscription` → response) trong cùng process Express.

Lý do: dự án tham khảo kiến trúc microservices (`event-ticketing-platform`) dùng RabbitMQ vì `payment-service` phải báo tin bất đồng bộ cho các service khác (`booking-service`, `event-service`) — các process/DB hoàn toàn tách biệt. Ở đây `apps/server` là monolith 1 process/1 database, không có ranh giới service nào cần decouple; toàn bộ thao tác nằm trên cùng 1 DB nên gộp vào 1 transaction là đủ, tránh thêm infra chưa cần thiết.

Boundary tích hợp cổng thanh toán: bọc qua interface theo từng `PaymentMethod.processorType` (ví dụ `VnPayGateway`/`MoMoGateway`) trong `apps/server/src/modules/payments/`, tương tự cách `MediaStorageService` bọc Cloudinary (mục 7) — module `payments` không phụ thuộc trực tiếp SDK/HTTP client cụ thể của từng cổng ngoài lớp adapter này.

Idempotency: chống xử lý trùng 1 callback IPN dựa vào `Transaction.providerTransactionId` unique — callback gọi lại nhiều lần với cùng mã giao dịch chỉ xử lý 1 lần; mọi callback nhận được (kể cả không khớp được `Transaction`) đều ghi vào `PaymentCallbackLog` trước, tách biệt khỏi luồng xử lý nghiệp vụ.

Chi tiết đầy đủ mô hình dữ liệu: `docs/designs/SUBSCRIPTION_BILLING_DESIGN.md`.

## 13. Architecture decisions that still need approval

- Cập nhật chính thức Class Diagram để phản ánh cơ chế duyệt/thu hồi tin (mục 12) trước khi đưa vào báo cáo khoá luận.

### Đã chốt ở Phase 1 (trước đây nằm trong mục này)

- **`JobPost.jobType`:** enum `JobPostType = INTERNSHIP | PART_TIME | FULL_TIME | CONTRACT`.
- **`WorkExperience.company`:** giữ `String` tự do (đã ghi trong Assumptions, `PROJECT_OVERVIEW.md` mục 13), không liên kết entity `Company`.
- **`Conversation.jobPost`:** optional (nullable FK) trong schema.
- **`Conversation` participants:** FK trực tiếp `studentId`/`employerId` (mỗi conversation cố định đúng 1 candidate + 1 employer), không dùng bảng nối `ConversationParticipant` generic — xem `DATABASE_DESIGN.md` mục "Messaging".
- **Schema validation library:** **Zod** — dùng cho (1) validate `process.env` lúc boot (`apps/server/src/shared/config/env.ts`, type-safe config thay vì đọc `process.env` thô), (2) middleware `validate(schema)` dùng chung cho request body/query/params, sẵn sàng cho các route nghiệp vụ từ Phase 2 trở đi. Lý do chọn Zod: TypeScript-first (suy ra type tự động từ schema, không cần định nghĩa DTO trùng lặp), không phụ thuộc decorator/reflect-metadata (khớp phong cách function-based hiện tại của repo, không dùng NestJS), phổ biến và đủ nhẹ cho quy mô khoá luận.
- **Error handling convention:** class `AppError` (statusCode + message) ném từ service/controller, middleware `errorHandler` tập trung ở cuối middleware chain trả về đúng shape `ApiResponse` (`packages/shared-types`). Logging: chưa cần thêm thư viện (Winston/Pino) ở Phase 1 — dùng wrapper `console` mỏng (`shared/logger.ts`), cân nhắc thay thế nếu nhu cầu thực tế phát sinh ở phase sau (tránh thêm dependency chưa cần thiết).
- **Password hashing library:** **`bcryptjs`** (pure-JS, không cần build native trên Windows) — dùng chung cho script `create-admin.ts` (mục 12b) và auth module thật ở Phase 2 (`/auth/register`, `/auth/login` bằng password).
