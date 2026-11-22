# Đăng nhập, đăng ký bền và an toàn hơn — Frontend

> **Trạng thái: ĐÃ DUYỆT (lập và duyệt 2026-11-22).** Chưa code. Làm sau backend (`docs/06-backend/auth-hardening/PLAN.md`). Quyết định kiến trúc: AD-31 (bổ sung AD-22). Giao diện theo skill `sip-ui` (đọc trước khi code). Ước lượng ~0,5 ngày, kể cả kiểm trên trình duyệt.

## Mục tiêu

1. Web chỉ xoá phiên khi server nói rõ phiên đã hết (401 / 403 ở `/auth/refresh`). Mất mạng, server khởi động lại, Redis lỗi (503) thì **giữ phiên** và báo lỗi tạm thời.
2. Thông báo tiếng Việt cho các mã lỗi mới: chặn đăng nhập, sai OTP, mã bị huỷ, email đã có tài khoản, email chờ xác thực.
3. Đăng ký lại email chờ xác thực thì chuyển thẳng sang bước nhập mã.
4. Nhập OTP mãi không được thì gợi ý gửi yêu cầu hỗ trợ ở trang `/support` (loại "Vấn đề khác"), để Admin kích hoạt thủ công.
5. Đóng AD-22: chạy 5 bước kiểm trên trình duyệt và ghi kết quả.

## Hiện trạng (đọc code 2026-11-22)

- `lib/api-client.ts`:
  - `requestAccessToken` trả `null` cho **mọi** lỗi (401, 5xx, mất mạng). `refreshAccessToken` / `refreshAccessTokenShared` trả `string | null`.
  - `apiFetch`, `apiDownload`, `apiUpload`: 401 ⇒ refresh ⇒ `null` thì `endSession(area)`. Hàm này xoá store, localStorage và cookie dùng chung mọi tab cùng khu vực.
- `lib/support-chat-stream.ts` (`sendWithSession`): refresh `null` hoặc gọi lại vẫn 401 ⇒ `onExpired` ⇒ `clear()`.
- `hooks/useSocket.ts`: `connect_error` chỉ gọi `refreshAccessTokenShared`, không xoá phiên. Giữ nguyên.
- `LoginForm.tsx`: nhận 403 chưa xác thực bằng cách so chuỗi `"not verified"`, rồi gọi `resend-otp` và chuyển sang `OtpForm`. Các lỗi khác in thẳng `err.message` (tiếng Anh).
- `RegisterForm.tsx`: mọi lỗi in thẳng `err.message`, nên 409 hiện "Email already registered".
- `OtpForm.tsx` (dùng ở đăng ký và ở đăng nhập khi chưa xác thực): in thẳng message lỗi; nút "Gửi lại mã" có đếm ngược.
- `ResetPasswordForm.tsx` (dùng ở `ForgotPasswordForm` và thẻ "Mật khẩu" của Cài đặt): có ô OTP.
- Trang `/support` nhận `?category=ACCOUNT_SUSPENDED|OTHER&email=…`. `SupportContactForm` có `initialEmail`, `initialCategory`, chưa có nội dung điền sẵn. Server giới hạn nội dung 20–2.000 ký tự.

## Các bước

### F1 — Refresh phân biệt "hết phiên" và "tạm thời lỗi" (D1 của AD-31)

- `requestAccessToken` trả một trong ba kết quả:
  - `{ kind: "ok", accessToken }`;
  - `{ kind: "expired" }` khi 401 / 403;
  - `{ kind: "unavailable" }` khi status 0, 5xx hoặc 429.
- `refreshAccessToken` giữ logic AD-22 (đọc refresh token mới nhất, thử lại khi tab khác đổi phiên) và trả kết quả ba dạng. `refreshAccessTokenShared` gộp theo khu vực như cũ.
- `apiFetch` / `apiDownload` / `apiUpload` khi gặp 401:
  - `ok` ⇒ gọi lại;
  - `expired` ⇒ `endSession` (như cũ);
  - `unavailable` ⇒ **không** xoá phiên, ném `ApiError(503, "Không kết nối được máy chủ, vui lòng thử lại sau ít phút", …, "AUTH_STORE_UNAVAILABLE")`.
- Request trả 503 `AUTH_STORE_UNAVAILABLE` ngay lần đầu ⇒ không refresh, chỉ ném lỗi (đã đúng sẵn, chỉ cần kiểm).
- `support-chat-stream.ts`: chỉ gọi `onExpired` / `clear()` khi refresh trả `expired`; `unavailable` ⇒ báo lỗi tạm thời như lỗi mạng.
- `useSocket.ts`: cập nhật theo kiểu trả về mới, hành vi giữ nguyên.
- `SessionSync`: không đổi (lỗi `/users/me` tạm thời chỉ làm query lỗi, không xoá phiên).

### F2 — Thông báo lỗi tiếng Việt

- `lib/auth-errors.ts`: hàm `authErrorMessage(err, fallback)` đổi `ApiError.code` sang câu tiếng Việt:

| Code | Câu hiển thị |
|---|---|
| `LOGIN_LOCKED` | "Bạn đã nhập sai quá nhiều lần. Thử lại sau N phút, hoặc dùng Quên mật khẩu." (N làm tròn lên từ `retryAfterSeconds`) |
| 401 kèm `attemptsLeft` | "Email hoặc mật khẩu không đúng. Còn N lần thử trước khi bị tạm khoá 15 phút." |
| 401 không kèm | "Email hoặc mật khẩu không đúng." |
| `OTP_INVALID` | "Mã không đúng hoặc đã hết hạn. Còn N lần nhập." (không có N thì bỏ vế sau) |
| `OTP_ATTEMPTS_EXCEEDED` | "Bạn đã nhập sai 5 lần, mã này đã bị huỷ. Bấm Gửi lại mã để nhận mã mới." |
| `EMAIL_TAKEN` | "Email này đã có tài khoản." kèm link Đăng nhập và Quên mật khẩu |
| `AUTH_STORE_UNAVAILABLE`, status 0, 5xx | "Không kết nối được máy chủ, vui lòng thử lại sau ít phút." |
| 429 của OTP (gửi lại mã) | "Bạn đã yêu cầu mã quá nhiều lần, vui lòng thử lại sau." |

