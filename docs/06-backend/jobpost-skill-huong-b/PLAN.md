# JobPost Skill — Hướng B: Skill tự nhập + duyệt (Backend)

Không thuộc phase đánh số nào trong `PROJECT_PHASES.md` — đây là cải tiến/retrofit cho module `job-posts` (Phase 6) + `candidates` (Phase 3) đã hoàn thành trước đó, gắn liền chuẩn bị cho Phase 11 (AI Features Boundary). Xem thiết kế gốc ở `docs/designs/JOBPOST_SKILL_DESIGN.md` (đặc biệt §3 Hướng B, §B.1 pipeline, §B.2 kỹ thuật hạn chế LLM) và checklist chuẩn bị ở `docs/temp/JOBPOST_SKILL_HUONG_B_SETUP.md`. Không chép lại nội dung 2 file đó — chỉ ghi phần đặc thù/bổ sung + quyết định mới chốt khi lên kế hoạch cụ thể.

**Trạng thái: ĐÃ TRIỂN KHAI (2026-09-15).** Quyết định kiến trúc chốt lại ở `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-9, trong đó có 2 điểm thực tế khác dự đoán ở plan này (`env.cacheDir` phải đặt trên đúng instance module `import()` động; `gemini-2.0-flash` đã bị Google gỡ nên model ID chuyển thành biến env `GEMINI_MODEL`).

**Khác biệt so với plan khi triển khai:** port/adapter LLM đặt ở `shared/ports/SkillMatchVerifier.ts` + `infrastructure/gemini-skill-match-verifier.ts` (theo đúng chỗ mọi port/adapter khác của repo đang nằm) thay vì `modules/skills/skill-match-verifier.port.ts` + `modules/skills/adapters/` như bảng ở Phần 1. Ngoài ra thêm `skills.service.ts` (tầng service cho nhánh Admin) và bước backfill embedding trong cron — hai thứ bảng file gốc chưa liệt kê.

## Quyết định mới chốt khi lên kế hoạch (bổ sung so với bản nháp `docs/temp`)

1. **Hạ tầng đã sẵn sàng phía chủ dự án**: `GEMINI_API_KEY` đã thêm vào `.env`; Neon project đã xác nhận bật được extension `vector`; thư mục cache model đã tạo sẵn tại `D:\ai-models-cache\smart-internship-platform` (chỉ cần code trỏ `env.cacheDir` tới đây).
2. **Áp dụng cho cả 2 actor**: Employer (gắn skill cho `JobPost`) và Candidate (gắn skill cho hồ sơ) dùng chung 1 pipeline/1 endpoint `POST /skills/suggest` — không tách 2 luồng riêng.
3. **Rate-limit tạo skill mới (quyết định mới, chưa có ở bản nháp gốc)** — chống spam/lạm dụng catalog:
   - Theo từng user: tối đa **10 skill mới/tuần** và **40 skill mới/tháng**.
   - Toàn hệ thống (global): tối đa **150 skill mới/tuần** (giá trị giữa khoảng 100-200 chủ dự án đưa ra — để hằng số dễ chỉnh, không hard-code rải rác).
   - **Chỉ tính vào rate-limit khi thực sự tạo ra 1 `Skill` mới ở trạng thái `PENDING`** (bậc 3, hoặc bậc 2 khi LLM kết luận `NEW`). Các lần match trúng skill có sẵn (alias exact match, token match bậc 1, LLM kết luận `MATCH`) **không tính** — vì không tạo dữ liệu mới, không có gì để giới hạn.
   - Dùng Redis (đã có sẵn từ Phase 2) — pattern giống rate-limit OTP đã triển khai: `INCR` + `EXPIRE` theo key user (tuần/tháng) và 1 key global (tuần).
4. **Ngưỡng similarity**: giữ nguyên đề xuất — `≥ 0.85` auto-match, `0.6-0.85` vùng xám (cần LLM xác nhận qua batch), `< 0.6` tạo mới thẳng.
5. **Model embedding**: `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (384 chiều) — giữ nguyên đề xuất.
6. **Dependency & schema**: đồng ý thêm `@huggingface/transformers`, `@google/genai`; đồng ý bật `previewFeatures = ["postgresqlExtensions"]` + `extensions = [vector]` trong `schema.prisma`.
7. **Phạm vi v0 mở rộng** so với bản nháp gốc (`docs/temp/JOBPOST_SKILL_HUONG_B_SETUP.md` mục 6) — 3 việc sau **làm luôn trong lần implement đầu tiên**, không để dành sau:
   - Batch/cron xử lý bậc 2 (gọi LLM) thay vì gọi đồng bộ trong request — do đó bậc 2 **không** trả kết quả ngay trong response của `POST /skills/suggest`, mà tạo `PENDING` tạm rồi cron xử lý sau.
   - Feedback loop: khi cron (LLM tự merge) hoặc Admin (merge tay) gộp 1 skill `PENDING` vào skill có sẵn, tự động ghi thêm dòng vào `SkillAlias`.
   - Cache kết quả xác nhận LLM theo Redis (tránh gọi lại Gemini nhiều lần cho cùng 1 cặp tên skill trong lúc chờ cron chạy).
   - **Vẫn để dành sau** (không làm ở lần này): xử lý input dạng câu dài (tách nhiều skill từ 1 đoạn mô tả), fine-tune lại model embedding, UI combobox nâng cao (debounce/loading mượt).
