# Quản lý người dùng (Admin) + Trang hỗ trợ bản A — Frontend

Song song với `docs/06-backend/admin-users-support/PLAN.md` (API, quyết định U1–U7, G1–G2, H1–H6, P1–P4; **không chép lại ở đây**). Quyết định kiến trúc: AD-17.

**Trạng thái: ĐÃ DUYỆT (2026-10-07). Chưa code.** Backend B0–B4 đã xong; API thực tế khác plan backend ban đầu ở vài điểm nhỏ, đã ghi ở mục 4 và bảng hook bên dưới.

## Quyết định

1. **Trang `/admin/users`** nằm trong `app/admin/(console)/users/page.tsx`, dùng chung `AdminConsoleShell`. Mục "Người dùng" trên menu (đang `soon: true`) đổi thành `href: "/admin/users"`; `CRUMB_LABELS` thêm `users: "Người dùng"`.
2. **Bố cục giống `/admin/companies`**: Card chứa thanh lọc (Select vai trò, Select trạng thái, Input tìm theo email có debounce ~300 ms), bảng danh sách, nút "Tải thêm" theo cursor. Bộ lọc đồng bộ lên query string (`?role=&status=&q=`) để link trong thông báo `SUPPORT_CONTACT_RECEIVED` (`/admin/users?q=<email>`) mở đúng người.
3. **Cột bảng (U7):** Email · Tên (ứng viên: họ tên; Employer: tên công ty, link `/admin/companies/[companyId]`) · Vai trò (`RoleBadge`) · Trạng thái (`Badge`: Hoạt động / Chờ xác thực / Đã khoá) · Ngày tạo · Thao tác. Hàng `SUSPENDED` có thêm một dòng phụ: "Lý do: … · Khoá bởi … · lúc …".
4. **Thao tác:**
   - "Khoá": mở `Dialog` có `Textarea` lý do bắt buộc (1–500 ký tự). Dialog ghi rõ người dùng sẽ nhận email kèm lý do.
   - "Mở khoá": `ConfirmDialog`. Nếu người đó chưa xác thực email (`AdminUserListItem.emailVerifiedAt === null`), ghi rõ "sẽ về trạng thái Chờ xác thực".
   - Hàng `ADMIN` không có nút thao tác (U2).
   - Thành công thì hiện `Toast` và invalidate danh sách. Lỗi 409 thì hiện thông báo rồi tải lại.
5. **Mã lỗi:** `ApiError` thêm trường `code` (đọc `res.body?.code` trong `parseBody`). Mọi chỗ cần nhận biết tài khoản bị khoá dùng `err.code === "ACCOUNT_SUSPENDED"`, không so chuỗi.
6. **Form đăng nhập (`LoginForm.tsx`, cả nhánh mật khẩu lẫn Google):** gặp `ACCOUNT_SUSPENDED` thì hiện "Tài khoản của bạn đã bị khoá." kèm link **"Liên hệ hỗ trợ"** → `/support?category=ACCOUNT_SUSPENDED&email=<email>` (nhánh Google không có email thì bỏ tham số `email`).
7. **Trang `/support`** (công khai): `app/support/page.tsx`, dùng header/footer công khai như `/jobs` (`CandidateHomeHeader`, `SiteFooter`). `proxy.ts` không chặn đường dẫn này (đã kiểm: chỉ chặn các tiền tố ứng viên, `/employer/*`, `/admin/*`), nên không cần sửa proxy.
   - Form: Email (`Input`), Loại vấn đề (`Select`: "Tài khoản bị khoá" / "Vấn đề khác"), Nội dung (`Textarea`, 20–2000 ký tự, có đếm ký tự). Điền sẵn từ query string.
   - Gửi xong thì thay form bằng khung xác nhận: "Đã gửi yêu cầu. Quản trị viên sẽ phản hồi qua email của bạn." Khung này giống nhau dù email có tài khoản hay không.
   - 429 thì hiện thông báo từ server. Validate phía client cùng ngưỡng với Zod ở server.
