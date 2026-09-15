# JobPost Skill — Hướng B: Skill tự nhập + duyệt (Frontend)

Xem thiết kế gốc ở `docs/designs/JOBPOST_SKILL_DESIGN.md` §6 (trang & bố cục dự kiến), checklist chuẩn bị ở `docs/temp/JOBPOST_SKILL_HUONG_B_SETUP.md`, và kế hoạch backend song song ở `docs/06-backend/jobpost-skill-huong-b/PLAN.md`. Không chép lại nội dung 3 file đó — chỉ ghi phần đặc thù frontend. Không thuộc phase đánh số nào trong `FRONTEND_PHASES.md` — retrofit cho `employer/(portal)/jobs` (Phase 6 FE) và `(candidate)/profile` (Phase 3 FE).

**Trạng thái: ĐÃ TRIỂN KHAI (2026-09-15).** Xem `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-9.

**Khác biệt so với plan khi triển khai:**
- `SkillMultiSelect` nhận `onAdd`/`onRemove` (thay vì một `onChange` cho cả danh sách) — hai nơi dùng có cách lưu khác nhau: hồ sơ Ứng viên lưu ngay từng kỹ năng lên server (giữ hành vi cũ của trang), còn form tin tuyển dụng gom vào `skillIds` rồi gửi một lượt.
- Bộ lọc kỹ năng ở `jobs/page.tsx` làm bằng **chip bấm bật/tắt** thay vì multi-select — danh mục còn nhỏ và chip dễ bấm trên điện thoại hơn.
- Màn Admin gộp kỹ năng mở **ngay trong thẻ** (panel thu gọn) thay vì modal — thao tác chỉ gồm một lựa chọn.
- Thêm mục "Kỹ năng" vào sidebar `AdminConsoleShell` (plan chưa nhắc), nếu không sẽ không có đường vào trang mới.
- Kỹ năng yêu cầu hiển thị trong `JobPostContent` (dùng chung cho xem trước/Admin/công khai) thay vì chỉ sửa riêng `jobs/[id]/page.tsx`.

## Quyết định mới chốt khi lên kế hoạch

1. Áp dụng cho cả Employer (form tạo/sửa `JobPost`) và Candidate (hồ sơ) — dùng chung 1 component multi-select + "đề xuất skill mới", gọi chung `POST /skills/suggest`.
2. **Không thêm thư viện combobox mới** (vd. `react-select`) — tự viết multi-select bằng Tailwind, đúng nguyên tắc "không tự thêm dependency" (`CLAUDE.md`); phần thêm dependency đã được duyệt ở backend (mục 4.3) chỉ áp dụng cho `apps/server`, không mở rộng ngầm sang `apps/web`.
3. Hiển thị rõ trạng thái "Đang chờ duyệt" cho skill vừa tự tạo (`matchType: "PENDING_REVIEW"`) khác với skill có sẵn (`matchType: "ALIAS"`/`"AUTO"`) — người dùng cần biết skill họ vừa thêm chưa chắc đã được duyệt công khai.
4. Rate-limit (10/tuần, 40/tháng mỗi user, 150/tuần toàn hệ thống — xem backend PLAN) cần thông báo lỗi rõ ràng khi chạm giới hạn, không phải lỗi chung chung.
5. Trang Admin duyệt skill là trang **mới**, chưa có mockup — bố cục dựa theo `admin/(console)/companies` đã có (cùng tinh thần duyệt/từ chối).
6. **Validate đầu vào phía client** (mirror rule backend, xem `docs/06-backend/jobpost-skill-huong-b/PLAN.md` Quyết định #8) — `SkillMultiSelect` chặn ngay trong UI trước khi gọi `POST /skills/suggest`: tên skill ≤ 50 ký tự, không có từ nào chỉ 1 ký tự, không được chỉ toàn khoảng trắng/ký tự đặc biệt. Đây là validate **cho UX** (phản hồi tức thì, đỡ round-trip vô ích + không tốn rate-limit cho input chắc chắn sai) — backend vẫn là nguồn xác thực cuối cùng, không bỏ qua validate backend dù đã chặn ở client.

## Ảnh tham khảo bố cục UI

Chưa có mockup cho tính năng này. Tham khảo bố cục gần nhất trong repo:
- `SkillSection` trong `apps/web/src/components/candidate/CandidateProfileClient.tsx:202-207` — pattern hiện tại: `<Select>` + input số năm kinh nghiệm + danh sách pill có nút xoá. Sẽ generalize thành component dùng chung, bỏ phần số năm kinh nghiệm khi dùng cho `JobPost`.
- `admin/(console)/companies` — bố cục màn duyệt (bảng hàng chờ + nút Approve/Reject) dùng làm tham khảo cho `admin/(console)/skills` mới.

## Phần 1 — Công nghệ / kiến trúc đặc thù

- Không thêm thư viện mới (xem quyết định 2). Tái dùng `apiFetch` (`lib/api-client.ts`), component có sẵn: `Select`, `Input`, `Button`, `Badge`, `Card`, `Field`.
- Tạo component dùng chung mới: `apps/web/src/components/shared/SkillMultiSelect.tsx` — thay thế logic riêng trong `SkillSection` (candidate) và dùng thêm ở form `JobPost` (employer). Props: `selected: SkillTag[]`, `onChange`, `catalog: CatalogItem[]`, `onSuggestNew: (name: string) => Promise<SuggestSkillResponse>`, `allowYearsOfExperience?: boolean` (chỉ bật cho Candidate).
- `SkillTag` hiển thị khác màu/badge tuỳ `matchType`: `"AUTO"`/`"ALIAS"` → pill thường (đã duyệt); `"PENDING_REVIEW"` → pill kèm badge vàng "Đang chờ duyệt" (dùng `Badge` tone `warning` có sẵn, đúng vocabulary đang dùng ở `JobPostStatus`).
- `SkillMultiSelect` validate tên skill ngay khi gõ, trước khi cho bấm "Thêm"/gọi API — hàm thuần `validateSkillName(name): string | null` (trả về thông báo lỗi hoặc `null` nếu hợp lệ) đặt cạnh component: độ dài ≤ 50 ký tự, không từ nào chỉ 1 ký tự, không chỉ toàn khoảng trắng/ký tự đặc biệt (đúng 3 rule ở Quyết định #6). Không dùng chung được schema zod của backend vì khác runtime — chấp nhận viết lại rule tương đương bằng tay, ngắn gọn, dễ giữ đồng bộ khi backend đổi ngưỡng.
- Danh sách admin (`admin/(console)/skills`) dùng React Query, cùng pattern `admin/(console)/companies/page.tsx`.

## Phần 2 — Liên kết giữa các phần

- Route mới: `apps/web/src/app/admin/(console)/skills/page.tsx` (danh sách `PENDING`), `.../skills/[id]/page.tsx` hoặc modal merge ngay trên danh sách (quyết định khi code — ưu tiên modal vì hành động đơn giản, không cần trang riêng).
- Sửa `apps/web/src/components/candidate/CandidateProfileClient.tsx`: thay logic `SkillSection` nội bộ bằng `SkillMultiSelect` dùng chung, giữ nguyên hành vi hiện có (chọn có sẵn + số năm kinh nghiệm) và **thêm mới** khả năng gõ tên chưa có → gọi `onSuggestNew`.
- Sửa form tạo/sửa `JobPost` (`employer/(portal)/jobs/new/page.tsx`, `.../jobs/[id]/page.tsx`): thêm `Section` "Kỹ năng yêu cầu" dùng `SkillMultiSelect` (không có số năm kinh nghiệm), đặt sau `requirements`/`benefits`.
- Trang public `jobs/[id]/page.tsx`: hiển thị tag skill (chỉ những skill đã `APPROVED` — theo đúng response backend, danh sách công khai không lộ skill `PENDING` của người khác) dưới khối `requirements`.
- Trang public `jobs/page.tsx` (danh sách/tìm kiếm): thêm filter "Kỹ năng" (multi-select đơn giản) bên cạnh filter lương/ngành/địa điểm hiện có — gọi `GET /catalog/skills` cho danh sách lựa chọn, thêm `skillIds` vào query string tìm kiếm.
- Thông báo lỗi rate-limit: `apiFetch` ném lỗi có `message` từ backend (đã có pattern chung trong `lib/api-client.ts`) — hiển thị trực tiếp trong `SkillMultiSelect` dưới ô nhập, không cần toast riêng.

## Phần 3 — Các bước thực hiện (chia theo phạm vi, mỗi phần tự test được)

### FE-1: Component dùng chung `SkillMultiSelect`
- Tạo `apps/web/src/components/shared/SkillMultiSelect.tsx` theo Phần 1 — chưa gắn vào đâu, test độc lập bằng 1 trang tạm hoặc Storybook-style nếu có, nếu không thì test trực tiếp khi gắn vào FE-2.
- **Test:** chọn từ catalog hoạt động, gõ tên mới gọi đúng `POST /skills/suggest`, hiển thị đúng badge theo `matchType` trả về.
- **Test validate client:** gõ tên dài > 50 ký tự / có từ 1 ký tự (vd. `"a Design"`) / chỉ toàn khoảng trắng hoặc ký tự đặc biệt → nút "Thêm" bị disable hoặc hiện lỗi ngay dưới ô nhập, **không** gọi `POST /skills/suggest`.

### FE-2: Candidate profile — chuyển sang dùng component chung
- Sửa `CandidateProfileClient.tsx` dùng `SkillMultiSelect` (`allowYearsOfExperience=true`), giữ nguyên hành vi cũ (không phá vỡ tính năng đã có từ Phase 3).
- **Test:** luồng cũ (chọn skill có sẵn + số năm kinh nghiệm) vẫn hoạt động y như trước; luồng mới (gõ tên chưa có) tạo skill `PENDING`, gắn vào hồ sơ ngay, hiển thị badge "Đang chờ duyệt".

### FE-3: Employer — form tạo/sửa JobPost
- Thêm `Section` "Kỹ năng yêu cầu" vào `jobs/new/page.tsx` và `jobs/[id]/page.tsx`, dùng `SkillMultiSelect` (`allowYearsOfExperience=false`).
- Submit gửi `skillIds` (gồm cả skill `PENDING` vừa tạo trong phiên) cùng các field khác đã có.
- **Test:** tạo/sửa tin gắn được skill có sẵn lẫn skill mới tự gõ; tin đã lưu hiển thị đúng danh sách skill khi load lại trang sửa.

### FE-4: Public — hiển thị & lọc theo skill
- `jobs/[id]/page.tsx`: hiển thị tag skill (chỉ `APPROVED`) dưới `requirements`.
- `jobs/page.tsx`: thêm filter "Kỹ năng" vào bộ lọc hiện có.
- **Test:** Guest xem được tag skill ở trang chi tiết; lọc theo 1-nhiều skill trả đúng kết quả.

### FE-5: Admin — duyệt skill mới
- `admin/(console)/skills/page.tsx`: bảng danh sách `Skill PENDING` (tên, người đề xuất, ngày tạo, `pendingMatchSkill` gợi ý nếu có) + action Approve/Reject/Merge (modal chọn skill đích khi Merge, dùng lại `SkillMultiSelect` ở chế độ single-select cho việc chọn skill đích).
- **Test:** Admin approve → skill xuất hiện trong `GET /catalog/skills` công khai; reject → skill biến mất, liên kết cũ bị xoá theo cascade; merge → liên kết cũ trỏ đúng sang skill đích, `SkillAlias` mới xuất hiện (kiểm tra qua Prisma Studio nếu cần).

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
