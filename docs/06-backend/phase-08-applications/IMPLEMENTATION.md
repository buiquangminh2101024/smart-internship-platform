# Phase 8 (Backend) — Application Module Implementation

Tài liệu này mô tả chi tiết implementation thực tế đã hoàn thành cho Phase 8 (Ứng tuyển & Xét duyệt) ở phía Backend.

## 1. Phạm vi và Mục tiêu

Phase 8 tập trung vào luồng giao dịch trung tâm của nền tảng:
- **Ứng viên nộp đơn**: Cho phép ứng viên ứng tuyển vào một tin tuyển dụng (`JobPost`) bằng cách đính kèm CV và thư xin việc (cover letter). Cho phép hủy đơn (Cancel) và ứng tuyển lại (Re-apply/Upsert).
- **Nhà tuyển dụng xét duyệt**: Xem danh sách ứng viên, xem chi tiết hồ sơ, đánh giá (Rating/Notes), và cập nhật trạng thái đơn (State Transition).

## 2. Database Changes (Prisma Schema)

Các model được cập nhật/thêm mới:
- `Application`: Quản lý đơn ứng tuyển.
  - Fields: `id`, `candidateId`, `jobPostId`, `cvId`, `status`, `coverLetter`, `employerNotes`, `rating`, `reappliedAt`, `createdAt`, `updatedAt`.
  - Relations: `Candidate` (1-n), `JobPost` (1-n), `Cv` (1-n).
  - Enum `ApplicationStatus`: Thêm trạng thái `CANCELLED`.
  - Constraints: `@@unique([jobPostId, candidateId])` chặn việc nộp 2 đơn cùng lúc cho 1 tin (ngoại trừ cơ chế Upsert khi ứng tuyển lại).

## 3. Kiến trúc và Các Module

### 3.1 Module `applications`
- **Controller**: `ApplicationsController` xử lý các API endpoint cho cả Candidate và Employer.
- **Service**: `ApplicationsService` chứa business logic (validate CV, check JobPost status, check State Transition, upsert logic).
- **Repository**: `ApplicationsRepository` tương tác với DB (Prisma).
- **Mapper**: `ApplicationMapper` (ẩn `employerNotes` và `rating` khỏi các API của ứng viên, bảo vệ dữ liệu nội bộ của nhà tuyển dụng).

### 3.2 Awilix Dependency Injection
- Toàn bộ Controller, Service, và Repository đều sử dụng **destructured object constructor** thay vì positional arguments để tuân thủ pattern Dependency Injection của Awilix (`constructor({ prisma, applicationsRepository }: { ... })`).

### 3.3 CV Lifecycle & Protection
- Cập nhật `CvService`: Chặn xóa CV (`cv.service.ts`) nếu CV đó đang được sử dụng trong bất kỳ đơn ứng tuyển nào (`Application`). Ngăn lỗi HTTP 500 từ Prisma (Foreign Key constraint).

## 4. API Endpoints Thực Tế

### 4.1 Candidate Endpoints
- `POST /api/candidate/applications`: Nộp đơn mới (hoặc Upsert nếu đơn cũ đã bị `CANCELLED`).
- `GET /api/candidate/applications`: Lấy danh sách lịch sử ứng tuyển.
- `GET /api/candidate/applications/:id`: Xem chi tiết một đơn.
- `PATCH /api/candidate/applications/:id/cancel`: Hủy đơn (chỉ được phép khi trạng thái đang là `PENDING`).

### 4.2 Employer Endpoints
- `GET /api/employer/job-posts/:jobId/applications`: Lấy danh sách đơn theo JobPost (có hỗ trợ filter theo trạng thái).
- `GET /api/employer/applications/:id`: Xem chi tiết hồ sơ ứng viên (bao gồm thông tin user, profile, cv attached).
- `PATCH /api/employer/applications/:id/status`: Cập nhật trạng thái đơn (dựa trên State Transition Rules).
- `PATCH /api/employer/applications/:id/evaluation`: Cập nhật đánh giá nội bộ (`rating`, `employerNotes`).

## 5. State Transition Rules

Hệ thống quản lý vòng đời ứng tuyển chặt chẽ qua config map trong Service:
- Tuyến chính: `PENDING` -> `REVIEWING` -> `SHORTLISTED` -> `INTERVIEWING` -> `ACCEPTED`.
- Rẽ nhánh từ chối: Hầu hết mọi trạng thái đều có thể chuyển sang `REJECTED` (ngoại trừ `ACCEPTED` hoặc đã bị `CANCELLED`).
- Rẽ nhánh hủy: Ứng viên chỉ có thể tự hủy đơn (`CANCELLED`) khi đơn đang ở trạng thái `PENDING`. Sau khi hủy, được phép ứng tuyển lại (hệ thống sẽ Upsert thay vì báo lỗi conflict).
- Không cho phép cập nhật đơn đã `CANCELLED` hoặc `REJECTED` (Terminal states).

## 6. Security & Authorization

- **IDOR Protection**: Các endpoint được bảo vệ bởi ID ứng viên (`req.user.id`) hoặc thông qua quyền sở hữu công ty của nhà tuyển dụng (`employerGuard`).
- **Data Privacy**: Thông tin đánh giá của nhà tuyển dụng (`rating`, `employerNotes`) bị gỡ bỏ (strip) khỏi toàn bộ DTO trả về cho ứng viên.
- **Job Status Validation**: Chỉ cho phép ứng tuyển khi JobPost đang ở trạng thái `PUBLISHED` và chưa hết hạn. CV nộp phải thuộc quyền sở hữu của ứng viên.
