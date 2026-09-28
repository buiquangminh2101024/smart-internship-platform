# Trợ lý hồ sơ Candidate (gộp A1 + A4 + B2) — Backend

Quyết định kiến trúc: `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-14 (đã cập nhật 2026-09-28). Bản nháp lập luận đầy đủ: `docs/temp/AI_A1_A3_A4_B2_B3_MERGE_NOTES.md` (không commit) — file này chỉ ghi **cái sẽ làm**.

Song song: `docs/05-frontend/phases/candidate-insights/PLAN.md`.

**Trạng thái (2026-09-28): backend bước 1–5 XONG (migration đã áp Neon; `getTopMatches` + `GET /candidate/job-recommendations` và `GET`/`POST /candidate/profile/insights` đã test HTTP trên server thật; `tsc --noEmit` sạch cho `apps/server` và `packages/shared-types`).**

## Hai tính năng độc lập, không ràng buộc thứ tự

Bản đầu gộp cả A1+A4+B2 vào một nút "Phân tích hồ sơ". Sau khi rà kỹ, tách thành 2 tính năng khác hẳn nhau về bản chất kỹ thuật:

| | **Phân tích hồ sơ** (A1+A4) | **Việc làm phù hợp** (B2) |
|---|---|---|
| Dùng LLM? | Có | **Không** — rule + hybrid thuần |
| Hạn mức/ngày? | Có (20/ngày) | **Không** |
| Trigger | Candidate chủ động bấm | Tự tính mỗi lần vào trang, không cần bấm gì trước |
| Lưu kết quả? | Có, persistent (`candidate_profile_insights`) | Không — luôn tính "live" |
| Module sở hữu | `candidate-insights` (mới) | `job-matching` (đã có, mở rộng) |

Hai tính năng **không phụ thuộc thứ tự nhau** — Candidate mở "Việc làm phù hợp" trước hay "Phân tích hồ sơ" trước đều chạy đúng, vì cả hai cùng gọi chung 1 hàm chấm điểm ở `job-matching` (mục dưới).

## Quyết định đã chốt (chủ dự án chọn 2026-09-27, tinh chỉnh 2026-09-28)

| # | Quyết định |
|---|---|
| D1 | `suggestedIndustry` **không** làm field riêng — gộp làm 1 phần tử có bằng chứng trong `suggestions[]`. |
| D2 | Lọc top tin: SQL lọc thô → rule → **tinh chỉnh bằng hybrid** trên tập đã thu hẹp. |
| D3 | `CandidateProfileInsight` lưu **persistent** — nhưng chỉ lưu đầu ra LLM, không lưu danh sách tin. |
| D4 | Hạn mức/ngày (chỉ áp cho "Phân tích hồ sơ"): tái dùng **giá trị** `REQUIREMENT_EXTRACTION_DAILY_LIMIT_PER_USER` (=20), không thêm biến env mới. |
| D5 | Module `candidate-insights` chỉ giữ phần LLM/lưu trữ/rate-limit. |
| D6 | Ngưỡng tối thiểu để tính là "phù hợp": `MIN_RECOMMENDATION_SCORE = 20` (%), lọc theo **từng tin**, không phải tất cả-hoặc-không. |
| D7 | "Việc làm phù hợp" **tách độc lập** khỏi "Phân tích hồ sơ" — không LLM, không hạn mức, tính live. |
| D8 | Top 10 cố định, **không phân trang** (khác trang thật của TopCV — giữ đúng quy mô hạ tầng đã có, không mở rộng thành duyệt toàn thị trường). |

### Chốt thêm trước bước 3 (2026-09-28)

| # | Quyết định |
|---|---|
| D9 | Gọi LLM theo **đúng khuôn `RequirementExtractor`** (không có "chuỗi fallback" dùng chung sẵn): port `shared/ports/ProfileInsightGenerator.ts` + `infrastructure/gemini-profile-insight-generator.ts` + `infrastructure/openrouter-profile-insight-generator.ts` + `infrastructure/fallback-profile-insight-generator.ts`; prompt đặt ở `infrastructure/profile-insight-prompt.ts` (cùng chỗ `requirement-extraction-prompt.ts`), không đặt trong module. |
| D10 | `completenessScore` = tổng trọng số theo 4 cờ `completeness` của loader: **kỹ năng 40, kinh nghiệm 25, học vấn 25, headline/bio 10** (tổng 100). Chỉ để hiển thị — không ảnh hưởng điểm/độ tin cậy Job Matcher. |
| D11 | **LLM chỉ viết `strengths[]` + `suggestions[]` loại `WRITING`.** `SKILL_GAP`/`INDUSTRY_MISMATCH` do **code** tạo từ kết quả `getTopMatches` (xem "Gợi ý do code tạo") — `evidence` luôn là dữ liệu thật, LLM không thể bịa. |
| D12 | Hạn mức áp **cả per-user và global**: dùng lại giá trị `REQUIREMENT_EXTRACTION_DAILY_LIMIT_PER_USER` (20) và `REQUIREMENT_EXTRACTION_DAILY_LIMIT_GLOBAL` (200), đếm ở key Redis riêng `candidate-insight-quota:*`. |
| D13 | Dữ liệu gửi LLM **chỉ gồm**: headline, bio, tên + mô tả dự án, chức danh + mô tả kinh nghiệm, tên kỹ năng. **Không** gửi ngành học (việc lệch ngành do code làm), tên công ty, URL, ngày tháng, và **không bao giờ** gửi họ tên/SĐT/email/ngày sinh. |

## Năng lực dùng chung — đặt ở `job-matching`, không phải `candidate-insights`

Vì bước "tìm top tin phù hợp với 1 hồ sơ" không cần LLM, nó thuộc đúng bản chất của module `job-matching` (đối xứng với năng lực đã có "tìm điểm của N hồ sơ với 1 tin", phục vụ Employer ở `listApplicationMatches`).

### `JobRecommendationService.getTopMatches(candidateId, { limit = 10, minScore = 20 })` — hàm mới trong `job-matching`

1. Load `CandidateMatchProfile` (đã có, `candidate-match-profile.loader.ts`).
2. **Giai đoạn A — SQL lọc thô** (repository mới trong `job-matching`, không sửa `job-posts`): `status = PUBLISHED`, `publishedAt` trong N ngày gần nhất (mặc định 30), cùng `industry`/`jobType` nếu hồ sơ có — LIMIT 50.
   - **Fallback nới lỏng 1 lần:** nếu kết quả < 10 tin, chạy lại bỏ điều kiện `industry`/`jobType` (chỉ giữ `PUBLISHED` + gần đây), gộp kết quả. Không cascade nhiều tầng, không độn tin ngẫu nhiên nếu vẫn thiếu — trả về ít hơn 10 là hợp lệ, không phải lỗi.
3. **Giai đoạn B — chấm điểm:** `ruleJobMatcher` (`RULE_WEIGHTS_V1`) cho toàn bộ tập đã lọc; lấy top ~20 theo điểm rule; tính `similarityForJobs` (method mới, xem dưới) cho 20 tin này với `maxNewJobs` giới hạn (như `MAX_NEW_EMBEDDINGS_PER_REQUEST` của GĐ2); chấm lại bằng `hybridJobMatcher` (`HYBRID_WEIGHTS_V2`) — tin nào chưa kịp có vector (do vướng `maxNewJobs`) tự động rơi về điểm rule-only cho lần gọi này, **không lỗi, không chờ** (tự "trả nợ" ở lần gọi sau, xem "Cold-start" bên dưới).
4. **Giai đoạn C — áp ngưỡng D6:** loại tin có điểm hybrid (hoặc rule nếu hybrid chưa sẵn) `< minScore` (mặc định 20). Sort giảm dần, lấy tối đa `limit` (mặc định 10).
5. Trả về `JobRecommendation[]` — mỗi phần tử là `{ jobPost: {id, title, companyName, ...tóm tắt}, match: MatchResult }` (tái dùng nguyên `MatchResult` đã có, không tạo kiểu điểm mới).

**Không cache kết quả bước này** — mỗi lần gọi tính lại (rẻ, xem lý do ở AD-13 mục 7: chấm điểm là hàm thuần). Phần tốn kém duy nhất (tính vector) đã tự cache theo `contentHash` ở tầng `MatchEmbeddingService`, không cần thêm lớp cache nào nữa.

### Bổ sung ở `match-embedding.service.ts` / `match-embedding.repository.ts` (additive)

Hạ tầng hiện có chỉ có chiều "1 tin ↔ N hồ sơ". Cần thêm chiều ngược lại:

- `match-embedding.repository.ts`: `cosinesForCandidate(candidateId: string, jobPostIds: string[]): Promise<Map<string, number>>` — đối xứng với `cosinesForJob`.
- `match-embedding.service.ts`: `similarityForJobs(candidate: EmbeddingTarget, jobs: EmbeddingTarget[], maxNewJobs: number): Promise<Map<string, number | null>>` — đối xứng với `similarityForCandidates`, dùng lại `ensureVectors` sẵn có.
- Không đổi `similarity`, `similarityForCandidates`, `cosinesForJob` hiện có.

### Cold-start — không cần thiết kế thêm

Lần đầu Candidate gọi tới (chưa từng xem tin nào, chưa từng phân tích hồ sơ): `ensureVectors` tự phát hiện hồ sơ/tin chưa có vector và tính ngay trong request đó (trong giới hạn `maxNew`), phần vượt giới hạn tạm thời dùng điểm rule, tự bổ sung dần ở các lần gọi sau. Đây là cơ chế đã có từ Job Matcher GĐ2 (`ensureVectors`, xem code hiện tại) — không thêm cron/trigger "làm nóng" lúc lưu hồ sơ.

## API mới ở `job-matching`

| Method | Đường dẫn | Guard | Trả về | Ghi chú |
|---|---|---|---|---|
| GET | `/candidate/job-recommendations` | Candidate | `JobRecommendation[]` (≤10) hoặc `[]` | Không LLM, không rate-limit, tính live. `status: "INSUFFICIENT_PROFILE"` riêng (giống `MatchResult`) khi hồ sơ chưa có kỹ năng nào — phân biệt với `[]` (có hồ sơ, không tin nào đạt `MIN_RECOMMENDATION_SCORE`) |

Đăng ký trong `job-matching.routes.ts` (file đã có), không tạo router mới.

## Thay đổi cơ sở dữ liệu — chỉ còn phục vụ "Phân tích hồ sơ"

```prisma
model CandidateProfileInsight {
  candidateId    String   @id
  candidate      Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  completenessScore Int
  strengths      Json      // string[]
  suggestions    Json      // { text, kind, evidence? }[]
  topJobPostIds  Json      // string[] — 10 tin dùng để tổng hợp lúc phân tích, chỉ để debug/hiển thị "dựa trên N tin", KHÔNG phải cache của "Việc làm phù hợp"
  generatedAt    DateTime  @default(now())

  @@map("candidate_profile_insights")
}
```

- Bảng mới, 1–1 với `Candidate`, cùng khuôn `CandidateEmbedding`. Additive.
- Quy trình: viết SQL tay → `prisma migrate diff --from-migrations ... --to-schema-datamodel` xác nhận khớp `schema.prisma` → **dừng, xin xác nhận** → mới `migrate deploy` lên Neon.

## Output "Phân tích hồ sơ" — đúng 3 field

| Field | Nguồn tính | Ghi chú |
|---|---|---|
| `completenessScore` | Rule | Từ 4 cờ `completeness` của `candidate-match-profile.loader.ts`, trọng số D10: kỹ năng 40, kinh nghiệm 25, học vấn 25, headline/bio 10. |
| `strengths[]` | LLM | 2–3 câu, đọc từ dữ liệu ở D13. |
| `suggestions[]` | LLM + code | `{ text, kind: "WRITING" \| "SKILL_GAP" \| "INDUSTRY_MISMATCH", evidence?: string[] }`. `WRITING` do LLM viết; `SKILL_GAP`/`INDUSTRY_MISMATCH` do **code** tạo (D11, mục dưới) — luôn kèm `evidence`. |

### Gợi ý do code tạo (D11)

Nguồn: `items` của `JobRecommendationService.getTopMatches(candidateId, { limit: 10, minScore: 20 })` — mỗi phần tử đã có `match.skills[]` (MATCHED/MISSING + importance) và `match.education` (status + requiredMajors).

- **`SKILL_GAP`**: đếm kỹ năng `MISSING` trên các tin top; giữ kỹ năng xuất hiện ở **≥ 3 tin**, xếp REQUIRED trước rồi theo tần suất, lấy **tối đa 5**. `text` dạng "Docker — xuất hiện ở 6/10 tin bạn có thể phù hợp"; `evidence` = tên các tin.
- **`INDUSTRY_MISMATCH`**: xét các tin top có yêu cầu ngành mà đối chiếu được (`education.status` khác `NOT_REQUIRED`/`UNKNOWN`); chỉ tạo khi có **≥ 2 tin** như vậy và **≥ một nửa** trong số đó là `NONE` (ngành không khớp). `evidence` = "Tên tin — yêu cầu: ngành A, ngành B".
- `status = INSUFFICIENT_PROFILE` hoặc `items` rỗng ⇒ không tạo hai loại này.

## Luồng `POST /candidate/profile/insights`

1. Kiểm hạn mức (`CandidateInsightRateLimitService`, xem dưới).
2. Gọi `jobRecommendationService.getTopMatches(candidateId, { limit: 10, minScore: 20 })` (đúng hàm dùng chung ở mục trên — **không** tự viết lại SQL lọc thô/chấm điểm trong module này).
3. Từ kết quả, code tạo `SKILL_GAP`/`INDUSTRY_MISMATCH` (mục "Gợi ý do code tạo").
4. Gọi `ProfileInsightGenerator` (Gemini → OpenRouter, D9) với dữ liệu ở D13 ⇒ `strengths[]` + gợi ý `WRITING`.
5. Ghép `completenessScore` (D10) + kết quả LLM + gợi ý do code tạo → upsert `CandidateProfileInsight` (lưu cả `topJobPostIds` từ bước 2 để debug).
6. Ghi nhận hạn mức đã dùng.

Nếu bước 2 trả về `INSUFFICIENT_PROFILE` hoặc `items` rỗng: vẫn chạy LLM cho `strengths[]`/`WRITING`, chỉ không có `SKILL_GAP`/`INDUSTRY_MISMATCH` (LLM không được giao tạo hai loại này nên không thể bịa). LLM lỗi ở mọi tầng ⇒ 503 tiếng Việt, **không** ghi nhận hạn mức, không ghi đè kết quả cũ.

## Hạn mức gọi LLM

- `CandidateInsightRateLimitService` — cùng khuôn `RequirementExtractionRateLimitService` (Redis, kiểm trước/tăng sau, TTL 2 ngày, khoá theo ngày UTC).
- Namespace riêng: `candidate-insight-quota:user:{userId}:day:{date}` và `candidate-insight-quota:global:day:{date}` — không dùng chung key với `requirement-extract-quota:*`.
- Số ngưỡng (D12): per-user đọc `config.REQUIREMENT_EXTRACTION_DAILY_LIMIT_PER_USER` (20), global đọc `config.REQUIREMENT_EXTRACTION_DAILY_LIMIT_GLOBAL` (200) — tái dùng giá trị, không thêm biến env mới.
- **Chỉ áp cho `POST /candidate/profile/insights`** — không áp cho `GET /candidate/job-recommendations` (D7).

## API `candidate-insights`

| Method | Đường dẫn | Guard | Trả về | Ghi chú |
|---|---|---|---|---|
| GET | `/candidate/profile/insights` | Candidate | `CandidateProfileInsight \| null` | Đọc kết quả đã lưu, không tính lại, không tốn hạn mức |
| POST | `/candidate/profile/insights` | Candidate | `CandidateProfileInsight` | Chạy luồng ở trên, kiểm hạn mức trước, upsert kết quả mới |

Lỗi: 429 khi vượt hạn mức (thông báo tiếng Việt như `RequirementExtractionRateLimitService`).

## Cấu trúc file mới

```text
apps/server/src/modules/job-matching/            # mở rộng module đã có
├─ job-recommendation.service.ts       # getTopMatches(candidateId, options) — giai đoạn A+B+C   [XONG]
├─ job-recommendation.repository.ts    # SQL lọc thô tin PUBLISHED (kèm fallback nới lỏng)       [XONG]
├─ job-match-profile.loader.ts         # + loadMany (tránh N+1)                                  [XONG]
├─ match-embedding.service.ts          # + similarityForJobs (additive)
├─ match-embedding.repository.ts       # + cosinesForCandidate (additive)
└─ job-matching.routes.ts              # + GET /candidate/job-recommendations (additive)

