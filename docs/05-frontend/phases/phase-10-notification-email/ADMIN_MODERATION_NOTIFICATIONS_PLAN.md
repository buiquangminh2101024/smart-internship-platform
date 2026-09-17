# Phase 10 (Frontend) — Bổ sung: Realtime + cài đặt thông báo trình duyệt cho Admin

Xem hạ tầng NotificationBell/polling/socket nền tảng ở `PLAN.md`/`IMPLEMENTATION.md` cùng thư mục — không lặp lại ở đây. Tài liệu này là **kế hoạch, chưa triển khai**. Backend tương ứng: `docs/06-backend/phase-10-notification-email/ADMIN_MODERATION_NOTIFICATIONS_PLAN.md`. Quyết định kiến trúc tóm tắt ở `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-12.

> **Trạng thái: ĐÃ TRIỂN KHAI (2026-09-17).** Bám sát kế hoạch, không có sai khác.

## 1. Bối cảnh

Admin hiện **chưa có** `SocketProvider` (chỉ candidate/employer có — `app/provider.tsx`, `EmployerPortalShell.tsx`), nên `NotificationBell` ở khu admin đang chạy hoàn toàn bằng polling 30s (`UNREAD_POLL_MS`). Sau khi backend bắn `COMPANY_LINK_REQUESTED`/`JOB_POST_SUBMITTED` (xem plan backend cùng bổ sung), cần: (1) Admin nhận badge/toast tức thời qua socket giống candidate/employer, (2) trang Cài đặt có toggle bật/tắt thông báo trình duyệt cho Admin — hiện trang này chỉ tồn tại ở candidate/employer.

**Nút thắt kỹ thuật:** `useSocketConnection`/`SocketProvider`/`useBrowserNotification`/`SettingsPage` đều đang gõ kiểu tham số `area` là `MessagingArea = "candidate" | "employer"` (loại trừ admin có chủ đích, vì admin không có hội thoại/tin nhắn). Cần mở rộng các chỗ này sang `AuthArea` (`"candidate" | "employer" | "admin"`) cho phần **thông báo nghiệp vụ**, đồng thời vẫn chặn đúng phần **tin nhắn** không áp dụng cho admin bằng type guard tường minh — không dựa vào "server sẽ không bao giờ gửi event đó cho admin" để bỏ qua kiểu.

## 2. Quyết định kỹ thuật

### 2.1 `hooks/useSocket.ts` — mở `area` sang `AuthArea`

- Đổi chữ ký `useSocketConnection(area: AuthArea, handlers, enabled)`.
- Thêm type guard cục bộ:
  ```ts
  function isMessagingArea(area: AuthArea): area is MessagingArea {
    return area !== "admin";
  }
  ```
- Bọc 2 chỗ đang gọi `markConversationUnavailable(area, ...)` (store chỉ nhận `"candidate" | "employer"`) bằng `if (isMessagingArea(area)) markConversationUnavailable(area, ...)` — 1 chỗ ở listener `conversation:unavailable`, 1 chỗ ở listener `error` (nhánh `CONVERSATION_UNAVAILABLE`).
- `authStoreForArea(area)` — không đổi, đã nhận `AuthArea` sẵn.
- `sendMessage()` — không đổi chữ ký, nhưng thực tế admin sẽ không gọi hàm này (UI admin không có ô chat) nên không cần guard thêm; nếu lỡ gọi, server không có handler nghiệp vụ cho conversation của admin nên emit sẽ bị bỏ qua vô hại.

### 2.2 `components/realtime/SocketProvider.tsx` — mở `area` sang `AuthArea`

- `SocketProvider({ area: AuthArea, ... })`, `SocketContextValue.area: AuthArea`.
- `onMessageNotification` hiện dùng `MESSAGES_HREF[area]` (kiểu `Record<MessagingArea, string>`) — thêm guard đầu callback:
  ```ts
  onMessageNotification: (event) => {
    if (!isMessagingArea(area)) return; // admin không có tin nhắn — phòng hờ, server không emit event này cho admin
    ...
  },
  ```
  (import `isMessagingArea` từ `useSocket.ts`, hoặc khai báo lại cục bộ — theo đúng chỗ đặt hiện có của 2 hook này).
- `onNotification` (dùng cho `notification:new`) — **không đổi**, hoạt động nguyên trạng cho mọi area kể cả admin (đây chính là kênh cần mở rộng).

### 2.3 `AdminConsoleShell.tsx` — mount `SocketProvider`

Bọc theo đúng pattern `EmployerPortalShell.tsx`:

```tsx
return (
  <SocketProvider area="admin">
    <div data-role="admin" className="flex min-h-screen flex-col bg-surface-page">
      ...
    </div>
  </SocketProvider>
);
```

`NotificationBell` (đã nhận `area: AuthArea` từ trước, không đổi) sẽ tự chuyển từ polling sang socket vì logic `pollInterval = socket?.area === area && socket.status === "connected" ? false : UNREAD_POLL_MS` đã tổng quát sẵn.

### 2.4 `lib/browser-notification.ts` — mở `area` sang `AuthArea`

Đổi kiểu tham số của `storageKey`/`readBrowserNotificationSetting`/`writeBrowserNotificationSetting`/`showBrowserNotification` từ `MessagingArea` sang `AuthArea` (import đổi từ `./messaging` sang `./auth-area`). Không đổi logic bên trong — key localStorage vẫn theo mẫu `sip-browser-notify-system-${area}`, chỉ thêm `admin` làm giá trị `area` hợp lệ. Kind `"message"` vẫn tồn tại trong type nhưng admin sẽ không bao giờ được gọi với kind này (chặn ở tầng UI, mục 2.6) — không cần loại bỏ khỏi `BrowserNotificationKind`.

### 2.5 `hooks/useBrowserNotification.ts` — mở `area` sang `AuthArea`

Chỉ đổi kiểu tham số `area: MessagingArea` → `area: AuthArea` (import đổi tương ứng). Logic không đổi.

### 2.6 `components/settings/SettingsPage.tsx` — nhận `AuthArea`, ẩn toggle "Tin nhắn mới" cho admin

```tsx
export function SettingsPage({ area }: { area: AuthArea }) {
  const toggles = area === "admin" ? TOGGLES.filter((t) => t.kind !== "message") : TOGGLES;
  ...
  {toggles.map((toggle) => (
    <BrowserNotificationToggle key={toggle.kind} area={area} {...toggle} />
  ))}
}
```

`BrowserNotificationToggle` nội bộ cũng đổi prop `area: MessagingArea` → `area: AuthArea` (chỉ truyền xuống `useBrowserNotification`, không dùng logic riêng theo area).

### 2.7 Trang mới `app/admin/(console)/settings/page.tsx`

Giống hệt `app/employer/(portal)/settings/page.tsx`:

```tsx
"use client";
import { SettingsPage } from "@/components/settings/SettingsPage";
export default function AdminSettingsPage() {
  return <SettingsPage area="admin" />;
}
```

### 2.8 `AdminConsoleShell.tsx` — thêm mục nav "Cài đặt"

`NAV_ITEMS` hiện thiếu mục này (khác Employer đã có) — thêm cuối danh sách:

```ts
{ label: "Cài đặt", icon: "settings", href: "/admin/settings" },
```

`CRUMB_LABELS` thêm `settings: "Cài đặt"` (đã có sẵn key này ở employer, admin đang thiếu).

### 2.9 Không đổi

- `lib/messaging.ts` (`MessagingArea` giữ nguyên `"candidate" | "employer"` — admin thật sự không có hội thoại, không mở rộng type này).
- `NotificationBell.tsx` — đã dùng `area: AuthArea` và tự tách `messagingArea` từ trước, không cần sửa.
- `ChatLayout.tsx`, `messaging-store.ts` — ngoài phạm vi (chat không liên quan tới bổ sung này).
- `packages/shared-types` — không cần type mới.

## 3. Phạm vi KHÔNG làm

- Không thêm banner "mất kết nối" toàn trang cho admin khi socket rớt — giữ nguyên chiến lược hiện có (NotificationBell tự rơi về polling im lặng).
- Không đồng bộ setting bật/tắt thông báo đa thiết bị cho admin (vẫn `localStorage` theo trình duyệt, giống candidate/employer).
- Không thêm badge riêng "việc chờ duyệt" tách khỏi badge thông báo chung — dùng chung cơ chế `unread-count` đã có.

## 4. Cách test (trình duyệt, 2 cửa sổ: Admin + Employer)

1. Đăng nhập Admin, mở `/admin/jobs` (hoặc bất kỳ trang console nào) → mở DevTools Network xác nhận có kết nối `socket.io`.
2. Ở cửa sổ Employer, nộp hồ sơ công ty rơi vào `MANUAL_REVIEW` → cửa sổ Admin nhận badge NotificationBell tăng ngay lập tức (không cần đợi 30s polling), mở bell thấy dòng mới, bấm vào điều hướng đúng `/admin/companies/:id`.
3. Vào `/admin/settings`, bật "Thông báo hệ thống" → cấp quyền trình duyệt → xác nhận **không** có toggle "Tin nhắn mới" trên trang này.
4. Chuyển tab admin sang ẩn (visibilityState hidden), lặp lại bước 2 → xác nhận nhận được browser notification hệ điều hành, bấm vào điều hướng đúng trang.
5. Tắt mạng ở cửa sổ Admin, lặp lại bước 2, bật lại mạng → xác nhận badge vẫn cập nhật trong vòng ≤30s (dự phòng polling hoạt động).

## Phần ghi chú của chủ dự án

*(để trống)*
