# Dashboard Employer & Admin — Backend

Song song: `docs/05-frontend/phases/dashboard-employer-admin/PLAN.md` (giao diện bản C).
Các lựa chọn đã được chủ dự án đồng ý (2026-09-29): `docs/temp/DASHBOARD_EMPLOYER_ADMIN_DECISIONS.md` (không commit).

**Trạng thái: ĐÃ ĐƯỢC CHỦ DỰ ÁN DUYỆT (2026-09-29), chấp nhận toàn bộ đề xuất D7–D11. ĐANG TRIỂN KHAI: bước 0 xong (AD-16, `PROJECT_STRUCTURE.md` §4–§5); bước 1 xong, migration `20260929000000_add_dashboard_analytics_tables` đã được chủ dự án áp lên Neon (2026-09-29); bước 2, 3 và 4 xong, kiểm chứng trên PostgreSQL tạm. Bước 5 (Interview, gồm D12–D13 được chủ dự án đồng ý 2026-09-29) xong phần code, kiểm chứng trên PostgreSQL tạm; migration `20260929120000_add_interviews` **chưa áp lên Neon**, chờ chủ dự án đồng ý. Bước 6 (bổ sung dữ liệu cho dashboard Admin bản D, D14) được chủ dự án duyệt 2026-09-30 và **xong phần code** (không migration).**

## Mục tiêu

Cung cấp dữ liệu cho hai dashboard (`/employer/dashboard`, `/admin/dashboard`): số liệu, danh sách "việc cần làm" thao tác tại chỗ, biểu đồ, và trung tâm thông báo phân nhóm. Thao tác (đổi trạng thái hồ sơ, duyệt/từ chối tin, xác minh công ty, duyệt danh mục) **dùng lại API hiện có**, không viết API riêng cho thao tác.

## Quyết định đã chốt (từ file lựa chọn)

| # | Quyết định |
|---|---|
| D1 | Route: `/employer/dashboard`, `/admin/dashboard`. Biểu đồ vẽ SVG/CSS thuần, không thêm thư viện. |
| D2 | Thêm 4 bảng: `ApplicationStatusHistory`, `JobPostDailyStat`, `AuditLog`, `Interview`. |
| D3 | Thông báo chia hai luồng: **thông báo** (đã xảy ra, bảng `notifications`, phân nhóm bằng ánh xạ `type` → nhóm trong code) và **việc cần làm** (đang chờ xử lý, tính trực tiếp từ trạng thái hiện tại, không lưu). |
| D4 | `ApplicationStatusHistory` và `AuditLog` ghi từ giờ trở đi; hồ sơ cũ được backfill đúng một dòng lịch sử ban đầu. |
| D5 | Email (qua outbox có sẵn) chỉ cho lịch phỏng vấn và gói sắp hết hạn. Các loại khác chỉ hiển thị trong app. |
| D6 | Migration dùng **shadow DB riêng**, tuyệt đối không dùng `DATABASE_URL` làm shadow (đã xoá sạch Neon ngày 2026-09-28). |
| D7 | (2026-09-29) **Bỏ "Gia hạn tin"**, thay bằng nút "Xem tin". Không thêm API gia hạn (F4). |
| D8 | (2026-09-29) **Thêm** `CATALOG_ENTRY_SUGGESTED` và `PAYMENT_COMPLETED` cho Admin, không gửi email (F9). Trung tâm thông báo Admin giữ đủ các nhóm Tin tuyển dụng / Công ty / Danh mục / Thanh toán. |
| D9 | (2026-09-29) **Thêm** `INTERVIEW_REMINDER` (nhắc lịch phỏng vấn trước một ngày, cho cả hai bên) ở giai đoạn Interview. Là mục cuối cùng của giai đoạn, cắt được mà không ảnh hưởng phần còn lại. |
| D10 | (2026-09-29) Nút 7/30/90 ngày **chỉ đổi các biểu đồ theo chuỗi thời gian**: Employer gồm "Hồ sơ ứng tuyển theo ngày" (và bản "Lượt xem") cùng "Phễu tuyển dụng"; Admin gồm "Người dùng mới theo ngày". "Doanh thu theo tuần" (luôn là tháng hiện tại) và "Người dùng theo vai trò" (số tổng hiện tại) không đổi theo nút. Thẻ KPI có kỳ cố định, ghi trong nhãn. |
| D11 | (2026-09-29) Doanh thu tính `SUM(amount)` của `Payment` có `status = COMPLETED`, nhóm theo `updatedAt` (giờ Việt Nam). **Không thêm** cột `paidAt` (F6). |
| D12 | (2026-09-29) **Lên lịch phỏng vấn hàng loạt**: chọn nhiều hồ sơ rồi đặt lịch một lần, hai kiểu "chia khung giờ liên tiếp" và "cùng một giờ" (phỏng vấn nhóm). **Tất cả hoặc không**: một hồ sơ không hợp lệ thì không tạo lịch nào và trả danh sách lỗi theo từng hồ sơ. Tối đa **20** hồ sơ mỗi lần. Trùng giờ với lịch khác của người đặt chỉ **cảnh báo** (giao diện tự tính), không chặn. Mỗi ứng viên vẫn là một dòng `Interview` riêng. |
| D13 | (2026-09-29) Thêm cột `Company.verificationSubmittedAt` (gộp vào M2) làm mốc chờ của công ty chờ xác minh, thay cho `updatedAt` vốn bị đổi khi đổi logo/banner hoặc Admin bật/tắt `requiresApproval` (F12). |
| D14 | (2026-09-30) Dashboard Admin chuyển sang **bản D** ("bàn duyệt", xem plan frontend). Backend bổ sung sáu điểm dữ liệu ở mục "Bước 6 — Dữ liệu cho dashboard Admin bản D". **Không migration.** Người làm trong "Hoạt động gần đây" hiện bằng **email** (tài khoản Admin không có trường tên, không thêm). |

## Phát hiện khi đọc code (thay đổi phạm vi so với bản nháp)

