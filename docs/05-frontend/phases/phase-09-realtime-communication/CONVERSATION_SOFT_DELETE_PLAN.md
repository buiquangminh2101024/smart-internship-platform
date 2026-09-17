# Phase 9 (Frontend) — Bổ sung: Soft-delete hội thoại theo trạng thái JobPost

Song song với `docs/06-backend/phase-09-realtime-communication/CONVERSATION_SOFT_DELETE_PLAN.md` — đọc file đó trước để nắm schema (`candidateDeletedAt`/`employerDeletedAt`), endpoint mới (`DELETE /conversations/:id`), event socket mới (`conversation:unavailable`), và lỗi `code: "CONVERSATION_UNAVAILABLE"` khi gửi tin bị chặn. Không lặp lại phần đó ở đây. Quyết định kiến trúc tóm tắt: `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-11.

> **Trạng thái: ĐÃ TRIỂN KHAI (2026-09-17).** Lệch so với kế hoạch bên dưới:
>
> - `markConversationUnavailable(area, conversationId)` nhận `area` của người nhận và tự suy ra cờ phía đối diện (thay vì `deletedByArea`).
> - Backend gửi kèm `conversationId` trong payload `error` → bỏ phương án `lastSentConversationIdRef` ở mục 4.
> - Toast dùng `ToastViewport` sẵn có với state cục bộ trong `ChatLayout`; nút xoá luôn hiện (góc phải dòng hội thoại), kèm badge "Không còn khả dụng" ở sidebar cho hội thoại bị khoá.

## 1. Bối cảnh

`ChatLayout.tsx` (component chat dùng chung candidate/employer qua prop `area`) và `messaging-store.ts` hiện đã có sẵn danh sách hội thoại, khung chat, và (từ bổ sung fix bug gần nhất) 2 effect tách riêng cho fetch lịch sử và `markAsRead`. Bổ sung này thêm 3 việc vào cùng component/store đó, không tạo trang mới:

1. Badge trên mỗi hội thoại đủ điều kiện xoá (job post đã đóng/hết hạn/bị gỡ).
2. Nút xoá + xác nhận, chỉ hiện khi đủ điều kiện.
3. Khoá ô nhập tin + banner "không còn khả dụng" khi phía kia đã xoá, cập nhật realtime qua socket.

## 2. `lib/messaging.ts` — 2 helper mới (cùng khuôn mẫu `isConversationUnread`)

```ts
const DELETABLE_JOB_POST_STATUSES: JobPostStatus[] = ["CLOSED", "EXPIRED", "TAKEN_DOWN"];

/** Tin tuyển dụng đã đóng/hết hạn/bị gỡ — đủ điều kiện xoá hội thoại (cùng rule với backend, xem AD-11). */
export function isConversationDeletable(conv: Conversation): boolean {
  return DELETABLE_JOB_POST_STATUSES.includes(conv.jobPost.status);
}

