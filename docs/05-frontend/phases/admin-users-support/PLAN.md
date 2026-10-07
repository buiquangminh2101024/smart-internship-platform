# Quản lý người dùng (Admin) + Trang hỗ trợ bản A — Frontend

Song song với `docs/06-backend/admin-users-support/PLAN.md` (API, quyết định U1–U7, G1–G2, H1–H6, P1–P4; **không chép lại ở đây**). Quyết định kiến trúc: AD-17.

**Trạng thái: ĐÃ DUYỆT (2026-10-07). F1–F6 xong, kể cả lỗi chuyển trang giữa các tab phát hiện ở F6 (đã sửa theo cách C).** Backend B0–B7 đã xong; API thực tế khác plan backend ban đầu ở vài điểm nhỏ, đã ghi ở mục 4 và bảng hook bên dưới.

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

**Gộp đợt (chủ dự án chọn 2026-10-07):** đợt 1 = F1 + F4 (cùng dựa trên `ApiError.code`), đợt 2 = F2 + F3 (dialog nằm trên trang danh sách), đợt 3 = F5, cuối cùng F6. Mỗi đợt xong vẫn dừng báo cáo và chạy `tsc` + lint.

### Đợt 1 — F1 + F4 ✅ (2026-10-07)

- `lib/api-client.ts`: `ApiError` thêm `readonly code: string | undefined` (tham số thứ 4 của constructor, các chỗ gọi cũ không phải sửa); `parseBody` truyền `res.body?.code`.
- `lib/notifications.ts`: 3 loại mới vào `NOTIFICATION_GROUP_BY_TYPE` và `NOTIFICATION_ACTION_LABEL` đúng nhãn ở quyết định 8; `NOTIFICATION_GROUP_META.ACCOUNT = { label: "Tài khoản", icon: "user-cog" }`. `hooks/useNotificationGroups.ts`: `"ACCOUNT"` ở cuối cả 3 khu vực.
- `ActivityTimeline.tsx`: `ENTITY_ICON.User = "user-round"`; `USER_SUSPENDED` → tone `no`, icon `lock`; `USER_REACTIVATED` → tone `ok`, icon `lock-open` (đặt trước nhánh regex `APPROVED|…`, vì `USER_REACTIVATED` không khớp regex đó).
- `LoginForm.tsx`: cả nhánh mật khẩu và Google nhận `err.code === "ACCOUNT_SUSPENDED"`, hiện "Tài khoản của bạn đã bị khoá." kèm link "Liên hệ hỗ trợ" (`role="alert"`). Nhánh mật khẩu thêm `&email=`, nhánh Google bỏ. Nhánh "chưa xác thực" giữ cách so chuỗi cũ vì server chưa gắn `code` cho lỗi đó.
- **Khác plan:** thêm `ACCOUNT_SUSPENDED` vào `WARNING_NOTIFICATION_TYPES` (thông báo bị khoá tô marigold như tin bị gỡ / công ty bị từ chối). Plan không nhắc tới; bỏ được nếu không muốn.
- **Bổ sung (chủ dự án duyệt):** mã `GOOGLE_EMAIL_UNVERIFIED` (401, `apps/server/src/infrastructure/google-auth-client.ts`, AD-17 mục 6) **có** ở server; báo cáo đợt 1 ban đầu nói nhầm là không có (lúc kiểm chỉ tìm trong `modules/auth` và `modules/users`). Đã xử lý: `googleAuthErrorMessage(err, fallback)` trong `components/auth/GoogleAuthButton.tsx`, dùng ở nhánh Google của cả `LoginForm` và `RegisterForm`, hiện "Google chưa xác thực email của tài khoản này. Hãy xác thực email trong tài khoản Google, hoặc dùng email và mật khẩu." Lỗi khác vẫn hiện message server như cũ.
- Còn lại (ngoài plan, chưa làm): `RegisterForm` nhánh Google gặp tài khoản bị khoá vẫn hiện message tiếng Anh "Account is suspended" (plan chỉ yêu cầu `LoginForm`).
- Kiểm: `npx tsc --noEmit` ở `apps/web` sạch (3 lỗi ở `lib/notifications.ts` đã hết); ESLint 5 file sạch. **Chưa** xem trên trình duyệt; để F6. Link "Liên hệ hỗ trợ" trỏ `/support`, trang này tới đợt 3 mới có (tới lúc đó sẽ 404).

