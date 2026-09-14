# Phase 8 (Frontend) — Application Module Implementation

Tài liệu này mô tả chi tiết implementation thực tế đã hoàn thành cho Phase 8 (Ứng tuyển & Xét duyệt) ở phía Frontend.

## 1. Phạm vi và Mục tiêu

Phase 8 cung cấp giao diện (UI) và móc nối API (Hooks) cho cả Ứng viên và Nhà tuyển dụng:
- **Ứng viên**: Khả năng nộp đơn từ trang chi tiết JobPost, quản lý danh sách lịch sử nộp đơn, hủy đơn, ứng tuyển lại. Giao diện được đồng bộ phong cách với trang chủ.
- **Nhà tuyển dụng**: Dashboard quản lý hồ sơ ứng viên theo từng tin tuyển dụng, xem chi tiết một hồ sơ, đánh giá nội bộ, đổi trạng thái.

## 2. API Configuration (Fix quan trọng)
- **Cấu hình NEXT_PUBLIC_API_URL**: Khắc phục lỗi Nginx không chạy trong môi trường dev bằng cách thiết lập URL gọi trực tiếp vào port 4000 của backend trong file `.env` và `.env.local` (`http://localhost:4000/api`).

## 3. Kiến trúc Components và Pages

### 3.1 Candidate UI
- **Nút Ứng Tuyển Thông Minh (`/jobs/[id]/page.tsx`)**:
  - Dựa trên custom hook `useJobApplicationStatus`, nút "Ứng tuyển ngay" sẽ tự động đổi trạng thái dựa theo lịch sử ứng tuyển.
  - Nếu trạng thái đơn là `PENDING` hoặc `REVIEWING`, hiển thị "Đang chờ duyệt" hoặc "Đang xem xét" (disabled).
  - Nếu đơn đã bị `CANCELLED`, nút chuyển thành "Ứng tuyển lại" (active).
  - Tránh lỗi crash giao diện bằng cách sử dụng `type="button"` khi disabled thay vì thẻ `as="a"` với `href=undefined`.
- **Trang Ứng Tuyển (`/jobs/[id]/apply/page.tsx`)**:
  - Auto-select CV: Hook `useEffect` tự động pre-select CV có `isDefault = true` hoặc chọn CV đầu tiên trong danh sách. Có badge "Mặc định".
- **Trang Quản Lý Đơn (`/applications/page.tsx`)**:
  - Hiển thị danh sách lịch sử theo dạng thẻ (Card) kèm Badge trạng thái.
  - Có nút "Hủy đơn" đối với các đơn `PENDING`.
  - Fix layout: Gỡ bỏ chồng chéo Header/Footer và bọc trong khung lưới `max-w-6xl` chuẩn Dashboard.

### 3.2 Layout Candidate (Chỉnh sửa UI)
- **`CandidatePortalShell.tsx`**: 
  - Layout trước đây sử dụng `PortalTopbar` (thiếu Footer và bị chồng chéo Header khi gọi trùng).
  - Đã được chuẩn hóa lại sử dụng `CandidateHomeHeader` ở trên cùng, Sidebar (`SideNav`) bên trái, Nội dung giữa (`flex-1 bg-surface-page`), và `SiteFooter` ở dưới cùng.
  - Mang lại UI đồng bộ 100% giữa khu vực tìm việc công khai và khu vực quản lý cá nhân.

### 3.3 Employer UI
- **Danh sách ứng viên (`/employer/jobs/[id]/applications/page.tsx`)**:
  - Bảng hiển thị thông tin ứng viên (Email, Ngày nộp, Trạng thái).
  - Bộ lọc Dropdown lọc ứng viên theo trạng thái.
- **Chi tiết ứng viên (`/employer/applications/[id]/page.tsx`)**:
  - Xem thông tin Profile ứng viên, link xem trực tiếp CV.
  - Cập nhật đánh giá nội bộ (Notes, Rating 1-5).
  - Cập nhật quy trình duyệt (Dropdown State Transition).

## 4. React Query Hooks (`useApplications.ts`)
Tách rời logic Data Fetching khỏi UI Component:
- `useCandidateApplications`: Lấy danh sách lịch sử nộp đơn (Candidate).
- `useJobApplicationStatus`: Lọc cache của list lịch sử theo `jobPostId` để trả ra trạng thái nộp đơn tức thời mà không cần fetch lại API riêng biệt.
- `useCancelApplication`: Trigger cancel đơn.
- `useApplyJob`: Gọi API tạo đơn ứng tuyển (tự động xử lý Upsert backend nếu đã từng hủy).
- `useEmployerJobApplications`: Lấy danh sách hồ sơ cho 1 tin (hỗ trợ filter).
- `useEmployerApplication`: Lấy chi tiết đơn kèm profile ứng viên.
- `useUpdateApplicationStatus` / `useUpdateApplicationEvaluation`: Mutations cập nhật cho Employer.

## 5. Testing & Hoạt động
- Toàn bộ flow từ lúc Ứng viên nộp -> Hiện trạng thái -> Employer duyệt -> Trạng thái update ngược về Ứng viên đã hoạt động ổn định và xuyên suốt. UI đẹp, responsive và không có lỗi crash.
