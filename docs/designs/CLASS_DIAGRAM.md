# Class Diagram — Domain Model

Nguồn sự thật cho **dữ liệu** (attributes, quan hệ, cardinality) là `apps/server/prisma/schema.prisma`. Tài liệu này diễn giải lại schema đó ở mức **class diagram phân tích (analysis-level)** — bổ sung method thể hiện hành vi/invariant nghiệp vụ mà schema (chỉ mô tả cấu trúc dữ liệu) không thể hiện được. Đây là bản thay thế chính thức cho vai trò tham chiếu domain của `class-diagram-v2.jpg` (ảnh cũ vẽ bằng Visual Paradigm) — ảnh cũ giữ lại chỉ để đối chiếu lịch sử, không dùng làm nguồn tham chiếu nữa (xem `PROJECT_OVERVIEW.md` §14, Open Question #1 nhánh liên quan).

## 1. Vì sao bản cũ bị nhận xét sai — và cách khắc phục

GVHD nhận xét 3 điểm trên bản vẽ cũ. Bảng dưới đối chiếu từng điểm với cách xử lý trong bản này:

| Nhận xét của GVHD | Vị trí lỗi trong bản cũ | Cách khắc phục trong bản này |
|---|---|---|
| "God Object" — lớp ôm quá nhiều thứ | `Student` vừa vẽ composition (hình thoi) tới `Education`, `WorkExperience`, `HighlightProject`, `Certificate`, `Award`, `StudentSkill`, **vừa** liệt kê lại chính các quan hệ đó dưới dạng attribute (`educations: List<Education>`, `workExperiences: List<WorkExperience>`...) — trùng lặp thông tin hai lần | §3 dưới đây: `Student` chỉ giữ attribute vô hướng (scalar) của chính nó; quan hệ tới entity con chỉ thể hiện qua đường nối UML (association/composition), không lặp lại dưới dạng attribute |
| "Transaction Script / Anemic Domain Model" — method không thật | Nhiều method trên bản cũ (`updatePersonalInfo(...)`, `addEducation(...)`...) chỉ là wrapper 1-1 cho việc gán field, không chứa rule nào — gọi là method nhưng thực chất là setter trá hình | §2 quy tắc lọc method + mọi method liệt kê trong §3 đều đi kèm **invariant cụ thể** nó bảo vệ, không liệt kê setter thuần |
| Vi phạm SRP (Single Responsibility) | Hệ quả trực tiếp của 2 điểm trên: `Student` vừa là data holder của chính nó, vừa "biết" chi tiết vận hành của 6 entity con khác | Sau khi bỏ attribute trùng lặp (điểm 1), `Student` chỉ còn chịu trách nhiệm về danh tính/hồ sơ cá nhân của chính nó; việc thêm/xoá entity con là method trên `Student` với vai trò *Aggregate Root* (DDD), không phải sở hữu dữ liệu chi tiết của chúng |

Ngoài 3 điểm GVHD nêu, bản này còn tự sửa thêm **1 lỗi mô hình hoá**: bản cũ vẽ `Student`/`Employer` **kế thừa (generalization, hình tam giác rỗng)** từ `User`. Thực tế `schema.prisma` hiện thực bằng **association 1–0..1 qua khoá ngoại `userId` (unique)**, không phải bảng cha–con dùng chung khoá chính (table inheritance) — vì Prisma không hỗ trợ table-per-type inheritance, và việc phân biệt actor đã có sẵn qua `User.role`. Vẽ generalization ở đây gây hiểu lầm rằng `Student`/`Employer` là subtype thật có thể dùng chung định danh với `User`, trong khi thực tế là quan hệ has-a với bảng/khoá riêng. Bản này dùng association thay vì generalization (xem §4).

## 2. Class diagram (phân tích) vs code thật — vì sao method vẫn "thật" dù Prisma model không có method

Kiến trúc backend của dự án dùng **Service Layer pattern** (`apps/server/src/modules/<domain>/*.service.ts`, đăng ký qua `awilix`) thao tác trên **Prisma model** — mà Prisma model là kiểu dữ liệu thuần (`type User = {...}`), **không thể** tự gắn method lên đó. Đây không phải Anemic Domain Model theo nghĩa tiêu cực (nơi business rule bị rải rác/không có chủ sở hữu rõ ràng), mà là một lựa chọn kiến trúc có chủ đích, đã ghi trong `INITIAL_ARCHITECTURE_PLAN.md` §3: *"Xử lý toàn bộ business logic theo module domain"* — mọi invariant được tập trung đúng 1 nơi (Service tương ứng), không trùng lặp giữa controller/route.

Vì vậy, class diagram ở tài liệu này là **mô hình phân tích (analysis model)**: method vẽ trên class thể hiện *khái niệm nào sở hữu trách nhiệm nghiệp vụ nào* (đúng vai trò kinh điển của class diagram trong OOAD — xem Larman, "Applying UML and Patterns"), còn cách hiện thực cụ thể nằm ở Service tương ứng. Mỗi method trong §3–§4 dưới đây có cột "Hiện thực trong code" trỏ đúng vị trí — method nào đã có trong Phase 2 sẽ trỏ tới file thật, method nào thuộc phase sau sẽ ghi rõ phase kế hoạch (không bịa code chưa tồn tại).

**Quy tắc lọc method** (áp dụng nhất quán trong toàn bộ §3–§4): một method chỉ được liệt kê nếu trả lời "có" cho ít nhất một câu hỏi sau — nếu không, nó là setter giả và bị loại khỏi diagram:

1. Có invariant/rule bảo vệ không (nếu bỏ method, cho set trực tiếp field, dữ liệu có thể rơi vào trạng thái vô lý không)?
2. Có kiểm tra/enforce transition hợp lệ của một state machine không?
3. Có tính toán/derive giá trị (không phải trả field thô) không?

## 3. Các nhóm class (theo đúng nhóm trong `DATABASE_DESIGN.md`)

### 3.1 Identity (`User`)

```
User
- id, email, passwordHash?, googleId?, role, status, emailVerifiedAt?, createdAt, updatedAt
+ verifyEmail(otp: string): void
+ suspend(): void
+ activate(): void
+ linkGoogleAccount(googleId: string): void
```

| Method | Invariant bảo vệ | Hiện thực trong code |
|---|---|---|
| `verifyEmail(otp)` | Chỉ chuyển `PENDING_VERIFICATION → ACTIVE` nếu OTP khớp; không cho set `status=ACTIVE` tuỳ tiện | `AuthService.verifyOtp()` — `apps/server/src/modules/auth/auth.service.ts` (đã có, Phase 2) |
| `suspend()` | `ACTIVE → SUSPENDED`; user đã suspended không login được (`AuthService.login` chặn tường minh) | Kế hoạch: Admin module quản lý user (chưa có phase riêng, thuộc Phase 2 mở rộng/Phase 12) |
| `activate()` | Ngược lại `suspend()`, chỉ Admin gọi | Kế hoạch: cùng module trên |
| `linkGoogleAccount(googleId)` | Chỉ gắn `googleId` vào `User` đã tồn tại nếu **email trùng khớp đã xác thực bởi Google**; không tạo bản ghi mới, giữ nguyên `role` hiện có, từ chối nếu `role=ADMIN` | `AuthService.loginOrRegisterWithGoogle()` gọi `userRepository.linkGoogleId()` — đã có, Phase 2 |

*Không có `updateEmail()`/`updatePassword()` liệt kê ở đây làm method riêng vì đổi mật khẩu (`resetPassword`) đã đi qua OTP (invariant nằm ở `verifyEmail`/OTP flow), không phải setter trần.*

### 3.2 Catalog (`Major`, `University`, `Industry`, `City`, `CompanyType`, `Skill`)

Chỉ có `id`, `name` (unique) — **không có method riêng**: đây là danh mục Admin CRUD thuần (create/rename/delete qua 1 module `catalog` dùng chung, không có invariant đặc thù theo từng loại). Cố tình không vẽ method giả (`create()`, `update()`, `delete()`) trên các class này vì chúng không bảo vệ invariant gì khác ngoài CRUD chuẩn — nếu vẽ sẽ tái phạm lỗi "fake behavior".

### 3.3 Candidate domain

```
Student
- id, userId, headline?, bio?, phone?, dateOfBirth?, gender?, avatarUrl?
- cityId?, createdAt, updatedAt
+ addEducation(education: Education): void
+ addWorkExperience(exp: WorkExperience): void
+ addCertificate(cert: Certificate): void
+ addAward(award: Award): void
+ addProject(project: Project): void
+ saveJob(jobPost: JobPost): void
+ unsaveJob(jobPost: JobPost): void
```

| Method | Invariant bảo vệ | Hiện thực trong code |
|---|---|---|
| `addEducation/addWorkExperience/addCertificate/addAward/addProject` | Entity con luôn tạo gắn đúng `studentId` của chính `Student` đang thao tác (không cho tạo hộ cho `Student` khác) — vai trò Aggregate Root | Kế hoạch: `apps/server/src/modules/students/*.service.ts`, Phase 3 |
| `saveJob(jobPost)` | Không lưu trùng — `unique(studentId, jobPostId)` ở DB, service phải catch/idempotent | Kế hoạch: `SavedJobService.save()`, Phase 7 |
| `unsaveJob(jobPost)` | Chỉ xoá đúng bản ghi của chính `Student` đang thao tác | Kế hoạch: `SavedJobService.unsave()`, Phase 7 |

*Không còn `universityId`/`majorId`/`graduationYear` trên `Student` — sinh viên có thể chuyển trường/ngành nên lịch sử học vấn dồn hẳn về `Education` (xem khối riêng ngay dưới đây), không lưu 1 giá trị "hiện tại" cố định trên `Student`.*

```
Education
- id, studentId, universityId?, majorId?, degree?, startYear?, endYear?, isCurrent, description?, createdAt
+ markAsCurrent(): void
```

| Method | Invariant bảo vệ | Hiện thực trong code |
|---|---|---|
| `markAsCurrent()` | Khi set `isCurrent=true` cho 1 `Education`, mọi `Education` khác của cùng `Student` phải bị set `false` trong cùng transaction — đảm bảo tại một thời điểm chỉ có đúng 1 chương trình học "đang theo học" (cùng dạng invariant với `Cv.markAsDefault()` bên dưới) | Kế hoạch: `EducationService.markAsCurrent()`, Phase 3 |

`WorkExperience`, `Project`, `Certificate`, `Award` — attribute thuần theo schema, **không có method riêng** (vòng đời hoàn toàn phụ thuộc `Student`, thao tác thêm/xoá đã nằm ở method của `Student` phía trên — tránh vẽ method trùng ở cả 2 phía).

```
Cv
- id, studentId, fileUrl, fileName, isDefault, uploadedAt
+ markAsDefault(): void
```

| Method | Invariant | Hiện thực |
|---|---|---|
| `markAsDefault()` | Khi set `isDefault=true` cho 1 CV, mọi CV khác của cùng `Student` phải bị set `false` trong cùng transaction — đảm bảo tại một thời điểm chỉ có đúng 1 CV mặc định | Kế hoạch: `CvService.setDefault()`, Phase 7 |

`StudentSkill` — **association class** giữa `Student` và `Skill` (xem §4), có thêm attribute riêng `yearsOfExperience`, không có method riêng ngoài add/remove (đã phủ bởi thao tác CRUD chuẩn trên bảng nối).

### 3.4 Employer domain

```
Company
- id, name, description?, logoUrl?, bannerUrl?, website?
- industryId?, companyTypeId?, cityId?, address?, taxCode?, foundedYear?
- isVerified, requiresApproval, verifiedAt?, createdAt, updatedAt
+ verify(): void
+ setRequiresApproval(value: boolean): void
+ retractionCount(): int
```

| Method | Invariant bảo vệ | Hiện thực trong code |
|---|---|---|
| `verify()` | Chỉ Admin gọi; `isVerified: false → true`, set `verifiedAt=now()`; mặc định `requiresApproval=true` sau khi verify (theo `INITIAL_ARCHITECTURE_PLAN.md` §12) | Kế hoạch: `CompanyService.verify()`, Phase 4 |
| `setRequiresApproval(value)` | Chỉ Admin bật/tắt; không ảnh hưởng tin đã `PUBLISHED` trước đó | Kế hoạch: `CompanyService.setRequiresApproval()`, Phase 4/6 |
| `retractionCount()` | **Method tính toán (derived), không phải field lưu trữ** — đếm số `JobPostModerationAction` có `action=RETRACTED` gắn với các `JobPost` của company này, tính tại query-time để không lệch khỏi audit log thật (quyết định đã chốt, `DATABASE_DESIGN.md` §"Job posts & moderation") | Kế hoạch: query trong `CompanyRepository`, Phase 6 |

```
Employer
- id, userId, companyId, isCompanyAdmin, title?, phone?, createdAt, updatedAt
```

Không có method riêng — hồ sơ cá nhân của Employer trong công ty, cập nhật qua CRUD chuẩn (`updateProfile`), không có invariant đặc thù ngoài ràng buộc unique `userId` (đã enforce ở DB, không cần method).

### 3.5 Subscription & Billing

Company phải có `CompanySubscription` đang `ACTIVE` còn quota mới được tạo `JobPost` mới (kể cả `DRAFT`) — chi tiết luồng nghiệp vụ: `docs/designs/SUBSCRIPTION_BILLING_DESIGN.md`.

```
SubscriptionPlan
- id, name, description?, jobPostQuota, durationDays, price, isActive, createdAt, updatedAt
```

```
PaymentMethod
- id, displayName, logoUrl?, isAvailable, processorType, configParams?, createdAt, updatedAt
```

Cả hai là catalog do Admin CRUD (thêm/sửa/tắt gói hoặc cổng thanh toán) — không có method riêng ngoài CRUD chuẩn, tương tự §3.2. Khác các catalog thuần `{id, name}` ở §3.2, cả hai giữ `createdAt`/`updatedAt` vì mang cấu hình giá/quota/trạng thái khả dụng mà Admin chỉnh sửa theo thời gian, cần audit.

```
CompanySubscription
- id, companyId, planId, startDate, endDate, status
- createdAt, updatedAt
+ activate(): void
+ cancel(): void
+ isActive(): boolean
```

| Method | Invariant bảo vệ | Hiện thực trong code |
|---|---|---|
| `activate()` | Chỉ gọi khi `Payment` liên kết chuyển `COMPLETED` (qua IPN callback); `PENDING → ACTIVE`, set `startDate=now()`, `endDate=startDate+plan.durationDays` | Kế hoạch: `SubscriptionService.activate()`, Phase 5 |
| `cancel()` | Gọi khi nâng cấp gói giữa kỳ (huỷ gói cũ) hoặc Admin can thiệp; `ACTIVE → CANCELLED`; không cộng dồn/hoàn trả quota còn lại (quyết định đã chốt, `SUBSCRIPTION_BILLING_DESIGN.md` §3) | Kế hoạch: `SubscriptionService.upgrade()`, Phase 5 |
| `isActive()` | **Method tính toán** — `status=ACTIVE && now() <= endDate`; dùng để gate việc tạo `JobPost`, không tự set `EXPIRED` (hết hạn cập nhật qua worker định kỳ, tương tự `JobPost.expire()`) | Kế hoạch: `JobPostService.assertCanCreate()`, Phase 6 |

```
Payment
- id, companySubscriptionId, amount, status, createdAt, updatedAt
+ complete(): void
+ fail(): void
```

| Method | Invariant bảo vệ | Hiện thực trong code |
|---|---|---|
| `complete()` | Chỉ gọi từ IPN callback khi cổng báo thành công; `PENDING → COMPLETED`, kéo theo `CompanySubscription.activate()` trong cùng transaction | Kế hoạch: `PaymentService.handleCallback()`, Phase 5 |
| `fail()` | `PENDING → FAILED`; không ảnh hưởng `CompanySubscription` (vẫn `PENDING`, employer có thể thử lại — tạo `Transaction` mới trên cùng `Payment`) | Kế hoạch: `PaymentService.handleCallback()`, Phase 5 |

```
Transaction
- id, paymentId, paymentMethodId, orderCode, providerTransactionId?, rawResponse?, status, createdAt
```

Không có method — entity ghi log bất biến mỗi lần gọi cổng thanh toán (cùng kiểu với `JobPostModerationAction` ở §3.6), chỉ insert, không update.

```
PaymentCallbackLog
- id, provider, rawQueryString?, rawPayload?, receivedAt
```

Không có method — log thô mọi callback nhận được, kể cả không khớp được `Transaction` nào; cố tình không có quan hệ FK tới `Transaction`/`Payment` để không phụ thuộc việc parse thành công.

### 3.6 Job posts & moderation

```
JobPost
- id, companyId, title, description, jobType, status
- salaryMin?, salaryMax?, isNegotiable, requirements?, benefits?
- cityId?, address?, industryId?
- publishedAt?, expiresAt?, closedAt?, createdAt, updatedAt
+ submitForApproval(): void
+ publish(): void
+ approve(actor: User): void
+ reject(actor: User, reason: string): void
+ retract(actor: User, reason: string): void
+ close(): void
+ expire(): void
```

Đây là ví dụ điển hình của "behavior thật" — mọi method đều enforce transition hợp lệ của state machine `JobPostStatus`, khớp luồng nghiệp vụ đã chốt ở `INITIAL_ARCHITECTURE_PLAN.md` §12:

| Method | Invariant bảo vệ | Hiện thực trong code |
|---|---|---|
| `submitForApproval()` | Chỉ hợp lệ khi `status=DRAFT`; chỉ Employer của company đó gọi được | Kế hoạch: `JobPostService.submitForApproval()`, Phase 6 |
| `publish()` | Nếu `company.requiresApproval=false`: `DRAFT → PUBLISHED` trực tiếp, log `APPROVED` với `actor=null`. Nếu đang `PENDING` (đã qua `approve()`): `PENDING → PUBLISHED`. Set `publishedAt=now()` | `JobPostService.publish()`, Phase 6 |
| `approve(actor)` | Chỉ Admin; chỉ hợp lệ khi `status=PENDING` → `PUBLISHED`, ghi `JobPostModerationAction(action=APPROVED, actor)` | `JobPostService.approve()`, Phase 6 |
| `reject(actor, reason)` | Chỉ Admin; chỉ hợp lệ khi `status=PENDING` → `DRAFT`; **`reason` bắt buộc**; ghi log `REJECTED` | `JobPostService.reject()`, Phase 6 |
| `retract(actor, reason)` | Chỉ Admin; chỉ hợp lệ khi `status=PUBLISHED` → `TAKEN_DOWN`; **`reason` bắt buộc**; ghi log `RETRACTED` (nguồn của `Company.retractionCount()`) | `JobPostService.retract()`, Phase 6 |
| `close()` | Chỉ Employer sở hữu tin; chỉ hợp lệ khi `status=PUBLISHED` → `CLOSED`, set `closedAt`; **không** ghi vào moderation log, không ảnh hưởng `retractionCount` | `JobPostService.close()`, Phase 6 |
| `expire()` | Hệ thống tự động (worker/cron, `apps/server/src/workers/`); chỉ hợp lệ khi `status=PUBLISHED` và `expiresAt <= now()` → `EXPIRED` | Kế hoạch: worker định kỳ, Phase 6 |

`JobPostSkill` — **association class** giữa `JobPost` và `Skill` (cùng dạng với `StudentSkill` ở §3.3), dùng chung catalog `Skill` để so khớp được với kỹ năng ứng viên khi triển khai AI matching (Phase 11). Không có method riêng ngoài add/remove qua CRUD chuẩn trên bảng nối.

```
JobPostModerationAction
- id, jobPostId, action, actorId?, reason?, createdAt
```

Không có method — đây là **entity ghi log bất biến (immutable)**, chỉ insert, không update/delete. Mỗi bản ghi được tạo *như là kết quả phụ* của method trên `JobPost` (bảng trên), không tự đứng độc lập ra quyết định gì.

### 3.7 Application

```
Application
- id, jobPostId, studentId, cvId, status
- coverLetter?, employerNotes?, rating?, createdAt, updatedAt
+ submit(): void
+ startReview(): void
+ shortlist(): void
+ scheduleInterview(): void
+ accept(): void
+ reject(): void
+ rate(score: int, notes: string): void
```

| Method | Invariant bảo vệ | Hiện thực trong code |
|---|---|---|
| `submit()` | Tạo mới ở `PENDING`; **`unique(jobPostId, studentId)`** — không ứng tuyển trùng 1 tin lần 2 | Kế hoạch: `ApplicationService.submit()`, Phase 8 |
| `startReview()` / `shortlist()` / `scheduleInterview()` | Enforce đúng thứ tự state machine `PENDING → REVIEWING → SHORTLISTED → INTERVIEWING`, không cho nhảy cóc | Kế hoạch: cùng service, Phase 8 |
| `accept()` / `reject()` | `accept()` chỉ hợp lệ từ `INTERVIEWING`; `reject()` hợp lệ từ nhiều trạng thái (`REVIEWING\|SHORTLISTED\|INTERVIEWING`) — cả hai là trạng thái cuối (terminal), không cho transition tiếp sau đó | Kế hoạch: cùng service, Phase 8 |
| `rate(score, notes)` | Set `rating`/`employerNotes`; **chỉ Employer sở hữu `JobPost` xem được**, không trả field này cho Student trong bất kỳ response nào (đã ghi ở `PROJECT_OVERVIEW.md` §13 Assumptions) | Kế hoạch: cùng service, Phase 8 |

### 3.8 Messaging

Mỗi `Conversation` gắn cố định đúng 1 `Student` + 1 `Employer` (đã xác nhận nghiệp vụ: không phải hộp thư chung nhiều nhân viên công ty) — dùng FK trực tiếp thay vì association class participant generic như bản trước.

```
Conversation
- id, jobPostId?, studentId, employerId, studentLastReadAt?, employerLastReadAt?, createdAt, updatedAt
+ postMessage(sender: User, content: string): void
+ markReadByStudent(): void
+ markReadByEmployer(): void
```

| Method | Invariant bảo vệ | Hiện thực trong code |
|---|---|---|
| `postMessage(sender, content)` | `sender` **phải** là user của `studentId` hoặc `employerId` gắn với conversation này (kiểm tra trước khi tạo `Message`); cập nhật `Conversation.updatedAt` | Kế hoạch: `ConversationService` + Socket.IO gateway, Phase 9 |
| `markReadByStudent()` / `markReadByEmployer()` | Chỉ set `studentLastReadAt`/`employerLastReadAt = now()` cho đúng phía gọi — dùng để tính badge "chưa đọc" | Kế hoạch: `ConversationService`, Phase 9 |

`Message` — attribute thuần, không có method (chưa có edit/delete trong phạm vi MVP).

### 3.9 Notification

```
Notification
- id, userId, type, title, body?, link?, isRead, createdAt
+ markAsRead(): void
```

| Method | Invariant | Hiện thực |
|---|---|---|
| `markAsRead()` | Chỉ chuyển `isRead: false → true`, không set ngược lại (không có `markAsUnread()` trong MVP) | Kế hoạch: `NotificationService.markAsRead()`, Phase 10 |

## 4. Quan hệ giữa các class

Phân loại theo đúng ngữ nghĩa `onDelete` trong `schema.prisma` — không chọn loại quan hệ tuỳ ý:

- **Composition (●──)**: cascade delete trong schema — con không có lý do tồn tại độc lập khi cha bị xoá.
- **Aggregation (○──)**: FK bắt buộc (`NOT NULL`) nhưng **không** cascade — con phụ thuộc cha để hợp lệ nhưng có vòng đời/định danh riêng, DB chặn xoá cha khi còn con tham chiếu (Restrict).
- **Association (──)**: FK optional (nullable) hoặc quan hệ tham chiếu tới catalog — không mang ý nghĩa sở hữu.
- **Association class (thay generalization)**: dùng cho quan hệ N-N có attribute riêng, vẽ như một class thường nối tới cả 2 phía bằng association — không dùng composition/generalization.

| Class A | Quan hệ | Class B | Multiplicity | Ghi chú |
|---|---|---|---|---|
| `User` | ●── | `Student` | 1 — 0..1 | Cascade; thay cho generalization sai ở bản cũ |
| `User` | ●── | `Employer` | 1 — 0..1 | Cascade; tương tự |
| `University` | ── | `Education` | 1 — 0..* | Optional (nullable FK) |
| `Major` | ── | `Education` | 1 — 0..* | Optional |
| `City` | ── | `Student` \| `Company` \| `JobPost` | 1 — 0..* (×3) | Optional, dùng chung 1 catalog |
| `Industry` | ── | `Company` \| `JobPost` | 1 — 0..* (×2) | Optional |
| `CompanyType` | ── | `Company` | 1 — 0..* | Optional |
| `Student` | ●── | `Education` \| `WorkExperience` \| `Project` \| `Certificate` \| `Award` \| `Cv` | 1 — 0..* (×6) | Cascade |
| `Student` × `Skill` | assoc. class | `StudentSkill` | (0..* , 0..*) qua bảng nối | Có attribute riêng `yearsOfExperience` |
| `Company` | ○── | `Employer` | 1 — 1..* | Bắt buộc, không cascade (Restrict) |
| `Company` | ○── | `JobPost` | 1 — 0..* | Bắt buộc, không cascade |
| `Company` | ○── | `CompanySubscription` | 1 — 0..* | Bắt buộc, không cascade — không xoá lịch sử gói khi xoá company |
| `SubscriptionPlan` | ○── | `CompanySubscription` | 1 — 0..* | Bắt buộc, tham chiếu catalog, không cascade |
| `CompanySubscription` | ○── | `Payment` | 1 — 0..* | Bắt buộc, không cascade |
| `Payment` | ○── | `Transaction` | 1 — 0..* | Bắt buộc, không cascade |
| `PaymentMethod` | ○── | `Transaction` | 1 — 0..* | Bắt buộc, tham chiếu catalog, không cascade |
| `JobPost` | ●── | `JobPostModerationAction` | 1 — 0..* | Cascade; entity log |
| `User` (actor) | ── | `JobPostModerationAction` | 1 — 0..* | Optional (`null` = hệ thống tự publish) |
| `Student` × `JobPost` | assoc. class | `Application` | (0..*, 0..*) qua bảng nối | `unique(jobPostId, studentId)`; có thêm ref tới `Cv` |
| `Cv` | ○── | `Application` | 1 — 0..* | Bắt buộc, không cascade |
| `Student` × `JobPost` | assoc. class | `SavedJob` | (0..*, 0..*) qua bảng nối | `unique(studentId, jobPostId)` |
| `JobPost` × `Skill` | assoc. class | `JobPostSkill` | (0..*, 0..*) qua bảng nối | Không có attribute riêng, chỉ liên kết |
| `JobPost` | ── | `Conversation` | 1 — 0..* | Optional (cho phép liên hệ chung không gắn tin) |
| `Student` | ●── | `Conversation` | 1 — 0..* | Cascade |
| `Employer` | ●── | `Conversation` | 1 — 0..* | Cascade |
| `Conversation` | ●── | `Message` | 1 — 0..* | Cascade |
| `User` (sender) | ── | `Message` | 1 — 0..* | Bắt buộc nhưng không cascade |
| `User` | ●── | `Notification` | 1 — 0..* | Cascade |

Enum (`Role`, `UserStatus`, `JobPostType`, `JobPostStatus`, `ModerationActionType`, `ApplicationStatus`, `NotificationType`, `SubscriptionStatus`, `PaymentStatus`, `TransactionStatus`, `PaymentProvider`) gắn `<<enumeration>>` vào đúng attribute tương ứng (vd. `User.role: Role`), không vẽ như class độc lập có quan hệ riêng — đúng giá trị hữu hạn cố định, không cần entity.
