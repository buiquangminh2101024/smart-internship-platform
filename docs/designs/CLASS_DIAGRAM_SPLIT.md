# Class Diagram — Bản tách cho báo cáo

Tách sơ đồ lớp đầy đủ trong `CLASS_DIAGRAM.md` §5.1 thành **1 sơ đồ tổng quan + 4 sơ đồ con** để đưa vào báo cáo. Nội dung (attribute, method, quan hệ, multiplicity) giữ nguyên như `CLASS_DIAGRAM.md`; khi sửa sơ đồ, sửa ở `CLASS_DIAGRAM.md` trước rồi cập nhật lại file này. Quy tắc lọc, bảng invariant của method và quy ước chọn loại quan hệ xem `CLASS_DIAGRAM.md` §2, §3, §6, §7.

**Quy ước tách:**

- Mỗi class được vẽ **đầy đủ attribute và method ở đúng một sơ đồ con** (sơ đồ "nhà" của nó, xem bảng dưới).
- Ở sơ đồ con khác, class đó chỉ xuất hiện dưới dạng **hộp chỉ có tên** để làm điểm nối quan hệ.
- Mỗi quan hệ chỉ vẽ ở **một** sơ đồ con, là sơ đồ chứa class phía "con" (phía `0..*`).
- Sơ đồ tổng quan vẽ đủ 36 class và mọi quan hệ nhưng **không có attribute/method**, giúp người đọc thấy toàn cảnh.

| Sơ đồ | Class vẽ đầy đủ | Class chỉ có tên (định nghĩa ở sơ đồ khác) |
|---|---|---|
| §2 Ứng viên & hồ sơ | `User`, `Candidate`, `Education`, `WorkExperience`, `Project`, `Certificate`, `Award`, `CandidateSkill`, `Cv`, `CandidateProfileInsight`, `Skill`, `University`, `Major` (13) | `City` |
| §3 Doanh nghiệp & tin tuyển dụng | `Company`, `Employer`, `City`, `Industry`, `CompanyType`, `JobPost`, `JobPostSkill`, `JobPostMajor`, `JobPostModerationAction` (9) | `User`, `Skill`, `Major` |
| §4 Ứng tuyển & tương tác | `Application`, `ApplicationStatusHistory`, `Interview`, `SavedJob`, `CandidateOutreachInvitation`, `Conversation`, `Message`, `Notification`, `AuditLog` (9) | `User`, `Candidate`, `Cv`, `JobPost`, `Company`, `Employer` |
| §5 Gói dịch vụ & thanh toán | `SubscriptionPlan`, `CompanySubscription`, `Payment`, `Transaction`, `PaymentMethod` (5) | `Company` |

Tổng: 13 + 9 + 9 + 5 = 36 class, khớp `CLASS_DIAGRAM.md` §4. Enum xem `CLASS_DIAGRAM.md` §5.2.

## 1. Sơ đồ tổng quan