8. **Validate đầu vào (khác với bước chuẩn hoá ở `skill-normalize.util.ts`)** — `skill-normalize.util.ts` chỉ *biến đổi* chuỗi để so khớp (lowercase, bỏ dấu câu, NFC), **không** từ chối input xấu. Thêm 1 bước validate riêng ở `skills.dto.ts` (zod), chạy ở tầng route **trước** rate-limit check và trước toàn bộ pipeline (từ chối sớm, không tốn quota cho input rác):
   - Độ dài tên skill (sau `trim()`) **≤ 50 ký tự**.
   - Không có từ (token, tách theo khoảng trắng) nào chỉ có **1 ký tự** — vd. `"a b Design"` bị từ chối vì có từ `"a"`/`"b"` chỉ 1 ký tự.
   - Không được chỉ toàn khoảng trắng hoặc chỉ toàn ký tự đặc biệt/dấu câu — bắt buộc có ít nhất 1 ký tự chữ hoặc số (regex unicode-aware `/[\p{L}\p{N}]/u`, hỗ trợ tiếng Việt có dấu).
   - **Lưu ý quan trọng**: rule "không từ 1 ký tự" chỉ áp dụng cho input tự gõ qua `POST /skills/suggest`, **không** áp dụng cho skill seed sẵn trong catalog (`scripts/seed.ts` ghi thẳng vào DB, không qua endpoint này) — các skill hợp lệ tên ngắn 1 ký tự (vd. ngôn ngữ lập trình `"C"`, `"R"`) vẫn seed được bình thường, chỉ người dùng không tự gõ tạo mới được tên kiểu đó qua UI.

## Ảnh tham khảo bố cục UI

Chưa có mockup riêng cho tính năng này. Frontend dùng lại component/pattern UI đã có (`SkillSection` trong `CandidateProfileClient.tsx`, `admin/(console)/companies` cho màn duyệt) — xem chi tiết ở PLAN frontend song song (`docs/05-frontend/phases/jobpost-skill-huong-b/PLAN.md`).

## Phần 1 — Công nghệ / package / kiến trúc

- **Dependency mới**: `@huggingface/transformers` (embedding local, chạy WASM trong Node — package đã đổi tên chính thức từ `@xenova/transformers`), `@google/genai` (SDK Gemini hiện hành, thay `@google/generative-ai` cũ).
- **Prisma** (`schema.prisma`):
  ```prisma
  generator client {
    provider        = "prisma-client-js"
    previewFeatures = ["postgresqlExtensions"]
  }

  datasource db {
    provider   = "postgresql"
    url        = env("DATABASE_URL")
    extensions = [vector]
  }

  enum SkillStatus {
    APPROVED
    PENDING
  }

  enum SkillAliasSource {
    SEED
    ADMIN_MERGE
    LLM_MERGE   // cron tự merge khi Gemini kết luận MATCH, không qua tay Admin
  }

  model Skill {
    id                  String            @id @default(cuid())
    name                String            @unique
    status              SkillStatus       @default(APPROVED)
    createdByUserId     String?
    createdBy           User?             @relation(fields: [createdByUserId], references: [id])
    embedding           Unsupported("vector(384)")?
    // Skill gần nhất tìm được lúc tạo (vùng xám 0.6-0.85) — để cron biết cần
    // xác nhận với Gemini so với ai, không phải tính lại fuzzy/embedding lần 2.
    pendingMatchSkillId String?
    pendingMatchSkill   Skill?            @relation("SkillPendingMatch", fields: [pendingMatchSkillId], references: [id])
    pendingMatchOf      Skill[]           @relation("SkillPendingMatch")
    candidateSkills     CandidateSkill[]
    jobPostSkills       JobPostSkill[]
    aliases             SkillAlias[]

    @@map("skills")
  }

  model SkillAlias {
    id        String            @id @default(cuid())
    alias     String            @unique
    skillId   String
    skill     Skill             @relation(fields: [skillId], references: [id], onDelete: Cascade)
    source    SkillAliasSource  @default(ADMIN_MERGE)
    createdAt DateTime          @default(now())

    @@map("skill_aliases")
  }
  ```
