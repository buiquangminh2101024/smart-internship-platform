# Skill cho JobPost — Các hướng thiết kế (Draft)

> **Trạng thái: Brainstorm/định hướng, CHƯA chốt, CHƯA implement.** Đây là tài liệu liệt kê các lựa chọn để chủ dự án chọn lọc, không phải quyết định kiến trúc cuối cùng — theo đúng yêu cầu ("không nhất thiết phải làm hết"). Một khi chọn hướng nào để làm thật, cần cập nhật quyết định đó vào `ARCHITECTURE_DECISIONS.md`/`PROJECT_PHASES.md` trước khi code (theo `CLAUDE.md`).
>
> **Vì sao viết tài liệu này:** model `JobPostSkill` đã tồn tại trong `schema.prisma` (dòng 547-555) từ khi chốt schema domain (`PROJECT_OVERVIEW.md` §14 mục 12: *"bảng nối JobPostSkill, dùng chung catalog Skill với StudentSkill, chuẩn bị cho AI matching CV↔JobPost"*), nhưng **chưa có bất kỳ code nghiệp vụ nào dùng tới** — không xuất hiện trong `job-posts.dto.ts`, `job-posts.service.ts`, `job-posts.repository.ts`, `job-posts.controller.ts` hay `job-posts.routes.ts`. Ngược lại, `CandidateSkill` đã được triển khai đầy đủ ở Phase 3 (module `candidates` + UI `CandidateProfileClient.tsx`). Skill cho JobPost hiện là "connect nửa vời": có bảng, chưa có nghiệp vụ.

---

## 1. Hiện trạng (điểm neo bắt buộc phải biết trước khi đọc tiếp)

| Thành phần | Trạng thái |
|---|---|
| `model Skill` (catalog dùng chung) | ✅ Có sẵn, seed qua `apps/server/scripts/seed.ts` |
| `model CandidateSkill` | ✅ Đã triển khai đầy đủ (schema + repository + service + route `/candidates/me/skills` + UI) |
| `model JobPostSkill` | ⚠️ Chỉ có trong `schema.prisma`, **không có route/service/UI nào** |
| `GET /catalog/skills` | ✅ Có sẵn (public, không cần auth — theo `API_CONVENTIONS.md` §11: "frontend tự build dropdown, không hardcode") |
| `POST /catalog/skills` (tạo skill mới) | ❌ Chưa tồn tại — catalog hiện tại là **read-only** cho mọi actor, kể cả Admin |
| UI mẫu để tham khảo | `SkillSection` trong `apps/web/src/components/candidate/CandidateProfileClient.tsx:202-207` — `<Select>` chọn từ catalog + input số năm kinh nghiệm + danh sách pill có nút xoá |

Vì `JobPostSkill` không có field nào ngoài `jobPostId`/`skillId` (không có `yearsOfExperience` như `CandidateSkill`, không có mức độ "bắt buộc/ưu tiên"), phần UI/logic cho JobPost sẽ **đơn giản hơn** phần Candidate — chỉ cần chọn/bỏ chọn skill, không có input phụ.

---

## 2. Dùng để làm gì — các mục đích khả thi

1. **Hiển thị yêu cầu kỹ năng có cấu trúc trên tin tuyển dụng** — thay vì chỉ có `JobPost.requirements` (text tự do), skill dạng tag giúp Candidate quét nhanh, giao diện nhất quán (tương tự `requirements`/`benefits` hiện tại nhưng structured).
2. **Lọc/tìm kiếm JobPost theo skill** — bổ sung vào bộ lọc công khai hiện có (lương/ngành/địa điểm, Phase 6) một lựa chọn lọc theo kỹ năng, giá trị UX rõ ràng, không phụ thuộc AI.
3. **Nền tảng cho AI Job Matching (Phase 11)** — đây là lý do gốc khi field này được chốt vào schema. Overlap giữa `CandidateSkill` và `JobPostSkill` là tín hiệu rule-based rẻ nhất, không cần AI thật, để tính match score CV↔JobPost (chi tiết §5).
4. **Dữ liệu cho Admin/thống kê (tuỳ chọn, ưu tiên thấp)** — skill nào đang "hot" theo ngành/thời gian, có thể phục vụ phần phân tích cho báo cáo khoá luận nhưng không phải mục tiêu chính.

