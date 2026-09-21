# Job Matcher — Giai đoạn 2: Embedding (semantic) + bộ đánh giá (Backend)

Tiếp nối `docs/06-backend/job-matcher-phase1/PLAN.md` — **GĐ1 phải xong trước** (GĐ2 dùng lại `importance`, `minExperienceYears`, `ScoringJobMatcher`, hai loader và ba route). Quyết định kiến trúc: `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-13. Bản nháp đầy đủ: `docs/temp/A2_JOB_MATCHER_3_PHASES.md` mục 5 — file này ghi cái sẽ làm, không chép lại lập luận.

**Trạng thái: đã lên kế hoạch (2026-09-20), CHƯA triển khai.** Migration phải viết tay, kiểm bằng `prisma migrate diff` và **dừng xin xác nhận** trước khi áp lên Neon.

GĐ2 có **hai mục tiêu song song**: (1) thêm thành phần `semantic` vào điểm; (2) tạo **bộ đánh giá** so sánh 3 cấu hình `RULE` / `EMBEDDING_ONLY` / `HYBRID` — đây là phần "nghiên cứu" của luận văn. Kết quả "embedding không tốt hơn rule" vẫn là kết quả hợp lệ; khi đó mặc định giữ `rule` và báo cáo trung thực.

## Quyết định đã chốt (chủ dự án duyệt Q1–Q8 ngày 2026-09-20)

Q6: bộ nhãn **30–50 cặp, 2 người gán độc lập** (tính Cohen's κ); nếu chỉ có 1 người thì nêu rõ hạn chế trong báo cáo. Dữ liệu demo tạo bằng LLM (ràng buộc chỉ dùng tên kỹ năng `APPROVED` trong catalog) rồi chủ dự án tự map + gán nhãn — **không làm crawler**, và chỉ chuẩn bị prompt khi tới bước 5 bên dưới. Các quyết định D1–D5 và `rule-v1` giữ nguyên từ GĐ1.

## Quyết định mới chốt khi lên kế hoạch

1. **Dùng chung một model embedding, không nạp lần hai.** `SkillEmbeddingService` giữ model (~465MB RAM). Port `shared/ports/EmbeddingProvider.ts` `{ modelId: string; embed(text): Promise<number[] | null> }` + adapter mỏng `infrastructure/skill-embedding-provider.ts` **uỷ quyền cho `skillEmbeddingService.embed`** (đã trả vector 384 chiều đã chuẩn hoá, `null` khi model lỗi — khớp đúng chữ ký port). **Không sửa module `skills`**; `modelId` lấy từ `config.EMBEDDING_MODEL_ID`.
2. **Bảng riêng `candidate_embeddings` / `job_post_embeddings`**, không thêm cột vào `Candidate`/`JobPost` (hai model dùng rất rộng; cascade xoá sạch khi xoá hồ sơ/tin). Extension `vector` đã bật từ Skill.
3. **Lazy + hash, không dirty flag, không cron.** Vector chỉ tính khi có người xem điểm; `contentHash = sha256(templateVersion | modelId | văn bản)` so tại chỗ. Sửa headline/kỹ năng ⇒ hash đổi ⇒ lần xem sau tự embed lại; sửa số điện thoại ⇒ văn bản không đổi ⇒ không tốn gì; đổi model hoặc mẫu ⇒ vector cũ tự hết hiệu lực. Thoả yêu cầu "chỉ regenerate khi dữ liệu nguồn đổi" mà không thêm trạng thái.
4. **Không tạo index vector.** Mỗi lần chỉ so **một cặp** (không tìm láng giềng gần nhất); HNSW để dành cho hướng gợi ý tin (B2).
5. **Điểm rơi về `rule-v1` khi thiếu vector.** `MatchResult.weightsVersion` phải nói đúng cấu hình đã chấm. Nên `JobMatchingService` giữ **hai** matcher (`rule`, `hybrid`) và chọn theo từng request: `JOB_MATCHER_MODE=hybrid` **và** có cosine ⇒ `hybrid-v1`; ngược lại ⇒ `rule-v1` với `semantic.available = false`. (Không để `hybrid` chạy với `semantic` bị loại: trọng số 0.40/0.10/0.15 chia lại không trùng 0.60/0.15/0.25 nên điểm sẽ lệch âm thầm mà nhãn vẫn ghi "hybrid".)
6. **Hạn chế số vector mới tính mỗi request** (danh sách đơn có N ứng viên chưa có vector): tối đa `MAX_NEW_EMBEDDINGS_PER_REQUEST` (hằng số ở `job-matching.config.ts`, **giá trị chốt sau khi đo ở bước 1**); phần vượt trả điểm `rule-v1` và `semanticStatus = "PENDING"` — lần tải sau dần đầy. Embed tuần tự, không song song (model CPU đơn luồng, song song không nhanh hơn).
7. **Trùng lặp có chủ ý:** kỹ năng vừa ở điểm rule vừa ở văn bản embed nên bị tính hai lần một phần. Trọng số `semantic = 0.30` (thấp) để hạn chế; nếu bộ đánh giá cho thấy gây hại ⇒ `templateVersion = 2` bỏ dòng "Kỹ năng" (hash đổi ⇒ tự tính lại, không migrate).
8. **Không đưa yếu tố nhạy cảm vào văn bản embed:** giới tính, ngày sinh, thành phố, số điện thoại, họ tên, **tên trường đại học**, tên công ty làm việc cũ. Có test khẳng định.
9. **Quyền riêng tư:** embedding chạy local, dữ liệu hồ sơ không rời máy chủ.
10. **Mount thứ tự:** `jobMatchingRouter` phải mount **sau** `skillsRouter` trong `main.ts` vì `skillEmbeddingService` được `skillsRouter` đăng ký vào container (cùng lý do đã ghi ở chú thích `main.ts` dòng 74–76).

## Thay đổi cơ sở dữ liệu

```prisma
model CandidateEmbedding {
  candidateId     String    @id
  candidate       Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  embedding       Unsupported("vector(384)")   // chỉ đọc/ghi qua $queryRaw/$executeRaw
  contentHash     String                        // sha256(templateVersion|modelId|text)
  model           String                        // config.EMBEDDING_MODEL_ID
  templateVersion Int
  embeddedAt      DateTime  @default(now())
  @@map("candidate_embeddings")
}

