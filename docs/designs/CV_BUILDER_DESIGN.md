# Thiết kế chức năng Tạo CV (CV Builder)

## 1. Tổng quan
Chức năng Tạo CV (CV Builder) cho phép ứng viên tự động tạo một bản CV định dạng PDF dựa trên các thông tin đã điền trong Hồ sơ cá nhân (Candidate Profile) trên hệ thống. Ứng viên không cần phải gõ lại thông tin, chỉ cần chọn mẫu (template), tuỳ chỉnh màu sắc/font chữ và xuất file.

**Mục tiêu:**
- Tận dụng tối đa dữ liệu có sẵn (`Education`, `Experience`, `Skill`, `Projects`, `Certificates`, `Awards`).
- Giảm rào cản ứng tuyển cho sinh viên chưa có CV.
- Xuất ra file PDF chuẩn, có thể tải về hoặc lưu trực tiếp vào danh sách CV trên nền tảng.

## 2. Kiến trúc và Công nghệ
**Frontend-first approach**: Chức năng này được xử lý hoàn toàn ở phía Frontend (client-side) để giảm tải cho server và cung cấp trải nghiệm realtime preview.

- **Thư viện chính:** `@react-pdf/renderer` (đã có sẵn trong dự án).
  - Kết xuất file PDF trực tiếp trên trình duyệt.
  - Hỗ trợ xây dựng UI cho PDF bằng các component giống React (`<Document>`, `<Page>`, `<View>`, `<Text>`).
- **Data Source:** Các API đã có của Candidate Profile.
  - `GET /api/candidates/me/profile` (hoặc các endpoint tương đương lấy thông tin học vấn, kỹ năng, kinh nghiệm...).
- **Upload CV:** Tận dụng API Upload CV đã làm ở Phase 7.
  - `POST /api/candidates/me/cvs`: Upload trực tiếp `Blob` PDF sinh ra từ `@react-pdf/renderer`.

## 3. Luồng hoạt động (User Flow)
1. **Truy cập:** Người dùng vào mục **Tạo CV** từ menu hoặc từ trang Quản lý CV.
2. **Chọn mẫu:** Hệ thống cung cấp sẵn 2-3 mẫu template cơ bản (VD: Minimalist, Professional, Creative).
3. **Tuỳ chỉnh & Xem trước (Preview):** 
   - Màn hình chia đôi: Một bên là các tuỳ chọn (Màu chủ đạo, Kích cỡ chữ, Bật/Tắt các phần như "Giải thưởng", "Dự án"), một bên là Preview PDF (hiển thị trực tiếp nhờ `<PDFViewer>` của `react-pdf`).
   - Mọi thay đổi đều được cập nhật realtime.
4. **Lưu/Tải về:**
   - **Tải xuống (Download):** Sinh file PDF và trigger download xuống máy.
   - **Lưu vào hệ thống:** Frontend tạo `Blob` dạng `application/pdf`, đóng gói vào `FormData` rồi gọi API `POST /api/candidates/me/cvs`. CV mới sẽ xuất hiện trong danh sách Quản lý CV.

## 4. Chi tiết thiết kế Template (@react-pdf)
Các component của `react-pdf` không dùng CSS thông thường mà dùng `StyleSheet.create`.

**Cấu trúc dữ liệu đầu vào (Context/Props):**
```typescript
interface CVData {
  personalInfo: { fullName, email, phone, address, avatar, summary };
  educations: Array<{ school, major, degree, gpa, startDate, endDate }>;
  experiences: Array<{ company, position, description, startDate, endDate }>;
  projects: Array<{ name, role, description, link }>;
  skills: Array<{ name, level }>;
  certificates: Array<{ name, organization, issueDate }>;
  awards: Array<{ name, organization, issueDate }>;
}
```

## 5. Tác động tới Backend
- **Không yêu cầu thay đổi Backend/DB mới.**
- Các API Profile (để lấy data) và API CV (để lưu file) đã được hoàn thiện trong Phase 3 và Phase 7.
- Chỉ cần đảm bảo API lấy thông tin trả về đủ các field cần thiết.

## 6. Kế hoạch triển khai (Frontend)
Vui lòng tham khảo `docs/05-frontend/phases/cv-builder/PLAN.md` (nếu có) để xem chi tiết từng bước code Frontend.