Mục 1–2 tự thân đã có giá trị **không cần AI** — có thể làm độc lập với Phase 11.

---

## 3. Ba hướng thiết kế cho "ai được nhập skill"

Đây là câu hỏi trọng tâm người dùng đặt ra. Ba hướng dưới đây **loại trừ lẫn nhau ở phần "tạo skill mới trong catalog"**, nhưng đều giống nhau ở phần "gắn skill có sẵn vào JobPost" (Employer luôn là người chọn skill cho tin của mình — không có tranh cãi ở điểm này).

### Hướng A — Admin-only, catalog đóng (khuyến nghị làm trước)

- Employer **chỉ được chọn từ danh sách skill đã có sẵn** trong catalog (giống hệt cách Candidate chọn skill hiện tại, giống cách Employer chọn `Industry`/`City` khi tạo `JobPost`).
- Catalog `Skill` do Admin quản lý — thực tế ở giai đoạn khoá luận nghĩa là **seed data** (`scripts/seed.ts`), không cần thiết phải có UI admin CRUD riêng (đúng pattern hiện tại: `Industry`/`City`/`University`/`Major` đều không có route tạo mới, chỉ seed).
- Nếu Employer không tìm thấy skill cần thiết → không chặn họ tạo tin (skill là optional), họ vẫn mô tả tự do trong `requirements`.

**Ưu điểm:** không cần schema mới, không cần route mới ngoài field `skillIds` trên `JobPost`, không rủi ro dữ liệu rác ("React" vs "ReactJS" vs "React.js"), triển khai nhanh nhất, đúng 100% pattern catalog đã có (`Industry`, `City`, `University`, `Major`).
**Nhược điểm:** catalog dễ thiếu skill mới (công nghệ mới ra liên tục), Admin phải chủ động cập nhật seed — không co giãn theo nhu cầu thực tế người dùng.

### Hướng B — Employer/Candidate tự nhập tự do, có kiểm duyệt Admin

- Employer (khi tạo `JobPost`) hoặc Candidate (khi cập nhật hồ sơ) có thể **gõ tên skill mới** nếu không có trong danh sách gợi ý (kiểu combobox "tạo mới nếu không tìm thấy" — pattern quen thuộc, ví dụ react-select `CreatableSelect`).
- Skill mới được tạo ngay ở trạng thái **`PENDING`** (cần thêm field `Skill.status: PENDING | APPROVED` + `Skill.createdByUserId`/`createdByRole` — **đây là thay đổi schema**, cần ghi vào `ARCHITECTURE_DECISIONS.md` trước khi code theo `CLAUDE.md`).
- Skill `PENDING` vẫn **gắn được ngay** vào `JobPostSkill`/`CandidateSkill` của chính người tạo (không chặn UX), nhưng **không xuất hiện trong danh sách gợi ý công khai** (`GET /catalog/skills`) cho tới khi Admin duyệt sang `APPROVED` — tương tự tinh thần "Admin quyết định thủ công cuối cùng" đã áp dụng cho `Company.isVerified`/`JobPost` moderation.
- Cần **cơ chế kiểm tra trùng lặp trước khi tạo mới** (bắt buộc, nếu không catalog sẽ nhanh chóng bẩn dữ liệu) — chi tiết pipeline ở §B.1, các kỹ thuật thay thế/hạn chế LLM ở §B.2.
- Admin có màn hình duyệt hàng chờ `Skill PENDING` (Approve/Reject/Merge-vào-skill-có-sẵn), bố cục giống màn `admin/(console)/companies` đã có cho company verification.

