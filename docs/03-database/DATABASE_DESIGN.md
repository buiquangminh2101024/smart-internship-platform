# Database Design

Nguồn sự thật (source of truth) là `apps/server/prisma/schema.prisma` — file này chỉ tóm tắt để đọc nhanh, **không** thay thế schema. Khi có khác biệt, schema thật luôn đúng, tài liệu này cần cập nhật theo.

Database: PostgreSQL (Neon.tech, managed), truy cập qua Prisma Client. Đã áp dụng migration `20260901052345_init` (schema domain đầy đủ, Phase 1) và `20260901124902_admin_auth_oauth_prep` (delta: `User.passwordHash` → optional, thêm `User.googleId`, chuẩn bị cho Google OAuth — xem `INITIAL_ARCHITECTURE_PLAN.md` §8b/§12b).

## Nhóm entity

### Users & auth

- **`User`** — bảng gốc cho cả 4 actor (Guest không có record). `role: Role (CANDIDATE | EMPLOYER | ADMIN)`. `passwordHash` và `googleId` đều optional — một user có thể có 1 trong 2 hoặc cả 2 (liên kết theo email trùng), ràng buộc "phải có ít nhất 1" enforce ở service layer, không phải DB constraint. `status: UserStatus (PENDING_VERIFICATION | ACTIVE | SUSPENDED)`. Admin **không** được tạo qua ứng dụng — chỉ qua `apps/server/scripts/create-admin.ts`.
- Không có bảng OTP/refresh-token trong Postgres — cả hai là dữ liệu ephemeral, TTL-bound, sống trong Redis (Phase 2).

### Catalog (danh mục dùng chung, admin-managed)

`Major`, `University`, `Industry`, `City`, `CompanyType`, `Skill` — đều là bảng nhỏ dạng `{id, name (unique)}`, được các entity domain khác tham chiếu (`Education`, `Company`, `JobPost`, `StudentSkill`, `JobPostSkill`). `University` có thêm `code` (mã trường, optional/unique); `City` có thêm `zipcode` (optional). Seed qua `apps/server/scripts/seed.ts`.

### Candidate domain

- **`Student`** (1:1 với `User` qua `userId`) — hồ sơ ứng viên: headline, bio, phone, dateOfBirth, gender, avatarUrl, liên kết `City` (optional). Không lưu trực tiếp trường/ngành/năm tốt nghiệp — xem `Education` bên dưới.
- Con của `Student`: `Education` (liên kết `University`/`Major` qua FK, có `isCurrent` để đánh dấu chương trình đang theo học — mỗi lần chuyển trường là 1 dòng mới, giữ lịch sử thay vì ghi đè), `WorkExperience` (`company` là `String` tự do, không liên kết entity `Company`), `Project` (có `isWorkingOn`), `Certificate` (có `description`), `Award` — mỗi loại 1 bảng riêng, quan hệ 1-N, cascade delete theo `Student`.
- **`StudentSkill`** — bảng nối N-N giữa `Student` và `Skill`, có thêm `yearsOfExperience`.
- **`Cv`** — file CV (qua Cloudinary), `isDefault` để đánh dấu CV mặc định.
- **`SavedJob`** — bảng nối N-N giữa `Student` và `JobPost` (tin đã lưu), unique theo cặp.

### Employer domain

- **`Company`** — hồ sơ doanh nghiệp: `isVerified`, `requiresApproval` (mặc định `true`, Admin bật/tắt riêng từng công ty), `taxCode` (unique, optional), `foundedYear`, liên kết `Industry`/`CompanyType`/`City`. `retractionCount` **không phải cột** — derive tại query time từ `JobPostModerationAction` (đếm action `RETRACTED`), tránh lệch dữ liệu so với audit log.
- **`Employer`** (1:1 với `User` qua `userId`, N:1 với `Company`) — `isCompanyAdmin` đánh dấu employer nào là admin của công ty đó.

### Subscription & Billing

