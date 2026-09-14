# Phase 10 (Frontend) — Notification & Email Module

Xem tổng quan ở `docs/05-frontend/FRONTEND_PHASES.md` §Phase 10 và kế hoạch backend song song ở `docs/06-backend/phase-10-notification-email/PLAN.md`. Không chép lại nội dung 2 file đó — chỉ ghi phần đặc thù frontend.

> **Trạng thái: đã triển khai** (2026-09-14). Khác biệt quan trọng so với kế hoạch ghi ở mục "Khác biệt khi triển khai" cuối file — đáng chú ý nhất: `CandidatePortalShell` **không** dùng `PortalTopbar`, nên chuông của ứng viên nằm ở `CandidateHomeHeader`.

**Chưa có ảnh mẫu UI cho phase này.** `components/layout/PortalTopbar.tsx` đã có sẵn comment chừa chỗ: *"không có chuông thông báo (Phase 10)"* — phần dưới đây thiết kế tối giản dựa theo component/vocabulary đã có, sẽ điều chỉnh khi chủ dự án cung cấp mẫu UI đầy đủ (giống cách 6-FE-4 đã làm).

**Phụ thuộc Phase 9 (Socket.IO, đang làm song song, chưa xong):** phase này chỉ dùng **polling** (`GET /notifications/unread-count` định kỳ), không dùng socket client. Khi Phase 9 xong, đổi cơ chế polling → lắng nghe socket event, không cần đổi REST contract.

## Phần 1 — Công nghệ / kiến trúc đặc thù

- Không thêm thư viện mới. Tái dùng `apiFetch` (`lib/api-client.ts`, theo `AuthArea` — `candidate`/`employer`/`admin`, xem `lib/auth-area.ts`) và component có sẵn: `Button`, `Icon`, `Badge`, `Card`.
- **Component mới `NotificationBell`** (`components/layout/NotificationBell.tsx`) — đặt trong `PortalTopbar.tsx` (component dùng chung cho cả 3 shell: `CandidatePortalShell`, `EmployerPortalShell`, `AdminConsoleShell`), thay cho đoạn comment chừa chỗ hiện có. Chỉ 1 component dùng chung cho cả 3 actor — không viết riêng cho từng shell — vì API `/notifications` actor-agnostic.
- Danh sách notification đầy đủ (`/notifications` trang riêng) dùng React Query, giống pattern `admin/(console)/companies/page.tsx`.
- Polling unread-count: `useQuery` với `refetchInterval` (30–60s) — không cần thư viện thêm, React Query đã hỗ trợ sẵn.

## Phần 2 — Liên kết giữa các phần

- **DTO dùng chung** (`packages/shared-types`, do backend thêm — xem `docs/06-backend/phase-10-notification-email/PLAN.md` Phần 2): `Notification { id, type: NotificationType, title, body, link, isRead, readAt, createdAt }`, `UnreadCountResponse { count }`. `NotificationType` union đã có sẵn ở `shared-types`, chỉ thêm 2 giá trị mới (`COMPANY_REJECTED`, `MESSAGE_RECEIVED`).
- Route thật cho trang danh sách notification đầy đủ: vì API actor-agnostic nhưng mỗi shell có layout riêng, đặt trang danh sách theo từng area — `apps/web/src/app/(candidate)/notifications/page.tsx`, `apps/web/src/app/employer/(portal)/notifications/page.tsx`, `apps/web/src/app/admin/(console)/notifications/page.tsx`. `NotificationBell` nhận `area: AuthArea` + `listHref` (đường dẫn tới trang danh sách tương ứng) làm prop, gọi `apiFetch(area, ...)`.
- Click 1 notification (trong dropdown chuông hoặc trang danh sách) → gọi `PATCH /notifications/:id/read` rồi `router.push(notification.link)`. **Không tự suy luận link theo `type`** — dùng thẳng `notification.link` backend đã render sẵn. Trang đích tự chịu trách nhiệm kiểm tra authorization (link chỉ là điều hướng, không phải quyền truy cập).
- "Đánh dấu tất cả đã đọc" → `PATCH /notifications/read-all`, invalidate cả query unread-count lẫn danh sách.
- Không có notification riêng cho Admin trong phạm vi Phase 10 (không có `NotificationType` nào target `ADMIN` role) — chuông của Admin sẽ hiển thị 0/rỗng, không phải lỗi.