**Ưu điểm:** catalog tự làm giàu theo nhu cầu thật, không phụ thuộc Admin cập nhật seed thủ công, chuẩn bị tốt cho hướng E3 "Skill Extraction & Normalization" trong `docs/temp/AI_APPLICATION_DIRECTIONS.md` (xem §5).
**Nhược điểm:** tốn công nhiều nhất — cần migration schema mới, route Admin mới, UI duyệt mới, logic fuzzy-match; rủi ro catalog vẫn bẩn nếu fuzzy-match không đủ tốt hoặc Admin duyệt cẩu thả; là **thay đổi kiến trúc thật sự**, không phải chỉ thêm 1 field nhỏ.

#### B.1 Pipeline quyết định trùng lặp — kết hợp fuzzy match + LLM theo bậc

Không dùng LLM để quyết định mọi trường hợp — LLM chỉ nên là **fallback cho vùng xám**, đứng sau một lớp lọc rẻ. Đề xuất 3 bậc theo điểm tương đồng (similarity) giữa tên skill mới và tên skill gần nhất trong catalog (sau khi đã chuẩn hoá — xem B.2 kỹ thuật 1):

| Bậc | Điều kiện | Hành động | Có gọi LLM? |
|---|---|---|---|
| 1 | `similarity ≥ 0.85` (typo nhỏ, khác hoa/thường, có/không dấu chấm — "reactjs" vs "React.js") | Tự động map vào skill có sẵn, không tạo mới | Không |
| 2 | `0.6 ≤ similarity < 0.85` (vùng xám — "Node" vs "Node.js", "ReactJS" vs "React Native" gần nhau về mặt chữ nhưng có thể khác nghĩa) | Gọi LLM, kèm tên skill mới + top 3-5 candidate gần nhất từ fuzzy match; yêu cầu trả JSON `{decision: "MATCH" \| "NEW", matchedSkillId?}` | Có, nhưng chỉ case này |
| 3 | `similarity < 0.6` | Tạo skill mới `PENDING` trực tiếp, không cần LLM (fuzzy match đã đủ tự tin đây là skill mới) | Không |

Payload gửi LLM ở bậc 2 rất nhỏ (1 tên skill + vài candidate, không phải văn bản dài), và tần suất thấp vì phần lớn case rơi vào bậc 1/3. Nên **cache kết quả theo tên skill đã chuẩn hoá** (Redis, đã có sẵn từ Phase 2) — nhiều người cùng gõ "reactjs" thì LLM chỉ quyết định 1 lần.

**Biến thể giảm tải hơn nữa:** thay vì gọi LLM realtime ngay lúc submit, để toàn bộ skill bậc 2 rơi vào `PENDING`, rồi chạy 1 batch job (`node-cron`, đã có sẵn từ Phase 5) định kỳ (vd. mỗi ngày) gom nhóm gọi LLM 1 lần cho cả batch, hiển thị gợi ý merge cho Admin duyệt — giảm số request LLM xuống rất nhiều so với gọi per-request, Admin vẫn quyết định cuối.

#### B.2 Kỹ thuật hạn chế hoặc thay thế hoàn toàn LLM

Fuzzy match (string-similarity) chỉ là một lớp trong nhiều lớp có thể xếp trước LLM. Xếp theo thứ tự nên áp dụng (rẻ nhất trước):

