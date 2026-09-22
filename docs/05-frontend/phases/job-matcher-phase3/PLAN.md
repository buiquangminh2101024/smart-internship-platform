# Job Matcher — Giai đoạn 3: Yêu cầu có cấu trúc qua LLM + Employer xác nhận (Frontend)

Song song với `docs/06-backend/job-matcher-phase3/PLAN.md` (schema, API, công thức chấm điểm, quyết định #1–#7 — **không chép lại ở đây**). Tiếp nối `docs/05-frontend/phases/job-matcher-phase1/PLAN.md` (đã có `SkillMultiSelect` với `onChangeImportance`, `JobPostForm`, `JobMatchCard`, `useJobMatch.ts`). Phạm vi: (1) form tin Employer — nút "Phân tích yêu cầu bằng AI" + bảng xem trước + số năm/skill + ngành yêu cầu + 3 nudge; (2) trang Admin duyệt tin — checklist.

**Trạng thái: đã code xong FE-1 → FE-5 (2026-09-22); `tsc`, ESLint, `next build` sạch. Mọi API mà FE gọi đã kiểm end-to-end với server thật (2026-09-23, xem Ghi chú triển khai của PLAN backend bước 8). Còn phần bấm thử trên trình duyệt của FE-6.**

## Quyết định mới chốt khi lên kế hoạch

1. **Bảng xem trước AI là component mới `RequirementExtractionPreview.tsx`**, viết theo đúng khuôn `CvExtractionPreview.tsx` (`components/candidate/CvExtractionPreview.tsx`, đã có từ CV AI Extraction Phase 2): state chỉnh sửa **cục bộ**, không gọi API cho tới khi bấm "Áp dụng"; mỗi dòng có nút bỏ (theo mẫu `Item`/`onToggle` đã có trong file đó). Không sửa `CvExtractionPreview.tsx` — khác domain (yêu cầu tin, không phải hồ sơ CV), tạo file riêng trong `components/employer/`.
2. **`SkillMultiSelect` thêm prop tuỳ chọn thứ 3, cùng khuôn `onUpdateYears`/`onChangeImportance` đã có:**

   ```ts
   onChangeMinYears?: (skillId: string, minYears: number | null) => void;
   ```

   Chỉ hiện ô số khi **cả** `onChangeImportance` **và** `onChangeMinYears` được truyền (ngữ cảnh form tin) — không đụng hành vi hồ sơ Candidate (`allowYearsOfExperience`/`onUpdateYears` không đổi). Ô số đặt cạnh công tắc Bắt buộc/Ưu tiên trên mỗi chip, để trống = `null` = "không yêu cầu số năm riêng cho skill này" — dùng được **độc lập với AI** (Employer gõ tay vẫn được, đúng nguyên tắc BE quyết định #1: field cấu trúc, không bắt buộc qua LLM).
3. **Ngành yêu cầu dùng lại đúng cách gọi `/catalog/majors`** đã có ở form học vấn Candidate (`CandidateProfileClient.tsx` dòng ~128) — không tạo endpoint mới. Dựng ô chọn nhiều **`MajorRequirementSelect`** (mới, trong `components/employer/`): tìm theo tên trong danh mục đã tải, mỗi mục chọn có công tắc "Đúng ngành" / "Ngành liên quan" (map `PRIMARY`/`RELATED`).
4. **Nút "Phân tích yêu cầu bằng AI"** chỉ hiện khi tin còn `DRAFT` (khớp ràng buộc backend — ẩn hẳn khi `PENDING`/`PUBLISHED`, không disable-và-giải-thích, tránh rối giao diện).
5. **3 nudge** (đặt ở `JobPostForm.tsx`, quanh ô `requirements` — **không đụng ô `description`**, hai ô khác mục đích theo đã chốt khi bàn kế hoạch):
   - Placeholder ví dụ mẫu trong `<textarea>` ô `requirements`.
   - Chỉ báo độ đầy đủ **không chặn submit**, tính thuần ở FE từ state hiện có (không gọi API riêng): số skill có `minYears`, có ngành yêu cầu hay chưa, có `requirementsConfirmedAt` hay chưa.
   - Nút "Phân tích lại" (gọi lại `extract`) chỉ hiện sau khi Employer sửa `requirements`/`description` **kể từ lần phân tích gần nhất** (so sánh string cục bộ, không cần lưu trạng thái riêng).
6. **Checklist Admin đặt trong trang có sẵn `app/admin/(console)/jobs/[id]/page.tsx`** — không tạo route mới. Auto-check tính thuần từ response `GET /admin/job-posts/:id` đã có (không gọi API mới); checklist thủ công là state cục bộ (checkbox không lưu server) chỉ để nhắc Admin, không ràng buộc gì backend.
7. Không thêm thư viện mới.

## Hook mới / mở rộng — `useJobMatch.ts` (đã có từ GĐ1) và `useJobPosts.ts`

| Hook | Kiểu | Ghi chú |
|---|---|---|
| `useExtractJobRequirements(jobPostId)` | mutation | `POST /employer/job-posts/:id/requirements/extract` → `ExtractedJobRequirements`; không tự retry (429/502 hiện lỗi rõ, Employer tự bấm lại) |
| `useConfirmJobRequirements(jobPostId)` | mutation | `PUT /employer/job-posts/:id/requirements`; thành công → invalidate query chi tiết tin (`["employer", "job-posts", jobPostId]`) để form nạp lại `minYears`/`majors`/`requirementsConfirmedAt` mới |

Đặt cả hai trong `hooks/useJobPosts.ts` (cạnh các hook CRUD tin đã có), không thêm file hook mới — khác `useJobMatch.ts` (dành cho phía **xem** điểm match, không phải phía **nhập** yêu cầu).

## Component mới

- `components/employer/RequirementExtractionPreview.tsx` — bảng xem trước (Quyết định #1). Props: `draft: ExtractedJobRequirements`, `onApply: (payload: ConfirmRequirementsRequest) => Promise<void>`, `onCancel`, `onReanalyze`.
- `components/employer/MajorRequirementSelect.tsx` — chọn ngành yêu cầu (Quyết định #3). Props: `selected: Array<{ majorId; majorName; relevance }>`, `catalog: CatalogItem[]`, `onAdd`, `onRemove`, `onChangeRelevance`.

Bố cục bảng xem trước (tham khảo mockup ở BE PLAN mục "Giao diện", chi tiết hoá cho FE):

```text
┌─ AI phân tích yêu cầu của tin ──────────────────── Độ tin cậy: Cao ─┐
│  Kỹ năng bắt buộc                                                    │
│   [✓] Java  (dòng tô nhạt nếu confidence LOW)      [+ thêm kỹ năng]  │
│   Số năm: Java [ 1 ]  Spring Boot [   ]  PostgreSQL [   ]            │
│  Kỹ năng ưu tiên                                                     │
│   [✓] Docker                                                         │
│  Chưa có trong danh mục — [Tìm/thêm trong danh mục kỹ năng]          │
│  Kinh nghiệm chung tối thiểu: [ 0.5 ] năm                            │
│  Ngành học phù hợp                                                   │
│   Đúng ngành: Khoa học máy tính                    [+ thêm ngành]    │
│   Ngành liên quan: Kỹ thuật phần mềm, CNTT ứng dụng     [✕] [✕]      │
│  Ngoại ngữ    Tiếng Anh — Ưu tiên   (chỉ hiển thị, không chấm điểm)  │
│  ─ AI chỉ gợi ý; bạn là người quyết định cuối cùng. ─                │
│                                   [Huỷ]   [Phân tích lại]  [Áp dụng] │
└──────────────────────────────────────────────────────────────────────┘
```

Dòng có `confidence: "LOW"` tô nhạt/viền đứt (dùng class Tailwind sẵn có kiểu `opacity-70 border-dashed`, không cần token màu mới).

## Thay đổi ở file hiện có

| File | Thay đổi |
|---|---|
| `components/shared/SkillMultiSelect.tsx` | Thêm prop `onChangeMinYears?` (Quyết định #2); ô số nhỏ cạnh chip khi có cả 2 prop importance+minYears |
| `components/jobs/JobPostForm.tsx` | State `skills` thêm `minYears`; state mới `majors: Array<{majorId, majorName, relevance}>`; nút "Phân tích yêu cầu bằng AI" (Quyết định #4) mở `RequirementExtractionPreview` trong modal/panel; 3 nudge quanh ô `requirements` (Quyết định #5); khi lưu gửi `minYears` cho từng skill nếu Employer nhập tay (không bắt buộc qua AI) |
| `app/employer/(portal)/jobs/[id]/page.tsx` | Không đổi cấu trúc — `JobPostForm` tự chứa toàn bộ luồng mới |
| `app/admin/(console)/jobs/[id]/page.tsx` | Thêm khối checklist (Quyết định #6): auto-check đọc từ dữ liệu đã fetch, checklist thủ công dạng `<input type="checkbox">` state cục bộ, không gửi server |
| `hooks/useJobPosts.ts` | + 2 hook mới ở trên |

## Các bước thực hiện

### FE-1: `SkillMultiSelect` + số năm/skill trong form tin

- Thêm prop `onChangeMinYears` theo Quyết định #2.
- **Test:** form tin nhập số năm cho 1 skill, không đụng AI ⇒ lưu nháp ⇒ mở lại thấy đúng số; hồ sơ Candidate (`/profile`) không đổi giao diện chip (kiểm hồi quy, dùng chung component); để trống ô số ⇒ lưu được `null`.

### FE-2: `MajorRequirementSelect` + state ngành trong `JobPostForm`

- Component mới + gắn vào form, gọi `/catalog/majors` đã có.
- **Test:** thêm ngành, đổi Đúng ngành/Liên quan, xoá ngành ⇒ đúng payload `majors[]` khi lưu.

### FE-3: `RequirementExtractionPreview` + 2 hook + nút "Phân tích yêu cầu bằng AI"

- Component mới + `useExtractJobRequirements`/`useConfirmJobRequirements` + gắn nút vào `JobPostForm` (chỉ hiện khi `DRAFT`).
- **Test:** bấm phân tích ⇒ hiện bảng đúng dữ liệu AI trả; bỏ tick 1 skill/thêm 1 dòng tay/đổi Bắt buộc↔Ưu tiên/sửa số năm/đổi mức ngành ⇒ bấm Áp dụng ⇒ tin cập nhật đúng (`JobPostSkill`, `JobPostMajor`, `minExperienceYears`); lỗi 429/502 ⇒ thông báo tiếng Việt, form vẫn dùng tay bình thường; tin đã `PUBLISHED` ⇒ không thấy nút.

### FE-4: 3 nudge quanh ô `requirements`

- Placeholder, chỉ báo độ đầy đủ, nút "Phân tích lại".
- **Test:** ô `requirements` trống ⇒ thấy placeholder mẫu; điền thiếu ⇒ chỉ báo đúng số mục còn thiếu, không chặn nút lưu/submit; sửa `requirements` sau khi đã phân tích 1 lần ⇒ nút "Phân tích lại" xuất hiện.

### FE-5: Checklist Admin

- Thêm khối vào `app/admin/(console)/jobs/[id]/page.tsx` theo Quyết định #6.
- **Test:** tin mô tả ngắn/thiếu kỹ năng ⇒ auto-check báo đúng; tick/bỏ tick checklist thủ công không gọi API nào (kiểm tab Network); `REJECTED` vẫn dùng ô `reason` sẵn có, không đổi hành vi.

### FE-6: Kiểm thử trình duyệt thật + tài liệu

- `next build` sạch; kiểm tra thủ công toàn bộ luồng (Employer phân tích+áp dụng, Employer nhập tay không qua AI, Admin duyệt có checklist) ở cả màn hình hẹp. Ghi "Ghi chú triển khai" theo đúng khuôn các PLAN trước.

## Ngoài phạm vi

- Hiển thị `minYears`/ngành yêu cầu trên trang tin công khai cho khách xem (`JobPostContent`) — chỉ ảnh hưởng chấm điểm, không đổi trang xem tin.
- Đổi `JobMatchCard` (GĐ1) để hiện chi tiết điểm `experience`-theo-skill/`education` mới — cân nhắc sau nếu cần, không bắt buộc để backend hoạt động đúng (điểm tổng đã phản ánh đúng qua trọng số).
- Lưu trạng thái checklist Admin lên server (chỉ dùng field `reason` sẵn có khi `REJECTED`).

## Ghi chú triển khai

### FE-1 → FE-5 (2026-09-22) — đã code

- **`SkillMultiSelect`:** thêm prop `onChangeMinYears` đúng Quyết định #2 (ô số chỉ hiện khi có cả `onChangeImportance`), `SelectedSkill.minYears`. Ô số tách thành `MinYearsInput` (export, dùng lại ở bảng xem trước): giữ chuỗi cục bộ khi gõ, chỉ báo giá trị khi rời ô/Enter; trống/0 ⇒ `null`, trần 20 như backend. Hồ sơ Candidate không truyền prop mới ⇒ không đổi.
- **Lưu form thường:** gửi `skillMinYears` cho **mọi** kỹ năng (null = không yêu cầu riêng, để xoá được số đã lưu) và `majors[]` — dùng hai field backend đã thêm ở bước 4. Lưu form thường không đặt `requirementsConfirmedAt`.
- **`MajorRequirementSelect`:** dùng `useMajors()` (hook `/catalog/majors` đã có trong `useCatalog.ts`) thay vì gọi `apiFetch` như `CandidateProfileClient` — cùng endpoint, có sẵn cache. Tối đa 10 ngành như backend. Chỉ chọn trong danh mục, không đề xuất ngành mới.
- **Hook:** query key thật là `["employerJobPost", id]` (PLAN ghi `["employer", "job-posts", id]` — sai tên). `useExtractJobRequirements` nhận tuỳ chọn `pendingText`.
- **Quyết định phát sinh — lưu chữ trước khi phân tích:** backend đọc tiêu đề/mô tả/yêu cầu **đã lưu**, nên nếu form đang khác bản đã lưu thì hook PATCH riêng 3 field chữ đó trước rồi mới gọi `extract` (có ghi rõ dưới nút). Không làm vậy thì nút "Phân tích lại" (nudge #3) sẽ phân tích bản cũ. Không đụng kỹ năng/ngành/lương khi lưu kiểu này.
- **Quyết định phát sinh — bảng xem trước gộp mục đang có:** `PUT .../requirements` đồng bộ **toàn bộ** tập kỹ năng/ngành, nên bảng khởi tạo = kết quả AI **+** kỹ năng/ngành đang có trong form mà AI không nhắc (nhãn "Đang có trong tin", vẫn tick sẵn). Nếu không, áp dụng sẽ âm thầm xoá kỹ năng Employer đã chọn tay. Số năm: AI không nêu ⇒ giữ số Employer đã nhập.
- **Tên AI đọc ra chưa có trong danh mục:** chưa tick; nút "Thêm vào danh mục" gọi `/skills/suggest` như khi Employer tự gõ (có thể khớp mục sẵn có hoặc tạo PENDING chờ duyệt). Ngành chưa có trong danh mục chỉ hiện ghi chú — không có luồng đề xuất ngành cho Employer.
- **"+ thêm kỹ năng":** ô tìm riêng trong bảng (chọn từ danh mục hoặc đề xuất mới), không dùng `SkillMultiSelect` vì bảng cần hiện câu trích/độ tin cậy từng dòng.
- Bảng là modal, nhận `key` mới mỗi lần phân tích ⇒ phân tích lại thì dựng lại bảng từ kết quả mới. Áp dụng xong: form lấy lại kỹ năng/ngành/`minExperienceYears`/`requirementsConfirmedAt` từ response để lần "Lưu nháp" sau không ghi đè ngược.
- **3 nudge:** placeholder mẫu nhiều dòng + hint ở ô `requirements`; khối "Yêu cầu có cấu trúc" ngay dưới ô đó liệt kê 4 mục (có kỹ năng, x/y kỹ năng có số năm, ngành, đã xác nhận) và "còn N mục có thể bổ sung (không bắt buộc)"; dòng "Phân tích lại" chỉ hiện khi mô tả/yêu cầu khác lần phân tích gần nhất trong phiên. Trang tạo tin mới (chưa có id) hiện "Lưu nháp tin trước để dùng AI".
- **Checklist Admin:** chỉ hiện khi tin `PENDING`. Auto-check: mô tả ≥ 150 ký tự, yêu cầu ≥ 50 ký tự (ngưỡng chỉ để nhắc), có kỹ năng bắt buộc, đã xác nhận yêu cầu; kèm kinh nghiệm tối thiểu + ngành phù hợp (trang tin công khai không hiện ngành). Hai ô tự đánh giá là state cục bộ.

### FE-6 — còn lại

- `tsc`, ESLint các file đã sửa, `next build`: sạch.
- **Chưa kiểm thử trên trình duyệt thật** (lúc code không có server/Redis/Nginx chạy). Cần đi hết các ca Test ở FE-1 → FE-5, nhất là: 429/502 hiện thông báo và form vẫn dùng tay được; màn hình hẹp của bảng xem trước.

## Phần ghi chú của chủ dự án

*(để trống)*