### Đợt 2 — F2 + F3 ✅ (2026-10-07)

- `hooks/useAdminUsers.ts`: `useAdminUsers(filters)` (`useInfiniteQuery`, key `["admin", "users", filters]`, giữ dữ liệu cũ khi đổi bộ lọc), `useSuspendUser`, `useReactivateUser`. `AdminUserFilters` khai báo riêng với `| undefined` cho từng trường (web bật `exactOptionalPropertyTypes`).
- `app/admin/(console)/users/page.tsx`: bộ lọc (ô tìm email debounce 300 ms, tối đa 100 ký tự như server; Select vai trò; Select trạng thái) đồng bộ `?role=&status=&q=` bằng `router.replace`. URL là nguồn sự thật; URL đổi từ nơi khác (bấm thông báo khi đang ở trang) thì ô tìm cập nhật theo. Trang bọc `Suspense` vì `useSearchParams` (theo docs Next bản này). Bảng 6 cột theo U7, hàng `SUSPENDED` có dòng phụ "Lý do · Khoá bởi · lúc HH:mm DD/MM/YYYY" (khung giống "Hoạt động gần đây"; không có `suspension` thì ghi rõ không có thông tin). Nút "Tải thêm" theo cursor. Đủ trạng thái đang tải / lỗi (`BlockError` có Tải lại) / rỗng.
- `components/admin/UserStatusDialogs.tsx`: `SuspendUserDialog` (lý do bắt buộc 1–500, đếm ký tự, lỗi tại ô, ghi rõ người dùng bị đăng xuất ngay và nhận email kèm lý do), `ReactivateUserDialog` (ghi rõ về "Chờ xác thực" nếu `emailVerifiedAt === null`). Thành công ⇒ toast xanh.
- `AdminConsoleShell.tsx`: mục "Người dùng" có `href: "/admin/users"`; `CRUMB_LABELS.users = "Người dùng"`.
- **Khác plan:**
  - Mở khoá dùng `Dialog` thay `ConfirmDialog`: `ConfirmDialog` portal ra `body` nên mất `data-role="admin"`, nút chính sẽ ra màu Pine thay vì Plum. `Dialog` render tại chỗ, cùng kiểu với hộp thoại khoá.
  - Lỗi 409 (đã khoá / không còn khoá) và 404: đóng hộp thoại, toast đỏ bằng câu tiếng Việt ("Tài khoản này đã bị khoá trước đó. Danh sách đã được tải lại."), không hiện message tiếng Anh của server. Lỗi khác (mạng, 5xx) giữ hộp thoại, báo tại chỗ để thử lại. Danh sách và "Hoạt động gần đây" tải lại ở `onSettled` (cả khi lỗi).
  - Nhãn vai trò trong bộ lọc dùng đúng từ của `RoleBadge` ("Sinh viên" / "Doanh nghiệp" / "Quản trị"), không phải "Ứng viên" như bước 1 kịch bản demo.
  - Thêm nút "Xoá bộ lọc" ở trạng thái rỗng khi đang lọc. Hàng `ADMIN` hiện "—" (kèm chữ ẩn cho trình đọc màn hình) ở cột thao tác.
  - Màn hình hẹp: bảng giữ 6 cột, cuộn ngang trong thẻ (`min-w-[820px]`), không đổi sang dạng thẻ.
  - `useToast` chép cục bộ trong trang như 8 trang khác đang làm (chưa có hook dùng chung); `NoteBox` lấy từ `components/interviews`.
- Kiểm: `npx tsc --noEmit` ở `apps/web` sạch; ESLint các file mới/sửa sạch. **Chưa** xem trên trình duyệt (chưa có container/dev server chạy, cần tài khoản Admin); để F6.

### Đợt 3 — F5 ✅ (2026-10-07)