1. **Chuẩn hoá chuỗi (normalization) trước khi so sánh** — lowercase, trim khoảng trắng thừa, bỏ dấu câu (`.`, `-`, `_`), chuẩn hoá Unicode (NFC). Loại bỏ phần lớn khác biệt bề mặt ("ReactJS", "react js", "React.JS" → cùng 1 dạng chuẩn hoá) trước khi cần đến bất kỳ thuật toán so khớp nào. Chi phí gần như bằng 0, nên luôn làm đầu tiên.
2. **Bảng đồng nghĩa/viết tắt tĩnh (alias dictionary)** — Admin duy trì 1 bảng map cố định (`"js" → "JavaScript"`, `"k8s" → "Kubernetes"`, `"node"/"nodejs" → "Node.js"`, `"ml" → "Machine Learning"`...). Tra bảng này trước fuzzy match — chính xác tuyệt đối cho case đã biết, không cần đoán. Bảng này **tự lớn dần theo thời gian** nhờ kỹ thuật 6 bên dưới.
3. **So khớp theo token/n-gram thay vì ký tự (Jaccard/TF-IDF trên tập từ)** — xử lý tốt hơn Levenshtein thuần ký tự cho các trường hợp đảo từ hoặc thêm/bớt từ đệm (vd. "Machine Learning Engineer" vs "Machine Learning"). Vẫn thuần thuật toán, không gọi API ngoài.
4. **Embedding chạy local (không qua API, không tốn token trả phí)** — dùng `@xenova/transformers` (đã đề xuất trong `docs/temp/AI_APPLICATION_DIRECTIONS.md` mục 3, chạy WASM ngay trong Node) để tính cosine similarity ngữ nghĩa giữa tên skill mới và catalog. Đây vẫn là "AI" nhưng **miễn phí, không rate limit, không gửi dữ liệu ra ngoài** — có thể dùng thay cho LLM thật ở bậc 2 của pipeline B.1, chỉ escalate lên LLM (Gemini/OpenRouter) khi cả fuzzy match lẫn embedding local đều không đủ tự tin. Giảm số lần gọi LLM thật xuống gần 0 trong đa số trường hợp.
5. **Giới hạn ở UI (autocomplete-first)** — combobox gợi ý ngay khi gõ (search-as-you-type trên catalog hiện có) khiến người dùng có xu hướng chọn từ danh sách gợi ý thay vì gõ hẳn tên mới. Đây là cách giảm **nhu cầu** phải so khớp/gọi LLM ngay từ đầu, không phải kỹ thuật so khớp.
6. **Vòng lặp học từ quyết định của Admin (feedback loop, không cần AI)** — mỗi khi Admin duyệt "Merge vào skill có sẵn" cho một skill `PENDING`, tự động ghi thêm 1 dòng vào bảng đồng nghĩa ở kỹ thuật 2. Theo thời gian catalog "tự học" từ chính lịch sử duyệt, số case rơi vào vùng xám (cần LLM) giảm dần một cách tự nhiên.
7. **Bỏ hẳn AI, để Admin duyệt thủ công 100%** — nếu muốn zero chi phí AI: dùng kỹ thuật 1–3 chỉ để **xếp hạng gợi ý** (top-K candidate gần nhất) hiển thị cạnh mỗi skill `PENDING` trong màn duyệt Admin, nhưng quyết định match/new luôn do Admin bấm chọn thủ công — tương đương Hướng C ở mức thực thi (không tự động, chỉ hỗ trợ hiển thị), loại bỏ hoàn toàn bậc 2 của pipeline B.1.

**Khuyến nghị xếp lớp:** 1 → 2 → 3 làm nền (rẻ, đủ xử lý đa số case phổ biến) → nếu muốn "AI" mà không tốn token trả phí thì dừng ở 4 (embedding local) → chỉ mở LLM thật (Gemini/OpenRouter) làm lớp cuối cùng cho case thực sự mơ hồ, có cache, và cân nhắc chạy theo batch (cuối B.1) thay vì realtime để giảm số lần gọi tối đa.

### Hướng C — Lai: chọn từ catalog + nút "Đề xuất kỹ năng mới" (request riêng, không tự động tạo)

- Giống Hướng A cho phần chọn skill có sẵn.
- Thêm 1 nút phụ "Không thấy kỹ năng cần thiết? Đề xuất kỹ năng mới" → mở form nhỏ, ghi vào bảng riêng (ví dụ `SkillSuggestion`, không đụng vào bảng `Skill` chính) kèm `suggestedByUserId`, `note` — **không** tự động gắn vào `JobPostSkill` ngay lập tức (khác Hướng B).
- Admin xem danh sách đề xuất định kỳ, nếu đồng ý thì **tự tay thêm vào catalog `Skill`** qua seed/script hoặc 1 route admin đơn giản — Employer/Candidate phải tự quay lại chọn skill đó sau khi được thêm (không tự động).