- **`SubscriptionPlan`** (catalog do Admin quản lý) — `jobPostQuota`, `durationDays`, `price` (VND, `Int`), `isActive`. Giữ `createdAt`/`updatedAt` (khác các catalog thuần `{id, name}` ở trên) vì giá/quota có thể được Admin chỉnh sửa theo thời gian.
- **`CompanySubscription`** — gói mà 1 `Company` đang/đã dùng (`status: SubscriptionStatus` — `PENDING | ACTIVE | EXPIRED | CANCELLED`). Quota còn lại **không phải cột** — đếm số `JobPost` được tạo trong khoảng `[startDate, endDate)` tại query-time (quyết định đã chốt, tránh lệch dữ liệu). Nâng cấp gói giữa kỳ = huỷ (`CANCELLED`) gói cũ + tạo bản ghi mới, không cộng dồn thời hạn/quota còn lại.
- **`Payment`** — ý định thanh toán cho 1 `CompanySubscription` (`status: PaymentStatus` — `PENDING | COMPLETED | FAILED`), ổn định, không đổi nhiều lần trong vòng đời — khác với `Transaction`.
- **`Transaction`** — mỗi lần gọi cổng thanh toán (VNPay/Momo) là 1 bản ghi (N-1 với `Payment`), append-only (`status: TransactionStatus` — `INIT | SUCCESS | FAILED`), `orderCode` unique tự sinh để khớp lại khi IPN callback trả về, `providerTransactionId` unique dùng chống xử lý callback trùng lặp.
- **`PaymentCallbackLog`** — log thô **mọi** callback IPN/webhook nhận được (`provider: PaymentProvider` — `VNPAY | MOMO`), kể cả khi không khớp được `Transaction` nào — cố tình không có FK, tách biệt khỏi luồng xử lý nghiệp vụ để tra soát sau này.
- **`PaymentMethod`** (catalog) — generic hoá cổng thanh toán (`processorType: PaymentProvider`, `configParams` JSON), `Transaction.paymentMethodId` tham chiếu tới đây thay vì hardcode enum trực tiếp trên `Transaction`.
- Company không có `CompanySubscription` đang `ACTIVE` còn quota bị chặn hoàn toàn tạo `JobPost` mới (kể cả `DRAFT`) — chi tiết: `docs/designs/SUBSCRIPTION_BILLING_DESIGN.md`.

### Job posts & moderation

- **`JobPost`** — `jobType: JobPostType (INTERNSHIP | PART_TIME | FULL_TIME | CONTRACT)`, `status: JobPostStatus (DRAFT | PENDING | PUBLISHED | EXPIRED | CLOSED | TAKEN_DOWN)`. Có `address` (địa chỉ cụ thể của tin, độc lập với `cityId` — cần thiết khi 1 công ty có nhiều chi nhánh trong cùng thành phố), `isNegotiable`, `requirements`, `benefits`. Vòng đời đầy đủ + cơ chế duyệt/thu hồi mô tả chi tiết ở `INITIAL_ARCHITECTURE_PLAN.md` §12.
- **`JobPostSkill`** — bảng nối N-N giữa `JobPost` và `Skill` (dùng chung catalog với `StudentSkill`), lưu kỹ năng yêu cầu của tin — chuẩn bị cho AI matching CV↔JobPost (Phase 11).
- **`JobPostModerationAction`** — audit log mọi hành động duyệt/từ chối/thu hồi (`action: ModerationActionType`, `actor: User?` — null nếu tự động publish do `requiresApproval=false`, `reason` optional).

### Application

- **`Application`** — nối `JobPost` + `Student` + `Cv`, unique theo cặp `(jobPostId, studentId)`. `status: ApplicationStatus` (PENDING → REVIEWING → SHORTLISTED → INTERVIEWING → ACCEPTED/REJECTED). Có `coverLetter` (thư xin việc, optional). `employerNotes`/`rating` chỉ hiển thị nội bộ nhà tuyển dụng (xem `PROJECT_OVERVIEW.md` §13 Assumptions).