```mermaid
classDiagram
direction LR

%% Định danh
User "1" *-- "0..1" Candidate
User "1" *-- "0..1" Employer
User "1" *-- "0..*" Notification
User "1" -- "0..*" Message : sender
User "0..1" -- "0..*" JobPostModerationAction : actor
User "0..1" -- "0..*" AuditLog : actor
User "0..1" -- "0..*" Skill : createdBy
User "0..1" -- "0..*" University : createdBy
User "0..1" -- "0..*" Major : createdBy

%% Hồ sơ ứng viên
Candidate "1" *-- "0..*" Education
Candidate "1" *-- "0..*" WorkExperience
Candidate "1" *-- "0..*" Project
Candidate "1" *-- "0..*" Certificate
Candidate "1" *-- "0..*" Award
Candidate "1" *-- "0..*" Cv
Candidate "1" *-- "0..1" CandidateProfileInsight
Candidate "1" *-- "0..*" CandidateSkill
Skill "1" *-- "0..*" CandidateSkill

%% Danh mục
University "0..1" -- "0..*" Education
Major "0..1" -- "0..*" Education
Skill "0..*" --> "0..1" Skill : pendingMatch
University "0..*" --> "0..1" University : pendingMatch
Major "0..*" --> "0..1" Major : pendingMatch
City "0..1" -- "0..*" Candidate
City "0..1" -- "0..*" Company
City "0..1" -- "0..*" JobPost
Industry "0..1" -- "0..*" Company
Industry "0..1" -- "0..*" JobPost
CompanyType "0..1" -- "0..*" Company

%% Nhà tuyển dụng & gói dịch vụ
Company "1" o-- "1..*" Employer
Company "1" o-- "0..*" JobPost
Employer "1" o-- "0..*" JobPost : author
Company "1" o-- "0..*" CompanySubscription
SubscriptionPlan "1" o-- "0..*" CompanySubscription
CompanySubscription "1" o-- "0..*" Payment
Payment "1" o-- "0..*" Transaction
PaymentMethod "1" o-- "0..*" Transaction

%% Tin tuyển dụng
JobPost "1" *-- "0..*" JobPostModerationAction
JobPost "1" *-- "0..*" JobPostSkill
Skill "1" *-- "0..*" JobPostSkill
JobPost "1" *-- "0..*" JobPostMajor
Major "1" *-- "0..*" JobPostMajor

%% Ứng tuyển
Candidate "1" *-- "0..*" Application
JobPost "1" *-- "0..*" Application
Cv "1" o-- "0..*" Application
Application "1" *-- "0..*" ApplicationStatusHistory
Application "1" *-- "0..*" Interview
Candidate "1" *-- "0..*" SavedJob
JobPost "1" *-- "0..*" SavedJob

%% Mời ứng viên
Candidate "1" *-- "0..*" CandidateOutreachInvitation
Company "1" o-- "0..*" CandidateOutreachInvitation
Employer "1" o-- "0..*" CandidateOutreachInvitation : sender
JobPost "1" o-- "0..*" CandidateOutreachInvitation

%% Nhắn tin
Candidate "1" *-- "0..*" Conversation
Employer "1" *-- "0..*" Conversation
JobPost "1" o-- "0..*" Conversation
Conversation "1" *-- "0..*" Message
```

## 2. Ứng viên & hồ sơ

Tài khoản, hồ sơ ứng viên, CV và danh mục dùng cho hồ sơ (kỹ năng, trường, ngành).

```mermaid
classDiagram

class User {
  -String email
  -String password
  -Role role
  -UserStatus status
  -DateTime emailVerifiedAt
  -DateTime sessionsRevokedAt
  +verifyEmail(String otp) void
  +linkGoogleAccount(String googleId) void
  +suspend(String reason) void
  +reactivate() void
  +revokeSessions() void
}
class Candidate {
  -String fullName
  -String headline
  -String bio
  -String phone
  -Date dateOfBirth
  -Gender gender
  -String avatarUrl
  -Boolean isOpenToOutreach
  +importFromCv(Cv cv) void
  +apply(JobPost j, Cv cv, String coverLetter) Application
  +saveJob(JobPost j) void
}
class Education {
  -String degree
  -Int startYear
  -Int endYear
  -Boolean isCurrent
  -String description
  +markAsCurrent() void
}
class WorkExperience {
  -String company
  -String position
  -Date startDate
  -Date endDate
  -Boolean isCurrent
  -String description
}
class Project {
  -String name
  -String description
  -String url
  -Boolean isWorkingOn
  -Date startDate
  -Date endDate
}
class Certificate {
  -String name
  -String issuer
  -Date issueDate
  -String credentialUrl
  -String description
}
class Award {
  -String name
  -String issuer
  -Date date
  -String description
}
class CandidateSkill {
  -Float yearsOfExperience
}
class Cv {
  -String fileUrl
  -String fileName
  -Boolean isDefault
  -Boolean isHidden
  -Boolean isBuilder
  -String templateId
  -Json builderData
  -CvExtractionStatus extractionStatus
  -Json extractedData
  -DateTime uploadedAt
  -DateTime extractedAt
  +markAsDefault() void
  +extract() Json
}
class CandidateProfileInsight {
  -Int completenessScore
  -Json strengths
  -Json suggestions
  -Json topJobPostIds
  -DateTime generatedAt
  +regenerate() void
}
class Skill {
  -String name
  -CatalogEntryStatus status
  +approve() void
  +reject() void
  +mergeInto(Skill target) void
}
class University {
  -String name
  -String code
  -CatalogEntryStatus status
  +approve() void
  +reject() void
  +renameApprove(String name) void
  +mergeInto(University target) void
}
class Major {
  -String name
  -CatalogEntryStatus status
  +approve() void
  +reject() void
  +renameApprove(String name) void
  +mergeInto(Major target) void
}
%% Chỉ có tên — định nghĩa ở §3
class City

User "1" *-- "0..1" Candidate
User "0..1" -- "0..*" Skill : createdBy
User "0..1" -- "0..*" University : createdBy
User "0..1" -- "0..*" Major : createdBy

Candidate "1" *-- "0..*" Education
Candidate "1" *-- "0..*" WorkExperience
Candidate "1" *-- "0..*" Project
Candidate "1" *-- "0..*" Certificate
Candidate "1" *-- "0..*" Award
Candidate "1" *-- "0..*" Cv
Candidate "1" *-- "0..1" CandidateProfileInsight
Candidate "1" *-- "0..*" CandidateSkill
Skill "1" *-- "0..*" CandidateSkill

University "0..1" -- "0..*" Education
Major "0..1" -- "0..*" Education
Skill "0..*" --> "0..1" Skill : pendingMatch
University "0..*" --> "0..1" University : pendingMatch
Major "0..*" --> "0..1" Major : pendingMatch
City "0..1" -- "0..*" Candidate
```