model JobPostEmbedding {   // cùng cấu trúc, khoá jobPostId → JobPost, @@map("job_post_embeddings")
}

model Candidate { /* ... */ matchEmbedding CandidateEmbedding? }
model JobPost   { /* ... */ matchEmbedding JobPostEmbedding? }
```

Migration: 2 `CREATE TABLE` + khoá ngoại `ON DELETE CASCADE`; `schema.prisma` chỉ thêm 2 quan hệ ngược ở hai model hiện có. Tên: `2026MMDDHHMMSS_job_matcher_phase2`. Cùng quy trình như GĐ1: viết tay → `migrate diff` → **dừng xin xác nhận** → áp Neon.

Cosine của một cặp:

```sql
SELECT 1 - (c.embedding <=> j.embedding) AS cosine
FROM candidate_embeddings c, job_post_embeddings j
WHERE c.candidate_id = $1 AND j.job_post_id = $2
```

## Dựng văn bản để embed

Model chỉ đọc ~**128 token** đầu (giới hạn của `paraphrase-multilingual-MiniLM-L12-v2` — **kiểm chứng bằng thực nghiệm ở bước 1**), phần dư bị bỏ. Vì vậy văn bản **ngắn, xếp theo độ quan trọng giảm dần** để nếu bị cắt thì cắt phần ít quan trọng nhất. Hai hàm thuần `buildCandidateMatchText(source)` và `buildJobMatchText(source)` trong `match-text.builder.ts`, `templateVersion = 1`:

```text
# Hồ sơ                                       # Tin
Chức danh: {headline}                          Vị trí: {title}
Ngành học: {ngành học gần nhất}; {degree}      Kỹ năng bắt buộc: {tên kỹ năng REQUIRED}
Kỹ năng: {≤15 tên, yearsOfExperience giảm dần} Kỹ năng ưu tiên: {tên kỹ năng PREFERRED}
Kinh nghiệm: {≤3 position gần nhất}            Yêu cầu: {requirements, cắt 400 ký tự}
Dự án: {≤2 tên dự án}                          Mô tả: {description, cắt 300 ký tự}
Giới thiệu: {bio, cắt 300 ký tự}
```

- Dòng nào không có dữ liệu thì **bỏ hẳn dòng** (không để "Chức danh: "); gom khoảng trắng; hoà cùng năm thì xếp kỹ năng theo tên để hash ổn định.
- "Học vấn gần nhất": theo `endYear` rồi `startYear` giảm dần; "≤3 position gần nhất": theo `startDate` giảm dần.
- Cần nguồn văn bản mà GĐ1 chưa nạp ⇒ loader GĐ2 nạp thêm khối `textSource` (headline, bio, degree + tên ngành học gần nhất, ≤3 position, ≤2 tên dự án; phía tin: title, requirements, description). Thêm khối này vào `CandidateMatchProfile`/`JobMatchProfile` **không đổi** phần GĐ1 dùng để chấm điểm.

## Chấm điểm: thành phần `semantic`

`ScoringJobMatcher` (GĐ1) thêm thành phần thứ 5. Áp dụng khi `input.semanticSimilarity ≠ null` **và** `weight.semantic > 0`; điểm thành phần:

```text
semanticScore = clamp( (cosine − lo) / (hi − lo), 0, 1 )
```

Vì cosine của model này với văn bản liên quan thường chỉ 0.3–0.7 — lấy thẳng `cosine × 100` thì cặp rất hợp cũng chỉ ~55%. `lo`/`hi` **không đoán** mà hiệu chỉnh trên tập dev: `lo` = trung vị cosine của cặp `POOR_MATCH`, `hi` = trung vị của cặp `GOOD_MATCH`. Giá trị tạm để chạy trước khi có nhãn: `lo = 0.20`, `hi = 0.70` (`SEMANTIC_CALIBRATION` trong `job-matching.config.ts`, kèm ghi chú "sẽ thay bằng số hiệu chỉnh"). `MatchResult.semantic = { enabled, available, similarity: cosine thô, normalized: semanticScore }` (`enabled` = `JOB_MATCHER_MODE=hybrid`, đã có sẵn trong kiểu từ GĐ1; `enabled && !available` là trường hợp model lỗi/vượt hạn mức embed); `notes` thêm một câu tiếng Việt khi có/không có điểm này.

Ba bảng trọng số (cùng chỗ với `RULE_WEIGHTS_V1`, cùng `ScoringJobMatcher`, không viết matcher mới):

| Cấu hình | requiredSkills | preferredSkills | experience | education | semantic |
|---|---|---|---|---|---|
| `RULE_WEIGHTS_V1` (GĐ1) | 0.60 | 0.15 | 0.25 | 0 | 0 |
| `EMBEDDING_ONLY_WEIGHTS_V1` | 0 | 0 | 0 | 0 | 1.0 |
| `HYBRID_WEIGHTS_V1` | 0.40 | 0.10 | 0.15 | 0.05 | 0.30 |

`education` chưa có nguồn ở GĐ2 nên luôn "không áp dụng" và bị chia lại (chỉ có ý nghĩa từ GĐ3). Ví dụ tính tay `hybrid-v1` (tin như ví dụ GĐ1, cosine 0.62, `lo=0.25`, `hi=0.75`): semantic = 0.74; `Σw = 0.80`; `(0.40×0.667 + 0.10×1 + 0.30×0.74)/0.80 = 0.736 → 74` — dùng làm test. `EMBEDDING_ONLY` khi cosine `null` ⇒ không thành phần nào áp dụng ⇒ `INSUFFICIENT_JOB_DATA` (script đánh giá phải loại/đánh dấu các cặp này, không tính là điểm 0).

## `MatchEmbeddingService` và luồng

```text
JobMatchingService (GĐ1) ──► MatchEmbeddingService.similarity(candidateProfile, jobProfile)   [chỉ khi JOB_MATCHER_MODE=hybrid]
   ├─ text  = buildCandidateMatchText / buildJobMatchText
   ├─ hash  = sha256(templateVersion | modelId | text)
   ├─ SELECT content_hash FROM candidate_embeddings WHERE candidate_id = ?
   │     ├─ khớp ─────────────► dùng vector đã lưu
   │     └─ khác/chưa có ─► EmbeddingProvider.embed(text)
   │             ├─ null ─────► trả null (đi tiếp bằng rule-v1)
   │             └─ vector ───► UPSERT (raw SQL, literal '[..]'::vector)
   ├─ (tương tự cho job_post_embeddings)
   └─ SELECT cosine (SQL ở trên)  →  number | null