| # | Phát hiện | Hệ quả cho plan |
|---|---|---|
| F1 | Employer chỉ có API liệt kê hồ sơ **theo từng tin** (`GET /employer/job-posts/:jobId/applications`), chưa có danh sách toàn công ty. | Endpoint `tasks` của dashboard tự truy vấn hồ sơ toàn công ty. Thao tác vẫn gọi `PATCH /employer/applications/:id/status` có sẵn. |
| F2 | State machine trong `applications.service.ts`: `PENDING → REVIEWING/REJECTED`, `REVIEWING → SHORTLISTED/REJECTED`, `SHORTLISTED → INTERVIEWING/REJECTED`, `INTERVIEWING → ACCEPTED/REJECTED`. | Hàng hồ sơ chờ chỉ có **Xem xét** và **Từ chối**. "Mời phỏng vấn / đặt lịch" chỉ áp dụng cho hồ sơ `SHORTLISTED`, nên dashboard có thêm nhóm "Hồ sơ chờ đặt lịch" (giai đoạn Interview). Không đổi state machine. |
| F3 | `createApplication`, `cancelApplication` không nằm trong transaction, không ghi lịch sử, và **không báo cho Employer** khi có hồ sơ mới. | Bọc transaction, ghi history, thêm thông báo `APPLICATION_RECEIVED` cho mọi employer của công ty. |
| F4 | Không có API gia hạn tin (`updateDraft` chỉ sửa được tin `DRAFT`; hết hạn do cron `job-post-expiry`). | Nút "Gia hạn tin" trong mock **bị bỏ**, thay bằng "Xem tin" (**D7 — đã chốt**). Nếu sau này muốn gia hạn thật thì thêm `POST /employer/job-posts/:id/extend`, ngoài phạm vi plan này. |
| F5 | Hạn mức lời mời là **theo ngày** (`outreachInvitationDailyQuota` của gói; `TRIAL` dùng `DEFAULT_OUTREACH_DAILY_QUOTA`; `BLOCKED` ⇒ 403). `resolveDailyQuota` đang `private`. | KPI đổi tên "Lời mời còn lại hôm nay". Tách `getDailyQuotaStatus(employer)` thành method public của `CandidateOutreachService`, dashboard gọi qua đó. `BLOCKED` ⇒ ẩn phần đo, ghi "Cần gói còn hiệu lực". |
| F6 | `Payment` không có `paidAt`. `PaymentsService` gọi `updateStatus(paymentId, "COMPLETED")` đúng một lần. | Doanh thu tính `SUM(amount)` với `status = COMPLETED`, nhóm theo `updatedAt` (giờ Việt Nam) — **D11, đã chốt**, không thêm `paidAt`. Nếu ở bước 4 phát hiện `Payment` COMPLETED còn bị cập nhật lại về sau thì báo chủ dự án trước khi đổi. |
| F7 | Đã có `GET /employer/job-posts/stats` và `GET /admin/job-posts/stats` (đếm theo trạng thái). | Dashboard tái dùng `JobPostsService.ownStats` / `moderationStats`, không đếm lại. |
| F8 | `GET /notifications` không lọc theo loại; `unread-count` chỉ trả tổng. | Thêm tham số `group` và endpoint đếm chưa đọc theo nhóm. |
| F9 | Thông báo cho Admin chỉ có `COMPANY_LINK_REQUESTED`, `JOB_POST_SUBMITTED`. Không có loại cho "kỹ năng/trường/ngành được đề xuất" hay "thanh toán thành công". | Thêm `CATALOG_ENTRY_SUGGESTED` và `PAYMENT_COMPLETED` (cho Admin, không email) — **D8, đã chốt**. |
| F10 | `viewCount` chỉ tăng trong `JobPostsService.getPublicDetail` → `jobPostRepository.incrementViewCount`. | `JobPostDailyStat` được upsert đúng chỗ đó. |
| F11 | Cron quét hằng giờ; nếu gửi thông báo "sắp hết hạn" mỗi lượt quét sẽ lặp. | Thêm cột `Notification.dedupeKey` (unique, nullable) để mỗi đối tượng chỉ được báo một lần. |
| F12 | `Company.updatedAt` đổi cả khi công ty đang chờ xác minh mà chưa nộp lại (`EmployersService.updateCompanyBranding`, `CompaniesService.setRequiresApproval`), làm thời gian chờ về 0 và đẩy công ty xuống cuối hàng đợi. | D13: cột `verificationSubmittedAt`, ghi ở `createOrResubmitCompany`. |
| F13 | `PATCH /employer/applications/:id/status` vẫn cho chuyển `SHORTLISTED → INTERVIEWING` bằng tay (không đặt lịch), và state machine không cho quay lại `SHORTLISTED` sau khi huỷ lịch. | "Chờ đặt lịch" gồm cả hồ sơ `INTERVIEWING` chưa có lịch `SCHEDULED` nào; hồ sơ `INTERVIEWING` được đặt thêm lịch (vòng sau) khi không còn lịch sắp tới. Không đổi state machine. |

## Thay đổi cơ sở dữ liệu

Hai migration, chia theo giai đoạn để tách được `Interview` nếu cần thu gọn.

### Migration M1 (giai đoạn 1)

```prisma
model ApplicationStatusHistory {
  id            String             @id @default(cuid())
  applicationId String
  application   Application        @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  fromStatus    ApplicationStatus? // null = dòng khởi tạo (kể cả dòng backfill)
  toStatus      ApplicationStatus
  actorId       String?            // userId thực hiện; null = hệ thống / backfill
  createdAt     DateTime           @default(now())

  @@index([applicationId, createdAt])
  @@index([toStatus, createdAt])
  @@map("application_status_history")
}

model JobPostDailyStat {
  id        String   @id @default(cuid())
  jobPostId String
  jobPost   JobPost  @relation(fields: [jobPostId], references: [id], onDelete: Cascade)
  date      DateTime @db.Date // ngày theo Asia/Ho_Chi_Minh
  views     Int      @default(0)

  @@unique([jobPostId, date])
  @@index([date])
  @@map("job_post_daily_stats")
}

model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?  // null = hệ thống
  actorRole  Role?
  action     String   // hằng số trong audit-log.actions.ts, vd. "JOB_POST_APPROVED"
  entityType String   // "JobPost" | "Company" | "Skill" | "University" | "Major" | "Subscription"
  entityId   String
  summary    String   // câu tiếng Việt đã render lúc ghi (snapshot, giống Notification)
  metadata   Json?
  createdAt  DateTime @default(now())

  @@index([createdAt])
  @@index([entityType, entityId])
  @@map("audit_logs")
}
```

