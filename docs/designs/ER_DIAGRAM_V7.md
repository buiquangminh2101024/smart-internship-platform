# ER Diagram V7

Đi kèm `CLASS_DIAGRAM_V7.md`. Nguồn sự thật vẫn là `apps/server/prisma/schema.prisma`; ERD này chỉ vẽ phần bảng ứng với các lớp của sơ đồ lớp V7.

Vẽ trong Visual Paradigm (project `tot_nghiep.vpp`, cơ sở dữ liệu cấu hình PostgreSQL), gồm 5 sơ đồ:

| Sơ đồ | Bảng (đầy đủ cột) | Bảng nhóm khác (chỉ tên) |
|---|---|---|
| ERD V7 - Tong quan | Cả 28 bảng, đầy đủ cột | |
| ERD V7 - 1. Tai khoan va Ho so ung vien | `users`, `candidates`, `educations`, `cvs`, `skills`, `candidate_skills`, `candidate_profile_insights`, `universities`, `majors`, `cities` | `employers` |
| ERD V7 - 2. Doanh nghiep va Goi dich vu | `employers`, `companies`, `industries`, `subscription_plans`, `company_subscriptions`, `payments`, `transactions`, `payment_methods` | `users`, `cities` |
| ERD V7 - 3. Tuyen dung | `job_posts`, `job_post_skills`, `applications`, `interviews`, `saved_jobs` | `companies`, `employers`, `cities`, `skills`, `candidates`, `cvs`, `candidate_outreach_invitations` |
| ERD V7 - 4. Goi y va Lien lac | `job_candidate_match_scores`, `candidate_outreach_invitations`, `conversations`, `messages`, `notifications` | `candidates`, `job_posts`, `employers`, `companies`, `applications`, `users` |

Ảnh xuất ở `co_so_ly_thuyet/er diagram/V7 - *.jpg`.

## 1. Lớp → bảng

| Lớp (V7) | Bảng |
|---|---|
| `User` + `Candidate`, `Employer`, `Admin` | `users` (có cột `role`), `candidates`, `employers`. `candidates.userId`, `employers.userId` là FK duy nhất → quan hệ 1–0..1. `Admin` không có thuộc tính riêng nên không có bảng |
| `Education`, `Cv`, `Skill`, `CandidateProfileInsight` | `educations`, `cvs`, `skills`, `candidate_profile_insights` (khoá chính là `candidateId`) |
| `CandidateSkill`, `JobPostSkill`, `MatchScore` | `candidate_skills`, `job_post_skills`, `job_candidate_match_scores` — khoá chính kép từ hai FK |
| `Company`, `SubscriptionPlan`, `CompanySubscription` | `companies`, `subscription_plans`, `company_subscriptions` |
| `Payment` | `payments` + `transactions` (mỗi lần gọi cổng thanh toán) + `payment_methods` (VNPay/MoMo) |
| `JobPost`, `Application`, `Interview` | `job_posts`, `applications`, `interviews` |
| Association "lưu tin" `Candidate`–`JobPost` | `saved_jobs` |
| `OutreachInvitation` | `candidate_outreach_invitations`; `applications.invitationId` (duy nhất, có thể rỗng) ghi đơn được tạo từ lời mời |
| `Conversation`, `Message`, `Notification` | `conversations`, `messages`, `notifications` |
| Thuộc tính `city`, `industry`, `university`, `major` | Bảng danh mục `cities`, `industries`, `universities`, `majors` + FK |

Thuộc tính dẫn suất không lưu (`retractionCount`, `remainingQuota`, `acceptedCount`, `endsAt`…) không có cột. `companies.isVerified` là dẫn suất nhưng lưu sẵn nên vẫn có cột.

Bảng có trong schema nhưng không vẽ: nhật ký và vận hành (`audit_logs`, `audit_logs_archive`, `audit_log_hourly_stats`, `outbox_events`, `payment_callback_logs`, `job_post_moderation_actions`, `application_status_history`, `job_post_daily_stats`), vector (`candidate_embeddings`, `job_post_embeddings`), alias danh mục (`skill_aliases`, `university_aliases`, `major_aliases`), phần hồ sơ phụ (`work_experiences`, `projects`, `certificates`, `awards`), và `company_types`, `job_post_majors`, `job_alerts`, `job_reports`. Cột chỉ phục vụ kỹ thuật (`skills.embedding`, cấu hình auto-outreach chi tiết, `builderData`, `extractedData`…) cũng không vẽ.