```

- `toVectorLiteral` trong `skill-embedding.service.ts` là hàm module-private ⇒ **không** export/sửa module `skills`, viết lại hàm một dòng cục bộ.
- Hai request đồng thời cho cùng ứng viên có thể embed hai lần; UPSERT idempotent nên chấp nhận, **không thêm khoá**.
- Danh sách đơn Employer: gom vector đã có bằng 1 truy vấn, chỉ embed phần còn thiếu, tối đa `MAX_NEW_EMBEDDINGS_PER_REQUEST` (quyết định #6). `ApplicationMatchSummary` thêm `semanticStatus: "OFF" | "AVAILABLE" | "PENDING"` (`OFF` = `JOB_MATCHER_MODE=rule`; `PENDING` = đang bật nhưng chưa có cosine do model lỗi hoặc vượt hạn mức) để FE dán nhãn — dùng enum thay boolean để `rule` không bị hiểu nhầm là "chưa tính được".
- **Khởi động:** `SkillEmbeddingService` nạp model lười ở lần `embed` đầu ⇒ request đầu chậm. Nếu số đo ở bước 1 cho thấy đáng kể: gọi `embed("khởi động")` **không chặn** một lần sau khi server listen (warm-up). Cân nhắc sau khi đo, không làm trước.

Cấu hình môi trường mới (thêm vào zod schema `shared/config/env.ts`; dùng `z.enum`, **không** `z.coerce.boolean` — đã có ghi chú về lỗi này ở PROJECT_STATUS Phase 4):

| Biến | Giá trị | Ý nghĩa |
|---|---|---|
| `JOB_MATCHER_MODE` | `rule` (mặc định) \| `hybrid` | Cấu hình service dùng. Script đánh giá tự tạo cả 3, không phụ thuộc biến này |
| `MATCH_EMBEDDING_TEMPLATE_VERSION` | số nguyên ≥ 1 (mặc định 1) | Đổi để buộc tính lại vector khi đổi mẫu văn bản |

Tái dùng `EMBEDDING_MODEL_ID`, `EMBEDDING_MODEL_CACHE_DIR`. Không thêm dependency.

## Bộ đánh giá

**Vị trí:** script `apps/server/scripts/seed-match-demo.ts`, `apps/server/scripts/eval-job-matching.ts`; hàm chỉ số thuần ở `apps/server/scripts/lib/eval-metrics.ts` (có test); **sản phẩm nghiên cứu** đặt trong thư mục tài liệu để commit có chủ đích: `docs/06-backend/job-matcher-phase2/eval/labels.json` và `eval-results.md`.

**Dữ liệu:**

- `seed-match-demo.ts` idempotent, đọc fixture JSON (`apps/server/scripts/data/match-demo.json`): ~15–20 ứng viên (email `<ref>@match-demo.local`) + ~8–10 tin (backend, frontend, marketing, kinh tế…) trong một Company demo; kỹ năng lấy từ catalog `APPROVED` thật; cờ `--reset` xoá toàn bộ dữ liệu demo (theo đuôi email/Company demo) — **không** đụng dữ liệu thật. Ràng buộc bắt buộc của `User`/`Company`/`JobPost` kiểm tra lúc viết code.
- Fixture phải có vài ca **khó có chủ đích**: ứng viên toàn `WorkExperience` không liên quan nhưng đủ năm (kiểm chứng hạn chế D2), tin tiếng Việt viết tắt/không chuẩn, ứng viên gần lĩnh vực (CNTT ↔ Khoa học máy tính), skill trùng nghĩa khác `skillId`.
- `labels.json`: `pairs[] = { id, candidateRef, jobRef, label: GOOD_MATCH(2) | PARTIAL_MATCH(1) | POOR_MATCH(0), split: "dev" | "test", labeledBy[], note }`; `jobRef` = tiêu đề tin demo (duy nhất). **Chia dev/test cố định trong file (~60/40), không random lúc chạy.** Dev để hiệu chỉnh `lo/hi`, ngưỡng GOOD/PARTIAL và thử lưới trọng số; **test chỉ để báo cáo** — tránh chỉnh tham số trên chính dữ liệu dùng để khoe kết quả.

**Luồng script:** với mỗi cặp dựng `MatchInput` bằng **đúng loader và `MatchEmbeddingService` của service thật**, chạy 3 `ScoringJobMatcher` (RULE / EMBEDDING_ONLY / HYBRID) → tập dev: hiệu chỉnh `lo/hi` (trung vị POOR/GOOD) và 2 ngưỡng; lưới `semantic ∈ {0.2, 0.3, 0.4}` chỉ trên dev → tập test: tính chỉ số → ghi `eval-results.md` (bảng + danh sách cặp sai để phân tích lỗi + số Cohen's κ nếu có 2 người gán).

| Chỉ số | Định nghĩa |
|---|---|
| Spearman ρ | Tương quan thứ hạng giữa điểm và nhãn (0/1/2), xử lý hạng đồng |
| Accuracy 3 lớp | Đổi điểm → nhãn bằng 2 ngưỡng (khởi đầu ≥70 GOOD, 40–69 PARTIAL, <40 POOR; chỉnh trên dev) rồi so nhãn tay |
| NDCG@3 theo tin | Với mỗi tin có ≥3 ứng viên gán nhãn: xếp theo điểm, độ lợi = giá trị nhãn; lấy trung bình — chất lượng **xếp hạng**, nền cho A3 |
| False positive / False negative | POOR nhưng điểm ≥ ngưỡng GOOD / GOOD nhưng điểm < ngưỡng PARTIAL |

Cỡ mẫu 30–50 cặp là **nhỏ**: kết quả chỉ mang tính chỉ báo, không đủ kết luận có ý nghĩa thống kê — `eval-results.md` và báo cáo phải nói rõ. **Quy tắc quyết định mặc định (chốt trước khi có số):** chỉ đổi `JOB_MATCHER_MODE` mặc định sang `hybrid` nếu, **trên tập dev**, HYBRID ≥ RULE ở cả Spearman ρ lẫn NDCG@3 và không tăng false positive; nếu không, giữ `rule`, vẫn giữ code hybrid. Tập test chỉ để báo cáo, không dùng để chọn.

## Cấu trúc file mới / thay đổi

```text
apps/server/src/
├─ shared/ports/EmbeddingProvider.ts                      MỚI
├─ infrastructure/skill-embedding-provider.ts             MỚI (bọc SkillEmbeddingService)
├─ shared/config/env.ts                                   + JOB_MATCHER_MODE, MATCH_EMBEDDING_TEMPLATE_VERSION
└─ modules/job-matching/
    ├─ match-text.builder.ts                              MỚI (2 hàm thuần)
    ├─ match-embedding.service.ts                         MỚI
    ├─ job-matching.config.ts                             + 2 bảng trọng số, SEMANTIC_CALIBRATION, MAX_NEW_EMBEDDINGS_PER_REQUEST
    ├─ scoring-job-matcher.ts                             + thành phần semantic
    ├─ candidate-match-profile.loader.ts / job-match-profile.loader.ts   + khối textSource
    └─ job-matching.service.ts                            chọn matcher theo quyết định #5, gọi MatchEmbeddingService
