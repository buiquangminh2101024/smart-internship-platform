# Phase 10 (Backend) — Bổ sung: Thông báo cho Admin khi có việc cần duyệt

Xem hạ tầng notification nền tảng (`NotificationsService.notify/notifyMany`, Transactional Outbox, `RealtimeNotifier`) ở `PLAN.md`/`IMPLEMENTATION.md` cùng thư mục — không lặp lại ở đây. Tài liệu này là **kế hoạch, chưa triển khai**. Quyết định kiến trúc tóm tắt ở `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-12.

> **Trạng thái: ĐÃ TRIỂN KHAI (2026-09-17).** Migration `20260917120000_add_admin_moderation_notification_types`. Bám sát kế hoạch, không có sai khác.

## 1. Bối cảnh & yêu cầu nghiệp vụ

Chủ dự án yêu cầu: khi Employer (1) nộp hồ sơ công ty cần Admin xác minh thủ công ("liên kết công ty"), hoặc (2) gửi tin tuyển dụng chờ duyệt, Admin phải nhận được thông báo — giống cơ chế `notification:new` đang có cho candidate/employer, **không gộp** theo kiểu hội thoại tin nhắn (mỗi sự kiện = 1 dòng riêng trong bell, xem lý do đã trao đổi: đây là hàng đợi việc cần xử lý từng cái, không phải luồng hội thoại). Không gửi email cho 2 loại này — Admin làm việc trực tiếp trên dashboard, gửi email mỗi lần sẽ gây spam mà không thêm giá trị.

## 2. Quyết định kỹ thuật

### 2.1 Điểm mấu chốt: hạ tầng generic đã đủ dùng, không cần sửa tầng socket/RealtimeNotifier

`NotificationsService.notify()`/`notifyMany()` (`notifications.service.ts`) đã tổng quát theo `userId`, không phân biệt role — gọi `realtimeNotifier.pushToUser(recipientUserId, ...)` vốn emit `notification:new` tới room `user:${userId}` bất kể đó là candidate/employer/admin. Vậy phần "bắn việc mới cho Admin" chỉ cần **gọi đúng service này với `userId` của các tài khoản `role=ADMIN`** — không cần thêm event socket mới, không sửa `RealtimeNotifier`.

### 2.2 Schema (`schema.prisma`) — thêm 2 giá trị `NotificationType`

```prisma
enum NotificationType {
  APPLICATION_STATUS_CHANGED
  JOB_POST_APPROVED
  JOB_POST_REJECTED
  JOB_POST_TAKEN_DOWN
  COMPANY_VERIFIED
  COMPANY_REJECTED
  COMPANY_LINK_REQUESTED   // MỚI — employer nộp/nộp lại hồ sơ công ty cần Admin xác minh thủ công
  JOB_POST_SUBMITTED       // MỚI — employer gửi tin tuyển dụng chờ duyệt (company.requiresApproval = true)
}
```

Cần 1 migration mới (`npm run db:migrate -w server`), không backfill (2 giá trị enum mới không ảnh hưởng dữ liệu cũ).

### 2.3 `notification.types.ts` — thêm payload map

```ts
COMPANY_LINK_REQUESTED: { companyId: string; companyName: string; employerEmail: string };
JOB_POST_SUBMITTED: { jobPostId: string; jobPostTitle: string; companyName: string };
```

`AssertSameKeys` đã có sẵn sẽ tự báo lỗi biên dịch nếu quên khai báo payload khớp enum — không cần sửa gì thêm ở đó.

### 2.4 `notification-templates.ts` — thêm 2 renderer, `email: null`

```ts
COMPANY_LINK_REQUESTED: (data, ctx) => {
  const title = "Yêu cầu liên kết công ty mới";
  const body = `Công ty "${data.companyName}" (${data.employerEmail}) vừa gửi hồ sơ liên kết, cần xác minh thủ công.`;
  return { title, body, link: `/admin/companies/${data.companyId}`, email: null };
},
JOB_POST_SUBMITTED: (data, ctx) => {
  const title = "Tin tuyển dụng chờ duyệt";
  const body = `${data.companyName} vừa gửi tin "${data.jobPostTitle}" chờ duyệt.`;
  return { title, body, link: `/admin/jobs/${data.jobPostId}`, email: null };
},
```

`link` trỏ đúng route console admin hiện có (`/admin/companies/[id]`, `/admin/jobs/[id]`) — không cần trang mới.

### 2.5 `UserRepository` — thêm method lấy danh sách Admin

```ts
findAdminIds(tx?: Prisma.TransactionClient): Promise<string[]> {
  const db = tx ?? this.prisma;
  return db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }).then((rows) => rows.map((r) => r.id));
}
```

Nhận `tx` tuỳ chọn để đọc được trong cùng transaction nghiệp vụ (giống pattern `notify()`). Không giới hạn số lượng — hệ thống có bao nhiêu tài khoản `role=ADMIN` thì `notifyMany` gửi tới hết.

### 2.6 `employers.service.ts` — trigger tại `createOrResubmitCompany`

Vị trí: nhánh hiện có ở cuối transaction (dòng ~250-260) đang chỉ xử lý `if (autoVerified)`. Đổi thành `if/else` đầy đủ:

```ts
if (autoVerified) {
  await this.notificationsService.notify("COMPANY_VERIFIED", userId, { companyId, companyName: dto.name }, tx);
} else {
  // MỚI — company vào MANUAL_REVIEW (create lẫn resubmit), Admin cần biết để xử lý.
  const adminIds = await this.userRepository.findAdminIds(tx);
  await this.notificationsService.notifyMany(
    "COMPANY_LINK_REQUESTED",
    adminIds,
    { companyId, companyName: dto.name, employerEmail: user.email },
    tx,
  );
}
```

`userRepository` đã có sẵn trong constructor (dùng cho `requireUser`), `user.email` đã có từ `requireUser(userId)` ở đầu hàm — không cần query thêm. Áp dụng cho cả `mode: "create"` lẫn `"resubmit"` vì cả hai đều có thể rơi vào `MANUAL_REVIEW`.

### 2.7 `job-posts.service.ts` — trigger tại `submitForApproval`

Vị trí: nhánh `!autoPublished` (dòng ~173-175, JobPost chuyển `PENDING`):

```ts
if (!autoPublished) {
  const updated = await this.jobPostRepository.update(id, { status: "PENDING" }, tx);
  // MỚI — Admin cần biết có tin chờ duyệt.
  const adminIds = await this.userRepository.findAdminIds(tx);
  await this.notificationsService.notifyMany(
    "JOB_POST_SUBMITTED",
    adminIds,
    { jobPostId: id, jobPostTitle: jobPost.title, companyName: company.name },
    tx,
  );
  return updated;
}
```

`company` đã có sẵn từ `const { company } = await this.requireVerifiedCompany(userId);` ở đầu hàm — không cần JOIN thêm. Cần thêm `userRepository: UserRepository` vào constructor + field của `JobPostsService` (tương tự cách `notificationsService` đã được inject) — `userRepository` đã đăng ký singleton toàn cục trong `container.ts` nên awilix tự resolve theo tên tham số, **không cần sửa `container.ts`**.

### 2.8 Không đổi

- `RealtimeNotifier` (port + 2 impl): không thêm method, không đổi event socket.
- `messaging.*`, `infrastructure/socket/index.ts`: không liên quan tới notification nghiệp vụ này (đó là kênh `send_message`/`new_message` riêng cho chat).
- `notifications.service.ts`, `.controller.ts`, `.routes.ts`, `.repository.ts`: đã tổng quát theo `userId`, dùng nguyên trạng cho Admin.
- `packages/shared-types`: không cần type mới — `NotificationEvent`/`Notification` đã tổng quát, không phân biệt role.

## 3. Phạm vi KHÔNG làm

- Không gửi email cho `COMPANY_LINK_REQUESTED`/`JOB_POST_SUBMITTED` (đã chốt: `email: null`).
- Không thêm trang "hàng đợi duyệt" mới — `link` trỏ thẳng tới `/admin/companies/:id`, `/admin/jobs/:id` hiện có.
- Không gộp nhiều sự kiện cùng loại thành 1 dòng (vd. 3 công ty cùng chờ duyệt vẫn là 3 dòng riêng) — mỗi dòng là 1 action item độc lập cần Admin xử lý riêng.
- Không xử lý "digest" hay "chống spam" khi nhiều Admin/nhiều request dồn dập — để dành sau nếu phát sinh vấn đề thật.

## 4. Cách test (Postman/curl + tài khoản Admin)

1. Tạo tài khoản Employer mới, nộp hồ sơ công ty với mã số thuế **không** khớp auto-verify (rơi vào `MANUAL_REVIEW`) → gọi `GET /notifications` bằng tài khoản Admin → thấy 1 notification mới `COMPANY_LINK_REQUESTED`, `link` trỏ đúng `/admin/companies/:id`; `GET /notifications/unread-count` tăng lên.
2. Với company đã `requiresApproval=true` (mặc định) và đã `VERIFIED`, Employer tạo job post rồi gọi `submitForApproval` → JobPost chuyển `PENDING` → Admin nhận `JOB_POST_SUBMITTED`.
3. Với company `requiresApproval=false`, `submitForApproval` publish thẳng (`autoPublished=true`) → xác nhận **không** có notification `JOB_POST_SUBMITTED` nào được tạo (đúng nhánh `if/else`).
4. Tạo thêm 1 tài khoản Admin thứ 2 → lặp lại bước 1 → xác nhận **cả 2** Admin đều nhận được notification (kiểm tra `findAdminIds` không giới hạn 1 bản ghi).
5. Kiểm tra bảng `outbox_events` sau bước 1/2 — không có dòng nào ứng với 2 notification này (xác nhận `email: null` không tạo outbox email).

## Phần ghi chú của chủ dự án

*(để trống)*
