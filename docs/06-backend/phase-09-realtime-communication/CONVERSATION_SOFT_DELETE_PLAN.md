# Phase 9 (Backend) — Bổ sung: Soft-delete hội thoại theo trạng thái JobPost

Xem implementation nền tảng (chat, Socket.IO gateway) ở `IMPLEMENTATION.md`, và bổ sung notification realtime (`notification:new`, `notification:new_message`, `RealtimeNotifier`) ở `PLAN.md` cùng thư mục — không lặp lại ở đây. Tài liệu này là **kế hoạch, chưa triển khai**, chốt cùng chủ dự án ngày 2026-09-17. Quyết định kiến trúc tóm tắt ở `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-11.

> **Trạng thái: ĐÃ TRIỂN KHAI (2026-09-17).** Migration `20260917000000_add_conversation_soft_delete`. Lệch so với kế hoạch bên dưới:
>
> - Transaction nằm trong repository: 1 method `softDeleteConversationSide(conversationId, role, date)` trả `{ hardDeleted }` (thay cho cặp `deleteConversationSide`/`hardDeleteConversation` nhận `tx`) — service không phải đụng tới `prisma`.
> - Guard ở `saveMessage()` chặn khi **bất kỳ** cờ xoá nào có giá trị (không chỉ cờ phía kia) — phía đã xoá cũng không được gửi tiếp.
> - Payload `error` của socket có thêm `conversationId` (mục 2.7) — frontend không cần `lastSentConversationIdRef`.
> - Thêm type `DeleteConversationResponse` vào shared-types.

## 1. Bối cảnh & yêu cầu nghiệp vụ

Chủ dự án yêu cầu (chốt 2026-09-17):

1. Hội thoại thuộc `JobPost` đã **đóng** (`CLOSED`), **hết hạn** (`EXPIRED`), hoặc **bị gỡ** (`TAKEN_DOWN`) mới được phép xoá — cả candidate lẫn employer đều thấy dấu hiệu để biết mình có thể xoá.
2. Xoá là **xoá mềm riêng từng phía** (đã chốt ở phần trao đổi trước, xem lý do an toàn dữ liệu + chi phí code chuyển đổi trong lịch sử hội thoại lên kế hoạch — không lặp lại ở đây).
3. Khi **một phía** xoá: phía đó không còn thấy hội thoại trong danh sách của mình. Phía **còn lại** (chưa xoá) vẫn thấy hội thoại nhưng bị khoá — không gửi được tin nhắn mới, chỉ xem lại lịch sử. Nếu phía đó **đang mở đúng hội thoại này** hoặc đang gõ tin, phải được báo ngay (không chờ tới lần load trang sau).
4. Khi **cả 2 phía** đều đã xoá: hội thoại (và toàn bộ tin nhắn) bị xoá thật khỏi DB.

## 2. Quyết định kỹ thuật

### 2.1 Schema (`schema.prisma`)

```prisma
model Conversation {
  id                  String    @id @default(cuid())
  jobPostId           String
  jobPost             JobPost   @relation(fields: [jobPostId], references: [id])
  candidateId         String
  candidate           Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  employerId          String
  employer            Employer  @relation(fields: [employerId], references: [id], onDelete: Cascade)
  candidateLastReadAt DateTime?
  employerLastReadAt  DateTime?
  candidateDeletedAt  DateTime?   // MỚI — soft-delete riêng phía candidate
  employerDeletedAt   DateTime?   // MỚI — soft-delete riêng phía employer
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  messages Message[]

  @@unique([candidateId, employerId, jobPostId])
  @@map("conversations")
}
```

Không đổi `Message`/`JobPostStatus` — điều kiện xoá đọc trực tiếp `JobPost.status` đã có, không thêm cột đánh dấu nào ở `JobPost`. Cần 1 migration mới (`npm run db:migrate -w server`), không cần backfill (cột mới đều `NULL` cho dữ liệu cũ, đúng ý nghĩa "chưa ai xoá").

### 2.2 `AppError` — thêm field `code` tuỳ chọn

```ts
export class AppError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = "AppError";
  }
}
```

Lý do: lỗi "hội thoại không còn khả dụng để nhắn" phát sinh từ handler socket `send_message` (không phải REST thường), đi qua `socket.emit("error", { message })` hiện có (`infrastructure/socket/index.ts:70-73`) — frontend cần một cách nhận diện chắc chắn hơn so khớp chuỗi tiếng Việt để tự động khoá UI. `code` optional nên mọi `throw new AppError(...)` hiện có ở các module khác không cần sửa.

### 2.3 `messaging.repository.ts`

| Thay đổi | Lý do |
|---|---|
| `conversationInclude.jobPost.select` thêm `status: true` | Dùng cho eligibility check (2.4) và hiện badge ở FE |
| `findConversationsByCandidateId(candidateId)` → thêm `where: { candidateId, candidateDeletedAt: null }` | Ẩn hội thoại **chính candidate đó** đã xoá khỏi danh sách của họ |
| `findConversationsByEmployerId(employerId)` → thêm `employerDeletedAt: null` | Tương tự, phía employer |
| `countUnreadConversations()` — cả 2 nhánh raw SQL | Thêm `AND c."candidateDeletedAt" IS NULL` / `AND c."employerDeletedAt" IS NULL` tương ứng — hội thoại đã tự xoá không được tính vào badge chưa đọc của chính mình |
| `findConversationById(id)` | **Không đổi** — vẫn phải trả về kể cả khi 1 phía đã xoá, vì `getMessages`/`markAsRead`/`saveMessage`/chính `deleteConversation` đều cần đọc được 2 cờ `*DeletedAt` để quyết định hành vi |
| Method mới `deleteConversationSide(tx, conversationId, role, date)` | `tx.conversation.update({ where: { id }, data: role === "CANDIDATE" ? { candidateDeletedAt: date } : { employerDeletedAt: date } })` — nhận `tx` (Prisma transaction client) để gọi trong cùng transaction với bước kiểm tra mutual-delete |
| Method mới `hardDeleteConversation(tx, conversationId)` | `tx.conversation.delete({ where: { id } })` |

### 2.4 `messaging.service.ts`

```ts
const DELETABLE_JOB_POST_STATUSES = ["CLOSED", "EXPIRED", "TAKEN_DOWN"] as const;
```

**`deleteConversation(userId, role, conversationId)`** (method mới):

1. `const conv = await this.requireConversationAccess(userId, role, conversationId);` (tái dùng nguyên vẹn — vẫn đúng vai trò kiểm tra "user này có thuộc hội thoại không", không quan tâm cờ xoá).
2. Nếu `!DELETABLE_JOB_POST_STATUSES.includes(conv.jobPost.status)` → `AppError(400, "Chỉ có thể xoá hội thoại khi tin tuyển dụng đã đóng, hết hạn hoặc bị gỡ")`.
3. Idempotent theo phía gọi: nếu cờ của chính role đó **đã có giá trị** → coi như thành công, không làm gì thêm (tránh lỗi khi bấm xoá 2 lần liên tiếp do double-click/race UI).
4. Chạy trong `prisma.$transaction(async (tx) => { ... })`:
   - Gọi `messagingRepository.deleteConversationSide(tx, conversationId, role, new Date())`.
   - Đọc lại bản ghi trong `tx` để lấy cả 2 cờ hiện tại (bản vừa update + cờ phía kia không đổi).
   - Nếu **cả 2** đã có giá trị → gọi `messagingRepository.hardDeleteConversation(tx, conversationId)`, trả về `{ hardDeleted: true }`.
   - Ngược lại trả về `{ hardDeleted: false }`.
5. Nếu `hardDeleted === false` (chỉ 1 phía vừa xoá): xác định `otherUserId` (giống cách `notifyRecipient()` đang làm — `conversation.candidate.userId`/`conversation.employer.userId`), gọi `this.realtimeNotifier.notifyConversationUnavailable(otherUserId, { conversationId })` (best-effort, lỗi chỉ log — cùng pattern `notifyRecipient()`).
6. Trả `{ hardDeleted }` cho controller.

**Guard trong `saveMessage()`** (sửa method có sẵn) — thêm ngay sau `requireConversationAccess`, trước khi ghi `Message`:

```ts
const otherSideDeleted = role === "CANDIDATE" ? conv.employerDeletedAt : conv.candidateDeletedAt;
if (otherSideDeleted) {
  throw new AppError(409, "Cuộc hội thoại không còn khả dụng để nhắn tin", "CONVERSATION_UNAVAILABLE");
}
```

Không chặn ở `getMessages()`/`markAsRead()` — xem lịch sử và cập nhật mốc đọc vẫn được phép dù hội thoại đã bị phía kia xoá (đúng yêu cầu "chỉ coi lịch sử trò chuyện").

### 2.5 `RealtimeNotifier` (port + 2 impl)

`shared/ports/RealtimeNotifier.ts` — thêm type + method:

```ts
export interface ConversationUnavailablePayload {
  conversationId: string;
}

