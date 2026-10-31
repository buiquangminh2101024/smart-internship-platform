# Menu trên điện thoại cho Employer và Admin — Frontend

Bản mẫu đã duyệt: `docs/temp/ui-compare/mobile-nav-drawer.html` (chủ dự án xác nhận 2026-10-15).
Quy ước giao diện: `.claude/skills/sip-ui/SKILL.md`.

**Trạng thái: ĐÃ DUYỆT (2026-10-15). Bước 1 và 2 xong, chờ chủ dự án xác nhận.**

## Vấn đề

`SideNav` luôn rộng 240px (`w-60`) và topbar luôn hiện email và nút "Đăng xuất". Ở 375px, mọi trang Employer có `scrollWidth` 586 so với 357: nội dung chỉ còn khoảng 120px, cả trang cuộn ngang. Admin dùng chung `SideNav` và `PortalTopbar` nên bị giống hệt. Candidate không dùng hai component này, không bị ảnh hưởng.

## Cách làm

Dưới 1024px (`lg`), ẩn sidebar và thay bằng nút ☰ ở đầu topbar. Nút này mở một ngăn kéo trượt từ trái. Từ 1024px trở lên giữ nguyên như bây giờ.

| Bề rộng | Topbar | Điều hướng |
|---|---|---|
| < 768px | ☰ · logo kèm nhãn khu vực · chuông | Ngăn kéo |
| 768 – 1023px | ☰ · logo · breadcrumb · chuông | Ngăn kéo |
| ≥ 1024px | Như hiện tại: logo · breadcrumb · chuông · email · Đăng xuất | Sidebar cố định như hiện tại |

Ở 768px không để email và "Đăng xuất" trên topbar, vì bản mẫu cho thấy breadcrumb bị cắt còn "Emplo". Hai mục này nằm ở đáy ngăn kéo cho mọi bề rộng dưới 1024px.

### Ngăn kéo

- **Khung:** rộng 288px, tối đa 85% màn hình, cao hết màn hình, nằm trên topbar. Viền trái 3px `brand-500` giống `SideNav`. Lớp nền phủ `text-strong` 45%.
- **Phần đầu** (cao 64px, khớp topbar): logo kèm nhãn khu vực và nút × ("Đóng menu").
- **Khối tiêu đề:** dùng đúng `header` mà shell đang truyền cho `SideNav` (tên công ty kèm huy hiệu, hoặc "Admin Panel"). Tên công ty dài thì xuống tối đa 2 dòng thay vì cắt.
- **Danh sách mục:** cùng `items` với sidebar, gồm số việc chờ, `badgeTone` và "Sắp có". Mỗi mục cao 44px (sidebar là 38px). Khi màn thấp thì danh sách tự cuộn, và lúc mở sẽ cuộn tới mục đang mở.
- **Phần đáy** (đứng yên):
  - Employer: nút "Đăng tin mới" (chính là `footer` của sidebar).
  - Sau đó, cả hai khu vực có một dòng email (Employer: dẫn tới `/employer/profile`; Admin: chỉ là chữ) và một dòng "Đăng xuất" có icon `log-out`.
- **Chấm trên nút ☰:** hiện khi có mục nào đó có `badge > 0`. Employer dùng màu `brand-600`, Admin dùng `marigold-500`, giống màu số trên menu. Lúc đó nhãn của nút là "Mở menu, có việc chờ xử lý".

### Hành vi

| Việc | Cách làm |
|---|---|
| Mở | Bấm ☰. `aria-expanded`, `aria-controls` trỏ tới ngăn kéo. Focus chuyển vào nút ×. |
| Đóng | Nút ×, bấm vào nền, nhấn `Esc`, hoặc đổi route (theo dõi `usePathname()`). Khi màn hình rộng ra ≥ 1024px, ngăn kéo cũng tự đóng (`matchMedia` trong `useEffect`). Đóng bằng thao tác của người dùng thì trả focus về nút ☰. |
| Trong lúc mở | Ngăn kéo có `role="dialog"`, `aria-modal`, `aria-label="Menu điều hướng"`. Phần topbar và nội dung phía sau có thuộc tính `inert`. `Tab` chỉ đi vòng trong ngăn kéo. Khoá cuộn bằng `document.body.style.overflow`, giống `ConfirmDialog`. |
| Lúc đóng | Ngăn kéo có `inert` và `visibility: hidden` sau khi trượt xong, nên không lọt vào thứ tự Tab. |
| Chuyển động | Trượt `translate-x` trong 200ms và nền mờ dần. Khi máy bật giảm chuyển động (`motion-reduce:`) thì không có chuyển động. |

Không thêm dependency. Chỉ dùng React state, `inert` (React 19.2 hỗ trợ sẵn, repo đã dùng ở `DayGroupList`) và Tailwind v4 (`lg` = 1024px).

## File thay đổi