## 3. Doanh nghiệp & tin tuyển dụng

Công ty, nhà tuyển dụng, tin tuyển dụng, yêu cầu kỹ năng/ngành của tin và lịch sử kiểm duyệt.

```mermaid
classDiagram

class Company {
  -String name
  -String description
  -String logoUrl
  -String bannerUrl
  -String website
  -String address
  -String taxCode
  -Int foundedYear
  -Boolean isVerified
  -Boolean requiresApproval
  -CompanyVerificationStatus verificationStatus
  -CompanyVerificationMethod verificationMethod
  -String businessLicenseUrl
  -String verificationNote
  -DateTime verificationSubmittedAt
  -DateTime verifiedAt
  -DateTime rejectedAt
  +submitVerification() void
  +verify() void
  +rejectVerification(String note) void
  +retractionCount() Int
}
class Employer {
  -Boolean isCompanyAdmin
  -String title
  -String phone
  +issueInviteCode() String
  +joinCompany(String inviteCode) void
}
class City {
  -String name
  -String zipcode
}
class Industry {
  -String name
}
class CompanyType {
  -String name
}
class JobPost {
  -String title
  -String description
  -JobPostType jobType
  -JobPostStatus status
  -Int salaryMin
  -Int salaryMax
  -Boolean isNegotiable
  -String requirements
  -String benefits
  -String address
  -Float minExperienceYears
  -Json requirementsExtra
  -Int viewCount
  -DateTime publishedAt
  -DateTime expiresAt
  -DateTime closedAt
  -DateTime requirementsConfirmedAt
  +submitForApproval() void
  +approve(User admin) void
  +reject(User admin, String reason) void
  +retract(User admin, String reason) void
  +close() void
  +expire() void
  +confirmRequirements() void
}
class JobPostSkill {
  -SkillImportance importance
  -Float minYears
}
class JobPostMajor {
  -MajorRelevance relevance
}
class JobPostModerationAction {
  -ModerationActionType action
  -String reason
  -DateTime createdAt
}
%% Chỉ có tên — định nghĩa ở §2
class User
class Skill
class Major

User "1" *-- "0..1" Employer
User "0..1" -- "0..*" JobPostModerationAction : actor

City "0..1" -- "0..*" Company
City "0..1" -- "0..*" JobPost
Industry "0..1" -- "0..*" Company
Industry "0..1" -- "0..*" JobPost
CompanyType "0..1" -- "0..*" Company

Company "1" o-- "1..*" Employer
Company "1" o-- "0..*" JobPost
Employer "1" o-- "0..*" JobPost : author

JobPost "1" *-- "0..*" JobPostModerationAction
JobPost "1" *-- "0..*" JobPostSkill
Skill "1" *-- "0..*" JobPostSkill
JobPost "1" *-- "0..*" JobPostMajor
Major "1" *-- "0..*" JobPostMajor
```

## 4. Ứng tuyển & tương tác

Ứng tuyển, phỏng vấn, lưu tin, mời ứng viên, nhắn tin, thông báo và nhật ký quản trị.