## 2. Kiểu thay thế

Visual Paradigm không có kiểu enum, `jsonb` và `vector` cho PostgreSQL, nên các cột sau được vẽ bằng kiểu khác:

| Cột | Kiểu trên hình | Kiểu thật |
|---|---|---|
| `users.role` | `varchar` | enum `Role` (CANDIDATE, EMPLOYER, ADMIN) |
| `users.status` | `varchar` | enum `UserStatus` |
| `candidates.gender` | `varchar` | enum `Gender` |
| `cvs.extractionStatus` | `varchar` | enum `CvExtractionStatus` |
| `skills.status` | `varchar` | enum `CatalogEntryStatus` |
| `companies.verificationStatus` | `varchar` | enum `CompanyVerificationStatus` |
| `company_subscriptions.status` | `varchar` | enum `SubscriptionStatus` |
| `payments.status` | `varchar` | enum `PaymentStatus` |
| `transactions.status` | `varchar` | enum `TransactionStatus` |
| `payment_methods.processorType` | `varchar` | enum `PaymentProvider` |
| `job_posts.jobType`, `job_posts.status` | `varchar` | enum `JobPostType`, `JobPostStatus` |
| `job_post_skills.importance` | `varchar` | enum `SkillImportance` |
| `applications.status` | `varchar` | enum `ApplicationStatus` |
| `interviews.mode`, `interviews.status` | `varchar` | enum `InterviewMode`, `InterviewStatus` |
| `candidate_outreach_invitations.status`, `.source` | `varchar` | enum `OutreachInvitationStatus`, `OutreachInvitationSource` |
| `notifications.type` | `varchar` | enum `NotificationType` |
| `candidate_profile_insights.strengths`, `.suggestions` | `text` | `jsonb` (mảng chuỗi) |

Giá trị của từng enum xem hình "Các kiểu liệt kê" trong phần sơ đồ lớp. Các kiểu khác khớp schema: `String` → `varchar`/`text`, `Int` → `int4`, `Float` → `float8`, `Boolean` → `bool`, `DateTime` → `timestamp`. Khoá chính `id` là chuỗi cuid nên dùng `varchar`.

## 3. Ràng buộc không thấy trên hình

- Duy nhất theo cặp: `applications(jobPostId, candidateId)` — mỗi ứng viên nộp một đơn cho một tin; `saved_jobs(candidateId, jobPostId)`; `conversations(candidateId, employerId, jobPostId)`.
- Xoá theo (`ON DELETE CASCADE`): xoá `users` thì xoá `candidates`/`employers`/`notifications`; xoá `candidates` thì xoá hồ sơ (`educations`, `cvs`, `candidate_skills`, `candidate_profile_insights`), đơn, lời mời, điểm phù hợp, hội thoại, tin đã lưu; xoá `employers` thì xoá hội thoại; xoá `job_posts` thì xoá `job_post_skills`, `applications`, điểm phù hợp, tin đã lưu; xoá `applications` thì xoá `interviews`; xoá `conversations` thì xoá `messages`.
- Xoá lời mời thì `applications.invitationId` về rỗng (`SET NULL`).
- Các FK bắt buộc còn lại chặn xoá bản ghi cha (`RESTRICT`), ví dụ không xoá được `companies` khi còn `job_posts`, không xoá được `cvs` đã dùng trong đơn.

## 4. Đọc ký hiệu

- Chìa khoá vàng: khoá chính. Chìa khoá xanh: khoá ngoại; chìa khoá vừa vàng vừa xanh: khoá ngoại nằm trong khoá chính (bảng liên kết).
- `N`: cho phép rỗng. `U`: duy nhất.
- Đường liền: quan hệ xác định (FK thuộc khoá chính). Đường nét đứt: quan hệ không xác định.
- Đầu chân chim: nhiều; vạch: một; vòng tròn: có thể không có.
- Cột FK nằm cuối mỗi bảng (Visual Paradigm tự thêm khi nối khoá ngoại).