/** false nếu phía bên kia (hoặc chính mình, phòng hờ dữ liệu cũ trong cache) đã xoá. */
export function isConversationAvailable(conv: Conversation): boolean {
  return !conv.candidateDeletedAt && !conv.employerDeletedAt;
}
```

`isConversationAvailable` không cần tham số `area`/`currentUserId` như `isConversationUnread` — vì availability là thuộc tính của **cả hội thoại** (đã bị 1 trong 2 phía xoá thì khoá gửi tin cho tất cả), không lệch theo người xem.

## 3. `stores/messaging-store.ts`

1. **`deleteConversation(area, conversationId): Promise<{ hardDeleted: boolean }>`** (action mới) — gọi `DELETE /conversations/:id`, sau đó xoá `conversationId` khỏi mảng `conversations` trong state (giống cách `appendMessage` re-order mảng, dùng `filter`), và nếu `activeConversationId === conversationId` thì `setActiveConversationId(null)` (tránh khung chat bên phải trỏ vào hội thoại vừa biến mất khỏi danh sách của chính mình).
2. **`markConversationUnavailable(conversationId, deletedByArea)`** (action mới, gọi từ socket handler ở mục 4) — cập nhật đúng field tương ứng trong `conversations` state:
   ```ts
   markConversationUnavailable: (conversationId, deletedByArea) => {
     set((state) => ({
       conversations: state.conversations.map((c) =>
         c.id !== conversationId ? c : {
           ...c,
           ...(deletedByArea === "candidate"
             ? { candidateDeletedAt: new Date().toISOString() }
             : { employerDeletedAt: new Date().toISOString() }),
         },
       ),
     }));
   },
   ```
   `deletedByArea` ở đây luôn là **phía đối diện với `area` hiện tại của store instance** (event `conversation:unavailable` chỉ được đẩy tới người *không* xoá — xem mục 4), nên tại call site chỉ cần truyền cố định giá trị đối nghịch với `area`, không cần server gửi kèm field này trong payload socket.

## 4. `hooks/useSocket.ts`

Thêm listener trong `useSocketConnection`, ngay cạnh `socket.on("new_message", ...)` (dòng 60-62 hiện tại) — **cùng pattern gọi thẳng action của `messaging-store`**, không qua `SocketHandlers` (đúng lý do `new_message` cũng làm vậy: đây là cập nhật dữ liệu domain của `messaging-store`, khác `onNotification`/`onMessageNotification` là hook UI-level của từng component gọi `useSocketConnection`):

```ts
const markConversationUnavailable = useMessagingStore((s) => s.markConversationUnavailable);
// ...
socket.on("conversation:unavailable", (event: ConversationUnavailableEvent) => {
  const otherArea = area === "candidate" ? "employer" : "candidate";
  markConversationUnavailable(event.conversationId, otherArea);
});
```

**Lỗi gửi tin bị chặn** — thêm listener cho event `error` đã tồn tại ở backend từ trước (`socket.emit("error", ...)`, `infrastructure/socket/index.ts:72`) nhưng **chưa từng được lắng nghe ở frontend** (kiểm tra: không có `socket.on("error", ...)` nào trong `useSocket.ts` hiện tại — lỗi trước đây rơi vào khoảng không, không tới được UI). Thêm:

```ts
socket.on("error", (payload: { message: string; code?: string }) => {
  if (payload.code === "CONVERSATION_UNAVAILABLE") {
    // Trường hợp hiếm: socket "conversation:unavailable" bị lỡ (mất kết nối đúng lúc)
    // nhưng người dùng vẫn cố gửi — REST/socket handler chặn lại, đồng bộ lại state
    // tại đây thay vì chỉ hiện lỗi tức thời rồi mất.
    const otherArea = area === "candidate" ? "employer" : "candidate";
    // conversationId không có trong payload lỗi hiện tại của backend — xem mục "Việc cần làm ở backend" bên dưới.
  }
});
```

**Khoảng hở cần chốt trước khi code:** payload lỗi từ backend (`{ message, code }`, xem PLAN backend mục 2.7) **không có `conversationId`** — nhưng `sendMessage()` trong cùng hook (dòng 106-110) biết chính xác `conversationId` vừa emit `send_message`. Xử lý: giữ lại `conversationId` đang gửi trong một `ref` (`lastSentConversationIdRef`) ngay trong `sendMessage()`, dùng ref đó khi xử lý `socket.on("error", ...)` thay vì đợi backend đổi payload — không cần sửa gì thêm ở backend plan.

## 5. `ChatLayout.tsx`

### 5.1 Badge + nút xoá trên từng dòng hội thoại (sidebar)

Trong khối render mỗi `conv` (danh sách `visibleConversations.map(...)`, hiện đang render tên/latestMessage/link ngoài) — thêm:

- Nếu `isConversationDeletable(conv)`: hiện badge nhỏ (icon + text, ví dụ `archive` icon + "Tin đã đóng") cạnh `conv.jobPost.title`.
- Nút xoá (icon `trash-2`, chỉ hiện khi hover hoặc luôn hiện nhỏ ở góc — chi tiết UI chốt lúc code) — chỉ **render** khi `isConversationDeletable(conv)` (không phải chỉ disable, vì phần lớn hội thoại — tin còn `PUBLISHED` — không bao giờ xoá được, ẩn hẳn đỡ rối UI).
- Bấm nút xoá → dialog xác nhận (tái dùng component confirm dialog sẵn có trong `components/ui/` nếu có, không tạo mới nếu đã tồn tại — kiểm tra lúc code) với nội dung khác nhau tuỳ có phải lần xoá cuối cùng hay không **— nhưng frontend không biết trước** ai đã xoá phía kia chưa (`hardDeleted` chỉ biết được sau khi gọi API). Nội dung confirm dùng chung 1 câu trung tính: *"Xoá hội thoại này? Nếu phía còn lại cũng đã xoá, toàn bộ tin nhắn sẽ bị xoá vĩnh viễn."*
- Xác nhận → `await deleteConversation(area, conv.id)` → toast/thông báo ngắn tuỳ `hardDeleted` (`true`: "Đã xoá vĩnh viễn"; `false`: "Đã xoá khỏi danh sách của bạn").

### 5.2 Khoá khung chat khi hội thoại đang mở không còn khả dụng

Thêm biến dẫn xuất cạnh `activeConversation`/`currentMessages` (dòng ~83-84 hiện tại):

```ts
const isActiveConversationAvailable = activeConversation ? isConversationAvailable(activeConversation) : true;
```

- **Vùng input** (khối `<form onSubmit={handleSend}>`, dòng ~239 hiện tại): khi `!isActiveConversationAvailable`, hiện banner thay cho ô nhập (tái dùng đúng vị trí/style banner `isDisconnected` đã có, đổi nội dung):
  > "Cuộc hội thoại không còn khả dụng để nhắn tin. Bạn chỉ có thể xem lại lịch sử."
  Ẩn hẳn `<input>`/nút Gửi trong trường hợp này (không chỉ disable) — tránh nhầm với trạng thái mất kết nối mạng (`isDisconnected`, vẫn giữ nguyên UI cũ, 2 trạng thái không loại trừ nhau nhưng banner "không khả dụng" ưu tiên hiện trước vì đây là trạng thái vĩnh viễn cho hội thoại đó, không tự hồi phục như mất mạng).
- `handleSend()` — thêm guard đầu hàm: `if (!isActiveConversationAvailable) return;` (phòng hờ, dù UI đã ẩn input).

### 5.3 Không đổi

- Effect fetch lịch sử (`hasFetchedMessages`) và effect `markAsRead` (bổ sung fix bug gần nhất) — giữ nguyên, không liên quan tới soft-delete.
- Tab "Tất cả"/"Chưa đọc" — không thêm tab riêng cho "đã khoá"/"đủ điều kiện xoá", chỉ đánh dấu bằng badge inline.

## 6. `packages/shared-types` (đồng bộ theo backend plan mục 2.8)

Không lặp lại chi tiết — chỉ lưu ý phía frontend: sau khi thêm `Conversation.candidateDeletedAt`/`employerDeletedAt` và `ConversationJobPostInfo.status`, TypeScript sẽ tự báo lỗi ở mọi nơi đang destructure `Conversation`/`ConversationJobPostInfo` mà quên field mới nếu có object literal thủ công (kiểm tra bằng `tsc --noEmit` sau khi đổi type, trước khi chạm UI).

## 7. Phạm vi KHÔNG làm trong bổ sung này

- Không thêm trang/tab riêng liệt kê "hội thoại đã bị khoá" — chỉ đánh dấu inline trong danh sách hiện có.
- Không thêm animation/toast phức tạp cho sự kiện `conversation:unavailable` — chỉ cần khoá UI đúng lúc, chi tiết hiệu ứng để lúc code.
- Không đổi `NotificationBell.tsx`/dòng ghim "N tin nhắn mới" — sự kiện `conversation:unavailable` không tính vào unread-summary.

## 8. Cách test thủ công (2 trình duyệt/2 tab ẩn danh, 1 candidate + 1 employer)

1. Employer đóng tin (`/employer/job-posts` → đóng tin) → cả 2 tab reload trang `/messages` tương ứng → xác nhận badge "Tin đã đóng" hiện ở đúng hội thoại đó, không hiện ở hội thoại khác (tin còn `PUBLISHED`).
2. Candidate mở đúng hội thoại đó, để nguyên trên màn hình. Employer bấm nút xoá → xác nhận → candidate (không reload trang) thấy ngay banner khoá xuất hiện, ô nhập biến mất — không cần thao tác gì thêm.
3. Candidate thử gõ URL gọi thẳng API gửi tin (hoặc DevTools gọi `socket.emit("send_message", ...)` thủ công) sau khi đã bị khoá ở bước 2 → xác nhận tin không xuất hiện, không có lỗi runtime nào vỡ UI.
4. Candidate bấm xoá (lần xoá thứ 2) → xác nhận hội thoại biến mất khỏi danh sách candidate; kiểm tra DB (hoặc gọi lại API bằng token cũ) xác nhận hội thoại đã bị xoá cứng.

## Phần ghi chú của chủ dự án

*(để trống)*
