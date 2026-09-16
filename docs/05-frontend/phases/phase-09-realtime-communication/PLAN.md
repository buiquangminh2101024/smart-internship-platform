# Phase 9 (Frontend) — Bổ sung: Notification realtime cho Messaging

Xem implementation nền tảng (chat UI, `useSocket`, `messaging-store`) đã hoàn thành ở `IMPLEMENTATION.md` cùng thư mục. Tài liệu này là **kế hoạch bổ sung, chưa triển khai** — song song với `docs/06-backend/phase-09-realtime-communication/PLAN.md`, đọc file đó trước để nắm 2 event socket mới (`notification:new` cho các `NotificationType` nghiệp vụ Phase 10, `notification:new_message` riêng cho tin nhắn) và endpoint `GET /conversations/unread-summary` — không lặp lại ở đây. Các quyết định UX còn bỏ ngỏ ở lần viết trước (vị trí dòng ghim, badge, chia sẻ socket, vị trí toggle, route CV/công ty) và các quyết định kỹ thuật bổ sung (banner lỗi kết nối, event name) đã được chốt cùng chủ dự án ngày 2026-09-16 — xem mục 3.

> **Trạng thái: đã triển khai (2026-09-16).** Ghi chú triển khai ở `IMPLEMENTATION.md` cùng thư mục, mục "Bổ sung — Notification realtime".

## 1. Bối cảnh

- `NotificationBell.tsx` (dòng 19-22) đã có sẵn TODO: bỏ `refetchInterval: UNREAD_POLL_MS` (polling 30s), thay bằng lắng nghe socket event rồi `queryClient.invalidateQueries(["notifications", area])`.
- `useSocket.ts` hiện chỉ được gọi trong phạm vi trang chat (`/messages`, `/employer/messages`) — mở 1 kết nối socket riêng cho khu vực đó. `NotificationBell` nằm ở layout cấp cao hơn (`CandidatePortalShell`/`EmployerPortalShell`, dùng chung mọi trang trong portal) nên chưa có sẵn kết nối socket để lắng nghe.
- Quyết định nghiệp vụ đã chốt (xem file backend PLAN.md mục 1): đối xứng 2 chiều, không lưu 1 dòng `Notification`/tin nhắn (dùng dòng ghim tổng hợp), browser notification bật/tắt được trong app, chỉ bắn khi tab không active.

## 2. Việc cần làm

1. **Nâng phạm vi kết nối socket lên layout cấp portal — 1 kết nối dùng chung qua React Context (đã chốt).** Tạo `SocketProvider` mới (React Context), mount 1 lần ở `CandidatePortalShell.tsx`/`EmployerPortalShell.tsx` — nơi `NotificationBell` cũng được render — gọi `useSocket()` bên trong provider đó, expose ra context cho cả `NotificationBell` lẫn trang chat (`/messages`, `/employer/messages`) cùng dùng, thay vì mỗi nơi tự gọi `useSocket()` riêng như hiện tại. Đảm bảo đúng 1 connection/user, không mở 2 socket song song lãng phí khi đang ở trang chat.

2. **`NotificationBell.tsx`**: hiện thực TODO đã ghi sẵn — bỏ polling, lắng nghe socket event **`notification:new`** (mới, dùng cho các `NotificationType` nghiệp vụ Phase 10 — khác `notification:new_message` chỉ dành riêng cho tin nhắn, xem mục 3), gọi `queryClient.invalidateQueries(["notifications", area])` khi nhận — giữ nguyên REST contract cho danh sách thông báo nghiệp vụ hiện có (Phase 10), không đổi gì ở đó.

3. **Dòng ghim "N tin nhắn mới"** trong panel `NotificationBell` (vị trí + badge đã chốt — mục 3):
   - Query riêng, tách biệt danh sách `notifications` thường: gọi `GET /conversations/unread-summary` (backend PLAN.md mục 2.5) — `useQuery(["conversations", area, "unread-summary"], ...)`.
   - Hiển thị cố định **ở cuối** danh sách preview (không xen giữa các `Notification` thường) — giữ các thông báo nghiệp vụ (duyệt tin, ứng tuyển...) ở vị trí quen thuộc trên đầu.
   - **Badge tách riêng**: icon chuông hiển thị 2 badge số độc lập — 1 cho `notifications` unread-count (Phase 10, giữ nguyên vị trí hiện tại), 1 cho `conversations` unread-summary (mới). Vị trí chính xác của 2 badge trên cùng 1 icon (góc trên/dưới, màu phân biệt...) là chi tiết UI cụ thể, quyết định khi thiết kế giao diện lúc cài đặt.
   - Cập nhật realtime qua cùng event `notification:new_message` (invalidate luôn query `unread-summary` cạnh `notifications`).
   - Bấm vào: điều hướng tới trang hội thoại lọc "chưa đọc" (mục 4) — **không** đánh dấu đã đọc ở đây (đã đọc chỉ xảy ra khi thực sự mở hội thoại, giữ đúng nguồn sự thật `candidateLastReadAt`/`employerLastReadAt`).

