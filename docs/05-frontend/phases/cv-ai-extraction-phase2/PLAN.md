# CV AI Extraction — Phase 2: Lưu vào hồ sơ (Frontend)

Tiếp nối `docs/05-frontend/phases/cv-ai-extraction-phase1/PLAN.md`, dựa trên kế hoạch backend song song `docs/06-backend/cv-ai-extraction-phase2/PLAN.md` và bản nháp `docs/temp/CV_JSON_TO_CANDIDATE_PROFILE_PROPOSAL.md` (đặc biệt mục 4.1, 9.5) — không chép lại nội dung đã bàn. Không thuộc phase đánh số nào trong `FRONTEND_PHASES.md`. Phạm vi: từ lúc Candidate bấm **"Lưu vào hồ sơ"** trên preview (Phase 1) tới hết luồng, cộng thêm trang Admin duyệt `University`/`Major`.

**Trạng thái: đã triển khai (2026-09-19).** Xem "Ghi chú triển khai" ngay trước Phần 4.

## Quyết định mới chốt khi lên kế hoạch

1. Nút **"Lưu vào hồ sơ"** thêm vào `CvExtractionPreview` (đã tạo ở Phase 1) — chuyển từ read-only sang **editable**: mỗi dòng trong danh sách (Education/WorkExperience/Project/Certificate/Award) có nút bỏ khỏi lần import này (không xoá gì trên server, chỉ loại khỏi payload gửi lên); mỗi skill trong danh sách trích được có thể bỏ chọn; field đơn lẻ trên `Candidate` có radio "Giữ giá trị hiện tại" / "Dùng giá trị mới" — đúng thiết kế bản nháp mục 9.5.
2. Radio field đơn lẻ mặc định theo đúng bản nháp mục 9.5: field đang trống ở hồ sơ hiện tại → mặc định "Dùng giá trị mới"; field đã có giá trị → mặc định "Giữ giá trị hiện tại".
3. Sau khi "Lưu vào hồ sơ" thành công → hiện toast xác nhận + nút "Xem hồ sơ" dẫn tới `CandidateProfileClient.tsx` — không tự động điều hướng ngay, để Candidate còn có thể phân tích/lưu tiếp từ CV khác nếu muốn.
4. Trang Admin **gộp chung** `/admin/education-catalog` dùng **tab** "Trường" / "Ngành" trong cùng 1 trang (khác với backend gộp 2 model riêng — ở FE chỉ là 1 trang, 1 route), tái dùng layout `admin/(console)/skills/page.tsx`, thêm hành động thứ 4 **"Sửa tên & duyệt"** (input tên mới + nút xác nhận, hiện cạnh 3 nút Duyệt/Gộp/Từ chối đã có).
5. `SkillMultiSelect` (đã có sẵn) dùng lại nguyên vẹn cho phần chỉnh sửa skill trong `CvExtractionPreview` — không cần sửa component.

## Ảnh tham khảo bố cục UI

- `CandidateProfileClient.tsx` — `CollectionSection` (dòng 54-108) làm mẫu cho việc render danh sách có thể sửa/xoá.
- `admin/(console)/skills/page.tsx` — mẫu chính cho trang admin mới (thêm 1 hành động).

## Phần 1 — Công nghệ / kiến trúc đặc thù