**Ưu điểm:** tách biệt hoàn toàn khỏi luồng nghiệp vụ chính (`JobPost`/`Candidate`), rủi ro thấp hơn Hướng B (đề xuất không làm bẩn catalog ngay), vẫn thu thập được nhu cầu thật.
**Nhược điểm:** trải nghiệm rời rạc hơn (Employer đề xuất xong không thấy skill dùng được ngay), giá trị thấp hơn Hướng B nếu mục tiêu là chuẩn bị dữ liệu cho AI matching (Phase 11) vì không có vòng lặp nhanh.

### So sánh nhanh

| Tiêu chí | A — Admin-only | B — Tự nhập + duyệt | C — Lai (đề xuất riêng) |
|---|---|---|---|
| Cần migration schema | Không | Có (`Skill.status`, `createdBy*`) | Có (bảng mới `SkillSuggestion`), nhưng không đụng `Skill` |
| Cần route/UI Admin mới | Không | Có (hàng chờ duyệt) | Có (đơn giản hơn B) |
| Rủi ro dữ liệu bẩn | Thấp nhất | Trung bình (phụ thuộc fuzzy-match + Admin duyệt kỹ) | Thấp (Admin toàn quyền lọc trước khi thêm) |
| Tốc độ triển khai | Nhanh nhất | Chậm nhất | Trung bình |
| Sẵn sàng cho AI E3 (Skill Extraction) | Yếu (catalog tĩnh) | Tốt nhất | Trung bình |

**Khuyến nghị:** làm **Hướng A trước** (rẻ, tương thích ngay, đủ dùng cho mục đích 1–2 ở §2 và đủ làm nền cho rule-based matching ở §5). Cân nhắc nâng cấp lên **Hướng B** chỉ khi thật sự triển khai AI E3 (Skill Extraction & Normalization) ở Phase 11 — lúc đó chi phí thêm field `status`/fuzzy-match là hợp lý vì đã có LLM hỗ trợ đề xuất skill từ text, giảm rủi ro trùng lặp hơn nhiều so với để người dùng gõ tay hoàn toàn tự do.

---

## 4. Luồng chi tiết (Hướng A — luồng khuyến nghị làm trước)

### 4.1 Employer gắn skill khi tạo/sửa JobPost

1. Employer mở form tạo/sửa `JobPost` (`employer/(portal)/jobs/new` hoặc `jobs/[id]`).
2. Form gọi `GET /catalog/skills` (đã có sẵn, không cần đổi) để lấy danh sách skill cho multi-select.
3. Employer chọn nhiều skill (multi-select, khác với Candidate — Candidate thêm từng cái một kèm số năm kinh nghiệm; JobPost không có field phụ nên hợp lý hơn nếu chọn nhiều cùng lúc dạng combobox có chip, thay vì lặp lại UX "thêm từng cái" của Candidate).
4. Submit `POST /job-posts` hoặc `PATCH /job-posts/:id` kèm `skillIds: string[]` trong body.
5. Backend (`job-posts.service.ts`): validate `skillIds` tồn tại trong catalog, diff với `JobPostSkill` hiện có (thêm mới/xoá bớt — pattern giống hệt cách `candidate.repository.ts` xử lý `CandidateSkill`, chỉ khác không có `yearsOfExperience`).

### 4.2 Candidate/Guest xem & lọc theo skill