- `hooks/useSupportContact.ts`: `useSubmitSupportContact()` gọi `POST /support/contact` qua `publicFetch`.
- `app/support/page.tsx`: server component, đọc `searchParams` (Promise, như trang `/login`) để điền sẵn: `category` chỉ nhận `ACCOUNT_SUSPENDED`, còn lại là `OTHER`; `email` cắt 254 ký tự. Header/footer công khai (`CandidateHomeHeader`, `SiteFooter`), cột nội dung `max-w-2xl`.
- `components/support/SupportContactForm.tsx`: Email (`Input type="email"`), Loại vấn đề (`Select` "Tài khoản bị khoá" / "Vấn đề khác", gợi ý dưới ô đổi theo loại), Nội dung (`Textarea` 20–2000 ký tự sau khi trim, đếm ký tự). Validate phía client cùng ngưỡng Zod, lỗi tại ô (`aria-invalid`, focus vào ô lỗi đầu tiên). Gửi xong thay form bằng khung "Đã gửi yêu cầu · Quản trị viên sẽ phản hồi qua email …", focus chuyển tới tiêu đề khung; khung giống nhau dù email có tài khoản hay không. 429 hiện đúng câu server ("Bạn đã gửi quá nhiều yêu cầu, vui lòng thử lại sau").
- **Khác plan:**
  - Khung xác nhận có hai nút "Về trang chủ" và "Gửi yêu cầu khác" (giữ email, xoá nội dung), và lặp lại email người gửi nhập (chỉ là email họ vừa gõ, không lộ việc email có tài khoản hay không).
  - 400 (hiếm, vì client đã validate) hiện câu tiếng Việt chung thay cho message Zod tiếng Anh; lỗi mạng / 5xx hiện "Không gửi được yêu cầu. Kiểm tra kết nối rồi thử lại."
  - Không có `category` trên URL thì mặc định "Vấn đề khác".
  - Thêm theo yêu cầu chủ dự án (sau đợt 3): `SiteFooter` cột "InternHub", mục "Liên hệ" đổi thành "Liên hệ hỗ trợ" và trỏ `/support` (các mục khác vẫn là `href="#"`). Ngoài footer, vào được từ `LoginForm` và nút trong email báo khoá (`/support?category=ACCOUNT_SUSPENDED`). Link của thông báo trong app là `/support` không kèm loại, nên form mở ở "Vấn đề khác" (người bị khoá cũng không đăng nhập để thấy thông báo này).
- Kiểm: `npx tsc --noEmit` ở `apps/web` sạch; ESLint 3 file mới sạch. **Chưa** xem trên trình duyệt; để F6.

### F6 — kiểm trên trình duyệt ✅ (2026-10-07)

Chạy trên Chrome, cùng một trình duyệt: tab 1 ứng viên demo `fe-react-03@match-demo.local` (mật khẩu trong `seed-match-demo.ts`), tab 2 Admin (chủ dự án tự đăng nhập).

- Kịch bản demo 5 bước: **đạt cả 5**. Lọc + tìm (URL `?role=CANDIDATE&q=…`); khoá (lỗi tại ô khi bỏ trống lý do, toast, hàng "Đã khoá" + dòng lý do); đăng nhập lại thấy "Tài khoản của bạn đã bị khoá. Liên hệ hỗ trợ"; link mở `/support` điền sẵn email + loại, gửi xong hiện khung xác nhận (focus vào tiêu đề); Admin thấy thông báo nhóm "Tài khoản", "Xem người dùng" mở `/admin/users?q=<email>` có lý do khoá; mở khoá (nút Plum) → ứng viên đăng nhập lại được, có 2 thông báo khoá / mở khoá; "Hoạt động gần đây" có 2 dòng (icon khoá đỏ / mở khoá xanh).
- Trạng thái khác: rỗng + "Xoá bộ lọc" (chạy đúng), hàng Employer có link tên công ty, hàng Admin hiện "—". Không có lỗi console.
- 375px (xem qua iframe vì cửa sổ Chrome đang phóng to): `/support` vừa khung, không cuộn ngang. `/admin/users` bị sidebar 240px ép chật, nhưng `/admin/dashboard` cũng vậy: lỗi sẵn có của `AdminConsoleShell` (chưa có sidebar thu gọn), không sửa trong phase này.
- `npx tsc --noEmit` sạch. `npm run lint`: 14 lỗi + 23 cảnh báo, **tất cả ở 24 file có sẵn từ trước** (`useCompany.ts`, `ConfirmDialog.tsx`, các trang CV…); các file của phase này lint sạch.
- Đã sửa trong F6:
  - Email trong tiêu đề hộp thoại bị ngắt giữa chữ ("…match-demo.loca / l?") do `break-all` → đổi sang `[overflow-wrap:anywhere]` (2 hộp thoại + khung xác nhận `/support`).
  - Bộ đếm `/support` hiện "0/2000" → dùng `formatNumber` ("0/2.000"), khớp dòng gợi ý.
  - Ngày tạo / giờ khoá ở `/admin/users` dùng font mono → trang đè `[--font-num:var(--font-sans)]` như dashboard Admin (bản D).
