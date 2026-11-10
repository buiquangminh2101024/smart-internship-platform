# Số ứng viên phù hợp và tiến độ tuyển theo tin (0.3) — Frontend

> **Trạng thái: BẢN NHÁP, CHỜ CHỦ DỰ ÁN DUYỆT (2026-11-10).** Chưa code. Làm sau backend (`docs/06-backend/hiring-progress/PLAN.md`), vì cần API ở bước 5 và 6 bên đó.

Mục 0.3 của `docs/01-project/FEATURE_BACKLOG.md`.

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency. Theo quy ước UI của skill `sip-ui` (token, `Panel`/`PanelHead`, `BlockSkeleton`/`BlockError` của dashboard).
- TanStack Query:
  - hook mới `useEmployerHiringProgress` trong `hooks/useEmployerDashboard.ts`;
  - thẻ tự mời dùng lại `hooks/useAutoOutreach.ts`; chỉ thêm trường hiển thị.
- **Không thêm khối mới ở trang tổng quan**: khối "Hiệu quả tin đang hiển thị" được thay bằng "Tiến độ tuyển theo tin" ở **đúng vị trí cũ**.

## Phần 2 — Liên kết giữa các phần

| Trang | Thay đổi | API |
|---|---|---|
| `/employer/dashboard` | `HiringProgressPanel` thay `JobPerformancePanel` | `GET /employer/dashboard/hiring-progress` |
| `/employer/jobs/[id]` | Thẻ "Tự động mời ứng viên" thêm dòng "Phù hợp" và "Phỏng vấn" | `GET …/auto-outreach` (thêm trường) |
| `/employer/jobs` | `JobMeta` thêm "Phù hợp N" (nếu làm bước 6 backend) và tỉ lệ nộp | `GET /employer/job-posts` |

Làm mới dữ liệu: khi có `AUTO_OUTREACH_SENT` hoặc ứng viên trả lời lời mời, `SocketProvider` đã làm mới key của thẻ 0.2. Thêm key `hiring-progress` vào cùng nhóm làm mới.

## Phần 3 — Các bước thực hiện

### Bước F1 — `HiringProgressPanel` (trang tổng quan)

```text
Tiến độ tuyển theo tin
Đã tuyển 3/20 người trên 8 tin đang hiển thị · 126 ứng viên phù hợp · cập nhật 03:30

Tin tuyển dụng          Phù hợp        Đã mời  Nhận lời  Phỏng vấn  Đã tuyển   Hạn nộp
Backend Node.js         32 (12 đã nộp)   12       3          2      0/2 ▓░░    còn 3 ngày
Frontend React          18 (4 đã nộp)     0       0          1      0/3        12/12/2026
                                                                     Bật tự mời →
...
Xem tất cả 8 tin đang hiển thị →
```

- Hiện 5 tin theo thứ tự backend trả về ("cần chú ý"), không sắp lại ở client.
- **Cột Đã tuyển:**
  - "a/b" với `b = hiringTarget`, kèm thanh nhỏ (dùng lại `Bar` đang có trong `JobPerformancePanel`);
  - đủ chỉ tiêu thì tô màu thành công;
  - tin chưa bật tự mời: thêm link nhỏ "Bật tự mời" tới `/employer/jobs/[id]`, **chỉ khi `ownedByViewer`**, vì thẻ cài đặt chỉ người đăng tin thấy. Người khác thấy chữ "Chưa bật tự mời", không có link.
- **Cột Phù hợp:**
  - `matchScoresAt = null` thì hiện "Đang chấm…", không hiện 0;
  - số là link tới trang tìm ứng viên của tin (`/employer/jobs/[id]/candidate-search`).
- **Hạn nộp:** còn ≤ 7 ngày thì tô marigold, giống bảng cũ.
- **Dòng phụ dưới tiêu đề:** tổng đã tuyển / tổng chỉ tiêu, tổng phù hợp, giờ cập nhật (`scoredAt`). Đây là dòng chữ, không phải thẻ số mới.
- **Màn hẹp:** danh sách dạng thẻ như `NarrowList` hiện có. Mỗi tin 2 dòng: tiêu đề + "Đã tuyển a/b"; "Phù hợp · Đã mời · Nhận lời · Phỏng vấn".
- **Trạng thái rỗng:** "Chưa có tin nào đang hiển thị…" như cũ.
- **Tải và lỗi:** `BlockSkeleton` / `BlockError` riêng của khối.

### Bước F2 — Gỡ `JobPerformancePanel`

- `dashboard/page.tsx` dùng `HiringProgressPanel` thay `JobPerformancePanel`, sửa chú thích đầu file cho đúng thứ tự khối.
- **Xoá** `components/dashboard/employer/JobPerformancePanel.tsx` (chủ dự án đồng ý 2026-11-10). Lượt xem và tỉ lệ nộp chuyển sang `/employer/jobs` (F4). Chuyển `Bar` sang `HiringProgressPanel` trước khi xoá.

### Bước F3 — Thẻ "Tự động mời ứng viên" (`jobs/[id]`)

Thêm một dòng trên dòng trạng thái hiện có:

```text
Phù hợp 32 (12 đã nộp) · Phỏng vấn 2
Đang giữ 12/12 lời mời · 3 đã nhận lời · Đã tuyển 0/2
```

- "Phù hợp" là link tới trang tìm ứng viên của tin.
- `matchScoresAt = null` thì hiện "Đang chấm…".
- Lưu cài đặt đổi ngưỡng ⇒ làm mới thẻ (đã có), số Phù hợp đổi theo ngưỡng mới mà không cần chấm lại.

### Bước F4 — Danh sách tin (`/employer/jobs`)

- `JobMeta` đã có lượt xem và số ứng viên. Thêm:
  - "Tỉ lệ nộp x%" (hồ sơ / lượt xem, ẩn khi chưa có lượt xem; cùng cách tính với bảng cũ);
  - "Phù hợp N" cho tin đang hiển thị, nếu backend làm bước 6.

### Bước F5 — Kiểm trên trình duyệt

Với tài khoản Mây Xanh của bộ demo lớn:

1. Trang tổng quan có đúng 5 tin, đúng thứ tự "cần chú ý". Số khớp API. Không có khối mới so với trước.
2. Đăng nhập một employer khác cùng công ty (không phải người đăng tin): thấy bảng, không thấy link "Bật tự mời".
3. Đổi ngưỡng ở thẻ tin 80 → 70 ⇒ số Phù hợp ở thẻ và ở trang tổng quan (sau khi làm mới) tăng.
4. Ứng viên nhận lời mời ⇒ cột "Nhận lời" tăng mà không cần tải lại trang (socket).
5. Màn hẹp 375 px: không cuộn ngang.
6. `npm run build` / `typecheck` cho web.

## Ngoài phạm vi

- Trang riêng liệt kê tiến độ của mọi tin: dùng "Xem tất cả" sang `/employer/jobs`.
- Biểu đồ phễu: giáo viên đã nhắc không nhồi biểu đồ không cần thiết.

## Ghi chú triển khai

Điền khi làm.

## Phần 4 — Ghi chú của chủ dự án
