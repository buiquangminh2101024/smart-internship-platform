# Phase 3 (Backend) — Candidate Profile Implementation

Tài liệu này mô tả chi tiết implementation thực tế đã hoàn thành cho Phase 3 (Candidate Profile) ở phía Backend.

## 1. Phạm vi và Mục tiêu

Phase 3 xây dựng các API để ứng viên hoàn thiện Hồ sơ cá nhân (Profile) và các thông tin liên quan (Học vấn, Kinh nghiệm, Dự án, Kỹ năng, Chứng chỉ, Giải thưởng).
Ứng viên có thể điền các form độc lập để làm giàu CV của mình.

## 2. Database Schema (Prisma)

Hồ sơ ứng viên được quản lý qua model gốc `Candidate` liên kết `1-1` với `User` (role = `CANDIDATE`).
Các model `1-n` liên kết với `Candidate`:
- `Education`: Lịch sử học vấn. Có các field `startYear`, `endYear`, `degree`, và `isCurrent`. Liên kết với `University` và `Major` trong catalog thông qua `universityId` và `majorId`.
- `CandidateSkill`: Kỹ năng ứng viên (liên kết với `Skill` catalog). Có `yearsOfExperience`.
- `WorkExperience`: Kinh nghiệm làm việc. Có `companyName`, `position`, `startDate`, `endDate`, `isCurrent`, `description`.
- `Project`: Dự án nổi bật. Có `name`, `role`, `startDate`, `endDate`, `isWorkingOn`, `description`, `projectUrl`.
- `Certificate`: Chứng chỉ (có `name`, `organization`, `issueDate`, `credentialUrl`, `description`).
- `Award`: Giải thưởng (có `name`, `organization`, `issueDate`, `description`).

## 3. Kiến trúc và Các Module

### 3.1 Module `candidates`
- **Controller**: `CandidateController` xử lý các API endpoint (CRUD).
- **Service**: `CandidateService` chứa logic (đảm bảo quyền sở hữu dữ liệu).
- **Repository**: `CandidateRepository` kết nối Prisma.
- Tất cả endpoints đều được auth và phân quyền role `CANDIDATE` qua `authenticate` và `authorize`.
- Input Validation thông qua Zod schemas định nghĩa tại `candidates.dto.ts`.

## 4. API Endpoints Thực Tế

Tất cả các endpoint dưới đây đều bắt đầu bằng `/api/candidates/me` và yêu cầu xác thực Candidate.

### 4.1 Thông tin cơ bản
- `GET /candidates/me`: Lấy toàn bộ thông tin profile, bao gồm tất cả các quan hệ (educations, skills, workExperiences, projects, certificates, awards). Dữ liệu được nested đầy đủ.
- `PATCH /candidates/me`: Cập nhật thông tin cơ bản (headline, bio, phone, dateOfBirth, gender, cityId).

### 4.2 Học vấn (Education)
- `POST /candidates/me/education`: Thêm quá trình học tập.
- `PATCH /candidates/me/education/:id`: Cập nhật quá trình học tập.
- `DELETE /candidates/me/education/:id`: Xóa quá trình học tập.

### 4.3 Kỹ năng (Skills)
- `GET /candidates/me/skills`: Liệt kê các kỹ năng.
- `POST /candidates/me/skills`: Thêm hoặc cập nhật kỹ năng (upsert).
- `DELETE /candidates/me/skills/:skillId`: Xóa kỹ năng.

### 4.4 Kinh nghiệm làm việc (Work Experience)
- `POST /candidates/me/work-experiences`: Thêm kinh nghiệm.
- `PATCH /candidates/me/work-experiences/:id`: Cập nhật.
- `DELETE /candidates/me/work-experiences/:id`: Xóa.

### 4.5 Dự án (Projects)
- `POST /candidates/me/projects`: Thêm dự án.
- `PATCH /candidates/me/projects/:id`: Cập nhật.
- `DELETE /candidates/me/projects/:id`: Xóa.

### 4.6 Chứng chỉ (Certificates)
- `POST /candidates/me/certificates`: Thêm chứng chỉ.
- `PATCH /candidates/me/certificates/:id`: Cập nhật.
- `DELETE /candidates/me/certificates/:id`: Xóa.

### 4.7 Giải thưởng (Awards)
- `POST /candidates/me/awards`: Thêm giải thưởng.
- `PATCH /candidates/me/awards/:id`: Cập nhật.
- `DELETE /candidates/me/awards/:id`: Xóa.

## 5. Security & Validation
- **IDempotency & Ownership**: Khi thao tác PATCH/DELETE trên một record ID (ví dụ: `:id` của Education), hệ thống chỉ query với filter `candidateId: req.user.id` để đảm bảo ứng viên không thể xóa hoặc sửa hồ sơ của người khác.
- Dữ liệu `isCurrent` hoặc `isWorkingOn` nếu `true` thì validation cho phép `endDate` là `null` hoặc bỏ qua.
