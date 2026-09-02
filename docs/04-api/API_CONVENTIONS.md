# API Conventions

Tài liệu này ghi lại các tiêu chuẩn/quy tắc dùng chung cho mọi endpoint giữa `apps/server` (Express) và `apps/web` (Next.js). Tạo lần đầu khi implement Phase 2 (`auth`, `users`) — sẽ bổ sung khi các module sau phát sinh nhu cầu mới, không viết trước cho mọi trường hợp chưa tồn tại. Khi có xung đột giữa tài liệu này và code, code là nguồn sự thật — cập nhật lại tài liệu.

Type dùng trong toàn bộ tài liệu (`ApiResponse`, `PaginatedResponse`, DTO request/response...) đều định nghĩa ở `packages/shared-types/src/index.ts` — không định nghĩa trùng ở `apps/server`/`apps/web`.

---

## 1. Base URL & routing

- Mọi route backend nằm dưới prefix `/api` (mount trong `apps/server/src/main.ts`, ví dụ `app.use("/api", authRouter(container))`).
- Qua Nginx (dev/demo): frontend gọi `NEXT_PUBLIC_API_URL=http://localhost:8080/api`, Nginx route `/api/*` → `apps/server`. Gọi thẳng `apps/server` (port 4000) khi cần iterate nhanh không qua gateway.
- Không có version prefix (`/api/v1`) — phạm vi khoá luận không cần versioning API; nếu phát sinh nhu cầu breaking change lớn, quyết định thêm version phải ghi vào `docs/02-architecture/ARCHITECTURE_DECISIONS.md`.
- Đặt tên route: danh từ số nhiều theo resource, kebab-case khi nhiều từ (`/job-posts`, `/saved-jobs`), lồng theo module (`/auth/*`, `/users/*`). Hành động không phải CRUD thuần dùng verb rõ nghĩa nối vào path (`/auth/verify-otp`, `/auth/forgot-password`) thay vì nhét vào query string.
- HTTP method theo đúng ngữ nghĩa REST: `GET` đọc (không side-effect), `POST` tạo mới hoặc hành động (login, verify-otp...), `PATCH` cập nhật một phần, `DELETE` xoá/huỷ. Không dùng `PUT` (không có nhu cầu replace toàn bộ resource ở domain này).

## 2. Response envelope

Mọi response (thành công lẫn lỗi) đều bọc qua `ApiResponse<T>`:

```ts
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
```

- Thành công có payload: `{ success: true, data: T }`.
- Thành công không cần payload (side-effect action, ví dụ `logout`, `resend-otp`): `{ success: true, message: "..." }`.
- Thất bại: `{ success: false, error: "..." }` — không bao giờ trả cả `data` lẫn `error` cùng lúc.
- Danh sách có phân trang bọc thêm một lớp `PaginatedResponse<T>` bên trong `data`:

```ts
interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}
// => ApiResponse<PaginatedResponse<JobPostSummary>>
```

Dùng **cursor-based pagination** (`nextCursor`, không dùng `page`/`limit` offset) cho mọi endpoint danh sách — nhất quán cho các list có thể thay đổi thường xuyên (tin tuyển dụng, ứng tuyển).

## 3. HTTP status code conventions

| Status | Khi nào dùng |
|---|---|
| `200` | Thành công (GET, hoặc action không tạo resource mới) |
| `201` | Tạo resource mới thành công (`POST /auth/register`, `POST /job-posts`...) |
| `400` | Validation lỗi (Zod), OTP sai/hết hạn, business rule vi phạm rõ ràng do input |
| `401` | Chưa xác thực — thiếu/sai/hết hạn/đã bị thu hồi access token |
| `403` | Đã xác thực nhưng không đủ quyền (role không khớp, tài khoản `SUSPENDED`, hành động bị chặn theo business rule) |
| `404` | Resource không tồn tại |
| `409` | Xung đột dữ liệu (email đã đăng ký, unique constraint) |
| `429` | Rate-limit (OTP, hoặc endpoint nhạy cảm khác ở Phase 11) |
| `500` | Lỗi không lường trước — log qua `logger.error`, **không** trả message/stack thật cho client (`"Internal server error"`) |
| `502` | Lỗi khi gọi external service (Resend, Cloudinary...) |

Quy tắc chọn `401` vs `403`: `401` = "tôi không biết bạn là ai" (token thiếu/sai/hết hạn/bị revoke), `403` = "tôi biết bạn là ai nhưng bạn không được phép làm việc này".

## 4. Error handling

- Mọi lỗi nghiệp vụ ném bằng `AppError(statusCode, message)` (`apps/server/src/shared/errors/AppError.ts`), bắt tập trung bởi `errorHandler` middleware — controller chỉ `catch (error) { next(error); }`, không tự `res.status().json()` khi lỗi.
- `message` trong `AppError` phải an toàn để hiển thị trực tiếp cho client (tiếng Anh, ngắn gọn, không rò rỉ chi tiết nội bộ như SQL error, stack trace, hay việc email có tồn tại trong hệ thống hay không ở các luồng nhạy cảm như `forgot-password`).
- Lỗi validate (Zod, qua middleware `validate(schema)`) trả `400` với `error` là các message của từng field nối bằng `", "` — xem `apps/server/src/shared/middleware/validate.ts`. Không trả cấu trúc field-by-field riêng ở giai đoạn này (đơn giản hoá cho quy mô khoá luận).
- Frontend luôn kiểm tra `success` trước khi đọc `data`; hiển thị `error`/`message` trực tiếp cho user khi phù hợp (đa số message đã viết theo hướng end-user-friendly).