4. **Bộ lọc "chỉ hội thoại chưa đọc"** trên trang `/messages` (candidate) / `/employer/messages` (employer) đã có: thêm query param (vd. `?filter=unread`), lọc `conversations` trong `messaging-store` client-side (đã có đủ dữ liệu `latestMessage`, `candidateLastReadAt`/`employerLastReadAt` để tính unread, không cần gọi API riêng cho việc lọc — chỉ `unread-summary` ở mục 3 cần API vì `NotificationBell` không phải lúc nào cũng có sẵn toàn bộ `conversations` trong store).
   - Mỗi hội thoại trong danh sách lọc hiển thị thêm link ra ngoài, route đã chốt (mục 3):
     - **Employer xem** ("CV của ứng viên"): tra `Application` theo `(candidateId, jobPostId)` của conversation — có thì link `/employer/applications/[id]` đó; **không có thì ẩn link** (không xây trang candidate profile mới).
     - **Candidate xem** ("trang công ty"): link tạm tới `/jobs/[jobPostId]` của conversation (trang chi tiết tin tuyển dụng đã có — luôn có `jobPostId` vì `Conversation` bắt buộc gắn 1 `JobPost`).

5. **Browser Notification toggle:**
   - Setting mới đặt trong **trang Settings mới, riêng** (đã chốt — khác đề xuất ban đầu là gắn vào trang `/messages`): thêm route mới hoàn toàn `/settings` (candidate) và `/employer/settings` (employer) — hiện **chưa tồn tại trang settings nào** trong `apps/web/src/app`, cần tạo cả trang lẫn mục trong menu portal shell trỏ tới nó. Giai đoạn này chỉ cần đúng 1 toggle "Thông báo tin nhắn qua trình duyệt" (không cần xây đầy đủ nhiều mục setting), lưu vào `localStorage` (per-browser, không đồng bộ đa thiết bị — đã chấp nhận trade-off này ở buổi trao đổi trước).
   - Hook mới `useBrowserNotification.ts`:
     - Khi user bật toggle: gọi `Notification.requestPermission()` (chỉ hỏi permission lúc bật, không tự động hỏi khi load trang).
     - Khi nhận event `notification:new_message` qua socket: nếu `document.visibilityState !== "visible"` **và** `Notification.permission === "granted"` **và** setting đang bật → `new Notification(title, { body })`.
     - Không bắn khi tab đang active (đã chốt) — dùng `document.visibilityState`, không phải `document.hasFocus()` (khác nhau khi multi-monitor/tab khác cùng cửa sổ).
   - Click vào browser notification: điều hướng về đúng hội thoại (`conversationId` trong payload) — cần `window.focus()` + router push.

6. **`useSocket.ts`**: thêm listener cho **cả 2** event mới — `notification:new` (dispatch cho `NotificationBell` invalidate query, mục 2) và `notification:new_message` (dispatch cho dòng ghim + `useBrowserNotification`, mục 3/5) — tách khỏi handler `new_message` hiện tại (nội dung chat thật), không đẩy vào `messaging-store`.
   - **Banner lỗi kết nối (đã chốt — mục 3):** khi `connect_error` hoặc `disconnect` (không phải do chủ động gọi `socket.disconnect()`), hiển thị 1 banner nhỏ trong portal shell (vd. "Mất kết nối realtime, đang thử kết nối lại...") thay vì chỉ `console.error` như hiện tại — ẩn banner khi `connect` lại thành công. Đặt state này ở `SocketProvider` (mục 1) để cả `NotificationBell` lẫn trang chat cùng thấy trạng thái kết nối, không cần mỗi nơi tự quản lý riêng.

## 3. Quyết định đã chốt (2026-09-16)

| Vấn đề | Quyết định |
| --- | --- |
| Vị trí dòng ghim "N tin nhắn mới" | Cuối danh sách preview trong `NotificationBell` |
| Badge tổng trên icon chuông | Tách 2 badge riêng (`notifications` unread-count và `conversations` unread-summary) |
| Chia sẻ kết nối Socket.IO giữa `NotificationBell` và trang chat | 1 kết nối dùng chung qua React Context (`SocketProvider` mới ở portal shell) |
| Vị trí toggle bật/tắt browser notification | Trang Settings mới (`/settings`, `/employer/settings`) — chưa tồn tại, cần tạo |
| Link "CV của ứng viên" khi conversation không có `Application` khớp | Ẩn link (không xây trang candidate profile mới) |
| Link "trang công ty" khi candidate nhận thông báo | Dùng tạm `/jobs/[jobPostId]` của conversation |
| Báo lỗi mất kết nối Socket.IO phía frontend | ~~Banner nhỏ toàn trang~~ → đổi (2026-09-16): chỉ báo trong trang chat (cảnh báo trên ô nhập + khoá nút Gửi) |
| Phạm vi kết nối socket của candidate | Mount ở gốc app (`app/provider.tsx`), ngắt khi tab ở `/employer`/`/admin` — nhận realtime cả trên trang công khai |
| Trùng browser notification khi mở nhiều tab | Dùng `tag` theo hội thoại để trình duyệt gộp |
| Browser notification cho thông báo nghiệp vụ (Phase 10) | Có — toggle riêng "Thông báo hệ thống", tách khỏi toggle "Tin nhắn mới" |
| Event socket cho `NotificationBell` (thông báo nghiệp vụ Phase 10) | `notification:new` — tách khỏi `notification:new_message` (chỉ dành cho tin nhắn) |

Không còn điểm nào bỏ ngỏ ảnh hưởng tới việc bắt đầu code phần frontend — chi tiết UI (màu badge, layout Settings page...) sẽ chốt khi thiết kế giao diện cụ thể lúc triển khai.

## 4. Phạm vi KHÔNG làm trong bổ sung này

- Không dùng Service Worker / Push API — chỉ Web Notification API khi tab mở nền.
- Không đồng bộ setting bật/tắt browser notification qua nhiều thiết bị (chỉ `localStorage`).
- Không đổi UI/luồng của các loại `Notification` khác (Phase 10) ngoài việc bỏ polling ở mục 2.