prisma/schema.prisma + migration                          2 bảng
packages/shared-types                                     ApplicationMatchSummary.semanticStatus; MatchResult.semantic đã có từ GĐ1
apps/server/scripts/{seed-match-demo,eval-job-matching}.ts, scripts/lib/eval-metrics.ts, scripts/data/match-demo.json
apps/server/tests/unit/{match-text-builder,scoring-job-matcher(bổ sung),eval-metrics}.test.ts
docs/06-backend/job-matcher-phase2/eval/{labels.json,eval-results.md}
```

Không sửa `skills`, `applications`, `candidates`.

## Các bước thực hiện

1. **Đo thực tế (script tạm trong scratchpad, không commit).** (a) Thời gian nạp model lần đầu và thời gian `embed` một văn bản khi đã nóng; (b) xác nhận giới hạn ~128 token: embed đoạn dài rồi đoạn bị cắt, so cosine; (c) chốt `MAX_NEW_EMBEDDINGS_PER_REQUEST` và quyết định có cần warm-up. Ghi số đo vào "Ghi chú triển khai" của file này. *Kết quả đo có thể đổi mẫu văn bản — nên làm trước mọi việc khác.*
2. **Migration 2 bảng** — viết tay, `migrate diff`, **dừng xin xác nhận** → áp Neon. Port + adapter + `MatchEmbeddingService` + `match-text.builder` + test đơn vị.
3. **Mở rộng `ScoringJobMatcher`** (thành phần `semantic`, chuẩn hoá `lo/hi`, 2 bảng trọng số) + test đơn vị (ví dụ 74, clamp, `null` ⇒ không áp dụng, `EMBEDDING_ONLY` + `null` ⇒ `INSUFFICIENT_JOB_DATA`).
4. **Tích hợp `JobMatchingService`** sau cờ `JOB_MATCHER_MODE` (mặc định `rule` ⇒ hành vi GĐ1 không đổi); mount sau `skillsRouter`. *Test:* `rule` ⇒ response y hệt GĐ1; `hybrid` ⇒ có `semantic.available`, `weightsVersion = "hybrid-v1"`; tắt model (ép `embed` trả `null`) ⇒ rơi về `rule-v1` không lỗi; sửa headline ⇒ hash đổi ⇒ vector mới; sửa số điện thoại ⇒ không embed lại; xoá Candidate/tin ⇒ dòng embedding bị cascade.
5. **Dữ liệu và nhãn:** *(lúc này mới chuẩn bị)* xuất tên kỹ năng `APPROVED`, soạn prompt sinh dữ liệu tổng hợp có ràng buộc, chủ dự án map + kiểm; seed demo; chủ dự án (và người thứ hai) gán nhãn 30–50 cặp — **đây là việc tốn công nhất, không tự động hoá được**.
6. **Script đánh giá + hiệu chỉnh:** `eval-job-matching.ts`, test `eval-metrics`, sinh `eval-results.md`, chốt `lo/hi`, trọng số, mặc định `JOB_MATCHER_MODE` theo quy tắc ở trên; cập nhật config, UI (FE plan), tài liệu.
7. `tsc` sạch, `node --import tsx --test tests/unit/*.test.ts` xanh; cập nhật "Ghi chú triển khai" + `PROJECT_STATUS.md`.

## Ngoài phạm vi GĐ2

- Bảng requirements có cấu trúc, `education` có nguồn, kinh nghiệm theo kỹ năng → GĐ3 (chưa có PLAN — dùng cấu hình cuối cùng của GĐ2 làm nền, nên viết sau khi có số liệu).
- Vector index (HNSW), tìm tin/ứng viên gần nhất (B2/A3).
- Embedding cho `Major`/`University`; so sánh nhiều model embedding; fine-tune.
- UI đánh giá (đánh giá chạy bằng script, không có màn hình).

## Rủi ro / hạn chế

- Chất lượng tiếng Việt của model nhỏ chưa được kiểm chứng — bộ đánh giá chính là câu trả lời, kể cả khi kết quả là "không tốt hơn rule".
- Văn bản bị cắt ~128 token làm mất thông tin ở cuối; cold start làm request đầu chậm; model tải lần đầu ~465MB.
- Bộ nhãn nhỏ và chủ quan; dữ liệu demo do LLM sinh có thể "sạch" hơn dữ liệu thật (nêu trong báo cáo).
- `hybrid` có thể làm điểm của cùng một ứng viên khác nhau giữa hai lần tải (khi model lỗi hoặc vượt hạn mức embed) — được nói rõ bằng `weightsVersion` + `semanticStatus`, không che bằng cách giả vờ.

## Ghi chú triển khai

*(điền khi làm: số đo bước 1, `lo/hi` cuối cùng, mọi điểm lệch so với kế hoạch)*

## Phần ghi chú của chủ dự án

*(để trống)*