## Phần 3 — Các bước thực hiện

### 10-FE-1: `NotificationBell` trong `PortalTopbar`
- `components/layout/NotificationBell.tsx`: icon chuông + badge số `unreadCount` (ẩn nếu 0), click mở dropdown/popover hiển thị 5–10 notification gần nhất (title, body rút gọn, thời gian tương đối, chấm chưa đọc), link "Xem tất cả" → trang danh sách theo area, nút "Đánh dấu tất cả đã đọc".
- Sửa `PortalTopbar.tsx`: thay comment "không có chuông thông báo (Phase 10)" bằng `<NotificationBell area={...} listHref={...} />`, truyền `area` từ 3 nơi gọi (`CandidatePortalShell`, `EmployerPortalShell`, `AdminConsoleShell`).
- **Test:** đăng nhập từng role, thấy badge đúng số chưa đọc, mở dropdown thấy đúng danh sách, polling cập nhật badge sau khi có notification mới (test bằng cách trigger 1 hành động ở backend — vd. đổi trạng thái application).

### 10-FE-2: Trang danh sách notification đầy đủ
- 3 trang theo route ở Phần 2 (nội dung giống nhau, chỉ khác layout bọc ngoài theo shell): danh sách phân trang (cursor), filter "Chưa đọc"/"Tất cả", mỗi item click → mark-read + điều hướng theo `link`.
- **Test:** phân trang hoạt động đúng (cursor), filter "Chưa đọc" chỉ hiện đúng các mục `isRead=false`, mark-read cập nhật UI ngay không cần reload.

### 10-FE-3 (chuẩn bị sẵn, không code ngay): Seam cho Phase 9
- Ghi chú trong code (comment TODO ở `NotificationBell.tsx`): khi Phase 9 có Socket.IO client, thay `refetchInterval` bằng lắng nghe event realtime rồi gọi `queryClient.invalidateQueries` — không cần đổi shape dữ liệu hay endpoint.

## Khác biệt khi triển khai (so với kế hoạch ở trên)

- **`PortalTopbar` chỉ dùng cho Employer + Admin.** Kế hoạch giả định cả 3 shell dùng chung `PortalTopbar`, nhưng `CandidatePortalShell` thực tế dựng header bằng `CandidateHomeHeader` (marketing header, để giao diện ứng viên nhất quán với trang công khai). Vì vậy:
  - `PortalTopbar` nhận thêm prop `area: AuthArea` và render `<NotificationBell area={area} />` (Employer/Admin truyền từ shell tương ứng).
  - `CandidateHomeHeader` đặt `<NotificationBell area="candidate" />` cạnh nút menu tài khoản; mục "Thông báo — Sắp có" (disabled) trong menu tài khoản được đổi thành link thật tới `/notifications`.
- **Tách `lib/notifications.ts`** (gọi API + `NOTIFICATIONS_HREF` theo area + `formatRelativeTime`) để chuông và trang danh sách không lặp lại logic fetch.
- **3 trang danh sách chỉ là vỏ mỏng** bọc một component dùng chung `components/notifications/NotificationListPage.tsx` (`area` là prop duy nhất) — nội dung 3 trang giống hệt nhau, chỉ khác app shell bọc ngoài, nên viết 3 lần là trùng lặp thuần tuý.
- `NotificationBell` tự suy ra `listHref` từ `area` qua `NOTIFICATIONS_HREF` thay vì nhận thêm prop `listHref` như kế hoạch — một nguồn sự thật duy nhất cho đường dẫn.
- Thêm nhãn breadcrumb `notifications: "Thông báo"` vào `CRUMB_LABELS` của `EmployerPortalShell`/`AdminConsoleShell` (nếu không, breadcrumb hiển thị "Chi tiết").
- **Chưa kiểm thử bằng trình duyệt với phiên đăng nhập thật**: đã xác minh type-check sạch, 3 route render/redirect đúng, và toàn bộ 4 endpoint notification trả đúng dữ liệu khi gọi trực tiếp bằng token thật. Phần còn lại (badge cập nhật sau polling, dropdown, điều hướng khi bấm) cần chủ dự án bấm thử trên UI.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
