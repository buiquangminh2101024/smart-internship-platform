# CV AI Extraction — Phase 2: Lưu vào hồ sơ (Backend)

Tiếp nối `docs/06-backend/cv-ai-extraction-phase1/PLAN.md` — không thuộc phase đánh số nào trong `PROJECT_PHASES.md`, đi trước Phase 11. Dựa trên `docs/temp/CV_JSON_TO_CANDIDATE_PROFILE_PROPOSAL.md` (đặc biệt mục 2, 3, 4, 4.1, 9.2, 9.5) — không chép lại nội dung đã bàn, chỉ ghi phần đặc thù/bổ sung khi lên kế hoạch cụ thể. Phạm vi: từ lúc Candidate xem preview (Phase 1) và bấm **"Lưu vào hồ sơ"** cho tới khi dữ liệu đã nằm trong `Education`/`WorkExperience`/`CandidateSkill`/... và catalog `University`/`Major` đã có cơ chế duyệt tương đương `Skill`.

**Trạng thái: đã triển khai code (2026-09-19); migration `20260919120000_education_catalog_moderation` chạy trên DB sau khi chủ dự án xác nhận.** Xem "Ghi chú triển khai" ngay trước Phần 4 cho các điểm khác/bổ sung so với kế hoạch.

## Quyết định mới chốt khi lên kế hoạch

1. **Đổi `SkillStatus` → `CatalogEntryStatus`** (đã chốt ở bản nháp mục 9.2), dùng chung cho `Skill`/`University`/`Major`. Ảnh hưởng: `skills.service.ts`, `skills.repository.ts`, `skill-dedupe.service.ts`, mọi import `SkillStatus` khác trong repo — đổi tên đồng loạt trong 1 migration, không đổi hành vi hay giá trị enum (`APPROVED`/`PENDING` giữ nguyên).
2. **Bỏ tier embedding (bậc 2) cho `University`/`Major`** — khác với pipeline `Skill` gốc (5 bậc, có bậc embedding qua `@huggingface/transformers`+pgvector). Lý do: tên trường/ngành học ít biến thể phức tạp hơn tên kỹ năng công nghệ, token/bigram (bậc 1) đã đủ dùng; bỏ bậc 2 giúp `University`/`Major` **không cần cột `embedding`/pgvector**, giảm hẳn độ phức tạp schema và tránh trùng lặp hạ tầng embedding không cần thiết. Pipeline còn lại **4 bậc**: bậc 0 alias exact match → bậc 1 token/bigram ≥0.85 auto-match → vùng xám 0.6-0.85 → tạo `PENDING` + cron LLM xác nhận (tái dùng cơ chế cron có sẵn) → < 0.6 → `PENDING` thẳng, không qua LLM.
3. **Tổng quát hoá port `SkillMatchVerifier` → `CatalogMatchVerifier`** (thêm tham số `domain: "skill" | "university" | "major"` để chọn nội dung prompt) thay vì viết 3 bản adapter Gemini gần như giống hệt nhau. `GeminiSkillMatchVerifier` đổi tên thành `GeminiCatalogMatchVerifier`.
4. **Tổng quát hoá `SkillRateLimitService` → `CatalogRateLimitService`** (thêm `domain` vào key Redis), dùng chung ngưỡng số hiện có của Skill (10 mới/tuần, 40/tháng mỗi user, 150/tuần toàn hệ thống) cho cả 3 loại — cùng lý do chống spam catalog PENDING, không có căn cứ để đặt số khác nhau giữa Skill/University/Major. **Lưu ý: đây là rate-limit chống spam catalog, khác hẳn `cv-extraction-rate-limit.service.ts` ở Phase 1** (rate-limit đó bảo vệ quota LLM dùng chung của cả hệ thống, lý do khác nhau, giữ 2 service riêng).
5. **Module mới `apps/server/src/modules/education-catalog/`** gộp chung `University` + `Major` (thay vì 2 module riêng biệt) — vì luôn được bàn/triển khai theo cặp, cấu trúc giống hệt nhau. Chấp nhận trùng lặp nhỏ giữa `university-dedupe.service.ts`/`major-dedupe.service.ts` thay vì trừu tượng hoá `CatalogDedupeService<T>` generic — để dành sau nếu thấy thật sự cần, không làm ở lần triển khai đầu tiên (đúng tinh thần bản nháp mục 7.1: quyết định lúc implement, không ảnh hưởng thiết kế tổng thể).
6. `catalog.repository.ts` (`listMajors`/`listUniversities`) thêm `WHERE status = 'APPROVED'` — khớp đúng cách `listSkills` đang lọc, tránh lộ `PENDING` ra dropdown công khai.
7. `cityId`: **không** mở rộng cơ chế `PENDING` cho `City`. Nếu tên thành phố trích được không khớp catalog, bỏ qua, không set `cityId`, không tạo `City` mới (đã chốt ở bản nháp mục 9.5 — `City` là danh sách tỉnh/thành cố định, không phát sinh giá trị mới như tên trường/ngành).
8. Ghi dữ liệu khi import (đã chốt ở bản nháp mục 9.5): danh sách (`Education`/`WorkExperience`/`Project`/`Certificate`/`Award`) **luôn insert dòng mới**, không dò/khớp để thay thế; `CandidateSkill` (khoá chính kép `[candidateId, skillId]`) **bỏ qua nếu đã có sẵn**, giữ nguyên `yearsOfExperience` cũ (*bổ sung sau khi cho nhập số năm ở preview: chỉ giữ nguyên khi `yearsOfExperience > 0`; đang `0` nghĩa là chưa khai nên nhận số Candidate vừa nhập*); field đơn lẻ trên `Candidate` (`headline`/`bio`/`phone`/`dateOfBirth`/`gender`/`cityId`) **chỉ ghi khi FE gửi cờ "dùng giá trị mới"** cho từng field riêng.
9. `candidate.fullName` trong `extractedData` **không map vào đâu** ở bước import (không có field lưu tên đầy đủ trong `User`/`Candidate`) — bỏ qua khi import, giữ nguyên trong `extractedData` đã lưu từ Phase 1 cho tương lai.