apps/server/src/modules/candidate-insights/       # module mới, chỉ phần LLM/lưu trữ
├─ candidate-insights.config.ts       # trọng số completeness (D10), ngưỡng SKILL_GAP (≥3 tin, tối đa 5)
├─ candidate-insights.repository.ts   # upsert/find CandidateProfileInsight + đọc dữ liệu D13 (chỉ đọc bảng candidate)
├─ candidate-insight-rate-limit.service.ts
├─ profile-suggestions.util.ts        # hàm thuần tạo SKILL_GAP/INDUSTRY_MISMATCH từ items của getTopMatches
├─ candidate-insights.service.ts      # orchestrate: rate-limit → getTopMatches → gợi ý code → LLM → persist
├─ candidate-insights.controller.ts
└─ candidate-insights.routes.ts

apps/server/src/shared/ports/ProfileInsightGenerator.ts             # D9
apps/server/src/infrastructure/profile-insight-prompt.ts           # D9 — prompt chỉ yêu cầu strengths + WRITING
apps/server/src/infrastructure/gemini-profile-insight-generator.ts
apps/server/src/infrastructure/openrouter-profile-insight-generator.ts
apps/server/src/infrastructure/fallback-profile-insight-generator.ts
```

Kiểu `ProfileInsight`/`ProfileInsightSuggestion` đặt thẳng ở `packages/shared-types` (frontend cần) — bỏ file `candidate-insights.types.ts` riêng.

Sửa thêm (additive): `packages/shared-types` (kiểu `ProfileInsight`, `ProfileInsightSuggestion`; `JobRecommendation`/`JobRecommendationList` đã thêm ở bước 2); `main.ts` (mount router `candidate-insights`, `job-matching.routes.ts` chỉ thêm route, không cần mount lại).

Không sửa `candidates`, `cv`, `job-posts`, `applications`.

## Các bước thực hiện

1. **Migration** (bảng `candidate_profile_insights`) — viết tay, `migrate diff`, dừng xin xác nhận → áp Neon.
2. **`job-matching`: 2 method đối xứng + `job-recommendation.repository.ts` + `job-recommendation.service.ts` + route mới.** *Test:* gọi `getTopMatches` bằng script tạm với 1 hồ sơ thật — kiểm ngưỡng 20% lọc đúng, fallback nới lỏng khi pool < 10, hồ sơ trắng trả `INSUFFICIENT_PROFILE`.
3. **`candidate-insights`: repository + rate-limit + prompt + service** (gọi `getTopMatches` ở bước 2, chưa có route) — kiểm bằng script tạm, xem `suggestions[]` sinh ra hợp lý, `INDUSTRY_MISMATCH` luôn kèm `evidence`, và trường hợp `getTopMatches` trả `[]` thì không có `SKILL_GAP` bịa ra.
4. **Controller + route + đăng ký awilix + mount `main.ts`**. Test: `GET /candidate/job-recommendations` không cần hạn mức, gọi được ngay cả khi chưa từng `POST /candidate/profile/insights`; `POST` phân tích > hạn mức ⇒ 429.
5. `tsc` sạch cho `apps/server` và `packages/shared-types`.

## Ghi chú triển khai bước 1–2 (2026-09-28)

- **Lọc thô không theo ngành/loại việc:** `Candidate` không có trường ngành/loại việc mong muốn ⇒ điều kiện thu hẹp là "tin yêu cầu ≥ 1 kỹ năng APPROVED mà hồ sơ có"; nới lỏng thì bỏ điều kiện này. Luôn kèm `PUBLISHED`, chưa hết hạn (`expiresAt`), đăng trong 30 ngày.
- **Kiểu trả về:** `JobRecommendationList = { status: "OK" | "INSUFFICIENT_PROFILE", items: JobRecommendation[] }`; `JobRecommendation.jobPost` là `JobPost` công khai đầy đủ (dùng lại `jobPostInclude`/`toJobPostDto` của `job-posts`, không sửa module đó) để FE tái dùng `JobCard`.
- Hằng số ở `job-matching.config.ts`: `RECOMMENDATION_LIMIT=10`, `MIN_RECOMMENDATION_SCORE=20`, `RECOMMENDATION_RECENT_DAYS=30`, `RECOMMENDATION_POOL_SIZE=50`, `RECOMMENDATION_RERANK_SIZE=20`.
- Test trên dữ liệu thật (17 tin PUBLISHED, 22 hồ sơ): nới lỏng chạy khi pool thu hẹp = 9 (→ 17); ngưỡng 20% trả 5–6 tin cho hồ sơ ít kỹ năng (không độn); `minScore: 90` chỉ còn tin ≥ 90; hồ sơ trắng ⇒ `INSUFFICIENT_PROFILE`; không tin nào đạt ngưỡng ⇒ `OK` + rỗng; user không có hồ sơ ⇒ 404. Thời gian ~2 s (lần đầu ~5,6 s do nạp model/tính vector).
- **Sự cố:** khi kiểm migration ở bước 1 đã lỡ dùng `DATABASE_URL` làm `--shadow-database-url` ⇒ Prisma reset toàn bộ DB Neon (2026-09-28 03:13 UTC); đã khôi phục bằng Neon point-in-time restore. **Không bao giờ dùng DB thật làm shadow DB** — kiểm migration bằng `--from-migrations` cần một Neon branch riêng.

## Ghi chú triển khai bước 3 (2026-09-28)

- File: `shared/ports/ProfileInsightGenerator.ts`; `infrastructure/profile-insight-prompt.ts`, `gemini-/openrouter-/fallback-profile-insight-generator.ts`; `modules/candidate-insights/` gồm `candidate-insights.config.ts`, `profile-suggestions.util.ts`, `candidate-insight-rate-limit.service.ts`, `candidate-insights.repository.ts`, `candidate-insights.service.ts`. Kiểu `ProfileInsight`, `ProfileInsightSuggestion`, `ProfileInsightSuggestionKind` ở `shared-types`. Chưa đăng ký awilix/route (bước 4).
- **Kiểu trả về:** `ProfileInsight = { completenessScore, strengths, suggestions, basedOnJobCount, generatedAt }` — không trả `topJobPostIds` ra API, chỉ số lượng (`basedOnJobCount`) cho câu "dựa trên N tin"; mảng id vẫn lưu DB để debug.
- LLM chỉ trả `{ strengths (≤3), writingSuggestions (≤4) }`; `temperature 0.2`; prompt cấm đề xuất kỹ năng/ngành (phần đó do code). Đầu vào bị cắt độ dài (bio 1500, mô tả 800 ký tự, ≤10 kinh nghiệm/dự án, ≤40 kỹ năng).
- **Hồ sơ không có chữ nào** (không headline/bio/kỹ năng/kinh nghiệm/dự án) ⇒ không gọi LLM, không tính lượt, vẫn lưu `completenessScore` + mảng rỗng — tránh tốn lượt và tránh LLM bịa điểm mạnh.
- LLM và `getTopMatches` chạy song song. LLM lỗi mọi tầng ⇒ 503 tiếng Việt, không ghi DB, không tính lượt. `upsert` tự đặt lại `generatedAt` (cột chỉ có `@default(now())`).
- `evidence` của `SKILL_GAP`/`INDUSTRY_MISMATCH` có dạng "Tên tin (Tên công ty)" để phân biệt tin trùng tên.
- **Test bước 3 (script tạm, Gemini thật, Redis giả cho phần hạn mức):** hồ sơ 16 kỹ năng ⇒ completeness 100, 2 điểm mạnh + 4 góp ý WRITING có căn cứ, dựa trên 10 tin (~12 s); hồ sơ 2 kỹ năng, không kinh nghiệm/dự án ⇒ completeness 75, 1 điểm mạnh + 3 góp ý, 3 tin (~7 s); `GET` đọc lại khớp. Không sinh `SKILL_GAP`/`INDUSTRY_MISMATCH` trên dữ liệu thật vì không kỹ năng thiếu nào xuất hiện ở ≥ 3 tin và cả 10 tin đều `NOT_REQUIRED` ngành — đã kiểm hai hàm này bằng dữ liệu giả (đủ/thiếu ngưỡng, `items` rỗng ⇒ không gợi ý). Hạn mức: lượt thứ 3 của user (ngưỡng 2) và vượt ngưỡng global đều ⇒ 429. LLM lỗi ⇒ 503, DB không đổi, không gọi `recordUsage`.

## Ghi chú triển khai bước 4 (2026-09-28)

- `candidate-insights.controller.ts` + `candidate-insights.routes.ts`: `GET /candidate/profile/insights` (trả `ProfileInsight | null` — `null` khi chưa từng phân tích, không tốn hạn mức) và `POST /candidate/profile/insights` (phân tích lại, kiểm hạn mức trước ⇒ 429/503/404 như bước 3). Cả hai dùng guard `authenticate` + `authorize("CANDIDATE")`.
- Đăng ký awilix trong `candidateInsightsRouter`: `profileInsightGenerator` là chuỗi tầng Gemini chính → Gemini `GEMINI_FALLBACK_MODEL` (nếu có) → OpenRouter, cùng khuôn `cvExtractor`; cùng rate-limit, repository, service, controller.
- `main.ts`: mount ngay sau `jobMatchingRouter` vì service resolve `jobRecommendationService`/`candidateMatchProfileLoader` do router đó đăng ký.
- **Test HTTP (server dev thật, Gemini thật, hạn mức tạm hạ còn 4/ngày rồi trả lại 20):** không token ⇒ 401; token EMPLOYER ⇒ 403; `GET /candidate/job-recommendations` trước khi phân tích ⇒ 200, 10 tin (~2,8 s); `GET` insights khi chưa phân tích ⇒ `data: null`; `POST` ⇒ 200 đủ trường (hồ sơ 16 kỹ năng: completeness 100, 2 điểm mạnh, 4 WRITING, dựa trên 10 tin, ~9,8 s), `GET` đọc lại khớp; thành công đúng 4 lượt, lượt 5 ⇒ 429 với thông báo tiếng Việt; khi đã hết lượt, `GET` insights vẫn trả kết quả cũ và `GET /candidate/job-recommendations` vẫn 200. Dữ liệu test (dòng insight, bộ đếm Redis) đã dọn.

## Ngoài phạm vi

- Phân trang "Việc làm phù hợp" (D8 — chỉ top 10 cố định).
- Tự động tính lại "Phân tích hồ sơ" khi hồ sơ đổi (chỉ tính khi Candidate bấm nút).
- Sửa hồ sơ Candidate tự động theo gợi ý LLM.

## Phần ghi chú của chủ dự án

*(để trống)*