Thay đổi bảng/enum hiện có:

- `Notification`: thêm `dedupeKey String? @unique`; thêm `@@index([userId, createdAt])` và `@@index([userId, type, isRead])`.
- `NotificationType`: thêm `APPLICATION_RECEIVED`, `JOB_POST_EXPIRING`, `SUBSCRIPTION_EXPIRING`, `CATALOG_ENTRY_SUGGESTED`, `PAYMENT_COMPLETED`.
- Index cho truy vấn thống kê (kiểm tra index đang có trước để không trùng): `applications(jobPostId, status)`, `applications(status, createdAt)`, `job_posts(companyId, status)`, `job_posts(status, createdAt)`.
- Quan hệ ngược: `Application.statusHistory`, `JobPost.dailyStats`.

**Backfill (trong cùng file migration, SQL thuần):** với mỗi `applications` chưa có lịch sử, chèn một dòng `fromStatus = NULL`, `toStatus = status hiện tại`, `actorId = NULL`, `createdAt = applications.createdAt`, id sinh bằng `gen_random_uuid()::text`. Không dùng giá trị enum mới trong câu SQL này (PostgreSQL không cho dùng giá trị enum vừa `ADD VALUE` trong cùng transaction).

**Quy ước đọc dữ liệu cũ:** dòng `fromStatus IS NULL` không được tính vào chỉ số thời gian xử lý. Phễu tính "đã đạt bước X" theo hai nguồn: có dòng history với `toStatus = X`, **hoặc** trạng thái hiện tại nằm ở/sau bước X trên đường chính (`PENDING → REVIEWING → SHORTLISTED → INTERVIEWING → ACCEPTED`). Nhờ vậy hồ sơ cũ không làm phễu tụt bậc. Hồ sơ cũ bị `REJECTED` chỉ được tính ở bước "Ứng tuyển" vì không biết đã bị loại ở đâu; cần ghi chú trên giao diện.

### Migration M2 (giai đoạn 5 — Interview)

```prisma
enum InterviewMode   { ONLINE ONSITE }
enum InterviewStatus { SCHEDULED CANCELLED }

model Interview {
  id              String          @id @default(cuid())
  applicationId   String
  application     Application     @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  scheduledAt     DateTime
  durationMinutes Int             @default(45)
  mode            InterviewMode
  location        String?         // liên kết họp online hoặc địa chỉ
  note            String?
  status          InterviewStatus @default(SCHEDULED)
  cancelReason    String?
  createdById     String          // userId của employer đặt lịch
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([applicationId])
  @@index([status, scheduledAt])
  @@map("interviews")
}
```

Thêm vào `NotificationType`: `INTERVIEW_SCHEDULED`, `INTERVIEW_RESCHEDULED`, `INTERVIEW_CANCELLED`, `INTERVIEW_REMINDER`. "Đã diễn ra" suy ra từ thời gian, không lưu trạng thái `COMPLETED`. Quan hệ ngược `Application.interviews`.

(D13) `Company`: thêm `verificationSubmittedAt DateTime?`, là lần nộp hoặc nộp lại hồ sơ xác minh gần nhất. Thêm cột nullable không có giá trị mặc định nên PostgreSQL chỉ sửa metadata, không ghi lại bảng; không cần index (hàng đợi đã lọc theo `verificationStatus`). Backfill trong cùng migration, chỉ cho công ty `PENDING`: lấy `createdAt` của dòng `audit_logs` `COMPANY_SUBMITTED` mới nhất, không có thì lấy `updatedAt`.

### An toàn khi chạy migration

1. Tạo cơ sở dữ liệu **tạm** làm shadow (nhánh Neon riêng hoặc PostgreSQL cục bộ). Không dùng lại `DATABASE_URL`.
2. Trước mỗi lệnh `prisma migrate dev`, in ra hai URL và xác nhận hai giá trị **khác nhau**.
3. Chỉ dùng `--create-only` để sinh file, đọc lại SQL, rồi mới áp dụng lên shadow.
4. Áp dụng lên Neon thật bằng `db:deploy` **chỉ sau khi chủ dự án đồng ý**, và sao lưu/chụp nhánh Neon trước.

## Kiến trúc backend

### Module mới

| Module | Vai trò | Ghi chú |
|---|---|---|
| `audit-log` | `AuditLogService.record(entry, tx?)` và repository đọc theo trang. | Dịch vụ dùng chéo, đăng ký ở `*.routes.ts` giống `notificationsService`. Không thay thế `job_post_moderation_actions` (giữ nguyên). |
| `dashboard` | Truy vấn tổng hợp **chỉ đọc** cho Employer và Admin. | Không sở hữu tài nguyên nào nên không vi phạm quy tắc "không có module admin riêng" (`PROJECT_STRUCTURE.md` §5). Cần ghi thành **AD-16** trước khi code (bước 0). |

`dashboard` gồm `dashboard.repository.ts` (SQL tổng hợp, `$queryRaw` cho nhóm theo ngày giờ Việt Nam), `employer-dashboard.service.ts`, `admin-dashboard.service.ts`, controller, routes, DTO (`range`). Service chỉ **đọc** qua repository, và gọi service khác khi cần logic có sẵn: `JobPostsService` (đếm trạng thái), `CandidateOutreachService.getDailyQuotaStatus`, `SubscriptionsService.getCompanySubscriptionAccess`, `MessagingService.getUnreadSummary`.

### API mới

Mọi mốc thời gian nhóm theo ngày dùng `Asia/Ho_Chi_Minh`; chuỗi theo ngày được điền đủ ngày trống bằng 0 ở server. `range` ∈ `7 | 30 | 90`, mặc định 30, chỉ ảnh hưởng các chuỗi theo ngày và phễu (D10). Doanh thu theo tuần, người dùng theo vai trò và KPI không phụ thuộc `range`.

