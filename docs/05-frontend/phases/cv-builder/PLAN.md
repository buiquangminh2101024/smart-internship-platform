# Kế hoạch Frontend: Tạo CV (CV Builder)

## 1. Công nghệ / package / kiến trúc sử dụng
- **Thư viện chính:** `@react-pdf/renderer` (phiên bản đã cài sẵn trong dự án) để kết xuất PDF trên trình duyệt.
- **Kiến trúc:** 
  - Khởi tạo data từ API bằng `react-query` (`GET /api/candidates/me/profile`).
  - Giao diện chia thành 2 phần: **Sidebar tuỳ chỉnh** (chọn màu, template, ẩn/hiện mục) và **PDF Viewer** (hiển thị preview realtime).
  - Quản lý trạng thái tuỳ chỉnh bằng `useState` hoặc `react-hook-form` tuỳ độ phức tạp.

## 2. Liên kết giữa các phần
- **Data Source:** Gọi API Profile để lấy cục data hoàn chỉnh về học vấn, kỹ năng, kinh nghiệm.
- **Mapper:** Hàm chuyển đổi từ định dạng API trả về sang cấu trúc `CVData` chuẩn.
- **Renderer:** Component React-PDF nhận `CVData` và `CustomizationOptions` để render ra `<Document>`.
- **Action:** Nút "Lưu vào hệ thống" sẽ tạo ra một instance của `Blob` từ `<Document>`, gói vào `FormData` dưới dạng file PDF (`application/pdf`) và gọi api `POST /api/candidates/me/cvs`.

## 3. Các bước thực hiện

1. **Khởi tạo và thiết kế Template:**
   - Tạo file `CvTemplateMinimal.tsx` chứa layout React-PDF.
   - Định nghĩa `StyleSheet` cho các thành phần: Header (chứa tên, contact), Body (chứa Education, Experience, Skills, v.v.).
2. **Trang Builder (UI):**
   - Tạo route `/candidate/cv-builder`.
   - Viết các hook fetch data profile.
   - Layout chia 2 cột: Cột trái (Controls), Cột phải (Preview sử dụng `<PDFViewer>`).
3. **Logic Preview và Download:**
   - Liên kết data fetch được vào props của Template.
   - Thêm nút "Tải xuống" sử dụng hook `usePDF` hoặc `<PDFDownloadLink>` của `react-pdf`.
4. **Tích hợp Upload:**
   - Thêm nút "Lưu thành CV của tôi".
   - Viết logic tạo `Blob` bất đồng bộ (sử dụng `pdf(<Document />).toBlob()`), gắn vào FormData.
   - Gọi API Upload CV và hiện toast thông báo thành công.

## 4. Ghi chú của chủ dự án
