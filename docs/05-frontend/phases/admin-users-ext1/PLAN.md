# Quản lý người dùng — Mở rộng 1 (Frontend)

Song song với `docs/06-backend/admin-users-ext1/PLAN.md` (API, quyết định E1–E8, P1–P8; **không chép lại ở đây**). Quyết định kiến trúc: AD-18. Nối tiếp `docs/05-frontend/phases/admin-users-support/PLAN.md`.

**Trạng thái: ĐÃ DUYỆT (2026-10-07).** Chưa code (chờ backend đợt 4).

## Quyết định

1. **Danh sách `/admin/users`** (sửa trang có sẵn):
   - Phân trang số trang (E6): thanh "Trước · 1 2 3 … · Sau" kèm "Hiển thị 21–40 trong 57 người dùng". Bỏ nút "Tải thêm" và `useInfiniteQuery`, dùng `useQuery` + `placeholderData` giữ trang cũ khi chuyển trang.
   - Bộ lọc: giữ ô tìm, vai trò, trạng thái; ô tìm đổi placeholder thành "Tìm theo email, họ tên hoặc tên công ty". Thêm nút "Bộ lọc khác" mở hàng thứ hai: phương thức đăng nhập (Mật khẩu / Google / Cả hai), xác thực email (Đã xác thực / Chưa xác thực), ngày tạo từ – đến (`Input type="date"`). Nút có số bộ lọc đang bật, hàng thứ hai tự mở nếu URL có bộ lọc trong đó.
   - Sắp xếp: `Select` "Mới nhất / Cũ nhất / Email A–Z" ở góc phải thanh lọc.
   - URL là nguồn sự thật như cũ, thêm `loginMethod`, `emailVerified`, `createdFrom`, `createdTo`, `sort`, `page`. Đổi bộ lọc / sắp xếp thì về trang 1.
   - Email trong bảng thành link sang `/admin/users/[id]`.
2. **Chọn nhiều và thao tác hàng loạt (E7):**
   - Cột ô chọn ở đầu bảng; ô ở tiêu đề chọn / bỏ chọn cả trang. Hàng `ADMIN` không có ô chọn. Tối đa 20 (bằng cỡ trang nên không vượt được).
   - Chọn ≥ 1 thì hiện thanh thao tác dính đáy thẻ (cùng kiểu `SelectionBar` của trang ứng tuyển Employer): "Đã chọn 5 · Khoá (3) · Mở khoá (2) · Bỏ chọn". Mỗi nút chỉ gửi những người áp dụng được (khoá: không `SUSPENDED`; mở khoá: `SUSPENDED`), nút có số 0 thì ẩn.
   - Khoá hàng loạt: hộp thoại lý do bắt buộc như khoá một người, liệt kê tối đa 5 email + "và N người khác". Mở khoá hàng loạt: hộp xác nhận, ghi số người sẽ về "Chờ xác thực".
   - Kết quả: toàn bộ thành công ⇒ toast xanh "Đã khoá 3 tài khoản". Có lỗi ⇒ hộp thoại kết quả liệt kê từng email lỗi với câu tiếng Việt theo `status` (409 "đã ở trạng thái này", 403 "là tài khoản quản trị", 404 "không còn tồn tại", khác "lỗi hệ thống, thử lại"). Xong thì bỏ chọn, tải lại danh sách và "Hoạt động gần đây".
   - Chuyển trang / đổi bộ lọc ⇒ bỏ chọn.