| Method | Path | Guard | Trả về |
|---|---|---|---|
| GET | `/employer/dashboard/overview` | EMPLOYER | Sáu KPI, số liệu cho dải tóm tắt, tỉ lệ chấp nhận lời mời 30 ngày. |
| GET | `/employer/dashboard/tasks` | EMPLOYER | Hồ sơ chờ xử lý (top 5 + tổng, kèm phân bố thời gian chờ), tin cần chú ý (sắp hết hạn ≤ 7 ngày hoặc bị từ chối), hồ sơ chờ đặt lịch (M2), lịch phỏng vấn sắp tới (M2). |
| GET | `/employer/dashboard/analytics?range=` | EMPLOYER | Hồ sơ theo ngày, lượt xem theo ngày, phễu, thời gian phản hồi đầu tiên trung bình. |
| GET | `/admin/dashboard/overview` | ADMIN | Hàng chờ (công ty, tin, danh mục) kèm phân bố thời gian chờ, người dùng mới 7 ngày so với 7 ngày trước, doanh thu tháng này/tháng trước, gói đang hoạt động (theo gói, số gói hết hạn ≤ 7 ngày). |
| GET | `/admin/dashboard/tasks` | ADMIN | Top 3–5 mỗi hàng chờ (tin, công ty, danh mục) kèm tổng. |
| GET | `/admin/dashboard/analytics?range=` | ADMIN | Người dùng mới theo ngày, doanh thu theo tuần của tháng hiện tại (khối 1–7, 8–14, 15–21, 22–hết), người dùng theo vai trò. |
| GET | `/admin/activity?cursor=&actor=` | ADMIN | Danh sách `AuditLog` mới nhất, phân trang cursor. `actor=admin` chỉ lấy thao tác của Admin (bước 6). |
| GET | `/notifications?group=` | mọi actor | Thêm tham số `group` cho endpoint có sẵn. |
| GET | `/notifications/unread-count/by-group` | mọi actor | `{ total, groups: { [group]: number } }`. |

Cụm API Interview (giai đoạn 5): `POST /employer/applications/:id/interviews`, `PATCH /employer/interviews/:id` (đổi lịch), `POST /employer/interviews/:id/cancel`, `GET /employer/interviews?from=&to=`, và phía ứng viên `GET /candidate/interviews`. Đặt lịch lần đầu cho hồ sơ `SHORTLISTED` chuyển hồ sơ sang `INTERVIEWING` trong cùng transaction (qua đường đổi trạng thái đã có, ghi history). Chi tiết ở mục "Giai đoạn 5 — Interview" bên dưới.

Kiểu trả về đặt trong `packages/shared-types` (tên dự kiến: `EmployerDashboardOverview`, `EmployerDashboardTasks`, `DashboardAnalytics`, `AdminDashboardOverview`, `AuditActivityItem`, `NotificationGroup`).

**Cách tính khi triển khai (bước 4).** Tên kiểu thực tế: `EmployerDashboardOverview`, `EmployerDashboardTasks`, `EmployerDashboardAnalytics`, `AdminDashboardOverview`, `AdminDashboardTasks`, `AdminDashboardAnalytics`, `AuditActivityItem`, cùng các kiểu phụ `DailyPoint`, `PeriodComparison`, `WaitBuckets`, `OutreachDailyQuotaStatus`.

- **"7 ngày"** là hôm nay và 6 ngày trước theo giờ Việt Nam; kỳ trước là 7 ngày liền trước đó. Cột `DateTime` lưu giờ UTC không múi giờ, nên SQL đổi `UTC → Asia/Ho_Chi_Minh` rồi mới lấy ngày.
- **Mốc bắt đầu chờ:**
  - Hồ sơ: `reappliedAt`, nếu không có thì `createdAt`.
  - Tin chờ duyệt: lần `SUBMITTED` gần nhất, nếu không có thì `updatedAt`.
  - Công ty `PENDING`: `verificationSubmittedAt` (D13, từ bước 5), nếu không có thì `updatedAt`.
  - Danh mục: `createdAt`.
- **Nhóm việc cần làm:** hồ sơ chờ xếp chờ lâu nhất trước. "Tin cần chú ý" gồm tin `PUBLISHED` hết hạn trong 7 ngày, rồi tới tin `DRAFT` có thao tác kiểm duyệt gần nhất là `REJECTED`.
- **Phễu:**
  - Tính hồ sơ nộp trong kỳ, không tính hồ sơ đã huỷ.
  - Bước đạt được là giá trị lớn hơn giữa hạng của trạng thái hiện tại và hạng lớn nhất trong lịch sử, nên số đếm luôn giảm dần theo bước, kể cả với hồ sơ chỉ có dòng backfill.
  - `legacyRejected` là số hồ sơ bị từ chối mà không có dòng lịch sử chi tiết. Giao diện dùng số này để ghi chú.
- **Thời gian phản hồi đầu tiên:** tính cho các dòng `PENDING → REVIEWING/REJECTED` xảy ra trong kỳ. Mốc bắt đầu là dòng gần nhất có `toStatus = PENDING`.
- **Tin nhắn:**
  - Số hội thoại chưa đọc lấy từ `MessagingService.getUnreadSummary`.
  - Ba hội thoại gần nhất lấy bằng SQL chỉ đọc trong `dashboard`, cùng điều kiện "chưa đọc" với `MessagingRepository`.
- **Lời mời:** `CandidateOutreachService.getDailyQuotaStatus` dùng chung phần tra hạn mức với `resolveDailyQuota`. Số lượt đã dùng hôm nay đọc bằng `CandidateOutreachRateLimitService.getUsedToday`, chỉ đọc Redis.
  - Công ty dùng thử đã chạm hạn mức 2 tin `PUBLISHED` sẽ là `BLOCKED`, theo luật sẵn có của `SubscriptionsService`.
- **Hàng chờ tin của Admin:** tổng và phân bố thời gian chờ đếm trong cùng một câu SQL của `dashboard`, không gọi `moderationStats`.
- **Người dùng và gói:**
  - "Người dùng mới" chỉ tính Ứng viên và Nhà tuyển dụng.
  - "Người dùng theo vai trò" tính đủ ba vai trò.
  - "Gói đang hoạt động" là gói `ACTIVE` có `endDate > now`, vì cron hạ gói chạy lệch.
