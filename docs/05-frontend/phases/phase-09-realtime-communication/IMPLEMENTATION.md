# Phase 9 (Frontend) — Realtime Communication Implementation

Tài liệu này mô tả chi tiết implementation thực tế đã hoàn thành cho Phase 9 (Realtime Chat) ở phía Frontend.

## 1. Phạm vi và Mục tiêu

Phase 9 cung cấp trải nghiệm nhắn tin thời gian thực 1-1 giữa Ứng viên (Candidate) và Nhà tuyển dụng (Employer) thông qua cơ chế WebSocket.
- Tích hợp thư viện `socket.io-client`.
- Quản lý trạng thái (State Management) tập trung bằng Zustand.
- Cung cấp giao diện Chat hợp nhất (Shared Chat UI) dùng chung cho cả 2 Portal.
- Tích hợp luồng tạo hội thoại mới từ chi tiết JobPost hoặc chi tiết Application.

## 2. Kiến trúc và State Management

### 2.1 Zustand Store (`messaging-store.ts`)
Store tập trung để quản lý toàn bộ dữ liệu tin nhắn thay vì dùng Context API:
- `conversations`: Danh sách các hội thoại (mảng).
- `messages`: Dictionary dạng `Record<string, Message[]>` lưu trữ tin nhắn theo từng `conversationId`.
- `activeConversationId`: Hội thoại đang được chọn.
- `isLoadingConversations`, `isLoadingMessages`: Trạng thái loading.
- Cung cấp các async action: `fetchConversations`, `fetchMessages`, `appendMessage`, `markAsRead`.

### 2.2 Custom Hook (`useSocket.ts`)
- Khởi tạo kết nối Socket.IO trực tiếp đến backend (`process.env.NEXT_PUBLIC_API_URL` trích xuất phần origin).
- Xác thực bằng token (JWT) truyền qua thẻ `auth`.
- Tự động gắn event listener cho sự kiện `receive_message`.
- Dispatch action `appendMessage` vào `messaging-store` ngay khi nhận được tin nhắn mới.
- Xử lý cleanup kết nối (ngắt socket khi unmount hoặc token hết hạn).

## 3. Giao diện (UI Components)

### 3.1 Shared Layout (`ChatLayout.tsx`)
Giao diện nhắn tin được thiết kế linh hoạt, dùng chung cho cả `Candidate` và `Employer`:
- **Sidebar (Danh sách hội thoại):** Hiển thị tên đối tác (Candidate/Employer), tiêu đề tin tuyển dụng, và nội dung tin nhắn mới nhất. Hỗ trợ hiển thị chữ in đậm cho tin nhắn chưa đọc.
- **Chat Window:** Hiển thị bong bóng tin nhắn (message bubbles) phân biệt bằng màu sắc (tin của mình ở bên phải màu xanh, tin của đối tác ở bên trái màu trắng).
- **Auto-scroll:** Tự động cuộn xuống tin nhắn mới nhất mỗi khi người dùng gửi hoặc nhận tin.
- **Không gian tối ưu:** Layout được đặt `h-full` tràn viền, lược bỏ các tiêu đề thừa (như chữ "Tin nhắn" hoặc "Hội thoại" to) để không gian giống với các app nhắn tin chuyên nghiệp.

### 3.2 Tích hợp vào các Portal
- **Candidate Portal (`/messages/page.tsx`):**
  - Trang tin nhắn toàn màn hình.
  - Tích hợp thêm nút "Nhắn tin" (icon `messages-square`) trong danh sách **Lịch sử ứng tuyển** (`/applications/page.tsx`). Nhấn vào sẽ tự động tạo/lấy hội thoại tương ứng với JobPost đó và điều hướng thẳng vào phòng chat.
- **Employer Portal (`/employer/messages/page.tsx`):**
  - Trang tin nhắn toàn màn hình.
  - Tích hợp nút "Nhắn tin cho ứng viên" trong trang **Chi tiết ứng viên** (`/employer/applications/[id]/page.tsx`).

## 4. API & Fetching Issues (Đã fix)
- Khắc phục lỗi `Cannot read properties of undefined` khi `apiFetch` tự động trích xuất thuộc tính `data` từ payload response (`{ success: true, data: [...] }`), nhưng type khai báo bên frontend lại không đồng bộ. Đã sửa lại generic type của `apiFetch` thành đúng chuẩn mảng/object nội dung thực tế.
- Khắc phục lỗi 404 do khai báo đường dẫn API fetch dư thừa tiền tố `/api/` (vì config `apiFetch` đã có sẵn `/api`).
- Khắc phục lỗi 404 kết nối Socket do Next.js route sai đường dẫn websocket; đã sửa lại kết nối trỏ thẳng về Origin của Backend thay vì Frontend.