3. **Trang chi tiết `/admin/users/[id]`** (`app/admin/(console)/users/[id]/page.tsx`), bố cục giống `/admin/companies/[id]`:
   - Đầu trang: email, `RoleBadge`, `Badge` trạng thái, ngày tạo; bên phải nhóm nút thao tác (quyết định 4). Breadcrumb đoạn `[id]` hiện email (theo cách `companies/[id]` đang làm).
   - Cột trái (rộng): khối theo vai trò.
     - Ứng viên (E4): "Hồ sơ" (họ tên, tiêu đề, học vấn, kỹ năng dạng `Badge`, "Cho phép nhà tuyển dụng tìm thấy: Bật/Tắt"); "CV" (tên file, ngày tải, nhãn Mặc định / Đã ẩn; không có nút tải); "Đơn ứng tuyển" (tin → `/admin/jobs/[id]`, công ty → `/admin/companies/[id]`, trạng thái theo `APPLICATION_STATUS_LABEL`, ngày); "Lời mời đã nhận" (tin, công ty, trạng thái, ngày gửi, hạn). Danh sách có "20 / 45 gần nhất" khi `total` > số dòng.
     - Employer (E5): "Công ty" (tên → `/admin/companies/[id]`, trạng thái xác minh, "Quản trị công ty: Có/Không", chức danh); "Tin tuyển dụng" (ô số theo trạng thái, đúng từ vựng: Nháp · Chờ duyệt · Đang hiển thị · Đã đóng · Hết hạn · Đã hạ).
     - Admin (E8): một `Card tone="sunken"` "Tài khoản quản trị không quản lý được ở đây".
     - Trường hợp backend trả rỗng (kết quả đợt 4 backend): ứng viên có `candidate.profile = null` ⇒ khối "Hồ sơ" ghi "Ứng viên chưa tạo hồ sơ", các danh sách hiện trạng thái rỗng; Employer có `employer = null` ⇒ "Tài khoản chưa gắn với công ty nào".
   - Cột phải (hẹp, sticky): "Tài khoản" (phương thức đăng nhập, xác thực email lúc …, buộc đăng xuất lần cuối lúc …, thông tin khoá nếu đang khoá); "Lịch sử thao tác" (timeline từ `history`: icon theo hành động như `ActivityTimeline`, câu tóm tắt, lý do, "bởi {email} · lúc …"; rỗng ⇒ "Chưa có thao tác nào của quản trị viên").
   - Đủ trạng thái: đang tải (`BlockSkeleton`), lỗi (`BlockError`), 404 ("Không tìm thấy người dùng" + nút về danh sách).
   - 375px: hai cột thành một, khối "Tài khoản" lên đầu.
4. **Thao tác trên trang chi tiết** (nút chỉ hiện khi API cho phép, theo `sip-ui`):

   | Nút | Hiện khi | Hộp thoại |
   |---|---|---|
   | Khoá / Mở khoá | không phải `ADMIN`; theo trạng thái | Dùng lại `SuspendUserDialog` / `ReactivateUserDialog` |
   | Buộc đăng xuất | `ACTIVE` | `Dialog`: "Mọi thiết bị đang đăng nhập của {email} sẽ bị đăng xuất. Tài khoản không bị khoá; người dùng đăng nhập lại được ngay." Ô lý do không bắt buộc (tối đa 500). Gợi ý: "Nếu nghi tài khoản bị chiếm, hãy gửi thêm hướng dẫn đặt lại mật khẩu." Nút `danger`. |
   | Kích hoạt thủ công | `PENDING_VERIFICATION` | `Dialog`: khung cảnh báo marigold "Chỉ kích hoạt khi bạn đã trao đổi qua email với chính địa chỉ {email}. Biểu mẫu hỗ trợ không xác minh email người gửi." (P1). Lý do bắt buộc 1–500. |
   | Gửi hướng dẫn đặt lại mật khẩu | không `SUSPENDED` | `hasPassword = false` ⇒ nút tắt, chú thích "Tài khoản chỉ đăng nhập bằng Google". `Dialog` xác nhận: người dùng nhận email có link tới trang đặt lại mật khẩu; mật khẩu hiện tại chưa đổi. 429 ⇒ "Đã gửi 3 lần trong giờ qua, thử lại sau". |

   Hàng ≥ 3 nút: nút chính theo trạng thái (Khoá hoặc Kích hoạt) để ngoài, các nút còn lại vào menu "Thao tác khác". Mọi hộp thoại dùng `Dialog` render tại chỗ (không `ConfirmDialog`, lý do ở đợt 2 plan trước: giữ màu Plum). Thành công ⇒ toast + tải lại chi tiết, danh sách, "Hoạt động gần đây". 409 ⇒ đóng hộp thoại, toast câu tiếng Việt, tải lại.