- **D11 đã kiểm lại (F6):** `Payment` đã `COMPLETED` không bị cập nhật lại. IPN trùng bị chặn nhờ `providerTransactionId`, còn `reportClientCancellation` chỉ đổi `PENDING`. Vì vậy giữ nguyên cách nhóm theo `updatedAt`.
- **`GET /admin/activity`** do module `audit-log` phục vụ, nhận tham số `limit` (1–50, mặc định 20). Mỗi dòng kèm `actorEmail`, lấy qua `UserRepository.findEmailsByIds`.
- **Phần Interview** (hồ sơ chờ đặt lịch, lịch phỏng vấn sắp tới, KPI 4, ô "phỏng vấn sắp tới" của banner) được thêm ở bước 5, xem mục bên dưới.
- **Bổ sung cho dashboard Employer (2026-09-30, đã làm):** `DashboardPendingApplication.universityName`, `DashboardAttentionJob.applicationCount`, `EmployerDashboardOverview.messages.unreadCandidates`. Chi tiết ở plan frontend, ghi chú FE-2.

### Bước 6 — Dữ liệu cho dashboard Admin bản D (D14)

Sáu điểm, đều là đổi hợp đồng API hoặc template, **không migration**. Số thứ tự khớp nhãn 1 – 6 trong mock `docs/temp/ui-compare/admin-d-ban-duyet.html` (nút "Chỗ cần bổ sung API").

| # | Chỗ hiển thị trong bản D | Thay đổi | Nguồn dữ liệu |
|---|---|---|---|
| 1 | Dòng tóm tắt "Hàng chờ" và ô "Chờ lâu nhất" của ba thẻ hàng chờ | `AdminDashboardOverview.queues.{companies,jobPosts,catalog}.oldestSince: string \| null` (ISO) | `MIN(mốc chờ)` thêm vào ba câu SQL tóm tắt có sẵn (`companyQueueSummary`, `jobPostQueueSummary`, `catalogQueueSummary`), cùng mốc chờ đã quy ước ở trên. |
| 2 | Thanh chia nhóm của thẻ "Tin chờ duyệt": Dưới 6 giờ / 6 – 24 giờ / Trên 24 giờ | `queues.jobPosts.wait` đổi sang kiểu mới `JobPostWaitBuckets { under6h, sixTo24h, over24h }`. Công ty và danh mục giữ `WaitBuckets` (Dưới 24 giờ / 1 – 2 ngày / Trên 2 ngày). | Thêm hàm cột nhóm thứ hai bên cạnh `waitBucketColumns`. Lý do: tin được duyệt trong ngày, nhóm "Dưới 24 giờ" chứa gần như toàn bộ nên không cho thông tin. |
| 3 | Dòng phụ của hàng danh mục: "Đề xuất bởi Lạc Việt Tech (Nhà tuyển dụng)" | `AdminDashboardTasks.catalog.items[].suggestedBy: { name: string \| null; role: Role } \| null` | `createdByUserId` của `skills` / `universities` / `majors` (đã có). Tên: ứng viên lấy `Candidate.fullName`; nhà tuyển dụng lấy tên công ty của `Employer`; Admin để `name = null` (giao diện ghi "Quản trị viên"). `null` khi không có người tạo. |
| 4 | "Hoạt động gần đây": nút lọc "Quản trị viên / Tất cả" và khung lý do | `GET /admin/activity` nhận thêm `actor=admin\|all` (mặc định `all` để trang khác không đổi hành vi; dashboard gửi `admin`). `AuditActivityItem.reason: string \| null` | Lọc `actorRole = 'ADMIN'`. `reason` đọc từ `metadata.reason` (đã ghi sẵn cho từ chối tin, gỡ tin, từ chối công ty); dạng khác trả `null`. Không đổi `summary` đã lưu. |
| 5 | Nút "Xem công ty" của thông báo thanh toán | Payload `PAYMENT_COMPLETED` thêm `companyId`; `link` đổi từ `/admin/dashboard` sang `/admin/companies/{companyId}` | `PaymentsService.recordCompletedPayment` đã biết công ty. Chưa có trang giao dịch cho Admin nên không trỏ tới giao dịch. |
| 6 | Nội dung thông báo danh mục: "Lạc Việt Tech đề xuất kỹ năng “Figma Prototyping”." | Payload `CATALOG_ENTRY_SUGGESTED` thêm `suggestedByName: string \| null`; template dùng tên đó, không có thì giữ "Một người dùng" | `CatalogSuggestionNotifier.notifyAdmins` nhận thêm `userId` (hai nơi gọi đều có sẵn), tra tên theo cùng quy tắc ở mục 3. |

Lưu ý:
- Thông báo là bản chụp lúc tạo, nên mục 5 và 6 chỉ áp dụng cho thông báo mới; thông báo cũ trong DB giữ nội dung và liên kết cũ.
- Câu chữ các loại thông báo khác **giữ nguyên** (không sửa cho giống mock bản C).
- Kiểm chứng: `tsc` server và web; test đơn vị cho `AdminDashboardService` (bản giả repository, như `employer-dashboard-service.test.ts`) và cho `AuditLogService.listActivity` (lọc + `reason`); chạy SQL chỉ đọc trên DB thật để so số `oldestSince` và nhóm thời gian chờ với đếm trực tiếp.

Cách làm khi triển khai (2026-09-30):

- Tham số là chữ thường `actor=admin|all` (kiểu `ActivityActorFilter`). Người đề xuất có kiểu `CatalogSuggester`.
- Mục 3 và 6 dùng chung `UserRepository.findCatalogSuggesters(ids)`, nên quy tắc đặt tên chỉ nằm một chỗ. Họ tên rỗng được coi là `null`.
- Hàng chờ danh mục chỉ lấy thêm `createdByUserId` bằng SQL. Tên được tra một lần cho mọi người đề xuất khác nhau trong 5 mục.
- Test: `tests/unit/admin-dashboard-service.test.ts` và `tests/unit/audit-log-activity.test.ts`.

### Giai đoạn 5 — Interview (chi tiết, chốt 2026-09-29)

Module mới `interviews` sở hữu bảng `interviews` (repository, service, controller, routes, DTO, cron nhắc lịch). Mọi thao tác theo phạm vi **công ty**: employer nào của công ty cũng đặt, đổi, huỷ được lịch của hồ sơ thuộc tin của công ty; `createdById` ghi người đặt.

