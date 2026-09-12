# Phase 6 (Backend) — Job Recruitment Module

Xem tổng quan roadmap ở `docs/01-project/PROJECT_PHASES.md` §Phase 6, cơ chế duyệt/thu hồi ở `docs/02-architecture/INITIAL_ARCHITECTURE_PLAN.md` §12, tích hợp subscription ở `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-6. Không chép lại nội dung các file đó — chỉ ghi phần đặc thù/bổ sung của phase này.

## Quyết định mới chốt khi lên kế hoạch phase này

1. **`expiresAt`**: Employer tự chọn ngày hết hạn (không được quá 90 ngày kể từ ngày đặt). Có thể để trống lúc `DRAFT`, bắt buộc trước khi `submitForApproval()`/`publish()`.
2. **`JobPost.viewCount`** (field mới): tăng 1 mỗi lần Guest gọi API xem chi tiết tin `PUBLISHED`.
3. **Banner duyệt/từ chối/thu hồi phía Employer** đọc trực tiếp `JobPostModerationAction` mới nhất — không ghi vào bảng `notifications` (bảng đó để nguyên cho Phase 10).

## Ảnh tham khảo (bố cục UI liên quan tới field/response cần trả)

`C:\Users\QUANG MINH\Pictures\Screenshots\` — `Screenshot 2026-09-12 134041.png` (dashboard + form tạo tin + kết quả gửi duyệt), `134155.png` (xem trước), `134326.png` (admin dashboard + review + duyệt thành công), `134745.png` (modal từ chối + kết quả), `135023.png` (danh sách quản lý tin), `135146.png` (chi tiết quản lý 1 tin — 4 `StatCard` lượt xem/ứng viên/hạn/trạng thái), `135406.png` (banner từ chối). Các field `viewCount`, `latestModerationAction`, thống kê trong response tồn tại để phục vụ đúng các màn hình này.

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency mới — tái dùng `node-cron` đã có từ Phase 5.
- Module `job-posts` theo convention chặt của `companies`/`subscriptions` (không theo style lỏng của `candidates`): `job-post.repository.ts`, `job-post.mapper.ts`, `job-posts.service.ts`, `job-posts.controller.ts`, `job-posts.dto.ts` (zod), `job-posts.routes.ts`.
- Không tạo module `admin` riêng — hành động approve/reject/retract nằm trong routes của `job-posts`, gate bằng `authorize("ADMIN")` (giống `companies.routes.ts`).
- Migration Prisma: thêm `JobPost.viewCount Int @default(0)` — không có delta schema nào khác.

## Phần 2 — Liên kết giữa các phần

- `job-posts` inject `subscriptionsService` (đã có sẵn trong Cradle) → gọi `getCompanySubscriptionAccess({id, verifiedAt})` khi tạo `DRAFT` mới và khi `submitForApproval()`/`publish()`; chặn nếu `mode==="BLOCKED"` hoặc hết `draftRemaining`/`publishRemaining`.
- `job-posts` inject `companyRepository` (đã dùng chéo `employers`/`companies`) để đọc `requiresApproval`/`isVerified` quyết định nhánh `PENDING` hay `PUBLISHED` thẳng.
- `CompanyRepository.countRetractions()` (đã có từ Phase 4, query `job_post_moderation_actions` where `action=RETRACTED`) tự động ra số liệu thật ngay khi `retract()` của module này bắt đầu ghi log — **không sửa module `companies`**.
- Cron `job-post-expiry.job.ts` (node-cron `"0 * * * *"`, khởi động trong `main.ts` cạnh `subscription-expiry.job.ts`) quét mỗi giờ:
  (a) `PUBLISHED` & `expiresAt<=now()` → `EXPIRED`;
  (b) với mỗi company đang có tin `PUBLISHED`, gọi `getCompanySubscriptionAccess()` — nếu `BLOCKED` (hết gói và hết trial) → đóng toàn bộ tin `PUBLISHED` của company đó sang `EXPIRED`.
- Thêm vào `packages/shared-types/src/index.ts` cạnh enum đã có (`JobPostType`/`JobPostStatus`/`ModerationActionType`): `JobPostDto`, `CreateJobPostRequest`, `UpdateJobPostRequest`, `JobPostSearchQuery`, `RejectJobPostRequest`, `RetractJobPostRequest`, `JobPostModerationActionDto`.

## Phần 3 — Các bước thực hiện

1. Prisma: thêm `viewCount`, chạy migration (`npm run db:migrate --workspace=apps/server`).
2. `packages/shared-types`: thêm các DTO interface ở Phần 2.
3. `job-post.repository.ts`: `findOwnedByCompany`, `findPendingQueue`, `findPublishedForSearch` (filter salary/industry/city/jobType), `findLatestModerationAction`, `createModerationAction`, `incrementViewCount`, `findPublishedByCompany` (cho sweep).
4. `job-posts.service.ts` — state machine đầy đủ:
   - `createDraft` / `updateDraft` (chỉ khi `DRAFT`, kiểm tra `draftRemaining` qua subscriptions).
   - `submitForApproval` — nội bộ rẽ nhánh: nếu `company.requiresApproval=false` → publish thẳng (`DRAFT→PUBLISHED`, log `APPROVED` với `actor=null`); nếu `true` → `DRAFT→PENDING`. Validate `expiresAt` đã có và ≤ 90 ngày trước khi cho submit.
   - `approve(actor)` — `PENDING→PUBLISHED`, log `APPROVED`.
   - `reject(actor, reason)` — `PENDING→DRAFT`, `reason` bắt buộc, log `REJECTED`.
   - `retract(actor, reason)` — `PUBLISHED→TAKEN_DOWN`, `reason` bắt buộc, log `RETRACTED`.
   - `close()` — `PUBLISHED→CLOSED`, set `closedAt`, **không** ghi moderation log.
   - Mọi hàm ghi/đổi trạng thái validate quyền sở hữu: employer gọi phải cùng `companyId` với `JobPost`.
5. `job-post.mapper.ts` — map sang `JobPostDto`, gồm field tổng hợp `latestModerationAction` (action/reason/actorName/createdAt) để frontend render banner không cần gọi API riêng.
6. `job-posts.controller.ts` + `job-posts.dto.ts` + `job-posts.routes.ts` — 3 nhóm route:
   - Public (không guard): `GET /job-posts` (search/filter), `GET /job-posts/:id` (chi tiết, chỉ khi `PUBLISHED`, tăng `viewCount`).
   - Employer (`employerGuard`): `POST/GET/PATCH /employer/job-posts[...]`, `POST .../submit`, `POST .../close`.
   - Admin (`adminGuard`): `GET /admin/job-posts?status=PENDING`, `POST .../approve`, `POST .../reject`, `POST .../retract`.
7. `job-post-expiry.job.ts` — cron như Phần 2, đăng ký trong `main.ts`.
8. Mount router mới trong `main.ts`.

## Cách test (không cần frontend — Postman/curl)

- Company chưa đủ quota/trial → tạo `DRAFT` bị chặn (403, lý do rõ ràng).
- Company còn trial → tạo `DRAFT`/`PENDING` được; `requiresApproval=false` → publish thẳng, log `APPROVED actor=null`.
- Admin approve / reject (kèm reason) / retract (kèm reason) đúng state machine; gọi lại API company detail thấy `retractionCount` tăng đúng sau `retract`.
- Cron: set `expiresAt` quá khứ thủ công (Prisma Studio) rồi chạy job thủ công → tin chuyển `EXPIRED`; dùng `DEV_SKIP_PAYMENT_GATEWAY` (đã có từ Phase 5) để đưa 1 company về hết gói → tin `PUBLISHED` của company đó chuyển `EXPIRED`.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
