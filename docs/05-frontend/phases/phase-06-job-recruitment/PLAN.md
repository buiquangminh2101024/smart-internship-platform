# Phase 6 (Frontend) — Job Recruitment Module

Xem tổng quan ở `docs/05-frontend/FRONTEND_PHASES.md` §Phase 6 và kế hoạch backend song song ở `docs/06-backend/phase-06-job-recruitment/PLAN.md`. Không chép lại nội dung 2 file đó — chỉ ghi phần đặc thù frontend.

**Lưu ý route thật** (khác tên tạm `(public)/jobs`/`(employer)/jobs`/`(admin)/jobs` ghi trong `FRONTEND_PHASES.md`): repo dùng segment thật `employer/(portal)/...`, `admin/(console)/...`, còn public/guest nằm ở root như `(candidate)/*` — xem Phần 2.

## Ảnh tham khảo & bố cục giao diện

Thư mục: `C:\Users\QUANG MINH\Pictures\Screenshots\`. Đọc trực tiếp bằng Read tool trước khi code UI tương ứng:

| File | Sub-part | Bố cục chính |
|---|---|---|
| `Screenshot 2026-09-12 134041.png` | 6-FE-1 | 3 panel: (1) Employer dashboard — sidebar trái + 4 `StatCard` + bảng "tin gần đây"; (2) form tạo tin — sidebar + form 1 cột (Thông tin cơ bản → Chi tiết công việc), banner xanh "công ty đã xác minh"; (3) trang kết quả — card giữa màn hình + stepper ngang 4 bước (Tạo tin → Gửi duyệt → Admin kiểm tra → Công khai) |
| `Screenshot 2026-09-12 134155.png` | 6-FE-1 | Trang xem trước — 2 cột (nội dung tin trái, "Thông tin công ty" sticky phải), banner cảnh báo cam đầu trang, 2 nút cuối trang (Quay lại chỉnh sửa / Gửi duyệt) |
| `Screenshot 2026-09-12 134326.png` | 6-FE-2 | 3 panel: (1) Admin dashboard — sidebar + 3 `StatCard` + bảng "tin chờ duyệt"; (2) trang review — 2 cột (nội dung tin trái, card công ty + trạng thái + 2 nút Duyệt/Từ chối phải); (3) kết quả duyệt — card giữa + stepper 5 bước |
| `Screenshot 2026-09-12 134745.png` | 6-FE-2 | 2 panel: (1) modal từ chối đè nền mờ — checkbox lý do + textarea + 2 nút (Hủy/Xác nhận từ chối); (2) kết quả từ chối — card đỏ + lý do + stepper dừng ở "Từ chối" |
| `Screenshot 2026-09-12 135023.png` | 6-FE-3 | Danh sách quản lý tin — thanh tìm kiếm + 2 filter dropdown, danh sách card dọc (tiêu đề + badge trạng thái + meta trái, action link phải), phân trang cuối trang |
| `Screenshot 2026-09-12 135146.png` | 6-FE-3 | Chi tiết quản lý 1 tin — 2 cột: nội dung tin trái, 3 card nhỏ dọc phải (Thao tác nhanh / Tổng quan ứng viên / Thông tin chung); 4 `StatCard` ngang đầu trang (lượt xem/ứng viên/hạn/trạng thái duyệt) |
| `Screenshot 2026-09-12 135406.png` | 6-FE-3 | Banner cảnh báo đỏ full-width, 2 dòng (tiêu đề + "Lý do: ...") — chèn đầu trang chi tiết/sửa tin khi `latestModerationAction` là `REJECTED`/`RETRACTED` |
| `Screenshot 2026-09-12 135704.png` | 6-FE-4 (tối giản) | Trang public — topbar marketing + chi tiết tin 2 cột (nội dung trái, card công ty phải) — chỉ tham khảo bố cục tổng quát, sẽ làm lại chi tiết sau |

## Phần 1 — Công nghệ / kiến trúc đặc thù

- Không thêm thư viện mới. Tái dùng `apiFetch`/`publicFetch` (`lib/api-client.ts`) và component có sẵn: `JobCard`, `Badge`, `Card`, `Button`, `Field`, `Select`, `Input`, `Textarea`, `StatCard`, `Icon`.
- Mở rộng `components/ui/JobCard.tsx` thêm prop `status`/`verified`/`deadline`/`footer` (đúng shape đã thiết kế sẵn ở `docs/template_ui/components/domain/JobCard`), dùng `Badge` với tone cố định theo vocabulary (xem Phần 2).
- Form tạo/sửa tin dùng pattern `useState` + `apiFetch` thường (như `CreateCompanyForm`), không dùng `CollectionSection` (single-entity nhiều bước, không phải list CRUD).
- Danh sách (employer job list, admin queue) dùng React Query như `admin/(console)/companies/page.tsx`.

## Phần 2 — Liên kết giữa các phần

- **Status vocabulary cố định** (lấy nguyên từ `docs/template_ui/components/feedback/StatusPill.jsx`, không tự đặt từ mới): `draft`→"Nháp" (neutral), `review`→"Chờ duyệt" (warning/marigold), `published`→"Đang hiển thị" (success/pine), `closed`→"Đã đóng" (neutral), `expired`→"Hết hạn" (neutral), `takendown`→"Đã hạ" (danger). Map `JobPostStatus`: `DRAFT`→draft, `PENDING`→review, `PUBLISHED`→published, `CLOSED`→closed, `EXPIRED`→expired, `TAKEN_DOWN`→takendown.
- Route thật: `apps/web/src/app/employer/(portal)/jobs/page.tsx` (danh sách), `.../jobs/new/page.tsx` (tạo), `.../jobs/[id]/page.tsx` (chi tiết/sửa); `apps/web/src/app/admin/(console)/jobs/page.tsx` (hàng đợi), `.../jobs/[id]/page.tsx` (review); public: `apps/web/src/app/jobs/page.tsx` (tìm kiếm), `apps/web/src/app/jobs/[id]/page.tsx` (chi tiết) — root-level giống `(candidate)/*`.
- `apps/web/src/lib/sample-jobs.ts` (placeholder trang chủ candidate) được thay bằng `publicFetch` thật tới `/job-posts` sau khi 6-FE-4 xong.
- Banner từ chối/thu hồi lấy từ field `latestModerationAction` có sẵn trong response chi tiết tin (không gọi API riêng, không đụng `notifications`).

## Phần 3 — Các bước thực hiện (4 sub-part, mỗi phần tự test được)

### 6-FE-1: Employer tạo & gửi duyệt tin (ảnh 1, 2)
- Form đủ field theo schema thật: `title`, `industryId`, `cityId` + `address`, `jobType` (dịch 4 giá trị enum: Thực tập/Bán thời gian/Toàn thời gian/Hợp đồng), lương (`salaryMin`/`salaryMax` hoặc `isNegotiable`), `expiresAt` (date picker, validate ≤ 90 ngày), `description`, `requirements`, `benefits`. Nút "Lưu nháp" / "Xem trước" / "Gửi duyệt".
- Trang xem trước: đọc lại toàn bộ nội dung + nút "Quay lại chỉnh sửa" / "Gửi duyệt".
- Trang kết quả: stepper Tạo tin → Gửi duyệt → Admin kiểm tra / Công khai tùy `requiresApproval`.
- **Test:** Employer công ty đã verified, còn quota/trial, tạo tin → đúng trạng thái PENDING hoặc PUBLISHED tùy `requiresApproval`; hết quota bị chặn kèm lý do rõ ràng.

### 6-FE-2: Admin duyệt/từ chối (ảnh 3, 4)
- `admin/(console)/jobs`: bảng hàng đợi PENDING (React Query) + `StatCard` tổng quan.
- `admin/(console)/jobs/[id]`: chi tiết tin + info công ty + nút Duyệt / Từ chối.
- Modal từ chối: checkbox lý do (Thiếu thông tin / Nội dung không phù hợp / Thông tin không hợp lệ / Vi phạm chính sách / Khác) + textarea tự do, ghép thành 1 chuỗi `reason` gửi backend.
- Trang kết quả duyệt/từ chối với stepper.
- **Test:** Admin duyệt 1 tin PENDING → PUBLISHED; từ chối kèm lý do → tin về DRAFT, ghi log REJECTED.

### 6-FE-3: Employer quản lý tin đã đăng + banner từ chối/thu hồi (ảnh 5, 6, 7)
- `employer/(portal)/jobs`: danh sách đầy đủ, filter theo trạng thái (đúng vocabulary), tìm kiếm, phân trang; action theo trạng thái (Xem/Sửa/Đóng tin).
- `employer/(portal)/jobs/[id]`: chi tiết quản lý (view count thật, applicant count = 0 placeholder vì Phase 8 chưa có, hạn còn lại, trạng thái duyệt), nút Sửa / Xem public / Đóng tin.
- Banner đỏ khi DRAFT có `latestModerationAction.action==="REJECTED"`, hoặc khi TAKEN_DOWN — hiển thị `reason` + ngày.
- **Test:** Employer thấy đúng banner lý do, sửa & gửi duyệt lại được; đóng 1 tin PUBLISHED → CLOSED, không ảnh hưởng `retractionCount`.

### 6-FE-4 (tối giản — sẽ chi tiết hoá sau khi có mẫu đầy đủ): Guest tìm kiếm công khai (ảnh 8)
- `app/jobs/page.tsx`: danh sách `JobCard` + filter cơ bản lương/ngành/địa điểm.
- `app/jobs/[id]/page.tsx`: chi tiết tin công khai tối giản, tăng `viewCount`.
- Nút "Ứng tuyển ngay" / "Lưu tin" chỉ dẫn tới đăng nhập hoặc disable — **không** implement logic thật (thuộc Phase 7/8).
- **Test:** Guest chưa đăng nhập lọc được theo lương/ngành/địa điểm, mở được chi tiết 1 tin PUBLISHED.
- Phần này sẽ được thiết kế lại chi tiết khi chủ dự án cung cấp mẫu UI đầy đủ.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