**Điều kiện đặt lịch cho một hồ sơ:**

- Hồ sơ thuộc tin của công ty; nếu không thì coi như không tồn tại (404, hoặc lỗi `NOT_FOUND` trong lô).
- Trạng thái `SHORTLISTED`, hoặc `INTERVIEWING` (F13, vòng sau hoặc đặt lại sau khi huỷ). Trạng thái khác: lỗi `INVALID_STATUS`.
- Chưa có lịch `SCHEDULED` nào sắp diễn ra (`scheduledAt > now`); có rồi thì phải đổi lịch đó: lỗi `ALREADY_SCHEDULED`.
- `scheduledAt` ở tương lai và không quá 180 ngày; `durationMinutes` 15–240 (mặc định 45); `location` bắt buộc (liên kết họp hoặc địa chỉ, giao diện điền sẵn địa chỉ công ty); `note` tuỳ chọn, là ghi chú **gửi cho ứng viên**.

**Ghi dữ liệu:** trong một transaction, khoá các dòng `applications` liên quan bằng `SELECT … FOR UPDATE` rồi mới kiểm tra điều kiện (hai employer đặt cùng lúc không tạo trùng lịch). Hồ sơ `SHORTLISTED` chuyển sang `INTERVIEWING` và ghi `ApplicationStatusHistory` (actor là người đặt). Ứng viên nhận **một** thông báo `INTERVIEW_SCHEDULED` kèm email; **không** gửi thêm `APPLICATION_STATUS_CHANGED` cho lần chuyển trạng thái này để khỏi thành hai email cho một việc.

**Hàng loạt (D12)** — `POST /employer/interviews/batch`:

- Body: `applicationIds` (1–20, không trùng, **thứ tự là thứ tự xếp giờ**), `arrangement` (`SEQUENTIAL` hoặc `GROUP`), `startAt`, `durationMinutes`, `gapMinutes` (0–120, chỉ dùng với `SEQUENTIAL`), `mode`, `location`, `note`.
- Giờ của hồ sơ thứ i: `SEQUENTIAL` là `startAt + i × (durationMinutes + gapMinutes)`; `GROUP` là `startAt` cho tất cả.
- Tất cả hoặc không: kiểm tra mọi hồ sơ trước; có lỗi thì trả **409** `{ success: false, error, data: { failures: [{ applicationId, reason }] } }` (`reason` ∈ `NOT_FOUND`, `INVALID_STATUS`, `ALREADY_SCHEDULED`) và không ghi gì. Thành công trả 201 với danh sách lịch vừa tạo theo đúng thứ tự gửi lên.
- Mỗi ứng viên nhận thông báo và email riêng, không chứa tên ứng viên khác (kể cả kiểu `GROUP`).

**Đổi lịch** — `PATCH /employer/interviews/:id`: chỉ lịch `SCHEDULED` chưa diễn ra, của hồ sơ đang `INTERVIEWING`. Nhận một phần các trường `scheduledAt`, `durationMinutes`, `mode`, `location`, `note` (giờ mới phải ở tương lai). Có thay đổi thì gửi `INTERVIEW_RESCHEDULED` kèm email (nội dung có giờ cũ và giờ mới); không có gì đổi thì trả nguyên trạng, không gửi.

**Huỷ** — `POST /employer/interviews/:id/cancel` với `reason` (bắt buộc, 1–500 ký tự): chỉ lịch `SCHEDULED` chưa diễn ra. Ghi `CANCELLED` + `cancelReason`, gửi `INTERVIEW_CANCELLED` kèm email. Hồ sơ giữ `INTERVIEWING` và quay lại nhóm "chờ đặt lịch".

**Khi hồ sơ có kết quả:** `ApplicationsService.updateApplicationStatus` chuyển hồ sơ sang `REJECTED` hoặc `ACCEPTED` thì trong cùng transaction huỷ các lịch `SCHEDULED` chưa diễn ra của hồ sơ đó (`cancelReason` = "Hồ sơ đã có kết quả"), **không** gửi `INTERVIEW_CANCELLED` vì ứng viên đã nhận `APPLICATION_STATUS_CHANGED`.

**Đọc:**

- `GET /employer/interviews?from=&to=&includeCancelled=` — lịch của cả công ty có `scheduledAt` trong `[from, to)`, sớm nhất trước. Mặc định từ đầu ngày hôm nay (giờ Việt Nam) tới 30 ngày sau; khoảng tối đa 92 ngày; mặc định bỏ lịch đã huỷ. Mỗi dòng có `createdById` để giao diện tự tính **cảnh báo trùng giờ** với lịch của chính người đặt (D12).
- `GET /employer/interviews/awaiting?jobPostId=` — hồ sơ **chờ đặt lịch**: `SHORTLISTED`, hoặc `INTERVIEWING` chưa có lịch `SCHEDULED` nào. Mốc chờ là lần vào trạng thái hiện tại (dòng history mới nhất có `toStatus` bằng trạng thái đó, không có thì `updatedAt`), chờ lâu nhất trước, tối đa 100 dòng. Dùng cho danh sách chọn nhiều.
- `GET /candidate/interviews` — mọi lịch (kể cả đã huỷ) của hồ sơ thuộc ứng viên, sớm nhất trước, tối đa 100.

**Dashboard (mở rộng kiểu của bước 4):**

- `overview.interviews`: số lịch `SCHEDULED` của hồ sơ `INTERVIEWING` theo từng ngày trong 7 ngày kể từ hôm nay (giờ Việt Nam, `DailyPoint[]`, dùng cho `DayColumns`), tổng 7 ngày (ô "phỏng vấn sắp tới" của banner) và buổi gần nhất.
- `tasks.awaitingSchedule` (tổng + 5 dòng) và `tasks.upcomingInterviews` (tổng lịch chưa diễn ra trong 7 ngày tới + 5 dòng gần nhất), lấy qua `InterviewsService` (module chủ).

**Thông báo:** `INTERVIEW_SCHEDULED`, `INTERVIEW_RESCHEDULED`, `INTERVIEW_CANCELLED` chỉ gửi ứng viên, có email. Giờ trong nội dung ghi theo giờ Việt Nam (`dd/mm/yyyy HH:mm`). Liên kết: ứng viên tới `/applications`, employer tới `/employer/applications/:id`. Cả bốn loại thuộc nhóm `INTERVIEWS`; Candidate có thêm nhóm này.

