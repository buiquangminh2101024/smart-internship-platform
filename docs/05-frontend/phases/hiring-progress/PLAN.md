# Số ứng viên phù hợp và tiến độ tuyển theo tin (0.3) — Frontend

> **Trạng thái: ĐÃ DUYỆT (2026-11-11). ĐỢT A XONG (F1, F2, F4); ĐỢT B (F3, F3b) VÀ F5 CHƯA LÀM.** Backend (`docs/06-backend/hiring-progress/PLAN.md`) đã xong, có API ở bước 5 và 6 bên đó.
>
> Làm theo 2 đợt, mỗi đợt một commit, rồi kiểm trên trình duyệt một lần:
>
> - **Đợt A = F1 + F2 + F4** (trang tổng quan và danh sách tin). F2 bỏ lượt xem và tỉ lệ nộp khỏi trang tổng quan, F4 đưa hai số này sang `/employer/jobs`, nên làm cùng một commit để không có lúc hai số này biến mất khỏi giao diện.
> - **Đợt B = F3 + F3b** (thẻ tự mời ở trang tin và trang tìm ứng viên). Cả hai đọc `useJobAutoOutreach` với cùng các trường `matched`, `matchedApplied`, `matchScoresAt`.
> - **F5** sau cả hai đợt.

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
| `/employer/jobs/[id]/candidate-search` | Dòng "N người điểm cao nhất trong M người phù hợp"; danh sách vẫn chấm trực tiếp | `GET …/auto-outreach` (đọc `status.matched`) |
| `/employer/jobs` | `JobMeta` thêm "Phù hợp N" (`matchedCount`, backend bước 6 đã có) và tỉ lệ nộp | `GET /employer/job-posts` |

Làm mới dữ liệu: khi có `AUTO_OUTREACH_SENT` hoặc ứng viên trả lời lời mời, `SocketProvider` đã làm mới key của thẻ 0.2. Thêm key `hiring-progress` vào cùng nhóm làm mới.

> Cập nhật 2026-11-11 (khi làm đợt A): key của hook mới là `["employer", "dashboard", "hiring-progress"]`, nằm dưới `EMPLOYER_DASHBOARD_KEY`. Mọi thông báo realtime tới Employer (gồm `AUTO_OUTREACH_SENT` và `CANDIDATE_OUTREACH_INVITATION_RESPONDED`) đã làm mới cả nhóm `["employer", "dashboard"]`, nên `SocketProvider` không cần sửa.

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

### Bước F3b — Trang tìm ứng viên (`jobs/[id]/candidate-search`)

- Danh sách "Gợi ý" **giữ chấm trực tiếp** như hiện tại. Chuyển sang đọc bảng điểm cùng lúc với tự mời của 0.2, sau 0.6.
- Thêm một dòng trên danh sách: "10 người điểm cao nhất trong 32 người phù hợp (12 đã nộp đơn)". Lý do: từ trang tổng quan bấm vào số "Phù hợp 32" sang đây mà chỉ thấy 10 người thì dễ thắc mắc.
- Số lấy từ `status.matched` / `status.matchedApplied` của `GET …/auto-outreach` (backend bước 5b), dùng lại hook `useAutoOutreach`. Khi làm, kiểm hai API có cùng quyền xem không (cả hai hiện đều chỉ cho người đăng tin). Nếu khác quyền thì báo lại, không tự thêm endpoint.
- `matchScoresAt = null` thì không hiện dòng này.
- Số người thật sự hiện ra có thể ít hơn 10 (pool nhỏ, hoặc đã mời hết), nên câu chữ dùng số thực tế: "N người điểm cao nhất…".

### Bước F4 — Danh sách tin (`/employer/jobs`)

- `JobMeta` đã có lượt xem và số ứng viên. Thêm:
  - "Tỉ lệ nộp x%" (hồ sơ / lượt xem, ẩn khi chưa có lượt xem; cùng cách tính với bảng cũ);
  - "Phù hợp N" cho tin đang hiển thị (backend bước 6 đã có `matchedCount`).
- `matchedCount` chỉ có ở tin `PUBLISHED` chưa quá hạn. Thiếu trường thì không hiện "Phù hợp". Danh sách tin không có `matchScoresAt`, nên tin vừa duyệt và chưa chấm xong (khoảng vài giây) hiện "Phù hợp 0".

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

### Đợt A — F1 + F2 + F4 (xong 2026-11-11)

- **File:**
  - mới: `components/dashboard/employer/HiringProgressPanel.tsx`, `components/employer/MatchedCount.tsx`;
  - sửa: `hooks/useEmployerDashboard.ts` (`useEmployerHiringProgress`, `HIRING_PROGRESS_KEY`), `app/employer/(portal)/dashboard/page.tsx`, `app/employer/(portal)/jobs/page.tsx`;
  - xoá: `components/dashboard/employer/JobPerformancePanel.tsx`.
- **`MatchedCount`:** dùng chung cho số "Phù hợp" ở F1, F4, và sẽ dùng ở F3. Số là link tới trang tìm ứng viên. `pending` thì hiện "Đang chấm…". Ghi "(x đã nộp)" khi x > 0.
- **Lệch so với mô tả F1, đã cân nhắc:**
  - Bảng 7 cột chỉ hiện từ `@4xl` (896 px vùng nội dung), không phải `@2xl` như bảng cũ, vì 7 cột không vừa. Màn 1280 px thì thấy bảng; màn 1024 px dùng dạng thẻ.
  - Thẻ ở màn hẹp có 3 dòng, không phải 2: dòng 3 là hạn nộp và "Bật tự mời". Gộp vào 2 dòng thì dòng 2 xuống hàng lộn xộn ở 375 px.
  - "Bật tự mời" / "Chưa bật tự mời" không hiện ở tin đã đủ chỉ tiêu, vì lúc đó không cần mời thêm.
  - `Bar` không chuyển nguyên mà viết lại: thanh so đã tuyển với chỉ tiêu (không còn so với tin nhiều hồ sơ nhất), đủ chỉ tiêu thì màu `success-600`, số kèm chữ ẩn "(đã đủ chỉ tiêu)".
  - Dòng phụ ghi "điểm phù hợp cập nhật lúc HH:mm ngày DD/MM" từ `scoredAt`; không có `scoredAt` thì bỏ phần này.
- **F4:** "Tỉ lệ nộp x%" hiện ở mọi trạng thái tin khi có lượt xem (cách tính như bảng cũ). "Phù hợp N" chỉ khi có `matchedCount`.
- **`SocketProvider` không sửa** (xem Phần 2).
- **Việc để lại cho đợt B:** `useUpdateJobAutoOutreach` cần làm mới `HIRING_PROGRESS_KEY` và danh sách tin `["employer", "job-posts"]` sau khi lưu cài đặt. Hiện chỉ làm mới chi tiết tin, nên sau khi đổi ngưỡng, trang tổng quan và `/employer/jobs` chỉ có số mới khi hết `staleTime` (mục 3 của F5).
- **Đã kiểm:** `tsc --noEmit`, `eslint` (các file sửa không có cảnh báo), `next build` của web đều qua. Chưa xem trên trình duyệt, để tới F5.

### Đợt B — F3 + F3b

Chưa làm.

## Phần 4 — Ghi chú của chủ dự án