1. Trang `jobs/[id]` (chi tiết tin công khai): hiển thị tag skill dưới phần `requirements`, style pill giống `SkillSection` bên Candidate (tái dùng component, không tạo mới).
2. Trang `jobs` (danh sách/tìm kiếm công khai): thêm bộ lọc "Kỹ năng" (multi-select) bên cạnh lương/ngành/địa điểm hiện có. Query backend thêm `skillIds` vào `jobPostSearchQuerySchema`, repository `JOIN JobPostSkill WHERE skillId IN (...)`.
3. (Tuỳ chọn, liên hệ §5) nếu Candidate đã đăng nhập và có `CandidateSkill`, trang chi tiết `JobPost` hiển thị thêm "X/Y kỹ năng bạn đã có" — thuần rule-based, không cần AI, có thể làm độc lập với Phase 11.

---

## 5. Xem xét cho Phase 11 (AI Features Boundary)

`PROJECT_PHASES.md` Phase 11 chỉ định nghĩa **boundary** (port/adapter), không triển khai AI thật. `JobPostSkill` liên quan tới 2 trong 4 port đã đặt tên sẵn:

- **`JobMatcher`** — tín hiệu rule-based rẻ nhất để tính match score CV↔JobPost chính là **overlap giữa `CandidateSkill.skillId` và `JobPostSkill.skillId`** (cộng thêm trọng số theo `yearsOfExperience`, `Major`↔`Industry`). Đây là baseline không cần gọi AI, nên làm **trước** phần semantic/embedding — có thể triển khai ngay sau khi Hướng A ở §3 hoàn thành, **không cần chờ Phase 11 chính thức bắt đầu** vì bản chất là 1 câu SQL join.
- **`CandidateRanker`** — dùng lại match score trên để sắp xếp `Application` theo mức độ phù hợp cho Employer.

Nếu về sau chọn nâng cấp lên Hướng B (§3), điều này khớp trực tiếp với hướng **E3 — Skill Extraction & Normalization** đã brainstorm ở `docs/temp/AI_APPLICATION_DIRECTIONS.md` (file nháp, đã `.gitignore`, không phải nguồn sự thật): dùng LLM trích skill từ `JobPost.requirements`/`description` tự do rồi fuzzy-match với catalog — lúc đó cơ chế duyệt `PENDING`/`APPROVED` ở Hướng B sẽ tái dùng được cho cả skill do LLM đề xuất lẫn skill do người dùng tự gõ, dùng chung 1 hàng chờ Admin.

**Lưu ý phạm vi:** phần rule-based matching (JobMatcher baseline) có thể làm **độc lập với Phase 11**, thuộc về việc hoàn thiện tính năng skill cho JobPost (Phase 6 mở rộng). Phần AI thật (embedding, LLM extraction) mới thuộc đúng phạm vi Phase 11 và các phase AI sau đó — không nên gộp 2 việc này làm một khi lên kế hoạch, để giữ đúng nguyên tắc "Phase 11 chỉ là boundary, chưa triển khai AI thật".

---

## 6. Trang web & bố cục dự kiến

| Trang | Actor | Thay đổi bố cục |
|---|---|---|
| `employer/(portal)/jobs/new`, `employer/(portal)/jobs/[id]` | Employer | Thêm 1 `Section` "Kỹ năng yêu cầu" trong form tạo/sửa tin, đặt sau `requirements`/`benefits`, trước nút submit. Multi-select combobox (chip) thay vì dropdown 1-lúc-1-skill. |
| `jobs/[id]` | Guest/Candidate | Thêm dãy tag skill (pill, không tương tác) ngay dưới khối `requirements`, trên `benefits`. Nếu Candidate đã đăng nhập và bật rule-based matching (§5): thêm dòng nhỏ "Độ phù hợp với hồ sơ của bạn: X%" hoặc "3/5 kỹ năng bạn đã có". |
| `jobs` (danh sách công khai) | Guest/Candidate | Thêm 1 filter "Kỹ năng" (multi-select) vào thanh filter hiện có (lương/ngành/địa điểm) — không đổi layout tổng thể, chỉ thêm 1 control. |
| `admin/(console)/skills` (chỉ cần nếu chọn Hướng B/C) | Admin | Trang mới, bố cục giống `admin/(console)/companies`: bảng danh sách skill `PENDING` kèm tên, người đề xuất, nút Approve/Reject/Merge-vào-skill-có-sẵn. |
| `(candidate)/profile` | Candidate | Không đổi — `SkillSection` hiện tại tái sử dụng nguyên vẹn làm component tham khảo cho phần Employer, không cần sửa. |