```mermaid
classDiagram

class Application {
  -ApplicationStatus status
  -String coverLetter
  -String employerNotes
  -Int rating
  -DateTime createdAt
  -DateTime reappliedAt
  +changeStatus(ApplicationStatus to) void
  +cancel() void
}
class ApplicationStatusHistory {
  -ApplicationStatus fromStatus
  -ApplicationStatus toStatus
  -DateTime createdAt
}
class Interview {
  -DateTime scheduledAt
  -Int durationMinutes
  -InterviewMode mode
  -String location
  -String note
  -InterviewStatus status
  -String cancelReason
  +reschedule(DateTime at) void
  +cancel(String reason) void
}
class SavedJob {
  -DateTime createdAt
}
class CandidateOutreachInvitation {
  -OutreachInvitationStatus status
  -Int matchScore
  -DateTime createdAt
  -DateTime expiresAt
  -DateTime respondedAt
  +accept() void
  +decline() void
  +expire() void
}
class Conversation {
  -DateTime candidateLastReadAt
  -DateTime employerLastReadAt
  -DateTime candidateDeletedAt
  -DateTime employerDeletedAt
  +postMessage(User sender, String content) Message
  +softDeleteBy(Role side) void
  +unreadCountFor(Role side) Int
}
class Message {
  -String content
  -DateTime createdAt
}
class Notification {
  -NotificationType type
  -String title
  -String body
  -String link
  -Boolean isRead
  -DateTime readAt
  -DateTime createdAt
  +markAsRead() void
}
class AuditLog {
  -Role actorRole
  -String action
  -String entityType
  -String entityId
  -String summary
  -Json metadata
  -DateTime createdAt
}
%% Chỉ có tên — định nghĩa ở §2 và §3
class User
class Candidate
class Cv
class JobPost
class Company
class Employer

Candidate "1" *-- "0..*" Application
JobPost "1" *-- "0..*" Application
Cv "1" o-- "0..*" Application
Application "1" *-- "0..*" ApplicationStatusHistory
Application "1" *-- "0..*" Interview
Candidate "1" *-- "0..*" SavedJob
JobPost "1" *-- "0..*" SavedJob

Candidate "1" *-- "0..*" CandidateOutreachInvitation
Company "1" o-- "0..*" CandidateOutreachInvitation
Employer "1" o-- "0..*" CandidateOutreachInvitation : sender
JobPost "1" o-- "0..*" CandidateOutreachInvitation

Candidate "1" *-- "0..*" Conversation
Employer "1" *-- "0..*" Conversation
JobPost "1" o-- "0..*" Conversation
Conversation "1" *-- "0..*" Message
User "1" -- "0..*" Message : sender

User "1" *-- "0..*" Notification
User "0..1" -- "0..*" AuditLog : actor
```

## 5. Gói dịch vụ & thanh toán

Gói dịch vụ, đăng ký gói của công ty và luồng thanh toán.

```mermaid
classDiagram

class SubscriptionPlan {
  -String name
  -String description
  -Int jobPostQuota
  -Int durationDays
  -Int price
  -Int outreachInvitationDailyQuota
  -Boolean isActive
}
class CompanySubscription {
  -DateTime startDate
  -DateTime endDate
  -SubscriptionStatus status
  +activate() void
  +cancel() void
  +expire() void
  +isActive() Boolean
  +remainingQuota() Int
}
class Payment {
  -Int amount
  -PaymentStatus status
  -DateTime createdAt
  +complete() void
  +fail() void
}
class Transaction {
  -String orderCode
  -String providerTransactionId
  -TransactionStatus status
  -DateTime createdAt
}
class PaymentMethod {
  -String displayName
  -String logoUrl
  -Boolean isAvailable
  -PaymentProvider processorType
  -Json configParams
}
%% Chỉ có tên — định nghĩa ở §3
class Company

Company "1" o-- "0..*" CompanySubscription
SubscriptionPlan "1" o-- "0..*" CompanySubscription
CompanySubscription "1" o-- "0..*" Payment
Payment "1" o-- "0..*" Transaction
PaymentMethod "1" o-- "0..*" Transaction
```

## 6. Gợi ý khi vẽ lại bằng Visual Paradigm

- Hộp "chỉ có tên" nên ẩn compartment attribute/method (Presentation Options → Show Attributes/Operations), hoặc tô màu nhạt khác hộp chính để người đọc biết class đó được định nghĩa ở sơ đồ khác.
- Dùng đường kiểu Rectilinear và đặt class danh mục (`City`, `Industry`, `CompanyType`) sát class dùng nó, tránh đường chạy vòng ra mép trang.
- Đặt class "cha" (phía có hình thoi) ở trên hoặc bên trái, class "con" ở dưới hoặc bên phải; sơ đồ đọc theo một chiều sẽ ít đường cắt nhau hơn.
- `CandidateSkill`, `JobPostSkill`, `JobPostMajor`, `Application`, `SavedJob` có thể đổi sang ký hiệu association class chuẩn (đường nét đứt gắn vào giữa quan hệ N–N), xem `CLASS_DIAGRAM.md` §7 ghi chú 1.
