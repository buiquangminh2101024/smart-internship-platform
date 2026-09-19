# CV AI Extraction — Phase 1: Trích xuất & Preview (Frontend)

Xem kế hoạch backend song song ở `docs/06-backend/cv-ai-extraction-phase1/PLAN.md` và bản nháp gốc `docs/temp/CV_OCR_PIPELINE_PROPOSAL.md`/`docs/temp/CV_JSON_TO_CANDIDATE_PROFILE_PROPOSAL.md` — không chép lại nội dung 3 file đó, chỉ ghi phần đặc thù frontend. Không thuộc phase đánh số nào trong `FRONTEND_PHASES.md` — retrofit cho `(candidate)/cv` (Phase 7 FE). Phạm vi Phase 1: nút trích xuất + màn preview đọc kết quả — **chưa cho sửa/lưu vào hồ sơ**, việc đó thuộc Phase 2 (`docs/05-frontend/phases/cv-ai-extraction-phase2/PLAN.md`).

**Trạng thái: đã code xong (2026-09-19).**

## Điều chỉnh khi triển khai

- Quyết định #3 (tăng timeout): không cần sửa gì — `httpClient` (axios) trong `api-client.ts` không đặt timeout. Giới hạn thật nằm ở nginx, đã nới riêng cho route `/extract` (xem PLAN backend).
- Hook dùng type `CandidateCvRecord` (mới, kế thừa `CvRecord`) thay vì `CvRecord`.
- Nút hiển thị "Phân tích lại" khi CV đã có kết quả; nút "Xem kết quả"/"Ẩn kết quả" hiện theo việc có `extractedData` (không theo `extractionStatus === "DONE"`), preview mở rộng ngay bên trong `CvCard`, tự mở sau khi phân tích xong.
- Upload nhận thêm JPG/PNG (khớp backend Quyết định #1).

## Quyết định mới chốt khi lên kế hoạch

1. Nút **"Phân tích CV"** đặt ngay trên mỗi `CvCard` trong `CvManagementClient.tsx` (danh sách CV đã có) — không tạo trang riêng.
2. Trạng thái extraction hiển thị trực tiếp trên `CvCard` bằng `Badge` theo `extractionStatus`: chưa phân tích (không badge) / đang phân tích (spinner, disable nút — vì Phase 1 backend chạy đồng bộ, không polling) / đã phân tích (badge "Đã phân tích", thêm nút "Xem kết quả").
3. **Tăng timeout riêng** cho lượt gọi `/extract` trong lớp gọi API (khác timeout mặc định các API khác) — lượt gọi này có thể mất 5-15 giây (Vision LLM), không được để timeout sớm làm tưởng lỗi trong khi backend vẫn đang xử lý.
4. Preview là khối **chỉ đọc (read-only)** ở Phase 1 — không cho sửa/xoá/lưu (thuộc Phase 2). Hiển thị theo từng khối tương ứng field trong `CvExtractionResult` (Thông tin cá nhân / Học vấn / Kinh nghiệm làm việc / Dự án / Chứng chỉ / Giải thưởng / Kỹ năng), có banner cảnh báo rõ khi `isValidCv: false` hoặc `extractionConfidence: "low"`.
5. Cảnh báo ghi đè khi bấm "Phân tích CV" lần 2 trên CV đã có `extractedData` (bản nháp mục 9.4) — dùng `ConfirmDialog` đã có sẵn trong `CvManagementClient.tsx` (đang dùng cho xoá CV).
6. `rawOcrText` (trường hợp fallback Tesseract, backend Phase 1 Quyết định #3) hiển thị như một khối text thô riêng trong preview, kèm ghi chú rõ "Không đọc được bằng AI, đây là văn bản thô — vui lòng tự nhập lại các mục cần thiết" — không cố gắng parse/format lại thành các khối có cấu trúc.

## Ảnh tham khảo bố cục UI

Chưa có mockup. Tham khảo gần nhất: `CvManagementClient.tsx` (danh sách `CvCard`) cho phần nút/badge; `admin/(console)/skills/page.tsx` cho phong cách hiển thị trạng thái theo `Badge`.

## Phần 1 — Công nghệ / kiến trúc đặc thù

- Không thêm thư viện mới — tái dùng `Card`/`Button`/`Badge`/`Icon`/`ConfirmDialog`/`ToastViewport` (`@/components/ui/*`), `apiFetch`/`apiUpload` (`@/lib/api-client.ts`).
- Mở rộng `apps/web/src/hooks/useCvs.ts`: thêm `useCvExtract()` (mutation `POST /candidates/me/cvs/:id/extract`, timeout dài hơn — Quyết định #3), invalidate `["candidateCvs"]` khi thành công để `CvCard` tự cập nhật `extractionStatus`/`extractedData` mới nhất.
- Component mới `apps/web/src/components/candidate/CvExtractionPreview.tsx` — nhận `data: CvExtractionResult` làm prop, render read-only theo từng khối (Quyết định #4/#6). Đặt cạnh `CvManagementClient.tsx`.

## Phần 2 — Liên kết giữa các phần

- Sửa `CvManagementClient.tsx`: mỗi `CvCard` thêm nút "Phân tích CV" (disable + spinner khi `extractionStatus === "PROCESSING"`); nếu `extractionStatus === "DONE"` hiện thêm nút "Xem kết quả" mở `CvExtractionPreview` (dùng cơ chế panel/mở-rộng đang có trong file, không thêm route mới).
- Bấm "Phân tích CV" khi đã có `extractedData` cũ → `ConfirmDialog` xác nhận ghi đè trước khi gọi `useCvExtract()` (Quyết định #5); chưa có kết quả cũ thì gọi thẳng, không cần confirm.
- Lỗi rate-limit (429) từ `useCvExtract()` → hiển thị message trả về từ backend trực tiếp trong toast (`ToastViewport` đã có sẵn trong file), theo đúng pattern lỗi chung của `apiFetch`.
- `isValidCv: false` → `CvExtractionPreview` hiện banner đỏ với `invalidReason`, không hiện các khối dữ liệu rỗng bên dưới (tránh gây hiểu nhầm là "đã trích được nhưng rỗng").
- `extractionConfidence: "low"` (kể cả trường hợp `rawOcrText`) → banner vàng "Kết quả có thể không đầy đủ, vui lòng kiểm tra kỹ" phía trên nội dung — vẫn hiện đầy đủ, không ẩn.

## Phần 3 — Các bước thực hiện (chia theo phạm vi, mỗi phần tự test được)

### FE-1: Hook `useCvExtract`

- Thêm vào `useCvs.ts` theo Phần 1.
- **Test:** gọi thành công cập nhật đúng `extractionStatus`/`extractedData` trong cache React Query; lỗi 429 propagate đúng message.

### FE-2: Nút "Phân tích CV" + badge trạng thái trên `CvCard`

- Sửa `CvManagementClient.tsx` theo Phần 2 (nút, badge, confirm ghi đè).
- **Test:** bấm nút gọi đúng CV theo `id`; disable đúng lúc đang xử lý; ghi đè có xác nhận, không ghi đè thì gọi thẳng.

### FE-3: `CvExtractionPreview`

- Tạo component theo Phần 1, gắn nút "Xem kết quả" mở nó lên (Phần 2).
- **Test:** hiển thị đúng từng khối theo dữ liệu thật trả về từ backend; banner `isValidCv`/`extractionConfidence` hiện đúng điều kiện; trường hợp `rawOcrText` hiển thị đúng khối text thô riêng.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
