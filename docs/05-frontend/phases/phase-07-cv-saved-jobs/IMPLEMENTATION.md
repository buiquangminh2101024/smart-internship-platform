# Phase 7 (Frontend) — CV & Saved Jobs Implementation

Tài liệu này mô tả chi tiết implementation thực tế đã hoàn thành cho Phase 7 (CV & Saved Jobs) ở phía Frontend.

## 1. Phạm vi và Mục tiêu

Xây dựng giao diện ứng viên (Candidate Portal) để tương tác với CV và Tin tuyển dụng đã lưu:
- Hỗ trợ tải lên, xem trước, thiết lập CV mặc định và xóa CV.
- Giao diện danh sách tin tuyển dụng yêu thích và khả năng bỏ lưu.
- Tích hợp tính năng Lưu/Bỏ lưu (Save/Unsave) trực tiếp vào trang Chi tiết tin tuyển dụng (Job Detail).

## 2. Các Hook React Query Mới (`src/hooks`)

Tất cả logic kết nối API được trừu tượng hóa qua các custom hooks (`react-query`):

### 2.1 `useCvs.ts`
- `useCvList()`: Fetch danh sách CV.
- `useCvUpload()`: Upload multipart/form-data qua `apiUpload`.
- `useCvSetDefault()`: Patch để đổi CV mặc định.
- `useCvDelete()`: Xóa CV.

### 2.2 `useSavedJobs.ts`
- `useSavedJobs()`: Fetch danh sách công việc đã lưu.
- `useSavedJobCheck(jobPostId)`: Kiểm tra trạng thái đã lưu của 1 job.
- `useSaveJob()`: Mutation lưu job.
- `useUnsaveJob()`: Mutation bỏ lưu job.

## 3. UI Components Thực Tế Đã Triển Khai

### 3.1 App Shell (Layout)
- **`CandidatePortalShell.tsx`**: Layout Wrapper dành riêng cho Route Group `(candidate)` sử dụng cấu trúc tương tự `EmployerShell` nhưng với sidebar điều hướng riêng cho Ứng viên (Hồ sơ, Quản lý CV, Việc làm đã lưu).
- Được gắn vào `apps/web/src/app/(candidate)/layout.tsx`.

### 3.2 CV Management (`CvManagementClient.tsx`)
- Vị trí: `apps/web/src/components/candidate/CvManagementClient.tsx`.
- Chức năng:
  - Drag-drop hoặc click để chọn file PDF tải lên.
  - Hiển thị danh sách CV dưới dạng Grid (`CvCard`).
  - Hỗ trợ các nút hành động (Xem PDF, Đặt mặc định, Xóa).
  - Tích hợp `ConfirmDialog` cho hành động xóa an toàn thay cho `window.confirm` mặc định.

### 3.3 Saved Jobs (`SavedJobsClient.tsx`)
- Vị trí: `apps/web/src/components/candidate/SavedJobsClient.tsx`.
- Chức năng:
  - Render các Job Post đã lưu thông qua Component `JobCard` tái sử dụng từ Phase 6.
  - Tích hợp chức năng gỡ bỏ trực tiếp trên màn hình quản lý.
  - Hỗ trợ trạng thái Empty State nếu chưa có Job nào.

### 3.4 Job Detail Integration (`jobs/[id]/page.tsx`)
- Trang chi tiết Job (`JobDetailClient` được refactor) giờ đây liên kết trực tiếp với backend thay vì dùng Local State tĩnh.
- Logic kiểm tra Session (`useAuthStore`) tự động điều hướng sang Login nếu Guest nhấn "Lưu tin".
- Nếu đã đăng nhập là Candidate, nút bấm chuyển trạng thái Lưu/Đã lưu (Save/Unsaved) và kích hoạt React Query Mutations tương ứng.

## 4. UI Library Bổ Sung

- **`ConfirmDialog.tsx`**: Modal xác nhận tái sử dụng, hỗ trợ phím Escape, loading state, và các loại action (Destructive/Primary). Dùng để xác nhận thao tác Xóa CV.

## 5. Các Chú ý Kiến trúc & Hạn chế

- **Vấn đề Cloudinary PDF**: Mặc định trình duyệt có thể không load được PDF do chính sách bảo mật Strict Delivery của Cloudinary. Khắc phục bằng cách sử dụng cấu hình tài khoản Cloudinary hợp lệ (disable Strict Delivery for PDF and ZIP) thay vì hack frontend URL. 
- **Type Safety**: Tất cả các hooks và API responses được typed chặt chẽ dựa trên các DTO nằm ở `@sip/shared-types`.
- **Hydration & Caching**: Sử dụng `queryClient.invalidateQueries` để đảm bảo dữ liệu luôn tươi mới ngay sau khi thực hiện mutation thành công (upload, delete, save, unsave).