### Messaging

- **`Conversation`** — gắn cố định đúng 1 `Student` + 1 `Employer` qua FK trực tiếp (`studentId`, `employerId`, cả hai cascade delete theo chủ sở hữu) — không dùng bảng nối participant generic, vì nghiệp vụ đã xác nhận mỗi cuộc trò chuyện luôn đúng 2 phía (không phải hộp thư chung nhiều nhân viên công ty). `studentLastReadAt`/`employerLastReadAt` cho trạng thái đã đọc (thay cho `ConversationParticipant.lastReadAt` trước đây). `jobPostId` optional (cho phép liên hệ chung không gắn tin cụ thể). Unique theo `(studentId, employerId, jobPostId)` để tránh tạo trùng cuộc trò chuyện.
- **`Message`** — thuộc 1 `Conversation`, có `sender: User` (bên gửi là user của `studentId` hoặc `employerId` gắn với conversation đó).

### Notification

- **`Notification`** — thuộc 1 `User`, `type: NotificationType`, có `link`/`isRead`.

## Quy ước chung

- Khoá chính: `String @id @default(cuid())` cho mọi entity.
- Đặt tên bảng ở DB (`@@map`) dùng snake_case số nhiều; tên model TypeScript dùng PascalCase số ít.
- Quan hệ 1:1 dùng field N `@unique` (vd. `Student.userId`, `Employer.userId`).
- Xoá cascade (`onDelete: Cascade`) áp dụng cho quan hệ "con thuộc về cha hoàn toàn" (vd. `Education` thuộc `Student`, `Message` thuộc `Conversation`) — không áp dụng cho quan hệ tham chiếu tới catalog hay `User` gốc.
- Enum được định nghĩa tập trung ở đầu file `schema.prisma`, dùng chung giữa Prisma Client và (khi cần) `packages/shared-types`.

## Các quyết định schema đã chốt (tham chiếu nhanh)

Chi tiết đầy đủ và rationale nằm ở `INITIAL_ARCHITECTURE_PLAN.md` §13 và `PROJECT_OVERVIEW.md` §13/§14. Tóm tắt:

| Quyết định | Giá trị chốt |
|---|---|
| `JobPost.jobType` | Enum `JobPostType` (không phải `String` tự do) |
| `WorkExperience.company` | `String` tự do, không liên kết entity `Company` |
| `Conversation.jobPost` | Optional (nullable FK) |
| `Company.retractionCount` | Derived từ `JobPostModerationAction`, không phải cột riêng |
| `User.passwordHash` / `User.googleId` | Cả hai optional — hỗ trợ đăng nhập email/password và/hoặc Google, liên kết theo email trùng |
| Tạo tài khoản Admin | Không qua API — chỉ qua `apps/server/scripts/create-admin.ts` |
| Học vấn (`University`/`Major`) | Gắn qua `Education` (kèm `isCurrent`), không gắn trực tiếp trên `Student` — hỗ trợ lịch sử chuyển trường |
| `Conversation` participants | FK trực tiếp `studentId`/`employerId`, không dùng bảng nối `ConversationParticipant` |
| Kỹ năng yêu cầu của `JobPost` | Bảng nối `JobPostSkill`, dùng chung catalog `Skill` với `StudentSkill` |
| Quota `CompanySubscription` còn lại | Đếm `JobPost` tạo trong kỳ hiện tại (query-time), không lưu counter |
| Nâng cấp gói giữa kỳ | Huỷ gói cũ (`CANCELLED`) + tạo gói mới, không cộng dồn |
| Company không có gói active | Chặn hoàn toàn tạo `JobPost` mới (kể cả `DRAFT`) |
| Cổng thanh toán (VNPay/Momo) | Generic hoá qua catalog `PaymentMethod`, không hardcode enum trên `Transaction` |