5. **Trang `/forgot-password`** (E1), `app/(auth)/forgot-password/page.tsx`, dùng layout `(auth)` như `/login`; `searchParams.role` giữ để quay về đúng `/login?role=...`:
   - Bước 1: ô email ⇒ `POST /auth/forgot-password`. Luôn chuyển sang bước 2 với câu "Nếu {email} có tài khoản đăng nhập bằng mật khẩu, mã gồm 6 chữ số đã được gửi tới hộp thư. Mã có hiệu lực 5 phút." Kèm dòng: "Tài khoản đăng nhập bằng Google thì không cần mật khẩu — hãy dùng nút Google ở trang đăng nhập." 429 ⇒ câu từ server dịch sang tiếng Việt.
   - Bước 2: mã OTP (6 chữ số), mật khẩu mới (≥ 8 ký tự, như server), nhập lại mật khẩu. Nút "Gửi lại mã" đếm ngược 60 giây (khớp cooldown server). "Đổi email" quay về bước 1.
   - 400 ⇒ "Mã không đúng hoặc đã hết hạn" (P2: server không còn trả 404). Thành công ⇒ `router.replace("/login?reset=1[&role=...]")`.
   - `LoginForm`: thêm link "Quên mật khẩu?" cạnh ô mật khẩu → `/forgot-password[?role=EMPLOYER]`; `/login?reset=1` hiện khung xanh "Đã đổi mật khẩu. Mọi thiết bị đang đăng nhập đã bị đăng xuất."
   - Kiểm `proxy.ts` không chặn `/forgot-password` (dự kiến không, giống `/support`).
   - Có thể dùng lại ô OTP của `OtpForm` nếu tách được; không thì viết ô đơn giản (`inputMode="numeric"`, `autocomplete="one-time-code"`).
6. **Thông báo và nhật ký:**
   - `lib/notifications.ts`: `ACCOUNT_ACTIVATED` → nhóm `ACCOUNT`, nhãn "Đăng nhập"; `PASSWORD_RESET_SUGGESTED` → nhóm `ACCOUNT`, nhãn "Đặt lại mật khẩu". (Hai map là `Record`, thiếu là lỗi biên dịch.)
   - `ActivityTimeline.tsx` `lookOf`: `USER_SESSIONS_REVOKED` → icon `log-out`, tone trung tính; `USER_ACTIVATED` → tone `ok`, icon `user-check`; `USER_PASSWORD_RESET_GUIDE_SENT` → icon `key-round`, tone trung tính. Kiểm tên icon có trong Lucide (tên sai render rỗng).
7. **Đổi mật khẩu trên trang Cài đặt** (E9, `components/settings/SettingsPage.tsx`, dùng chung Ứng viên / Employer / Admin):
   - Thẻ "Mật khẩu" đặt **trên** thẻ "Thông báo qua trình duyệt". Dữ liệu lấy từ `UserProfile` (`/users/me`, đã có trong store sau `SessionSync`).
   - `hasPassword = false` ⇒ không có nút, chỉ dòng "Bạn đăng nhập bằng Google nên tài khoản không có mật khẩu."
   - Bấm "Đổi mật khẩu" ⇒ hộp xác nhận ngắn: "Chúng tôi sẽ gửi mã xác thực tới {email}. Sau khi đổi, mọi thiết bị đang đăng nhập, kể cả thiết bị này, sẽ bị đăng xuất." ⇒ gọi `POST /auth/forgot-password` với email trong `UserProfile` (người dùng không phải nhập) ⇒ mở form bước 2.
   - Form bước 2 **dùng lại** form của `/forgot-password` (quyết định 5): tách thành `components/auth/ResetPasswordForm.tsx` (OTP, mật khẩu mới, nhập lại, "Gửi lại mã" đếm ngược 60 giây), nhận `email` và `onSuccess` qua props. Trên trang Cài đặt ẩn "Đổi email".
   - Thành công ⇒ server đã thu hồi mọi phiên, nên web tự xoá phiên của khu vực đang dùng, **không** gọi `/auth/logout` vì token đã bị thu hồi. `endSession` trong `lib/api-client.ts` chưa export và tự chuyển về trang chủ, nên khi code tách phần xoá phiên ra để dùng chung rồi chuyển tới trang đăng nhập kèm thông báo: Ứng viên / Employer `router.replace("/login?reset=1[&role=EMPLOYER]")`; Admin `router.replace("/admin?reset=1")` (trang đăng nhập Admin, AD-1) và trang đó hiện cùng khung xanh "Đã đổi mật khẩu…".
   - 429 khi xin mã ⇒ câu tiếng Việt như `/forgot-password`.
8. **Bị buộc đăng xuất:** không thêm gì (P7). Người dùng rơi vào luồng refresh thất bại có sẵn (`endSession`), về trang chủ như khi bị khoá.
9. Không thêm thư viện. Theo skill `sip-ui` (bản D cho Admin: số dùng font thường `tabular-nums`, không khối tối).

## Hook (`hooks/useAdminUsers.ts`)