- Cần `CREATE EXTENSION IF NOT EXISTS vector;` chạy được trên Neon — xác nhận thật khi chạy `db:migrate` (Prisma có thể tự sinh dòng này nhờ khai `extensions = [vector]`, nếu không thì thêm thủ công vào đầu file migration).
- **Module mới** `apps/server/src/modules/skills/` (convention chặt giống `companies`/`subscriptions`/`job-posts`):

| File | Vai trò |
|---|---|
| `skill-normalize.util.ts` | Chuẩn hoá chuỗi (lowercase, trim, bỏ dấu câu, NFC) |
| `skill-token-match.util.ts` | Jaccard similarity trên tập từ |
| `skill-embedding.service.ts` | Load model qua `@huggingface/transformers` (singleton, khởi tạo 1 lần), sinh vector, tính cosine qua pgvector (`$queryRaw`, toán tử `<=>`) |
| `skill-alias.repository.ts` | CRUD bảng `SkillAlias` |
| `skill-rate-limit.service.ts` | Đếm/kiểm tra quota qua Redis |
| `skill-match-verifier.port.ts` | Interface `SkillMatchVerifier.verify(newName, candidateName): Promise<{decision: "MATCH"\|"NEW"}>` |
| `adapters/gemini-skill-match-verifier.ts` | Adapter thật gọi Gemini qua `@google/genai`, có cache Redis theo cặp tên đã chuẩn hoá |
| `skill-dedupe.service.ts` | Orchestrator pipeline bậc 1/3 (đồng bộ, trong request) |
| `skill-suggestion-queue.job.ts` | Cron (node-cron) xử lý bậc 2 theo batch |
| `skills.repository.ts` / `.controller.ts` / `.dto.ts` / `.routes.ts` | CRUD + route |
| `apps/server/src/shared/ai/embedding-env.ts` | Set `env.cacheDir = process.env.EMBEDDING_MODEL_CACHE_DIR` 1 lần dùng chung |

- Redis: tái dùng `ioredis` client đã có sẵn (Phase 2) — thêm namespace mới cho rate-limit + cache LLM, không tạo connection mới.
- node-cron: tái dùng dependency đã có (Phase 5), thêm 1 job mới đăng ký trong `main.ts` cạnh `job-post-expiry.job.ts`/`subscription-expiry.job.ts`.

## Phần 2 — Liên kết giữa các phần