## 5. Authentication

- **JWT Bearer token**, không dùng cookie/session. Client gửi `Authorization: Bearer <accessToken>` cho mọi route cần đăng nhập.
- Access token: TTL ngắn (`JWT_ACCESS_EXPIRY`, mặc định `15m`). Refresh token: TTL dài (`JWT_REFRESH_EXPIRY`, mặc định `7d`), chỉ gửi qua body JSON (`POST /auth/refresh`), không đặt trong header.
- Payload JWT tối thiểu: `{ sub: userId, role, jti, iat, exp }` — frontend không cần (và không nên) tự decode payload để lấy thông tin hiển thị, luôn gọi `GET /users/me` để lấy profile mới nhất.
- Luồng refresh: khi access token hết hạn (`401`), gọi `POST /auth/refresh` với `refreshToken` còn hạn để lấy access token mới. Refresh **không rotate** ở MVP — cùng một refresh token dùng lại được tới khi hết hạn hoặc bị revoke qua `logout`.
- Luồng logout: `POST /auth/logout` (yêu cầu Bearer access token hợp lệ) kèm `refreshToken` trong body nếu muốn thu hồi luôn cả hai — cả access lẫn refresh token hiện tại bị đưa vào blacklist (Redis), dùng lại sẽ nhận `401`.
- Danh sách route hiện có: xem chi tiết luồng ở `docs/phases/phase-02-identity-access/PLAN.md` §Phần 2 (register/verify-otp/resend-otp/login/google/forgot-password/reset-password/refresh/logout) và `GET /users/me`.

## 6. Authorization (role guard)

- Role hệ thống: `CANDIDATE | EMPLOYER | ADMIN` (`Role` enum, dùng chung Prisma + `shared-types`).
- Middleware chain chuẩn cho route cần giới hạn role: `authenticate(container)` → `authorize(...roles)` → controller (xem `apps/server/src/shared/middleware/`). `authorize` luôn đặt sau `authenticate`.
- Endpoint public (Guest, không cần token): tìm kiếm/xem tin tuyển dụng, xem thông tin doanh nghiệp công khai (Phase 5+) — không mount `authenticate`.
- Không endpoint nào trong `auth` chấp nhận `role=ADMIN` ở request body (`register`, `google`) — validate ở tầng Zod DTO, không phải ở service. Tài khoản Admin chỉ tồn tại qua `apps/server/scripts/create-admin.ts`.

## 7. Request conventions

- `Content-Type: application/json` bắt buộc cho mọi request có body — server chỉ mount `express.json()`, không hỗ trợ `multipart/form-data` ở tầng route thường (upload file qua `MediaStorageService`/Cloudinary ở Phase 6 sẽ có convention riêng khi implement).
- Field naming: `camelCase` xuyên suốt request/response body (khớp Prisma Client field naming, không map lại sang `snake_case` dù cột DB dùng snake_case qua `@@map`).
- Email luôn được server chuẩn hoá lowercase + trim trước khi so khớp/lưu — frontend không bắt buộc phải tự làm việc này nhưng nên làm để tránh nhầm lẫn UX (validate lỗi trước khi gửi).
- Enum value trong request/response giữ nguyên `UPPER_SNAKE_CASE` như Prisma enum (`"CANDIDATE"`, `"PENDING_VERIFICATION"`...) — không chuyển sang lowercase/label ở tầng API, việc hiển thị label tiếng Việt là trách nhiệm của frontend.

## 8. Datetime & ID format

- Timestamp trả về client luôn là chuỗi ISO 8601 UTC (`Date.prototype.toISOString()`), không bao giờ trả `Date` object thô hay epoch số.
- ID mọi entity là `cuid` dạng string (`@id @default(cuid())`) — không giả định format số nguyên tăng dần.

## 9. Rate limiting

- Response khi vượt rate-limit: `429` với `ApiResponse` dạng lỗi, message end-user-friendly (ví dụ `"Please wait before requesting another OTP"`). Không trả header `Retry-After` ở giai đoạn này (có thể bổ sung nếu frontend cần hiển thị countdown chính xác).
- Rate-limit hiện áp dụng cho luồng OTP (theo email + theo IP, xem `docs/phases/phase-02-identity-access/PLAN.md`). Endpoint nhạy cảm khác (login sai nhiều lần liên tiếp...) sẽ bổ sung rate-limit khi implement Phase 11 nếu cần.

## 10. CORS

- `CORS_ORIGIN` (env) whitelist đúng một origin cho frontend dev (`http://localhost:3000` mặc định) — không dùng `origin: "*"`. Không bật `credentials: true` (không dùng cookie cho auth, xem mục 5).

## 11. Danh mục (catalog) & giá trị cố định

- Các bảng danh mục (`Major`, `University`, `Industry`, `City`, `CompanyType`, `Skill` — Phase 1/5+) trả về nguyên `{ id, name }`, frontend tự build dropdown/filter — không hardcode danh sách phía frontend.

## 12. Ghi chú khi thêm module mới

Khi implement một module mới (Phase 3 trở đi), nếu phát sinh convention chưa có ở đây (ví dụ format upload file, convention cho Socket.IO event payload ở Phase 8, hay convention riêng cho endpoint Admin), bổ sung trực tiếp vào file này theo đúng mục liên quan — không tạo file convention rời rạc theo từng module.
