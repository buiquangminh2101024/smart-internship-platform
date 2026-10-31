# Hỏi Redis song song khi xác thực access token — Backend

Nền tảng: AD-17 (khoá tài khoản), AD-18 (thu hồi mọi phiên). Tách khỏi `docs/06-backend/employer-identity-cache/PLAN.md` để commit, đo và hoàn tác riêng.

**Trạng thái: ĐÃ DUYỆT và ĐÃ TRIỂN KHAI (2026-10-17); đã kiểm khu Employer và socket trên trình duyệt.** Xem "Ghi chú triển khai" ở cuối. Không đổi API, mã lỗi, khoá Redis, frontend. Không thêm dependency. Không cần AD mới (không đổi kiến trúc, chỉ đổi cách gọi 3 port có sẵn).

## Mục tiêu

Mọi request đã đăng nhập (Candidate, Employer, Admin) và mọi lần mở kết nối Socket.IO đang hỏi Redis **3 lần nối tiếp nhau**. Chuyển sang hỏi cả 3 cùng lúc, giữ nguyên kết quả và thứ tự lỗi.

Đo ngày 2026-10-17 (máy dev → Redis Cloud Singapore, trung vị 25 lần): 3 lệnh `GET` tuần tự 99–119 ms; gộp 1 lượt (`MGET`) 33–40 ms. Kỳ vọng bớt khoảng 70–80 ms mỗi request.

## Hiện trạng (đọc code 2026-10-17)

| # | Phát hiện | Hệ quả |
|---|---|---|
| H1 | `shared/middleware/authenticate.ts` gọi tuần tự: `tokenBlacklist.isRevoked(jti)` → `accountSuspensionStore.isSuspended(sub)` → `sessionRevocationStore.getRevokedAt(sub)` + `isIssuedBeforeRevocation(iat, …)`. | Đổi sang chạy song song. |
| H2 | `infrastructure/socket/index.ts` (handshake `io.use`) lặp lại đúng 3 bước đó, cũng tuần tự, với thông báo lỗi riêng của socket. | Đổi cùng lúc, dùng chung một hàm để hai nơi không lệch nhau. |
| H3 | Thứ tự kiểm quyết định lỗi trả về khi nhiều điều kiện cùng đúng: HTTP trả `401 Token has been revoked` → `401 ACCOUNT_SUSPENDED` → `401 SESSION_REVOKED`; socket trả `Token revoked` → `Account suspended` → `Session revoked`. Frontend dựa vào mã lỗi (`lib/api-client.ts`) để đăng xuất hoặc báo khoá. | Chạy song song nhưng **xét kết quả đúng thứ tự cũ**. |
| H4 | Redis lỗi ở bất kỳ bước nào ⇒ `catch` ⇒ HTTP `401 Invalid or expired token`, socket `Authentication error: Invalid token`. | Giữ nguyên: một lệnh lỗi thì cả lượt lỗi, cùng thông báo cũ. |
| H5 | Mỗi port là một adapter riêng với khoá riêng (`jwt:blacklist:{jti}`, `user-suspended:{userId}`, `sessions-revoked-at:{userId}`), cùng dùng một client ioredis. ioredis gửi lệnh ngay khi được gọi, không chờ lệnh trước trả lời. | Gọi 3 method cùng lúc thì 3 lệnh đi chung một lượt mạng, **không cần** port mới hay `MGET` xuyên 3 adapter. |
| H6 | `auth.service.ts#refresh` chỉ hỏi blacklist (1 lệnh), phần còn lại đọc DB. | Không đổi. |
| H7 | Chưa có test cho `authenticate` hay handshake socket. | Viết test cho hàm dùng chung. |

## Phần 1 — Công nghệ / kiến trúc

- Không thêm dependency. `Promise.all` trên 3 port có sẵn (`TokenBlacklist`, `AccountSuspensionStore`, `SessionRevocationStore`).
- Không đổi port, adapter, khoá Redis, TTL.
- Một hàm thuần dùng chung cho HTTP và socket, đặt cạnh `isIssuedBeforeRevocation` trong `modules/auth/session-revocation.service.ts` (nơi đã chứa logic so mốc mà cả hai bên đang import).

## Phần 2 — Liên kết giữa các phần

```ts
export type AccessTokenRejection = "TOKEN_REVOKED" | "ACCOUNT_SUSPENDED" | "SESSION_REVOKED";

/** Hỏi 3 khoá Redis cùng lúc, xét theo thứ tự cũ (H3). Lỗi Redis ném ra cho nơi gọi. */
export async function checkAccessTokenState(
  stores: { tokenBlacklist: TokenBlacklist; accountSuspensionStore: AccountSuspensionStore; sessionRevocationStore: SessionRevocationStore },
  token: { jti: string; sub: string; iat: number },
): Promise<AccessTokenRejection | null>;
```

```text
authenticate ─┐                         ┌─► tokenBlacklist.isRevoked(jti)      ┐
              ├─► checkAccessTokenState ─┼─► accountSuspensionStore.isSuspended ├─ cùng lúc, 1 lượt mạng
socket io.use ┘                         └─► sessionRevocationStore.getRevokedAt ┘
                     │
                     └─ xét: revoked? → suspended? → issued before revocation? → null
authenticate: map sang AppError cũ (message + code giữ nguyên)
socket:       map sang new Error("Authentication error: …") cũ
```