## Luồng xử lý

```text
POST /candidates/me/profile/import-from-cv
(body: extractedData đã Candidate sửa, fieldOverrides, cvId tuỳ chọn)
    │
    ▼
Với mỗi education trong danh sách:
    │
    ├── universityName → universityDedupeService.suggest()
    │       bậc 0 alias exact match ──khớp──► dùng universityId đó
    │       bậc 1 token/bigram ≥0.85 ──khớp──► dùng universityId đó
    │       vùng xám 0.6-0.85 ──► tạo PENDING, gắn pendingMatchId,
    │                              cron LLM xác nhận sau (xem nhánh dưới)
    │       <0.6 ──► tạo PENDING thẳng, không qua LLM
    │
    └── majorName → majorDedupeService.suggest()  (y hệt logic trên)
    │
    ▼
insert Education mới (universityId/majorId vừa lấy được, null nếu bỏ trống)
    │
    ▼
insert mới toàn bộ workExperiences / projects / certificates / awards
(luôn thêm dòng mới, không dò để thay thế dòng đã có)
    │
    ▼
Với mỗi skill trong skills[]:
    skillDedupeService.suggest() → skillId
        │
        ▼
    upsert CandidateSkill (khoá kép candidateId+skillId)
        đã có, years > 0 ──► bỏ qua, giữ nguyên yearsOfExperience cũ
        đã có, years = 0 ──► cập nhật theo số Candidate nhập ở preview
        chưa có          ──► tạo mới với số năm đã nhập
    │
    ▼
candidate.cityId: fieldOverrides.cityId=true VÀ tên thành phố khớp City?
    khớp             ──► set cityId
    không khớp/false ──► giữ nguyên (null nếu chưa có, không tạo City mới)
    │
    ▼
Với từng field đơn lẻ (headline/bio/phone/dateOfBirth/gender):
    fieldOverrides[field]=true  ──► ghi giá trị mới
    fieldOverrides[field]=false ──► giữ giá trị cũ
    │
    ▼
candidate.fullName trong payload ──► bỏ qua (không map vào field nào)
    │
    ▼
Trả kết quả — hồ sơ Candidate đã cập nhật


── Song song, không đồng bộ với luồng import ở trên ──

PENDING University/Major (vùng xám 0.6-0.85, có pendingMatchId)
    │
    ▼
Cron catalog-suggestion-queue.job.ts (định kỳ)
    │
    ▼
CatalogMatchVerifier (Gemini, domain="university"|"major")
    │
    ├── MATCH        ──► tự động merge vào entry đích, ghi *Alias, xoá PENDING
    └── NEW / UNSURE ──► giữ PENDING, chờ Admin

PENDING (mọi trường hợp còn lại — <0.6 thẳng, hoặc NEW/UNSURE sau cron)
    │
    ▼
Admin vào /admin/universities hoặc /admin/majors
    │
    ├── approve       ──► PENDING → APPROVED (giữ nguyên tên)
    ├── reject        ──► xoá hẳn
    ├── merge         ──► gộp vào 1 entry APPROVED khác, lưu alias
    └── rename-approve ──► sửa tên + APPROVED (dùng khi entry là mới thật,
                            cần chuẩn hoá tên trước khi công khai)
    │
    ▼
catalog.repository.ts chỉ trả APPROVED ──► xuất hiện trong
GET /catalog/universities | /catalog/majors (dropdown công khai)
```