export interface RealtimeNotifier {
  pushToUser(userId: string, payload: RealtimeNotificationPayload): Promise<void> | void;
  pushMessageToUser(userId: string, payload: RealtimeMessagePayload): Promise<void> | void;
  /** Event `conversation:unavailable` — phía kia vừa xoá hội thoại (chưa xoá cứng). */
  notifyConversationUnavailable(userId: string, payload: ConversationUnavailablePayload): Promise<void> | void;
}
```

- `SocketIoRealtimeNotifier`: emit `conversation:unavailable` tới room `user:${userId}` — cùng khuôn mẫu `pushMessageToUser`.
- `NoopRealtimeNotifier`: cài đặt no-op + `logger.info`, giống 2 method hiện có.

### 2.6 Controller + Route

`messaging.controller.ts` — thêm:

```ts
deleteConversation = async (req: Request, res: Response) => {
  const { id: userId, role } = req.user!;
  const id = req.params.id as string;
  const result = await this.messagingService.deleteConversation(userId, role, id);
  res.json({ success: true, data: result });
};
```

`messaging.routes.ts` — thêm `router.delete("/:id", (req, res, next) => resolveController().deleteConversation(req, res).catch(next));` (đặt sau `PUT /:id/read`, cùng nhóm route theo `:id`).

### 2.7 Socket gateway — không đổi cấu trúc, chỉ đổi nội dung lỗi emit

`infrastructure/socket/index.ts`, handler `send_message` (dòng 60-74 hiện tại) — khối `catch` đổi từ:

```ts
socket.emit("error", { message: error.message });
```

thành:

```ts
socket.emit("error", { message: error.message, code: error.code });
```

(`error.code` là `undefined` cho mọi lỗi khác không set `code` — không phá hành vi hiện tại của các lỗi khác, ví dụ lỗi content rỗng vẫn emit như cũ chỉ thiếu field `code`).

### 2.8 `packages/shared-types`

- `ConversationJobPostInfo` — thêm `status: JobPostStatus`.
- `Conversation` — thêm `candidateDeletedAt: string | null`, `employerDeletedAt: string | null`.
- Type mới `ConversationUnavailableEvent { conversationId: string }` (payload socket, cạnh `MessageNotificationEvent`/`NotificationEvent` đã có).

### 2.9 `messaging.mapper.ts`

`toConversationDto()` — thêm vào object trả về:

```ts
candidateDeletedAt: entity.candidateDeletedAt?.toISOString() || null,
employerDeletedAt: entity.employerDeletedAt?.toISOString() || null,
jobPost: {
  id: entity.jobPost.id,
  title: entity.jobPost.title,
  companyName: entity.jobPost.company.name,
  status: entity.jobPost.status, // MỚI
},
```

## 3. Race condition — cả 2 xoá gần như đồng thời

Bước 2.4.4 chạy trong `prisma.$transaction`, nhưng Postgres READ COMMITTED (mặc định) không tự khoá row giữa read và write của 2 transaction song song trên 2 request khác nhau — về lý thuyết 2 request `deleteConversation` gọi gần như cùng lúc từ 2 phía có thể cùng đọc "phía kia chưa xoá" trước khi cả hai commit, dẫn tới cả hai return `hardDeleted: false` dù đáng lẽ phải hard-delete. Chấp nhận rủi ro này ở quy mô đồ án (xác suất cực thấp — người dùng phải bấm nút xoá của 2 tài khoản khác nhau trong cùng mili-giây); nếu cần chặt hơn, đổi `tx.conversation.update()` thành có `SELECT ... FOR UPDATE` tường minh qua `$queryRaw` trước khi update — **để dành sau nếu cần**, không làm ở lần này (đúng tinh thần "chấp nhận có chủ đích" đã dùng ở AD-8 outbox).

## 4. Phạm vi KHÔNG làm trong bổ sung này

- Không cho "hoàn tác" (undo) sau khi xoá — đã chốt xoá cứng thật khi cả 2 bên xoá, không có thùng rác/khôi phục.
- Không cron sweep tự động xoá hội thoại cũ — chỉ xoá thủ công qua nút bấm.
- Không đổi hành vi `getMessages()`/`markAsRead()` — vẫn hoạt động bình thường bất kể cờ xoá.
- Không thêm `SELECT ... FOR UPDATE` cho race condition ở mục 3 — chấp nhận rủi ro thấp, để dành sau nếu phát sinh vấn đề thật.

## 5. Cách test (Postman/curl + 2 tài khoản)

1. Tạo hội thoại giữa 1 candidate + 1 employer trên 1 `JobPost` đang `PUBLISHED` → gọi `DELETE /conversations/:id` → kỳ vọng `400`.
2. Employer tự đóng tin (`POST /employer/job-posts/:id/close` hoặc endpoint tương đương đã có ở Phase 6) → `JobPost.status = CLOSED` → gọi lại `DELETE /conversations/:id` từ phía candidate → `200`, `hardDeleted: false`; `GET /conversations` phía candidate không còn thấy hội thoại này; phía employer vẫn thấy, `candidateDeletedAt` khác `null`.
3. Employer thử gửi tin vào hội thoại đó (`send_message` qua socket) → nhận `error` event với `code: "CONVERSATION_UNAVAILABLE"`, tin không được lưu.
4. Employer vẫn gọi được `GET /conversations/:id/messages` bình thường (xem lịch sử) và `PUT /conversations/:id/read`.
5. Employer gọi `DELETE /conversations/:id` (xoá phía mình) → `200`, `hardDeleted: true` → xác nhận row `Conversation` và toàn bộ `Message` liên quan đã biến mất khỏi DB (cascade).
6. Mở 2 tab trình duyệt (candidate đã xoá ở bước 2, employer đang mở đúng hội thoại) — xác nhận employer nhận được realtime lock ngay khi candidate bấm xoá ở bước 2, không cần tải lại trang (chi tiết UI ở PLAN frontend cùng bổ sung).

## Phần ghi chú của chủ dự án

*(để trống)*