---

## 7. Độ tương thích với dự án hiện tại

- **Schema:** Hướng A **không cần migration** — `JobPostSkill` đã tồn tại nguyên vẹn từ khi chốt domain schema, chỉ cần code nghiệp vụ dùng tới. Hướng B/C cần migration thêm field/bảng mới → phải ghi vào `ARCHITECTURE_DECISIONS.md` trước khi code (bắt buộc theo `CLAUDE.md`, không được "tự ý quyết định ngầm").
- **Backend:** đúng convention module hiện có — sửa trong `apps/server/src/modules/job-posts/` (`job-posts.dto.ts` thêm `skillIds`, `job-posts.service.ts`/`job-posts.repository.ts` thêm diff-write `JobPostSkill` theo đúng pattern `candidates.repository.ts` đã xử lý `CandidateSkill`). Không cần module mới, không cần dependency mới.
- **Catalog:** `GET /catalog/skills` dùng lại nguyên vẹn, không đổi (đã public, không auth — đúng `API_CONVENTIONS.md` §11). Hướng B/C mới cần thêm route ghi (`POST`), lúc đó cần gắn `authenticate` + role guard (pattern đã có ở `companies`/`job-posts` moderation).
- **Frontend:** tái dùng được component `SkillSection` (đổi tên/generalize nhẹ để dùng chung cho cả Candidate lẫn JobPost, bỏ phần `yearsOfExperience` khi dùng cho JobPost) — không cần thêm thư viện UI mới nếu chọn multi-select đơn giản bằng `<select multiple>`/checkbox list; nếu muốn combobox chip đẹp hơn có thể cần thêm 1 thư viện nhỏ (ví dụ `react-select`) — **đây là dependency mới, cần cân nhắc/xin phép trước** theo `CLAUDE.md` ("không tự thêm dependency không cần thiết"), có thể tránh bằng cách tự viết multi-select đơn giản bằng Tailwind (đúng style hiện có, không phụ thuộc thư viện ngoài).
- **Không phá vỡ gì hiện có:** `JobPostSkill` là bảng phụ (join table), thêm `skillIds` optional vào DTO tạo/sửa `JobPost` là thay đổi additive — không ảnh hưởng luồng `submitForApproval()`/`publish()`/subscription quota đã có ở Phase 5/6.
- **Vị trí trong roadmap:** vì Phase 6 (`job-posts`) đã hoàn thành trước đó (theo lịch sử commit hiện tại, dự án đang ở sau Phase 10), đây là **bổ sung/retrofit cho phase đã xong**, không phải phần còn thiếu bắt buộc của Phase 6 gốc — nên xem như một cải tiến độc lập, có thể làm bất cứ lúc nào trước hoặc trong Phase 11, không chặn phase nào khác.

---

## 8. Câu hỏi mở cần chốt trước khi implement

1. Chọn Hướng A, B hay C ở §3? (khuyến nghị: A trước, cân nhắc B nếu làm AI E3 thật ở Phase 11).
2. Multi-select tự viết bằng Tailwind hay thêm thư viện (`react-select`...)? Có chấp nhận thêm dependency mới không?
3. Có làm luôn rule-based `JobMatcher` baseline (overlap skill, §5) ngay khi xong Hướng A, hay để dành hẳn cho Phase 11?
4. Bộ lọc "Kỹ năng" ở trang `jobs` công khai có cần thiết ngay hay để giai đoạn sau (ưu tiên thấp hơn hiển thị tag đơn thuần)?