**Cron nhắc lịch (D9, làm sau cùng):** `interview-reminder.job.ts`, 08:00 giờ Việt Nam hằng ngày. Lấy lịch `SCHEDULED` của hồ sơ `INTERVIEWING` có ngày (giờ Việt Nam) là ngày mai; gửi `INTERVIEW_REMINDER` cho ứng viên (có email) và employer đặt lịch (`email: null`). `dedupeKey = INTERVIEW_REMINDER:{interviewId}:{userId}:{scheduledAt epoch ms}`: kèm giờ hẹn để lịch bị dời sang ngày khác sau khi đã nhắc vẫn được nhắc lại cho giờ mới.

### Thao tác tại chỗ — API sẵn có được tái dùng

| Thao tác | API có sẵn |
|---|---|
| Xem xét / từ chối hồ sơ | `PATCH /employer/applications/:id/status` |
| Đóng tin, gửi duyệt tin | `POST /employer/job-posts/:id/close`, `/submit` |
| Duyệt / từ chối / gỡ tin (Admin) | `POST /admin/job-posts/:id/approve`, `/reject` (lý do bắt buộc), `/retract` |
| Xác minh / từ chối công ty | `POST /companies/:id/verify`, `/reject` (lý do bắt buộc) |
| Duyệt / từ chối kỹ năng, trường, ngành | `POST /admin/skills/:id/approve`, `/reject`; `POST /admin/{universities,majors}/:id/approve`, `/reject` |
| Đánh dấu đã đọc | `PATCH /notifications/:id/read`, `/notifications/read-all` |

### Điểm ghi dữ liệu (write hooks)

| Vị trí | Việc thêm |
|---|---|
| `ApplicationsService.createApplication` (tạo mới và ứng tuyển lại) | Bọc transaction; ghi history (`null → PENDING` hoặc `CANCELLED → PENDING`); `notifyMany(APPLICATION_RECEIVED)` cho employer của công ty. |
| `ApplicationsService.cancelApplication` | Bọc transaction; history `PENDING → CANCELLED`. |
| `ApplicationsService.updateApplicationStatus` | Ghi history kèm `actorId` trong transaction đã có. |
| `JobPostsService.getPublicDetail` | Upsert `JobPostDailyStat` cùng chỗ tăng `viewCount` (`INSERT ... ON CONFLICT (jobPostId, date) DO UPDATE SET views = views + 1`). |
| `JobPostsService.submit/approve/reject/retract` | `AuditLogService.record`. |
| `CompaniesService.verify/reject/setRequiresApproval`, `EmployersService.createOrResubmitCompany` | `AuditLogService.record`. |
| Duyệt / từ chối / gộp kỹ năng, trường, ngành | `AuditLogService.record`. |
| Đề xuất kỹ năng / trường / ngành mới | `notifyMany(CATALOG_ENTRY_SUGGESTED)` cho Admin (không email). |
| `PaymentsService` khi thanh toán `COMPLETED` | `AuditLogService.record` và `notifyMany(PAYMENT_COMPLETED)` cho Admin (không email). |

Cách ghi khi triển khai (bước 2): tin, công ty, hồ sơ ứng tuyển ghi nhật ký/lịch sử **trong cùng transaction** với thao tác. Danh mục (repository tự mở transaction riêng), đề xuất danh mục và thanh toán (luồng vốn không có transaction) ghi **sau khi thao tác đã commit**, lỗi chỉ được log (`AuditLogService.record` không có `tx`, `CatalogSuggestionNotifier`, `PaymentsService.recordCompletedPayment`). Chỉ thao tác của Admin với danh mục được ghi nhật ký; gộp tự động do cron Gemini không ghi. `CATALOG_ENTRY_SUGGESTED` gửi ngay khi mục PENDING được tạo, kể cả mục vùng xám mà cron có thể tự gộp sau đó.

### Thông báo

- `notification-groups.ts`: ánh xạ `NotificationType → nhóm` theo vai trò.
  - Employer: **Hồ sơ** (`APPLICATION_RECEIVED`), **Tin tuyển dụng** (`JOB_POST_APPROVED/REJECTED/TAKEN_DOWN/EXPIRING`), **Công ty** (`COMPANY_VERIFIED/REJECTED`), **Lời mời** (`CANDIDATE_OUTREACH_INVITATION_RESPONDED`), **Lịch phỏng vấn** (`INTERVIEW_*`, M2), **Gói dịch vụ** (`SUBSCRIPTION_EXPIRING`).
  - Admin: **Tin tuyển dụng** (`JOB_POST_SUBMITTED`), **Công ty** (`COMPANY_LINK_REQUESTED`), **Danh mục** (`CATALOG_ENTRY_SUGGESTED`), **Thanh toán** (`PAYMENT_COMPLETED`).
  - Candidate giữ nguyên (thêm `INTERVIEW_*`).