- Dùng ở `LoginForm`, `RegisterForm`, `OtpForm`, `ResetPasswordForm`, `ForgotPasswordForm`. Không đổi các câu đã có tiếng Việt (tài khoản bị khoá, Google).

### F3 — Đăng nhập

- `LoginForm`:
  - nhận chưa xác thực bằng `code === "EMAIL_NOT_VERIFIED"` (giữ so chuỗi cũ làm dự phòng);
  - `LOGIN_LOCKED` ⇒ câu ở F2, link "Quên mật khẩu?" nổi rõ;
  - lỗi thường hiện qua `authErrorMessage`.
- Trang đăng nhập Admin `/admin` (`app/admin/page.tsx`): cùng thông báo cho `LOGIN_LOCKED`.

### F4 — Đăng ký lại email chờ xác thực (D5)

- `RegisterForm`:
  - `EMAIL_PENDING_VERIFICATION` ⇒ gọi `/auth/resend-otp` (lỗi 429 cooldown thì bỏ qua, vì mã cũ có thể còn hạn) ⇒ chuyển sang `OtpForm` kèm ghi chú: "Email này đã đăng ký nhưng chưa xác thực. Mã mới đã được gửi tới email. Mật khẩu là mật khẩu bạn đặt lần đăng ký trước; nếu quên, sau khi xác thực hãy dùng Quên mật khẩu."
  - `EMAIL_TAKEN` ⇒ câu ở F2 kèm link Đăng nhập (giữ `role` trên URL) và Quên mật khẩu.
- `OtpForm` nhận prop `notice?: string` để hiện ghi chú trên (dùng `Alert` / kiểu thông báo sẵn có theo `sip-ui`).

### F5 — Gợi ý gửi yêu cầu hỗ trợ khi nhập OTP mãi không được (D7)

- Hiện gợi ý trong `OtpForm` khi **một trong ba**:
  - đã nhập sai từ 3 lần trở lên trong form (đếm phía client);
  - server trả `OTP_ATTEMPTS_EXCEEDED`;
  - "Gửi lại mã" bị 429 (vượt hạn mức mỗi giờ).
- Nội dung: "Không nhận được mã hoặc nhập mãi không được? **Gửi yêu cầu hỗ trợ**, quản trị viên sẽ kiểm tra và kích hoạt tài khoản giúp bạn."
- Link: `/support?category=OTHER&email=<email>&message=<câu điền sẵn>`, với câu điền sẵn: "Mình không xác thực được email khi đăng ký tài khoản (không nhận được mã OTP hoặc nhập mã không được). Nhờ quản trị viên kiểm tra giúp."
- `ResetPasswordForm`: cùng gợi ý, câu điền sẵn đổi thành "…khi đặt lại mật khẩu…". Ở thẻ "Mật khẩu" trong Cài đặt (đã đăng nhập) vẫn hiện, link mở tab mới.
- Trang `app/support/page.tsx`: đọc thêm `message` (cắt 2.000 ký tự) ⇒ `SupportContactForm` thêm prop `initialMessage`. Loại vẫn chỉ `ACCOUNT_SUSPENDED` / `OTHER`, server không đổi.
- Phía Admin không đổi: đọc yêu cầu, trao đổi qua email, bấm "Kích hoạt thủ công" ở `/admin/users/[id]`.

### F6 — Kiểm trên trình duyệt

Qua `localhost:8080`, cửa sổ ẩn danh, dùng tài khoản thử (không dùng tài khoản demo chính cho các bước làm khoá):

1. **AD-22, 5 bước** (bảng "Cách kiểm" trong AD-22): ghi kết quả vào AD-22 và đổi trạng thái AD-22 thành đã kiểm.
2. **Redis hỏng** (theo bước 8 của plan backend, Redis local): đang đăng nhập, dừng Redis ⇒ thao tác báo "Không kết nối được máy chủ…", không bị đưa về trang chủ, tab khác cùng khu vực vẫn còn phiên; bật lại Redis ⇒ dùng tiếp không cần đăng nhập lại.
3. **Chặn đăng nhập:** sai 3 lần ⇒ thấy "còn 2 lần"; sai lần 5 ⇒ câu tạm khoá; đúng mật khẩu ngay sau đó vẫn bị chặn.
4. **OTP:** đăng ký mới, nhập sai 3 lần ⇒ hiện gợi ý hỗ trợ; sai lần 5 ⇒ mã bị huỷ; bấm link ⇒ `/support` điền sẵn email, loại "Vấn đề khác", nội dung.
5. **Đăng ký lại email chờ xác thực** ⇒ sang bước nhập mã kèm ghi chú; email đã kích hoạt ⇒ câu tiếng Việt kèm hai link.
6. **Quên mật khẩu:** sai mã ⇒ "còn N lần"; gợi ý hỗ trợ hiện đúng.
7. Màn hình 375 px: các câu báo và link không vỡ.

## Không làm trong đợt này

- Đổi cách lưu token (cookie httpOnly).
- Loại yêu cầu hỗ trợ riêng cho xác thực email.
- Thông báo cho chủ tài khoản khi tài khoản bị chặn đăng nhập.

## Phần 4 — Ghi chú của chủ dự án

<!-- Dành cho chủ dự án. -->