| File | Thay đổi |
|---|---|
| `components/layout/SideNav.tsx` | Tách phần render từng mục thành `SideNavList` (nhận `items` và `size: "rail" \| "drawer"` để chọn chiều cao 38 hoặc 44px), xuất ra để ngăn kéo dùng chung. `SideNav` thêm `hidden lg:flex`. Thêm hàm `hasPendingBadge(items)` để tính chấm và tông màu. |
| `components/layout/MobileNavDrawer.tsx` (mới) | Ngăn kéo với các props: `open`, `onClose`, `items`, `header`, `footer`, `roleLabel`, `homeHref`, `userEmail`, `accountHref`, `onLogout`, `returnFocusRef`. Hành vi như bảng trên. |
| `components/layout/PortalTopbar.tsx` | Thêm props tuỳ chọn `menu?: { open, onOpen, pendingTone?: "brand" \| "attention", buttonRef }` để vẽ nút ☰ (`lg:hidden`). Email và "Đăng xuất" thêm `hidden lg:flex`. Padding đổi thành `px-4 lg:px-6`, gap `gap-3 lg:gap-6`. Không truyền `menu` thì topbar giữ nguyên như cũ. |
| `components/layout/EmployerPortalShell.tsx`, `AdminConsoleShell.tsx` | Thêm state `navOpen` và ref cho nút ☰. Bọc topbar và phần thân trong một `div` có `inert={navOpen}`. Truyền cùng `navItems`, `header`, `footer` cho cả `SideNav` lẫn `MobileNavDrawer`. Giữ nguyên `NAV_ITEMS`, `CRUMB_LABELS` và logic logout. |
| `.claude/skills/sip-ui/SKILL.md` | Cập nhật dòng "Shell cố định" và mục Layout: sidebar chỉ hiện từ `lg`, dưới đó là `MobileNavDrawer`. |

## Các bước

| Bước | Nội dung | Điều kiện xong |
|---|---|---|
| 0 | Chủ dự án duyệt plan. | — |
| 1 | Code 5 file trên. | `tsc` của web sạch, `npm run lint --workspace web` sạch với các file đã sửa. |
| 2 | Kiểm trên trình duyệt qua nginx `:8080` (không dùng `:3000`). Cần chủ dự án đăng nhập giúp tài khoản Employer và Admin. | Ở 375px: không cuộn ngang ở Tổng quan, Tin tuyển dụng, Lời mời (Employer) và Tổng quan, Người dùng (Admin). Đủ cách mở/đóng, Tab, Esc, đổi trang, chấm việc chờ. Ở 768px: có breadcrumb, không tràn. Ở ≥ 1280px: giống hệt hiện tại. Console không lỗi. Kết quả ghi vào plan này, rồi chủ dự án xác nhận. |

Server có cron ghi vào DB Neon thật, nên mình không tự bật server. Bước 2 dùng server đang chạy của chủ dự án.

## Rủi ro

- **Hai lớp cùng khoá cuộn:** `ConfirmDialog` trả `overflow` về `unset` khi đóng. Ngăn kéo luôn đóng trước khi một dialog trong trang có thể mở (mọi mục đều đổi route), nên hai bên không chồng nhau.
- **Thứ tự lớp:** topbar ở `z-20`, menu chuông ở `z-30`. Ngăn kéo và lớp nền đặt `z-40`, toast giữ nguyên lớp hiện có.
- **Trang tự tràn:** sau khi bỏ 240px của sidebar, trang nào vẫn cuộn ngang ở 375px là do chính nội dung trang đó. Bước 2 chỉ ghi lại các trang này, không sửa trong phạm vi plan.

## Ngoài phạm vi

- Shell của Candidate.
- Thu sidebar thành dải icon cho máy tính bảng, và thanh tab dưới đáy (đã cân nhắc và bỏ trong đề xuất).
- Sửa chỗ tràn riêng của từng trang nội dung.

## Kết quả

### Bước 1 (2026-10-15)

`tsc --noEmit` của web sạch. `eslint src/components/layout` không có lỗi; còn 3 cảnh báo import thừa có sẵn trong `CandidatePortalShell.tsx` (ngoài phạm vi, không sửa).

Khác so với bảng "File thay đổi" ở trên (chỉ là cách tổ chức code, hành vi giữ nguyên):