## Ảnh tham khảo bố cục UI

Không cần (backend). Xem `docs/05-frontend/phases/cv-ai-extraction-phase2/PLAN.md`.

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency mới.
- **Prisma** (`schema.prisma`):

```prisma
enum CatalogEntryStatus { // đổi tên từ SkillStatus
  APPROVED
  PENDING
}

model University {
  id              String             @id @default(cuid())
  name            String             @unique
  code            String?            @unique
  status          CatalogEntryStatus @default(APPROVED)
  createdByUserId String?
  createdBy       User?              @relation(fields: [createdByUserId], references: [id])
  educations      Education[]
  aliases         UniversityAlias[]

  @@index([status])
  @@map("universities")
}

model UniversityAlias {
  id           String           @id @default(cuid())
  alias        String           @unique
  universityId String
  university   University       @relation(fields: [universityId], references: [id], onDelete: Cascade)
  source       CatalogAliasSource @default(ADMIN_MERGE) // đổi tên từ SkillAliasSource, cùng đợt migration
  createdAt    DateTime         @default(now())

  @@map("university_aliases")
}

// Major + MajorAlias — cấu trúc y hệt University/UniversityAlias ở trên,
// chỉ đổi tên model/bảng.
```

- Port `apps/server/src/shared/ports/SkillMatchVerifier.ts` → đổi tên file + interface thành `CatalogMatchVerifier.ts` (Quyết định #3): thêm `domain` vào chữ ký `verify(domain, newName, candidates)`.
- Adapter `apps/server/src/infrastructure/gemini-skill-match-verifier.ts` → đổi tên `gemini-catalog-match-verifier.ts`, class `GeminiCatalogMatchVerifier`, nội dung prompt chọn theo `domain` (giữ nguyên logic cache Redis theo cặp tên, chỉ thêm `domain` vào cache key).
- `apps/server/src/modules/skills/skill-rate-limit.service.ts` → đổi tên, chuyển ra `apps/server/src/modules/shared/catalog-rate-limit.service.ts` (dùng chung, không còn thuộc riêng module `skills`), class `CatalogRateLimitService.assertWithinQuota(domain, userId)`/`recordCreation(domain, userId)`.
- Module mới `apps/server/src/modules/education-catalog/`:

| File | Vai trò |
| --- | --- |
| `university.repository.ts` / `major.repository.ts` | CRUD + query theo `status`, tách riêng vì 2 model Prisma khác nhau |
| `university-dedupe.service.ts` / `major-dedupe.service.ts` | Pipeline 4 bậc (Quyết định #2), theo khuôn `skill-dedupe.service.ts` nhưng bỏ bậc embedding |
| `education-catalog.controller.ts` / `.dto.ts` / `.routes.ts` | `POST /universities/suggest`, `POST /majors/suggest`, `GET/POST /admin/universities/*`, `GET/POST /admin/majors/*` |

- Module `modules/candidates/` mở rộng thêm `candidate-cv-import.service.ts` — orchestrator ghi dữ liệu từ `extractedData` (đã Candidate chỉnh sửa ở FE) vào profile (Quyết định #8).

## Phần 2 — Liên kết giữa các phần

- **`POST /universities/suggest`** / **`POST /majors/suggest`** (auth `CANDIDATE`): y hệt pipeline `POST /skills/suggest` (bậc 0-1 đồng bộ trong request, vùng xám tạo `PENDING` + gắn `pendingMatchId`, cron xác nhận sau) nhưng bỏ bậc embedding (Quyết định #2).
- **Cron xác nhận vùng xám**: mở rộng `skill-suggestion-queue.job.ts` (đổi tên `catalog-suggestion-queue.job.ts`) quét cả 3 bảng (`Skill`/`University`/`Major` có `pendingMatchId` chờ xác nhận), gọi `CatalogMatchVerifier` theo đúng `domain` tương ứng từng bảng.
- **Admin** — `education-catalog.routes.ts`: `GET /admin/universities?status=X`, `POST /admin/universities/:id/approve|reject|merge`, **`POST /admin/universities/:id/rename-approve`** (mới — body `{correctedName}`, kiểm tra trùng tên với entry `APPROVED` khác trước khi đổi tên+duyệt, xem mã mẫu ở bản nháp mục 4.1); y hệt cho `/admin/majors/*`.
- **`POST /candidates/me/profile/import-from-cv`** (auth `CANDIDATE`), body: `extractedData` (đã Candidate sửa ở FE) + `fieldOverrides: { headline?: boolean, bio?: boolean, phone?: boolean, dateOfBirth?: boolean, gender?: boolean, cityId?: boolean }` (cờ "dùng giá trị mới" cho từng field đơn lẻ, Quyết định #8) + `cvId` tuỳ chọn (chỉ để truy vết nguồn gốc, không bắt buộc trong logic ghi):
  1. Với mỗi `education`: gọi `universityDedupeService.suggest`/`majorDedupeService.suggest` lấy id tương ứng (`null` nếu bỏ trống) → insert `Education` mới.
  2. Insert mới toàn bộ `workExperiences`/`projects`/`certificates`/`awards` còn lại trong payload (đã được Candidate lọc/sửa ở FE).
  3. Với mỗi skill trong `skills`: gọi `skillDedupeService.suggest` lấy `skillId` → ghi `CandidateSkill` (khoá kép `[candidateId, skillId]`) theo `planSkillWrites` (Quyết định #8) — đã có với `yearsOfExperience > 0` thì giữ nguyên, đang `0` thì nhận số Candidate nhập ở preview, chưa có thì tạo mới. *Bổ sung sau: `skills` là `Array<{ name, yearsOfExperience }>` chứ không còn `string[]` — số năm do Candidate tự nhập, không phải do AI đọc từ CV.*
  4. Với `candidate.cityId`: nếu `fieldOverrides.cityId === true` và có tên thành phố trích được → tìm `City` khớp tên (so khớp đơn giản trên catalog nhỏ, không cần fuzzy phức tạp) → set nếu khớp, bỏ qua nếu không (Quyết định #7).
  5. Với từng field đơn lẻ còn lại (`headline`/`bio`/`phone`/`dateOfBirth`/`gender`): chỉ ghi nếu `fieldOverrides[field] === true`, tái dùng logic cập nhật đã có ở `PATCH /candidates/me` (gọi thẳng method trong `candidate.service.ts`, không qua HTTP nội bộ).
  6. `candidate.fullName` trong payload: bỏ qua hoàn toàn (Quyết định #9).
- `catalog.repository.ts`: `listMajors`/`listUniversities` thêm filter `APPROVED` (Quyết định #6).
- `packages/shared-types/src/index.ts`: thêm `CatalogEntryStatus` (thay `SkillStatus` — cập nhật mọi chỗ đang import `SkillStatus` sang tên mới), `AdminUniversityDto`/`AdminMajorDto` (mirror `AdminSkillDto`), `SuggestUniversityResponse`/`SuggestMajorResponse` (mirror `SuggestSkillResponse`), `ImportFromCvRequest`, `RenameApproveCatalogRequest { correctedName: string }`.

## Phần 3 — Các bước thực hiện

1. Sửa `schema.prisma` (Phần 1: đổi tên 2 enum, thêm field/2 bảng alias cho `University`/`Major`) → `npm run db:migrate --workspace=apps/server`.
2. Đổi tên + tổng quát hoá `SkillMatchVerifier` → `CatalogMatchVerifier` (port + adapter + mọi chỗ dùng trong module `skills`).
3. Đổi tên + tổng quát hoá `SkillRateLimitService` → `CatalogRateLimitService` (chuyển ra `modules/shared/`).
4. `modules/education-catalog/university.repository.ts`, `major.repository.ts`.
5. `modules/education-catalog/university-dedupe.service.ts`, `major-dedupe.service.ts` (4 bậc, Quyết định #2).
6. `modules/education-catalog/education-catalog.controller.ts`/`.dto.ts`/`.routes.ts` — suggest + admin CRUD 4 hành động.
7. Đổi tên cron `skill-suggestion-queue.job.ts` → `catalog-suggestion-queue.job.ts`, mở rộng quét cả 3 bảng.
8. `modules/candidates/candidate-cv-import.service.ts` — orchestrator Phần 2.
9. Thêm route `POST /candidates/me/profile/import-from-cv` vào `candidates.routes.ts`.
10. Sửa `catalog.repository.ts` lọc `APPROVED` cho `listMajors`/`listUniversities`.
11. Đăng ký container cho service/route mới.
12. Cập nhật `packages/shared-types/src/index.ts`.
13. **Tuỳ chọn, nên làm trước nếu có thời gian**: seed dữ liệu trường/ngành thật từ Bộ GD&ĐT vào `scripts/seed.ts` — giảm số lượng `PENDING` phát sinh ngay từ đầu (bản nháp mục 5).

## Cách test (Postman/curl, không cần frontend)

- Gõ tên trường trùng gần như 100% khác hoa/thường (`POST /universities/suggest`) → khớp bậc 1 (token/bigram), không tạo `PENDING`.
- Gõ tên trường hoàn toàn mới → tạo `PENDING`, gắn ngay vào `Education` của người tạo, **không** hiện trong `GET /catalog/universities` công khai.
- Case vùng xám (tên gần giống 1 trường có sẵn, ví dụ viết tắt) → `PENDING` tạm có `pendingMatchId`; chạy cron thủ công → merge tự động nếu Gemini nói `MATCH`, giữ `PENDING` chờ Admin nếu `NEW`/`UNSURE`.
- Admin `rename-approve` 1 entry `PENDING` mới thật với tên đã chuẩn hoá → chuyển `APPROVED`, tên đổi đúng; thử `rename-approve` trùng tên với 1 entry `APPROVED` khác → 409, message gợi ý dùng `merge`.
- `POST /candidates/me/profile/import-from-cv` với 2 `educations` trong 1 lần gọi → tạo đúng 2 dòng `Education` mới (không gộp/thay thế `Education` cũ nếu Candidate đã có sẵn từ trước).
- Import 1 skill mà Candidate đã có sẵn trong hồ sơ → không lỗi, không tạo dòng trùng, `yearsOfExperience` giữ nguyên giá trị cũ nếu nó `> 0`; nếu đang `0` thì nhận số mới Candidate nhập (xem `tests/unit/cv-import-skill-plan.test.ts`).
- Import với `fieldOverrides.phone: false` dù `extractedData.candidate.phone` khác giá trị hiện tại → `Candidate.phone` giữ nguyên, không bị ghi đè.
- Import với tên thành phố không khớp catalog nào → `Candidate.cityId` giữ `null`, không tạo `City` mới.

## Ghi chú triển khai (khác/bổ sung so với kế hoạch)

- **Schema**: ngoài snippet Phần 1, `University`/`Major` có thêm `pendingMatchUniversityId`/`pendingMatchMajorId` (self-relation, cùng ý nghĩa `Skill.pendingMatchSkillId` — cron cần biết hỏi Gemini so với mục nào) và `createdAt` (sắp xếp hàng đợi Admin).
- **Migration viết tay** (`ALTER TYPE ... RENAME`): `prisma migrate dev` tự sinh sẽ DROP rồi ADD lại cột `skills.status`/`skill_aliases.source` → mọi Skill PENDING bị reset về APPROVED.
- **Dedupe**: logic 4 bậc nằm ở một hàm dùng chung `education-catalog/education-catalog-dedupe.ts`; `university-dedupe.service.ts`/`major-dedupe.service.ts` chỉ gắn repository + hàm chuẩn hoá (hai repository cùng implement `EducationCatalogRepository`). Quota chỉ kiểm tra ngay trước khi tạo PENDING (khác Skill kiểm tra từ đầu) — người hết lượt vẫn chọn được mục có sẵn.
- **Chống gắn nhầm tên chung chung**: không trùng tên chính xác mà 2 ứng viên đầu cách nhau < 0.1 điểm (vd. "Đại học Bách khoa" khớp 0.90 với Bách khoa HCM, 0.84 với Bách khoa Hà Nội) → không AUTO, đẩy sang vùng xám (PENDING + cron hỏi Gemini). Phát hiện khi test với dữ liệu seed thật.
- **Chuẩn hoá tên** (`education-catalog-normalize.util.ts`): trường bỏ tiền tố "Trường", mở rộng "ĐH"/"CĐ"; ngành cắt chú thích cuối "(...)"/", chuyên ngành ..." và tiền tố "Ngành" — cùng quy tắc `scripts/seed-education-catalog.ts` dùng khi seed.
- `CatalogRateLimitService`, `CatalogMatchVerifier` đăng ký ở `container.ts` (dùng chung 2 module); cron chuyển sang `modules/shared/catalog-suggestion-queue.job.ts`. Key Redis quota của Skill giữ nguyên dạng `skill-quota:*`.
- `POST /universities/suggest`, `/majors/suggest`: chỉ `CANDIDATE`; response `SuggestCatalogEntryResponse { id, name, status, matchType }`.
- **Import (`candidate-cv-import.service.ts`)**: phân giải catalog trước, rồi ghi hồ sơ trong **một transaction** (không gọi lại `candidateService.updateProfile` như Phần 2 bước 5 — cần nguyên tử để bấm lại không nhân đôi dữ liệu). Lỗi nghiệp vụ từng mục (hết quota 429, tên kỹ năng không hợp lệ, thành phố không có trong danh mục) → trả trong `warnings`, không làm hỏng cả lần import. Kỹ năng: khớp alias/trùng tên trước (không tốn quota), mới gọi `suggest`. Phone/ngày sinh sai định dạng khi đã chọn ghi đè → 400.
- **Dọn trùng lặp catalog (2026-09-19)**: gộp 7 trường tên cứng cũ của `scripts/seed.ts` vào bản có mã Bộ GD&ĐT và 91 ngành trùng sau chuẩn hoá (vd. "Ngành Luật"/"Luật", "Tài chính - Ngân hàng"/"Tài chính – Ngân hàng"); tên bị gộp giữ lại làm alias (`source = SEED`). `seed.ts` giờ upsert trường theo `code` với đúng tên chuẩn; `seed-education-catalog.ts` gộp ngành bằng chính `normalizeMajorName` và bỏ qua mục đã có trong DB/alias — chạy lại không đẻ lại bản trùng.
- **City**: Phase 1 không trích thành phố → thêm `candidate.city` vào prompt/schema trích xuất (`cv-extraction-prompt.ts`) và `CvExtractionResult` (optional — CV phân tích trước đó không có field này).

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
