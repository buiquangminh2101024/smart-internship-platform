# Phase 7 (Backend) — CV & Saved Jobs Implementation

Tài liệu này mô tả chi tiết implementation thực tế đã hoàn thành cho Phase 7 (CV & Saved Jobs) ở phía Backend.

## 1. Phạm vi và Mục tiêu

Phase 7 tập trung vào các tính năng hỗ trợ Ứng viên (Candidate):
- **CV Management**: Tải lên (upload), danh sách, xóa và đặt CV mặc định. Upload file được trừu tượng hóa qua `MediaStorageService` (Cloudinary).
- **Saved Jobs**: Lưu tin tuyển dụng yêu thích, bỏ lưu, kiểm tra trạng thái lưu.

## 2. Database Changes (Prisma Schema)

Các model được cập nhật/thêm mới (đã đồng bộ với schema):
- `Cv`: Quản lý file CV.
  - Fields: `id`, `candidateId`, `fileUrl`, `fileName`, `isDefault`, `uploadedAt`.
  - Relations: `Candidate` (1-n).
- `SavedJob`: Quản lý các tin tuyển dụng đã lưu.
  - Fields: `id`, `candidateId`, `jobPostId`, `createdAt`.
  - Relations: `Candidate` (1-n), `JobPost` (1-n).
  - Constraints: `@@unique([candidateId, jobPostId])` chống lưu trùng lặp.

## 3. Kiến trúc và Các Module

### 3.1 Module `cv`
- **Controller**: `CvController` xử lý các API endpoint cho CV.
- **Service**: `CvService` chứa business logic (set default, delete).
- **Upload Flow**: 
  - Khác với upload local, CV được upload trực tiếp lên Cloudinary thông qua interface `MediaStorageService`.
  - Không import trực tiếp SDK Cloudinary vào service.
  - Cấu hình Cloudinary `upload_stream` với tham số `resourceType: "raw"` để giữ nguyên định dạng PDF (bypass giới hạn mặc định biến PDF thành image của Cloudinary).

### 3.2 Module `saved-jobs`
- **Controller**: `SavedJobsController` xử lý API cho Saved Jobs.
- **Service**: `SavedJobsService` chứa business logic (kiểm tra tồn tại, save, unsave, validate jobPost).
- **Validation**: Đảm bảo tin tuyển dụng (`JobPost`) có tồn tại và đang ở trạng thái `PUBLISHED` mới được phép lưu.

## 4. API Endpoints Thực Tế

Tất cả các endpoint dưới đây yêu cầu xác thực JWT (`RequireAuth`) và Role = `CANDIDATE` (`RequireRole(Role.CANDIDATE)`).

### 4.1 CV Endpoints
- `GET /api/candidates/me/cvs`: Lấy danh sách CV của ứng viên, sắp xếp theo mặc định lên đầu rồi đến mới nhất.
- `POST /api/candidates/me/cvs`: Upload CV mới (multipart/form-data).
- `PATCH /api/candidates/me/cvs/:cvId/default`: Đặt một CV làm mặc định. Tự động gỡ cờ `isDefault` của các CV khác.
- `DELETE /api/candidates/me/cvs/:cvId`: Xóa một CV (bao gồm cả file trên DB, không xóa vật lý trên Cloudinary để giữ nguyên tắc soft-deletion/immutability hoặc do MediaStorage chưa có hàm delete).

### 4.2 Saved Jobs Endpoints
- `GET /api/candidates/me/saved-jobs`: Lấy danh sách các tin tuyển dụng đã lưu, populate thông tin công ty và tin tuyển dụng.
- `GET /api/candidates/me/saved-jobs/check/:jobPostId`: Kiểm tra xem một tin tuyển dụng cụ thể đã được ứng viên lưu chưa (trả về `{ saved: boolean }`).
- `POST /api/candidates/me/saved-jobs`: Lưu tin tuyển dụng (body: `{ jobPostId }`).
- `DELETE /api/candidates/me/saved-jobs/:jobPostId`: Bỏ lưu tin tuyển dụng.

## 5. Security & Authorization

- Chặn quyền truy cập chéo: Các ứng viên chỉ có thể thao tác với CV và Saved Jobs thuộc về chính họ thông qua việc trích xuất `req.user.id`.
- Chống duplicate: Bảng `saved_jobs` có index unique `[candidateId, jobPostId]`.
- Cloudinary Security: Để Cloudinary phục vụ file PDF mà không gặp lỗi 401 Strict Delivery, Backend đã sử dụng `resourceType: "raw"`. Yêu cầu người dùng (quản trị viên) tắt tùy chọn "Strict PDF Delivery" trong Dashboard Cloudinary.

## 6. Testing & Khởi chạy

- Luồng hoạt động đã được kiểm thử tích hợp (curl/frontend integration).
- Lệnh chạy backend: `npm run dev --workspace=apps/server`.