- **`POST /skills/suggest`** (auth bất kỳ role `CANDIDATE`/`EMPLOYER`), body `{ name: string }`:
  0. **Validate đầu vào** (zod ở `skills.dto.ts`, chạy ở tầng route trước khi vào `skill-dedupe.service.ts` — quy tắc ở Quyết định #8: độ dài ≤ 50, không từ 1 ký tự, không rỗng/toàn ký tự đặc biệt). Sai bất kỳ rule nào → 400, không tới bước nào dưới đây, không tính rate-limit.

  Sau đó, trong `skill-dedupe.service.ts`:
  1. **Rate-limit check** (`skill-rate-limit.service.ts`) — vượt quota user/tuần, user/tháng, hoặc global/tuần → trả lỗi ngay (429), không chạy pipeline, không tính thêm.
  2. Chuẩn hoá chuỗi.
  3. Tra `SkillAlias` (exact match trên chuỗi đã chuẩn hoá) → khớp → trả `{ skillId, matchType: "ALIAS" }` ngay, **không** tính rate-limit.
  4. Token/Jaccard match với `Skill WHERE status = 'APPROVED'` → `similarity ≥ 0.85` → trả `{ skillId, matchType: "AUTO" }`, không tính rate-limit.
  5. `0.6 ≤ similarity < 0.85` (vùng xám): tạo `Skill` mới `status=PENDING`, `createdByUserId`, sinh & lưu `embedding` ngay, lưu `pendingMatchSkillId` = skill gần nhất tìm được ở bước 4 → gắn ngay vào `JobPostSkill`/`CandidateSkill` của người tạo (không chặn UX) → **tính rate-limit** → trả `{ skillId, matchType: "PENDING_REVIEW" }`.
  6. `similarity < 0.6`: tạo thẳng `Skill PENDING` (không set `pendingMatchSkillId`, không cần LLM) → tính rate-limit → trả `{ skillId, matchType: "PENDING_REVIEW" }`.
- **Cron `skill-suggestion-queue.job.ts`** (chạy định kỳ, ví dụ mỗi giờ): quét `Skill WHERE status='PENDING' AND pendingMatchSkillId IS NOT NULL` (tức là case vùng xám cần LLM xác nhận, khác case bậc 3 tạo thẳng) → gọi Gemini theo batch (qua `GeminiSkillMatchVerifier`, có cache Redis theo cặp tên) →
  - LLM trả `MATCH`: chuyển toàn bộ `JobPostSkill`/`CandidateSkill` đang trỏ vào skill `PENDING` này sang `pendingMatchSkillId` (skill đích), xoá skill `PENDING`, ghi `SkillAlias` mới (`source = LLM_MERGE`).
  - LLM trả `NEW` hoặc không chắc: giữ nguyên `PENDING`, bỏ `pendingMatchSkillId` (đánh dấu đã qua LLM, không xử lý lại), chờ Admin duyệt tay.
- **Admin duyệt tay** (`GET /admin/skills?status=PENDING`, `POST /admin/skills/:id/approve|reject|merge`): danh sách còn lại sau cron (case LLM nói `NEW`/không chắc, hoặc case tạo thẳng similarity < 0.6 không qua LLM).
  - `approve`: `PENDING → APPROVED`.
  - `reject`: xoá `Skill` (cascade xoá `JobPostSkill`/`CandidateSkill` đang trỏ vào — chấp nhận mất liên kết, vì đây là skill bị từ chối).
  - `merge` (chọn tay 1 skill đích): giống hành vi cron `MATCH` ở trên nhưng do Admin chọn, ghi `SkillAlias` nguồn `ADMIN_MERGE`.
- `catalog.repository.ts` (`listSkills()`): thêm `WHERE status = 'APPROVED'` — danh sách công khai chỉ hiện skill đã duyệt (không hiện `PENDING`).
- `job-posts.dto.ts`/`.service.ts`/`.repository.ts`: thêm `skillIds: string[]` khi tạo/sửa `JobPost` — diff-write `JobPostSkill` (cùng pattern `candidates.repository.ts` đã xử lý `CandidateSkill`). Cho phép gắn cả skill `PENDING` do chính employer đó vừa tạo trong phiên làm việc (không giới hạn chỉ `APPROVED`, vì đã gắn "tạm" ngay lúc suggest).
- `candidates.*`: áp dụng tương tự cho `CandidateSkill` (đã chốt dùng chung pipeline).
- Thêm vào `packages/shared-types/src/index.ts`: `SkillStatus`, `SuggestSkillRequest`, `SuggestSkillResponse` (`{ skillId, status, matchType }`), `AdminSkillDto`, `MergeSkillRequest`.

## Phần 3 — Các bước thực hiện

1. `npm install @huggingface/transformers @google/genai --workspace=apps/server`.
2. Cập nhật `.env`/`.env.example`: `GEMINI_API_KEY`, `EMBEDDING_MODEL_CACHE_DIR`.
3. Sửa `schema.prisma` (Phần 1) → `npm run db:migrate --workspace=apps/server` → xác nhận extension `vector` được tạo trên Neon thật.
4. `apps/server/src/shared/ai/embedding-env.ts`: set `env.cacheDir`.
5. `skill-embedding.service.ts`: `embed(text)`, `findNearest(vector, limit)` (raw SQL `<=>`).
6. `skill-normalize.util.ts`, `skill-token-match.util.ts` (kèm unit test nhỏ, thuần hàm không phụ thuộc DB/network).
7. `skill-alias.repository.ts`.
8. `skill-match-verifier.port.ts` + `adapters/gemini-skill-match-verifier.ts` (structured JSON output, cache Redis theo cặp tên).
9. `skill-rate-limit.service.ts` (hằng số: `PER_USER_WEEKLY_LIMIT=10`, `PER_USER_MONTHLY_LIMIT=40`, `GLOBAL_WEEKLY_LIMIT=150` — đặt thành constant dễ chỉnh, không hard-code rải rác).
10. `skill-dedupe.service.ts` — orchestrator Phần 2 bước 1-6.
11. `skills.repository.ts`/`.controller.ts`/`.dto.ts`/`.routes.ts` — `POST /skills/suggest`, `GET /admin/skills`, `POST /admin/skills/:id/approve|reject|merge`.
12. `skill-suggestion-queue.job.ts` — cron xử lý batch bậc 2, merge tự động khi `MATCH`.
13. Sửa `catalog.repository.ts` lọc `APPROVED`.
14. Sửa `job-posts.dto.ts`/`.service.ts`/`.repository.ts` thêm `skillIds`.
15. Sửa `candidates.dto.ts`/`.service.ts`/`.repository.ts` dùng chung `POST /skills/suggest` (không đổi route CRUD `CandidateSkill` hiện có, chỉ đổi nguồn `skillId` đầu vào).
16. Đăng ký container awilix cho service/route mới, mount router trong `main.ts`, đăng ký cron cạnh các cron khác.
17. Thêm DTO vào `packages/shared-types/src/index.ts`.

## Cách test (không cần frontend — Postman/curl)

- Gửi tên skill dài 51 ký tự trở lên → bị từ chối 400 ngay ở tầng validate, không chạm rate-limit/pipeline.
- Gửi tên có từ chỉ 1 ký tự (vd. `"a Design"`) → bị từ chối 400.
- Gửi chuỗi toàn khoảng trắng hoặc toàn ký tự đặc biệt (vd. `"   "`, `"!!!---"`) → bị từ chối 400.
- Xác nhận skill seed sẵn tên 1 ký tự (vd. `"C"`, `"R"`) qua `scripts/seed.ts` vẫn hiển thị bình thường trong `GET /catalog/skills` — không bị rule trên ảnh hưởng vì seed không đi qua endpoint `suggest`.
- Gõ tên skill trùng gần như 100% khác hoa/thường ("reactjs" khi đã có "React.js") → match bậc 1 (token/Jaccard cao), không tạo record, không tính rate-limit.
- Gõ tên hoàn toàn không giống gì trong catalog → tạo `PENDING` ngay (bậc 3, không `pendingMatchSkillId`), rate-limit user +1.
- Case vùng xám (seed sẵn "React", gõ "ReactJS" nếu chưa nằm trong alias/token-match ngưỡng cao) → tạo `PENDING` tạm có `pendingMatchSkillId`; chạy cron thủ công (gọi trực tiếp hàm job) → merge tự động vào "React", `SkillAlias` mới xuất hiện (`source=LLM_MERGE`), `JobPostSkill`/`CandidateSkill` cũ trỏ đúng sang skill đích.
- Gõ liên tục >10 lần/tuần cùng 1 user (mỗi lần 1 tên khác nhau để chắc chắn tạo mới) → lần thứ 11 bị chặn kèm message rõ ràng; xác nhận các lần match trúng skill có sẵn không bị tính vào bộ đếm.
- Admin vào `/admin/skills` thấy đúng skill còn `PENDING` sau cron (case LLM nói `NEW`), approve/reject/merge hoạt động đúng, dữ liệu liên kết cũ được chuyển đúng khi merge tay.
- Tắt cờ liên quan tới Gemini (giả lập `GEMINI_API_KEY` rỗng/lỗi) → cron không crash, skill vùng xám vẫn nằm `PENDING` chờ Admin xử lý thủ công (không có LLM vẫn an toàn, đúng nguyên tắc human-in-the-loop).

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