- Bổ sung `NotificationPayloadMap` và `templates` cho mọi loại mới (hai file này ép đủ khoá bằng `AssertSameKeys`, thiếu là lỗi biên dịch). Email chỉ cho `SUBSCRIPTION_EXPIRING` và `INTERVIEW_*`; `APPLICATION_RECEIVED`, `JOB_POST_EXPIRING`, `CATALOG_ENTRY_SUGGESTED`, `PAYMENT_COMPLETED` đặt `email: null`. `INTERVIEW_REMINDER` có hai payload/khung: gửi email cho ứng viên, `email: null` cho employer (template nhận thêm `recipientRole` trong payload).
- Cron mới, theo mẫu `job-post-expiry.job.ts`, chạy 08:00 hằng ngày múi giờ `Asia/Ho_Chi_Minh`:
  - `job-post-expiring-notice.job.ts`: tin `PUBLISHED` có `expiresAt` trong 3 ngày tới ⇒ `JOB_POST_EXPIRING` cho mọi employer của công ty, `dedupeKey = JOB_POST_EXPIRING:{jobPostId}:{userId}`.
  - `subscription-expiring-notice.job.ts`: gói `ACTIVE` có `endDate` trong 7 ngày tới ⇒ `SUBSCRIPTION_EXPIRING` cho **company admin** (người duy nhất được mua/gia hạn gói), `dedupeKey = SUBSCRIPTION_EXPIRING:{subscriptionId}:{userId}`.
  - Khoá kèm `userId` vì mỗi người nhận là một dòng `notifications` mà cột `dedupeKey` là unique (bản nháp ghi thiếu, đã sửa khi làm bước 3).
  - Mỗi người nhận xử lý trong transaction riêng (`NotificationsService.notifyOnce`): kiểm tra khoá trước, gặp vi phạm unique của `dedupeKey` (hai tiến trình chạy trùng) thì bỏ qua.
  - Nhóm `INTERVIEWS` đã có sẵn trong danh sách nhóm của Employer (số đếm = 0) để tab "Lịch phỏng vấn" hiển thị; các loại `INTERVIEW_*` gắn vào nhóm này ở bước 5.
  - (M2, D9) `interview-reminder.job.ts`: `INTERVIEW_REMINDER` cho lịch `SCHEDULED` trong ngày hôm sau, gửi cả employer đặt lịch lẫn ứng viên, `dedupeKey = INTERVIEW_REMINDER:{interviewId}:{userId}:{scheduledAt epoch ms}` (kèm giờ hẹn, xem mục Giai đoạn 5). Email chỉ gửi cho ứng viên. Làm sau cùng trong bước 5.

## Các bước thực hiện

| Bước | Nội dung | Điều kiện xong |
|---|---|---|
| 0 ✅ | Chủ dự án duyệt plan. Ghi **AD-16** vào `ARCHITECTURE_DECISIONS.md` (module `dashboard` chỉ đọc; `audit-log`; `dedupeKey`; quy ước phễu). Cập nhật `PROJECT_STRUCTURE.md` §5. | Hai tài liệu đã cập nhật. |
| 1 ✅ | **Schema M1**: viết Prisma, sinh migration bằng `--create-only` trên shadow DB tạm, đọc lại SQL, chạy thử trên nhánh Neon tạm, rồi mới áp lên Neon thật khi được đồng ý. | `prisma validate`, `tsc` sạch; backfill cho ra đúng một dòng/hồ sơ. |
| 2 ✅ | **Write hooks**: history (3 chỗ), `JobPostDailyStat`, `AuditLogService` + gắn vào các service ở bảng trên, `APPLICATION_RECEIVED`. | Luồng ứng tuyển, đổi trạng thái, duyệt tin cũ vẫn chạy; bản ghi mới xuất hiện đúng. |
| 3 ✅ | **Thông báo**: nhóm, tham số `group`, đếm theo nhóm, loại mới + template, `dedupeKey`, hai cron. | `tsc` sạch (AssertSameKeys); chạy cron thử hai lần chỉ sinh một thông báo. |
| 4 ✅ | **Module dashboard**: repository (SQL tổng hợp), hai service, controller, routes, kiểu trong `shared-types`, `CandidateOutreachService.getDailyQuotaStatus`. | Ba endpoint mỗi bên trả đúng số trên dữ liệu seed; kiểm tra tay bằng script so khớp với đếm trực tiếp. |
| 5 ✅ | **Interview (M2)**: migration (kèm `Company.verificationSubmittedAt`, D13), module `interviews`, thông báo `INTERVIEW_*` + email, mở rộng `tasks`/`overview`. Thứ tự: đặt/đổi/huỷ từng hồ sơ → lên lịch hàng loạt (D12) → cron nhắc lịch `INTERVIEW_REMINDER` (D9). Hai phần sau cắt được mà không ảnh hưởng phần trước. Cả bước tách được, có thể dời sang sau. | Đặt/đổi/huỷ lịch chạy đúng; hồ sơ tự sang `INTERVIEWING`; ứng viên nhận thông báo; lô có một hồ sơ lỗi thì không tạo lịch nào; cron nhắc lịch chạy hai lần chỉ sinh một thông báo mỗi người. |
| 6 ✅ | **Dữ liệu cho dashboard Admin bản D (D14)**: sáu điểm ở mục "Bước 6" (mốc chờ lâu nhất, nhóm thời gian chờ của tin, người đề xuất danh mục, lọc hoạt động + lý do, liên kết thông báo thanh toán, tên người đề xuất trong thông báo danh mục). Làm trước FE-4. | `tsc` sạch; test đơn vị mới pass; SQL chỉ đọc trên DB thật khớp đếm trực tiếp; `/admin/activity` không truyền `actor` vẫn trả như cũ. |

Repo chưa có test runner (`npm test` đang là placeholder). Kiểm chứng bằng `tsc`, script đối chiếu số liệu (viết trong `apps/server/scripts/`, chạy thủ công), và thử luồng trên trình duyệt. Thêm test runner là thay đổi dependency, phải hỏi riêng nếu muốn.

## Rủi ro và cách xử lý

| Rủi ro | Cách xử lý |
|---|---|
| Truy vấn tổng hợp chậm khi dữ liệu lớn | Index ở M1; đếm bằng `FILTER`/`COUNT` một lượt; nếu vẫn chậm thêm cache trong bộ nhớ 30 giây theo `companyId`/toàn hệ thống. |
| Số liệu cũ trước M1 không có history | Quy ước đọc dữ liệu cũ ở trên; ghi chú trên giao diện phễu. |
| Thêm giá trị enum trong Postgres | Không dùng giá trị mới trong cùng migration; kiểm tra file SQL. |
| `getPublicDetail` tăng tải ghi (mỗi lượt xem một upsert) | Chấp nhận với quy mô khoá luận; nếu cần, gom theo lô hoặc bỏ qua khi người xem là chủ tin. |
| Quá nhiều thông báo `APPLICATION_RECEIVED` cho công ty lớn | Chỉ trong app, không email; nhóm "Hồ sơ" có nút đánh dấu đã đọc theo nhóm (frontend). |

## Ngoài phạm vi

Trang "Người dùng" và "Báo cáo" của Admin; gia hạn tin (D7); cột `paidAt` (D11); thêm thư viện biểu đồ; test runner.

## Ghi chú của chủ dự án

<!-- Để trống — dành cho chủ dự án ghi thêm trong lúc triển khai. -->