- Đổi hành vi duy nhất: token đã bị blacklist thì trước đây không hỏi 2 khoá còn lại, giờ vẫn hỏi (thêm 2 lệnh Redis rất nhẹ cho trường hợp hiếm). Kết quả trả về không đổi.
- `Promise.all` gắn handler cho cả 3 promise, nên lệnh lỗi sau lệnh lỗi đầu tiên không thành unhandled rejection.

## Phần 3 — Các bước thực hiện

1. Thêm `checkAccessTokenState` vào `modules/auth/session-revocation.service.ts`.
2. `authenticate.ts`: thay 3 khối `if` bằng một lần gọi hàm, map kết quả sang đúng `AppError` cũ (`401 "Token has been revoked"`, `401 "Account is suspended" ACCOUNT_SUSPENDED`, `401 "Session has been revoked" SESSION_REVOKED`). Giữ `catch` như cũ.
3. `socket/index.ts`: tương tự, map sang 3 thông báo socket cũ. Giữ `catch` như cũ.
4. Test mới `tests/unit/access-token-state.test.ts` (fake 3 store):
   - không có khoá nào ⇒ `null`;
   - từng điều kiện riêng ⇒ đúng loại;
   - nhiều điều kiện cùng đúng ⇒ theo thứ tự `TOKEN_REVOKED` > `ACCOUNT_SUSPENDED` > `SESSION_REVOKED`;
   - token cấp **sau** mốc thu hồi ⇒ `null` (dùng đúng `isIssuedBeforeRevocation`);
   - một store ném lỗi ⇒ hàm ném lỗi (nơi gọi trả 401 cũ);
   - cả 3 store được gọi **trước khi** store nào trả lời (fake dùng promise treo, kiểm số lần gọi rồi mới giải phóng). Đây là test chứng minh chạy song song.
5. `tsc` sạch, toàn bộ test unit xanh.
6. Đo lại bằng script tạm trong scratchpad (chỉ `GET`, không ghi Redis): gọi `checkAccessTokenState` với 3 adapter thật, so với gọi tuần tự. Đo xong xoá script.
7. Bạn bật web + server, mình kiểm qua `:8080`: đăng nhập và dùng bình thường ở cả 3 khu (Candidate, Employer, Admin), socket kết nối được (chuông, chat). Các trường hợp khoá tài khoản / buộc đăng xuất cần thao tác ghi thật, chỉ kiểm nếu bạn chỉ định tài khoản test; còn lại dựa vào test ở bước 4.

### Hoàn tác

Trả 2 file `authenticate.ts`, `socket/index.ts` về 3 lệnh tuần tự; xoá hàm và test. Không có dữ liệu nào phải dọn.

## Phương án không chọn

- *Port mới đọc cả 3 khoá bằng một `MGET`:* phải biết tên khoá của 3 adapter khác nhau, phá ranh giới AD-17/AD-18, mà không nhanh hơn đáng kể so với 3 lệnh gửi cùng lúc (H5).
- *Bật `enableAutoPipelining` cho cả client ioredis:* ảnh hưởng mọi chỗ dùng Redis (rate-limit, OTP, khoá AI), quá rộng cho mục tiêu này.

## Ghi chú triển khai (2026-10-17)

- Đúng theo plan, không lệch: `checkAccessTokenState` trong `session-revocation.service.ts`; `authenticate.ts` và `socket/index.ts` gọi hàm này và map sang đúng thông báo/mã lỗi cũ, giữ `catch` cũ. Socket vẫn truyền `iat ?? 0` như trước.
- Test mới `tests/unit/access-token-state.test.ts` (6 test), gồm test chứng minh 3 store được gọi trước khi store nào trả lời (bản tuần tự sẽ trượt test này). `tsc` sạch, toàn bộ test unit 210/210 xanh.
- Đo với 3 adapter thật (script tạm, chỉ `GET` khoá không tồn tại, trung vị 25 lần × 2 lượt, đã xoá): tuần tự 97–98 ms, song song 33 ms; kết quả trùng nhau.
- Kiểm qua `:8080` bằng `employer@match-demo.local`:
  - Các trang Tổng quan, Lời mời, Tin tuyển dụng, Lịch phỏng vấn, Tin nhắn (mở hội thoại): mọi request API trả 200.
  - Socket: mở kết nối Socket.IO thô bằng access token hiện tại ⇒ kết nối được; token sai ⇒ `Authentication error: Invalid token` như cũ.
  - HTTP: token sai ⇒ 401 `Invalid or expired token`; thiếu token ⇒ 401 `Missing bearer token`, như cũ.
  - Lúc mở lại trang sau khi để lâu, console có 1 cảnh báo `Socket connect_error … Invalid token`: socket thử bằng access token đã hết hạn trước khi trang làm mới token. Hành vi này có từ trước (code cũ cũng trả `Invalid token` khi `jwt.verify` lỗi), không do thay đổi này.
  - Chưa kiểm: khu Candidate, Admin; các trường hợp token bị blacklist / tài khoản bị khoá / buộc đăng xuất trên giao diện (cần thao tác ghi). Thứ tự và thông báo các lỗi này dựa vào unit test.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