| Hook | Query key / mutation | Ghi chú |
|---|---|---|
| `useAdminUsers(filters)` | `["admin", "users", "list", filters]`, `useQuery` | **Đổi** từ `useInfiniteQuery`; `filters` thêm các trường mới + `page`, `sort` |
| `useAdminUserDetail(id)` | `["admin", "users", "detail", id]` | mới |
| `useSuspendUser`, `useReactivateUser` | có sẵn | `onSettled` invalidate thêm key chi tiết |
| `useRevokeUserSessions()` | `POST /admin/users/:id/revoke-sessions` | mới |
| `useActivateUser()` | `POST /admin/users/:id/activate` | mới |
| `useSendPasswordResetGuide()` | `POST /admin/users/:id/send-password-reset-guide` | mới |
| `useBulkSuspendUsers()`, `useBulkReactivateUsers()` | `POST /admin/users/bulk/suspend` / `reactivate` | mới; trả `AdminBulkActionResponse` |
| `useForgotPassword()`, `useResetPassword()` | `publicFetch` | `hooks/usePasswordReset.ts` (mới); trang `/forgot-password` và thẻ đổi mật khẩu ở Cài đặt dùng chung |

Mọi mutation trên một người: invalidate `["admin", "users"]` (gồm cả danh sách và chi tiết) và `[...ADMIN_DASHBOARD_KEY, "activity"]`.

## Các bước thực hiện

| Bước | Nội dung | Ước lượng |
|---|---|---|
| F1 | Map thông báo + icon nhật ký (quyết định 6). Làm ngay sau B3 backend. | ~20 phút |
| F2 | Danh sách: phân trang số trang, sắp xếp, "Bộ lọc khác", link chi tiết. Làm ngay sau B4: web vẫn biên dịch được, nhưng từ B4 tới khi xong F2 trang danh sách chỉ hiện 20 người đầu (không còn `nextCursor`). Kiểu trả về đổi sang `AdminUserListResponse`. | ~2 giờ |
| F3 | Chọn nhiều + thanh thao tác + hộp thoại hàng loạt + hộp thoại kết quả | ~1,5 giờ |
| F4 | Trang chi tiết: khối tài khoản, lịch sử, ứng viên, Employer, Admin | ~3 giờ |
| F5 | Thao tác trên trang chi tiết: 3 hộp thoại mới + menu "Thao tác khác" | ~1,5 giờ |
| F6 | `/forgot-password` + link ở `LoginForm` + thông báo `?reset=1` | ~1,5 giờ |
| F6b | Thẻ "Đổi mật khẩu" trên trang Cài đặt (quyết định 7). Cần B9 backend (`hasPassword`) và `ResetPasswordForm` tách ở F6. | ~1 giờ |
| F7 | Kiểm trên trình duyệt (kịch bản dưới), 375px và ≥ 1280px, `npx tsc --noEmit`, ESLint các file sửa | ~1 giờ |

Tổng **khoảng 12 giờ**. Gợi ý gộp đợt như lần trước: đợt 1 = F1 + F2, đợt 2 = F3, đợt 3 = F4 + F5, đợt 4 = F6 + F6b, cuối cùng F7. Mỗi đợt dừng báo cáo, chạy `tsc` + lint.

## Kịch bản demo

1. Admin mở `/admin/users`, tìm theo **tên** ứng viên, lọc "Chưa xác thực", sắp xếp "Cũ nhất", sang trang 2.
2. Chọn 3 người, khoá hàng loạt với một lý do; một người vốn đã khoá ⇒ hộp thoại kết quả báo đúng người đó.
3. Mở chi tiết một ứng viên: hồ sơ, CV (không tải được), đơn ứng tuyển, lời mời, lịch sử có dòng khoá vừa rồi.
4. Ứng viên demo đăng nhập ở cửa sổ khác. Admin bấm "Buộc đăng xuất" ⇒ thao tác kế tiếp của ứng viên đưa về trang chủ; ứng viên đăng nhập lại được ngay.
5. Admin bấm "Gửi hướng dẫn đặt lại mật khẩu" ⇒ ứng viên nhận email, bấm link tới `/forgot-password`, nhận OTP, đổi mật khẩu ⇒ mọi tab đang đăng nhập khác bị đăng xuất; `/login` hiện "Đã đổi mật khẩu".
6. Tài khoản `PENDING_VERIFICATION` (tạo bằng đăng ký không nhập OTP): Admin "Kích hoạt thủ công" ⇒ người dùng nhận email, đăng nhập được.
7. Ứng viên vào Cài đặt ⇒ "Đổi mật khẩu" ⇒ nhận mã qua email, đặt mật khẩu mới ⇒ về `/login` với khung "Đã đổi mật khẩu"; tab khác đang đăng nhập cũng bị đăng xuất. Tài khoản Google thấy dòng "không có mật khẩu" thay cho nút.

## Phần ghi chú của chủ dự án

*(để trống)*
