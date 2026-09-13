# Phase 3 (Frontend) — Candidate Profile Implementation

Tài liệu này mô tả chi tiết implementation thực tế đã hoàn thành cho Phase 3 (Candidate Profile) ở phía Frontend.

## 1. Phạm vi và Mục tiêu

Xây dựng giao diện trang Profile của Ứng viên (`/profile`), cho phép họ điền và quản lý các thông tin cá nhân và lịch sử học tập/làm việc để phục vụ cho hệ thống CV sau này.

## 2. Các Màn hình Thực Tế

### 2.1 Màn hình Candidate Profile (`CandidateProfileClient.tsx`)
- **Vị trí**: `apps/web/src/components/candidate/CandidateProfileClient.tsx`
- **Render qua**: `apps/web/src/app/(candidate)/profile/page.tsx`
- **Cấu trúc Giao diện**: Giao diện được chia thành các phần (Sections) rõ ràng.
  - **Thông tin cơ bản**: Header (Avatar, Headline, Bio), thông tin liên hệ (Phone, Gender, Date of Birth). Các input sử dụng UI components chuẩn (Input, Select, Textarea).
  - **Quá trình học tập (Education)**: Danh sách các trường học, chuyên ngành (Major), thời gian học (hiển thị "Hiện tại" nếu đang học). Có nút Edit và Delete cho từng record.
  - **Kinh nghiệm làm việc (Work Experience)**: Form nhập thông tin chức danh, tên công ty, khoảng thời gian.
  - **Dự án cá nhân (Projects)**: Form thêm các dự án tham gia, link dự án.
  - **Kỹ năng (Skills)**: Quản lý kỹ năng với Catalog (danh mục kỹ năng) và số năm kinh nghiệm.
  - **Chứng chỉ và Giải thưởng**: Các form tương ứng.

### 2.2 Logic Tương Tác
- Sử dụng `useState` và `useEffect` kết hợp với `apiFetch` (từ `lib/api-client`) để pull toàn bộ dữ liệu khi Component mount.
- Mỗi thao tác CRUD (tạo mới, sửa, xóa) đều gọi API tương ứng tới backend, và nếu thành công, State nội bộ sẽ được update để phản ánh thay đổi ngay lập tức mà không cần reload trang.
- Validation và error handling cơ bản (sử dụng Toast notification/alert để báo lỗi hoặc thành công).

## 3. Thành phần Component Tái Sử Dụng

- Dùng các Form components cơ bản: `Input`, `Select`, `Button`, `Card` từ Phase 2.
- Form Helper Functions (ví dụ `dateInput`, `emptyToUndefined`) giúp chuẩn hóa payload đẩy lên backend, loại bỏ các string rỗng hoặc null field không cần thiết, map 1-1 với Zod Validation trên backend.

## 4. Tích Hợp

- Giao diện này chỉ khả dụng cho tài khoản đã đăng nhập bằng role `CANDIDATE`. (Middleware `proxy.ts` / `layout.tsx` đảm bảo phân quyền truy cập).
- Kết hợp hoàn hảo với **Phase 7 (CV)**, nơi ứng viên có thể xuất thông tin profile này thành CV hoặc tải lên file đính kèm.