- State mở/đóng nằm trong hook `useMobileNav()` (cùng file `MobileNavDrawer.tsx`) thay vì viết lặp ở hai shell. Hook giữ `open`, `id` của ngăn kéo, ref nút ☰; đóng khi đổi route bằng cách so `pathname` ngay trong render (không cần effect), đóng khi ≥ 1024px qua `matchMedia`, và trả focus về ☰ sau khi commit.
- `PortalTopbar` nhận ref của nút ☰ qua prop riêng `menuButtonRef` (lint `react-hooks/refs` coi cả object `menu` là ref nếu để ref bên trong).
- Hàm tính chấm tên là `pendingBadgeTone(items)`, trả `"brand" | "attention" | null`.
- Logo kèm nhãn khu vực tách thành `PortalLogo` (trong `PortalTopbar.tsx`) để phần đầu ngăn kéo dùng chung.
- Employer: khối tên công ty tách thành `CompanyHeader` trong shell, có tuỳ chọn `wrap` để ngăn kéo cho xuống 2 dòng; sidebar vẫn cắt một dòng như cũ.
- Chọn một link bất kỳ trong ngăn kéo (kể cả trang đang mở, khi route không đổi) cũng đóng ngăn kéo.
- Số việc chờ và nhãn "Sắp có" trong ngăn kéo dùng chữ 13px; sidebar giữ cỡ cũ.
- Trong ngăn kéo, huy hiệu "Đã xác minh" vừa với chữ (`justify-items-start`); sidebar vẫn như cũ. Lỗi này phát hiện ở bước 2.

### Bước 2 (2026-10-15)

Kiểm qua nginx `:8080`, dev server của chủ dự án, tài khoản Employer và Admin đã đăng nhập sẵn. Cửa sổ Chrome đang maximize nên không thu nhỏ được; mình kiểm trong một iframe cùng origin rộng 375 / 768 / 1280px (ở 375px thanh cuộn dọc chiếm 15px, nên bề rộng nội dung là 360px).

**375px, không cuộn ngang** (`scrollWidth` = `clientWidth`):

| Khu vực | Trang |
|---|---|
| Employer | Tổng quan, Tin tuyển dụng, Lịch phỏng vấn, Lời mời, Tin nhắn, Hồ sơ công ty, Gói dịch vụ, Cài đặt |
| Admin | Tổng quan, Kiểm duyệt tin, Nhà tuyển dụng, Kỹ năng, Danh mục học vấn, Người dùng, Cài đặt |

Các phần rộng hơn màn hình (biểu đồ ở Tổng quan Employer, hàng tab ở Tổng quan Admin, bảng ở trang Người dùng) đều nằm trong vùng cuộn riêng, nên trang không bị tràn.

**Hành vi ngăn kéo (375px):**

- Bấm ☰: ngăn kéo rộng 288px, `aria-expanded="true"`, focus vào ×, `body` có `overflow: hidden`, phần trang phía sau có `inert`.
- Tab và Shift+Tab đi vòng giữa logo và "Đăng xuất".
- Đóng bằng Esc, bấm nền, chọn mục (Employer → Tin tuyển dụng, Lịch phỏng vấn, Lời mời; Admin → Người dùng), bấm vào chính mục đang mở, hoặc nút Back của trình duyệt. Mỗi lần đóng: focus về ☰, khoá cuộn được gỡ, ngăn kéo `inert` và `visibility: hidden`.
- Đang mở mà màn hình rộng lên 1280px thì ngăn kéo tự đóng và gỡ khoá cuộn.
- Employer có 3 hồ sơ chờ: ☰ có chấm màu `brand-600` (`#3f4cc0`), nhãn "Mở menu, có việc chờ xử lý". Admin lúc kiểm không có hàng chờ nào, nên ☰ không có chấm và nhãn là "Mở menu". Chấm marigold mới chỉ kiểm trên bản mẫu HTML.
- Admin: "Báo cáo" có nhãn "Sắp có"; email chỉ là chữ, không phải link.

**768px:** ☰, logo, breadcrumb ("Employer Portal › Tin tuyển dụng") và chuông đều hiện, không tràn. Ngăn kéo vẫn dùng như ở 375px.

**1280px:** Employer và Admin giống hiện tại: sidebar 240px, email và "Đăng xuất" trên topbar. Nút ☰ và ngăn kéo `display: none`.

**Console:** không có lỗi.

**Lỗi đã sửa trong lúc kiểm:** huy hiệu "Đã xác minh" bị kéo dãn hết bề ngang ngăn kéo.

**Chưa giải thích được:** có 2 lần click chuột thật vào "Tin tuyển dụng" từ Tổng quan Employer, ngăn kéo đóng nhưng sau 5–7 giây vẫn chưa chuyển trang. Một lần là lần đầu vào route đó; lần còn lại là sau khi sửa file shell (dev server phải biên dịch lại). Sau đó không lặp lại được: 6 lần click thật và 8 lần click bằng script liên tiếp, kể cả ngay sau khi biên dịch lại, đều chuyển trang trong 60–150ms, ngang với link thường trong trang. Khả năng cao là do dev server biên dịch chậm; nếu bạn gặp lại thì báo để kiểm tiếp.

**Chưa kiểm:** nút "Đăng xuất" trong ngăn kéo (sẽ đăng xuất tài khoản đang dùng để kiểm; nút gọi đúng `handleLogout` như topbar), tên công ty dài và trạng thái "Chờ xác minh" (cần dữ liệu khác; đã kiểm trên bản mẫu HTML).