8. **Thông báo:** `lib/notifications.ts` thêm nhóm `ACCOUNT` vào `NOTIFICATION_GROUP_META` (`{ label: "Tài khoản", icon: … }`, chọn icon có sẵn trong `Icon.tsx`). Thêm 3 loại vào `NOTIFICATION_GROUP_BY_TYPE` và `NOTIFICATION_ACTION_LABEL`: `ACCOUNT_SUSPENDED` → "Liên hệ hỗ trợ", `ACCOUNT_REACTIVATED` → "Đăng nhập", `SUPPORT_CONTACT_RECEIVED` → "Xem người dùng". Cả 2 map đều là `Record<…>`, thiếu là lỗi biên dịch. `hooks/useNotificationGroups.ts`: thêm `"ACCOUNT"` vào cuối `NOTIFICATION_GROUPS_BY_AREA` của cả 3 khu vực, cho khớp `NOTIFICATION_GROUPS_BY_ROLE` của server (đã làm ở B3).
9. **Nhật ký hoạt động (`ActivityTimeline.tsx`):** `ENTITY_ICON` thêm `User`. `lookOf`: `USER_SUSPENDED` → tone `no`, icon khoá; `USER_REACTIVATED` → tone `ok`.
10. Không thêm thư viện. Giao diện theo skill `sip-ui` và các component `ui/` có sẵn.

## Hook mới (`hooks/useAdminUsers.ts`)

| Hook | Query key / mutation | Ghi chú |
|---|---|---|
| `useAdminUsers(filters)` | `["admin", "users", filters]`, `useInfiniteQuery` theo `nextCursor` | `filters = { role?, status?, q? }` |
| `useSuspendUser()` | mutation `POST /admin/users/:id/suspend`, body `SuspendUserRequest`, trả `AdminUserListItem` | `onSuccess` → invalidate `["admin", "users"]` và `[...ADMIN_DASHBOARD_KEY, "activity"]` (key trong `useAdminDashboard.ts`) |
| `useReactivateUser()` | mutation `POST /admin/users/:id/reactivate`, trả `AdminUserListItem` | như trên |
| `useSubmitSupportContact()` | mutation `POST /support/contact` qua `publicFetch` | không cần đăng nhập |

## Các bước thực hiện

| Bước | Nội dung | Ước lượng |
|---|---|---|
| F1 | `ApiError.code` + `parseBody`; map thông báo (quyết định 8); icon nhật ký (quyết định 9). Làm ngay sau B1/B3 backend để `tsc` của web không gãy. | ~20 phút |
| F2 | `useAdminUsers.ts` + trang `/admin/users` (bộ lọc, bảng, tải thêm, thông tin khoá) + menu/breadcrumb | ~1,5 giờ |
| F3 | Dialog khoá / mở khoá + toast | ~30 phút |
| F4 | `LoginForm`: nhận `ACCOUNT_SUSPENDED`, link hỗ trợ | ~15 phút |
| F5 | Trang `/support` + hook gửi | ~45 phút |
| F6 | Kiểm trên trình duyệt (kịch bản demo bên dưới), `npx tsc --noEmit`, `npm run lint` ở `apps/web` | ~30 phút |

## Kịch bản demo cho buổi báo cáo (trọn vòng)

1. Ứng viên demo đang đăng nhập ở một cửa sổ, Admin mở `/admin/users` ở cửa sổ khác. Lọc "Ứng viên", tìm theo email.
2. Admin bấm "Khoá" và nhập lý do. Phía ứng viên: thao tác kế tiếp nhận 401, refresh thất bại nên bị đăng xuất về trang chủ (chặn ngay, không đợi 15 phút).
3. Ứng viên đăng nhập lại thì thấy "Tài khoản đã bị khoá · Liên hệ hỗ trợ". Mở hộp thư thấy email báo khoá kèm lý do.
4. Ứng viên bấm link, gửi form `/support`. Admin thấy chuông thông báo "Yêu cầu hỗ trợ mới", bấm vào mở `/admin/users?q=<email>`, hàng đó hiện lý do khoá.
5. Admin bấm "Mở khoá". Ứng viên nhận email mở khoá và đăng nhập lại được. Dashboard Admin hiện 2 dòng trong "Hoạt động gần đây".

## Phần ghi chú của chủ dự án

*(để trống)*