- Không thêm thư viện mới.
- Sửa `CvExtractionPreview.tsx` (Phase 1) — thêm state chỉnh sửa cục bộ (không gọi API cho tới khi bấm "Lưu vào hồ sơ"): danh sách item có thể bỏ, field đơn lẻ có radio chọn (Quyết định #1/#2), phần skill dùng `SkillMultiSelect` ở chế độ chỉnh sửa danh sách đã trích.
- Hook mới trong `useCvs.ts`: `useCvProfileImport()` — mutation `POST /candidates/me/profile/import-from-cv`, invalidate cả `["candidateCvs"]` lẫn query key trang hồ sơ (xác nhận tên chính xác đang dùng trong `CandidateProfileClient.tsx` lúc code) khi thành công.
- Trang mới `apps/web/src/app/admin/(console)/education-catalog/page.tsx` — clone cấu trúc `admin/(console)/skills/page.tsx`, thêm tab Trường/Ngành, thêm hành động `rename-approve` vào discriminated mutation payload.

## Phần 2 — Liên kết giữa các phần

- `CvExtractionPreview` nhận thêm prop `onImport: (payload) => Promise<void>` — nút "Lưu vào hồ sơ" build `payload` (gồm `extractedData` đã lọc/sửa + `fieldOverrides` + `cvId`) từ state chỉnh sửa cục bộ, gọi `useCvProfileImport()`.
- Lỗi từ backend hiển thị qua toast (pattern có sẵn), không cần xử lý riêng theo loại lỗi.
- `AdminConsoleShell.tsx`: thêm nav item `{ label: "Danh mục học vấn", icon: "graduation-cap", href: "/admin/education-catalog", matchNested: true }` + `CRUMB_LABELS["education-catalog"] = "Danh mục học vấn"`.
- Trang admin mới: `useQuery(["adminUniversities"/"adminMajors", status])` theo tab đang chọn, mutation discriminated `{id, action: "approve"|"reject"|"merge"|"rename-approve", targetId?, correctedName?}` — y hệt pattern trang skills, chỉ thêm nhánh `rename-approve` (hiện ô nhập tên mới khi bấm, gửi `correctedName`, hiển thị lỗi 409 rõ ràng nếu trùng tên với entry `APPROVED` khác — theo backend Phase 2 Quyết định liên quan).

## Phần 3 — Các bước thực hiện (chia theo phạm vi, mỗi phần tự test được)

### FE-1: `CvExtractionPreview` chuyển sang editable + nút "Lưu vào hồ sơ"

- Sửa component theo Phần 1/2 (Quyết định #1/#2).
- **Test:** bỏ chọn 1 item trong danh sách → không xuất hiện trong payload gửi lên; đổi radio field đơn lẻ → đúng cờ `fieldOverrides` tương ứng; bỏ chọn 1 skill → không có trong `skills` gửi lên.

### FE-2: Hook `useCvProfileImport` + tích hợp

- Thêm hook, gắn vào nút "Lưu vào hồ sơ" (Quyết định #3 cho hành vi sau khi thành công).
- **Test:** gọi thành công → `Education`/`WorkExperience`/... mới xuất hiện khi load lại trang hồ sơ (`CandidateProfileClient.tsx`); Candidate xem lại thấy đúng dữ liệu vừa import, đúng field đơn lẻ đã chọn/không chọn ghi đè.

### FE-3: Trang Admin `/admin/education-catalog`

- Tạo trang theo Phần 1/2 (Quyết định #4), thêm nav sidebar (Phần 2).
- **Test:** tab Trường/Ngành hiển thị đúng danh sách `PENDING`; 4 hành động (Duyệt/Từ chối/Gộp/Sửa tên & duyệt) hoạt động đúng, `rename-approve` trùng tên với entry `APPROVED` khác hiện lỗi rõ ràng từ backend (409).

## Ghi chú triển khai (khác/bổ sung so với kế hoạch)

- **Kỹ năng trong preview dùng chip bật/tắt, không dùng `SkillMultiSelect`** (Quyết định #5): backend nhận `skills: string[]` rồi tự khử trùng lặp; `SkillMultiSelect` gọi `/skills/suggest` ngay khi chọn → tạo Skill PENDING trước cả khi Candidate bấm "Lưu vào hồ sơ".
- **Sau khi lưu** (Quyết định #3): toast + khung kết quả ngay trong preview có nút "Xem hồ sơ" (`/profile`) và danh sách cảnh báo từ backend — `Toast` hiện không có chỗ đặt nút.
- `CandidateProfileClient.tsx` không dùng react-query → thêm query mới `["candidateProfile"]` (`useCandidateProfile` trong `useCvs.ts`) chỉ để preview so sánh field đơn lẻ; nút lưu bị khoá tới khi tải xong hồ sơ, để mặc định "Giữ"/"Dùng mới" luôn đúng.
- Trang `/admin/education-catalog` có nút "Tải thêm" (danh sách trường/ngành đã duyệt dài hơn nhiều so với kỹ năng).

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