## 5. Bổ sung — Notification realtime (2026-09-16)

Triển khai theo `PLAN.md` cùng thư mục.

- **`components/realtime/SocketProvider.tsx`** (mới): gọi `useSocketConnection(area, handlers, enabled)` và expose `{ area, status, sendMessage }` qua `useSocket()` (provider gần nhất được ưu tiên).
  - Candidate: mount ở `app/provider.tsx` (`CandidateSocketRoot`) — nhận realtime cả trên trang công khai (`/`, `/jobs`...), giữ 1 kết nối liên tục khi chuyển trang; `enabled=false` khi tab đang ở `/employer/*` hoặc `/admin/*` (chỉ ngắt kết nối, không đổi cây component).
  - Employer: mount ở `EmployerPortalShell`.
  - Mỗi tab trình duyệt (kể cả split tab) có kết nối riêng, không ảnh hưởng nhau.
  - Không có banner toàn trang: mất kết nối chỉ được báo trong `ChatLayout` (cảnh báo trên ô nhập, khoá nút Gửi; gửi thất bại thì giữ nội dung — `sendMessage` trả `false`). `NotificationBell` tự quay về polling.
- **`hooks/useSocket.ts`**: đổi thành `useSocketConnection(area, handlers)` — ngoài `new_message` còn nghe `notification:new` (invalidate `["notifications", area]`) và `notification:new_message` (invalidate `["conversations", area, "unread-summary"]` + browser notification). Token đọc lại mỗi lần (re)connect qua `auth` callback.
  - Token hết hạn (mở lại trang sau >15 phút): server từ chối ở middleware và socket.io không tự thử lại → hook gọi `refreshAccessTokenShared(area)` (dùng chung với `apiFetch`, gộp lệnh refresh đồng thời) một lần cho mỗi đợt lỗi, và subscribe store: token đổi mà socket chưa kết nối thì `socket.connect()`. `connect_error` log bằng `console.warn` (không bật overlay lỗi của Next dev).
- **`NotificationBell.tsx`**: polling 30s chỉ còn là dự phòng khi không có socket đang kết nối cho đúng area. Thêm badge thứ 2 (góc dưới, màu brand) cho số hội thoại có tin chưa đọc và dòng ghim cố định ở cuối panel → `/messages?filter=unread` (không đánh dấu đã đọc). Admin không có dòng ghim.
- **`ChatLayout.tsx`**: tab "Tất cả / Chưa đọc" đồng bộ với `?filter=unread`; ở chế độ "Chưa đọc" mỗi hội thoại có link ra ngoài (`lib/messaging.ts#conversationExternalLink`): employer → `/employer/applications/[applicationId]` (ẩn khi `applicationId = null`), candidate → `/jobs/[jobPostId]`. Sau `markAsRead` invalidate query `unread-summary`.
- **Trang Cài đặt** (mới): `/settings`, `/employer/settings` dùng chung `components/settings/SettingsPage.tsx` — 2 toggle thông báo trình duyệt tách riêng (`hooks/useBrowserNotification.ts(area, kind)`, lưu `localStorage`):
  - "Tin nhắn mới" (`kind = "message"`, key `sip-browser-notify-<area>`) — event `notification:new_message`.
  - "Thông báo hệ thống" (`kind = "system"`, key `sip-browser-notify-system-<area>`) — event `notification:new` (duyệt/từ chối tin, trạng thái ứng tuyển, xác minh công ty). Bấm vào: đánh dấu đã đọc + mở `link` backend đã render, giống bấm trong `NotificationBell`.
  - Chỉ hỏi quyền khi bật. `/settings` có trong `CANDIDATE_ONLY_PREFIXES` (`proxy.ts`) và menu tài khoản của `CandidateHomeHeader`. Khu admin không có socket nên không có thông báo trình duyệt.
- **`lib/browser-notification.ts`**: chỉ bắn khi `document.visibilityState !== "visible"`, quyền `granted` và setting bật; click → `window.focus()` + mở đúng hội thoại. Dùng `tag` theo `(area, conversationId)` để nhiều tab chạy nền không bắn trùng thông báo.