- **Lỗi phát hiện ở F6 (đã sửa, xem gạch đầu dòng kế tiếp):** khi ứng viên bị khoá, **tab Admin cùng trình duyệt tự chuyển về `/`**. Nguyên nhân: các store auth dùng chung `localStorage` giữa các tab, `SessionSync area="candidate"` chạy ở mọi tab (kể cả tab Admin); React Query tải lại `/users/me` khi tab được focus → 401 → refresh thất bại → `apiFetch` gọi `window.location.href = AREA_HOME.candidate` ngay trong tab Admin. Đây là hành vi có sẵn từ AD-4, chỉ lộ ra khi có tính năng khoá. Hệ quả phụ: tab ứng viên mở trang sau khi phiên đã bị tab Admin xoá nên không bị chuyển về trang chủ mà hiện trang rỗng. Ảnh hưởng demo: nếu ứng viên và Admin cùng một trình duyệt (dù khác cửa sổ), cửa sổ Admin sẽ nhảy về trang chủ ở bước 2. Đề xuất: `apiFetch`/`apiUpload` chỉ điều hướng khi đường dẫn hiện tại thuộc đúng area đó (vẫn luôn `clear()` phiên).
- **Đã sửa (cách C, chủ dự án chọn 2026-10-07):** `lib/auth-area.ts` thêm `areaForPath(pathname)` (`/admin*` → admin, `/employer*` → employer, còn lại → candidate, cùng quy tắc `CandidateSocketRoot`); `lib/api-client.ts` gộp nhánh refresh thất bại của `apiFetch` và `apiUpload` vào `endSession(area)`: luôn `clear()` phiên của area, chỉ `window.location.href = AREA_HOME[area]` khi `areaForPath(location.pathname) === area`. Kiểm lại trên trình duyệt: khoá ứng viên rồi giả lập tab Admin được focus → tab Admin đứng yên ở `/admin/users`, phiên ứng viên bị xoá, phiên Admin còn; tab ứng viên mở `/applications` bị đưa về `/` (chưa đăng nhập). Đã mở khoá lại tài khoản demo. `tsc` + ESLint 2 file sạch. Cách A (cookie httpOnly, bỏ token khỏi `localStorage`) đưa vào `docs/01-project/FEATURE_BACKLOG.md` mục 6, chưa làm.

## Kịch bản demo cho buổi báo cáo (trọn vòng)

1. Ứng viên demo đang đăng nhập ở một cửa sổ, Admin mở `/admin/users` ở cửa sổ khác. Lọc "Ứng viên", tìm theo email.
2. Admin bấm "Khoá" và nhập lý do. Phía ứng viên: thao tác kế tiếp nhận 401, refresh thất bại nên bị đăng xuất về trang chủ (chặn ngay, không đợi 15 phút).
3. Ứng viên đăng nhập lại thì thấy "Tài khoản đã bị khoá · Liên hệ hỗ trợ". Mở hộp thư thấy email báo khoá kèm lý do.
4. Ứng viên bấm link, gửi form `/support`. Admin thấy chuông thông báo "Yêu cầu hỗ trợ mới", bấm vào mở `/admin/users?q=<email>`, hàng đó hiện lý do khoá.
5. Admin bấm "Mở khoá". Ứng viên nhận email mở khoá và đăng nhập lại được. Dashboard Admin hiện 2 dòng trong "Hoạt động gần đây".

## Phần ghi chú của chủ dự án

*(để trống)*
