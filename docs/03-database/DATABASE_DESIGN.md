# Database Design

Nguồn sự thật (source of truth) là `apps/server/prisma/schema.prisma` — file này chỉ tóm tắt để đọc nhanh, **không** thay thế schema. Khi có khác biệt, schema thật luôn đúng, tài liệu này cần cập nhật theo.

Database: PostgreSQL (Neon.tech, managed), truy cập qua Prisma Client. Đã áp dụng migration `20260901052345_init` (schema domain đầy đủ, Phase 1) và `20260901124902_admin_auth_oauth_prep` (delta: `User.passwordHash` → optional, thêm `User.googleId`, chuẩn bị cho Google OAuth — xem `INITIAL_ARCHITECTURE_PLAN.md` §8b/§12b).

## Nhóm entity

### Users & auth

- **`User`** — bảng gốc cho cả 4 actor (Guest không có record). `role: Role (CANDIDATE | EMPLOYER | ADMIN)`. `passwordHash` và `googleId` đều optional — một user có thể có 1 trong 2 hoặc cả 2 (liên kết theo email trùng), ràng buộc "phải có ít nhất 1" enforce ở service layer, không phải DB constraint. `status: UserStatus (PENDING_VERIFICATION | ACTIVE | SUSPENDED)`. Admin **không** được tạo qua ứng dụng — chỉ qua `apps/server/scripts/create-admin.ts`.
- Không có bảng OTP/refresh-token trong Postgres — cả hai là dữ liệu ephemeral, TTL-bound, sống trong Redis (Phase 2).

### Catalog (danh mục dùng chung, admin-managed)

`Major`, `University`, `Industry`, `City`, `CompanyType`, `Skill` — đều là bảng nhỏ dạng `{id, name (unique)}`, được các entity domain khác tham chiếu (`Student`, `Company`, `JobPost`, `StudentSkill`). Seed qua `apps/server/scripts/seed.ts`.

### Candidate domain

- **`Student`** (1:1 với `User` qua `userId`) — hồ sơ ứng viên: headline, bio, phone, dateOfBirth, avatarUrl, liên kết `University`/`Major`/`City` (đều optional).
- Con của `Student`: `Education`, `WorkExperience` (`company` là `String` tự do, không liên kết entity `Company`), `Project`, `Certificate`, `Award` — mỗi loại 1 bảng riêng, quan hệ 1-N, cascade delete theo `Student`.
- **`StudentSkill`** — bảng nối N-N giữa `Student` và `Skill`, có thêm `yearsOfExperience`.
- **`Cv`** — file CV (qua Cloudinary), `isDefault` để đánh dấu CV mặc định.
- **`SavedJob`** — bảng nối N-N giữa `Student` và `JobPost` (tin đã lưu), unique theo cặp.

### Employer domain

- **`Company`** — hồ sơ doanh nghiệp: `isVerified`, `requiresApproval` (mặc định `true`, Admin bật/tắt riêng từng công ty), liên kết `Industry`/`CompanyType`/`City`. `retractionCount` **không phải cột** — derive tại query time từ `JobPostModerationAction` (đếm action `RETRACTED`), tránh lệch dữ liệu so với audit log.
- **`Employer`** (1:1 với `User` qua `userId`, N:1 với `Company`) — `isCompanyAdmin` đánh dấu employer nào là admin của công ty đó.

### Job posts & moderation

- **`JobPost`** — `jobType: JobPostType (INTERNSHIP | PART_TIME | FULL_TIME | CONTRACT)`, `status: JobPostStatus (DRAFT | PENDING | PUBLISHED | EXPIRED | CLOSED | TAKEN_DOWN)`. Vòng đời đầy đủ + cơ chế duyệt/thu hồi mô tả chi tiết ở `INITIAL_ARCHITECTURE_PLAN.md` §12.
- **`JobPostModerationAction`** — audit log mọi hành động duyệt/từ chối/thu hồi (`action: ModerationActionType`, `actor: User?` — null nếu tự động publish do `requiresApproval=false`, `reason` optional).

### Application

- **`Application`** — nối `JobPost` + `Student` + `Cv`, unique theo cặp `(jobPostId, studentId)`. `status: ApplicationStatus` (PENDING → REVIEWING → SHORTLISTED → INTERVIEWING → ACCEPTED/REJECTED). `employerNotes`/`rating` chỉ hiển thị nội bộ nhà tuyển dụng (xem `PROJECT_OVERVIEW.md` §13 Assumptions).

### Messaging

- **`Conversation`** — `jobPostId` optional (cho phép liên hệ chung không gắn tin cụ thể).
- **`ConversationParticipant`** — bảng nối N-N giữa `Conversation` và `User`, có `lastReadAt` cho trạng thái đã đọc.
- **`Message`** — thuộc 1 `Conversation`, có `sender: User`.

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
