# Job Matcher — Giai đoạn 2: Embedding (semantic) + bộ đánh giá (Backend)

Tiếp nối `docs/06-backend/job-matcher-phase1/PLAN.md` — **GĐ1 phải xong trước** (GĐ2 dùng lại `importance`, `minExperienceYears`, `ScoringJobMatcher`, hai loader và ba route). Quyết định kiến trúc: `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-13. Bản nháp đầy đủ: `docs/temp/A2_JOB_MATCHER_3_PHASES.md` mục 5 — file này ghi cái sẽ làm, không chép lại lập luận.

**Trạng thái: đã lên kế hoạch (2026-09-20), CHƯA triển khai.** Migration phải viết tay, kiểm bằng `prisma migrate diff` và **dừng xin xác nhận** trước khi áp lên Neon.

GĐ2 có **hai mục tiêu song song**: (1) thêm thành phần `semantic` vào điểm; (2) tạo **bộ đánh giá** so sánh 3 cấu hình `RULE` / `EMBEDDING_ONLY` / `HYBRID` — đây là phần "nghiên cứu" của luận văn. Kết quả "embedding không tốt hơn rule" vẫn là kết quả hợp lệ; khi đó mặc định giữ `rule` và báo cáo trung thực.

## Quyết định đã chốt (chủ dự án duyệt Q1–Q8 ngày 2026-09-20)

Q6: bộ nhãn **30–50 cặp, 2 người gán độc lập** (tính Cohen's κ); nếu chỉ có 1 người thì nêu rõ hạn chế trong báo cáo. Dữ liệu demo tạo bằng LLM (ràng buộc chỉ dùng tên kỹ năng `APPROVED` trong catalog) rồi chủ dự án tự map + gán nhãn — **không làm crawler**, và chỉ chuẩn bị prompt khi tới bước 5 bên dưới. Các quyết định D1–D5 và `rule-v1` giữ nguyên từ GĐ1.

## Quyết định mới chốt khi lên kế hoạch

1. **Dùng chung một model embedding, không nạp lần hai.** `SkillEmbeddingService` giữ model (~0,8GB RAM khi chạy — số đo ở bước 1). Port `shared/ports/EmbeddingProvider.ts` `{ modelId: string; embed(text): Promise<number[] | null> }` + adapter mỏng `infrastructure/skill-embedding-provider.ts` **uỷ quyền cho `skillEmbeddingService.embed`** (đã trả vector 384 chiều đã chuẩn hoá, `null` khi model lỗi — khớp đúng chữ ký port). **Không sửa module `skills`**; `modelId` lấy từ `config.EMBEDDING_MODEL_ID`.
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
WHERE c."candidateId" = $1 AND j."jobPostId" = $2
```

## Dựng văn bản để embed

Model `paraphrase-multilingual-MiniLM-L12-v2` được huấn luyện với câu ≤ **128 token**, nhưng **bước 1 đo được là thư viện không cắt ở 128 mà ở 512 token** (xem "Ghi chú triển khai"): đuôi văn bản vẫn ảnh hưởng vector, chỉ chưa rõ chất lượng biểu diễn có giảm khi vượt 128. Vì vậy văn bản vẫn **ngắn (mục tiêu ≤ ~128 token), xếp theo độ quan trọng giảm dần** — để bám sát độ dài model đã học, và để nếu có lúc bị cắt (>512) thì cắt phần ít quan trọng nhất. Hai hàm thuần `buildCandidateMatchText(source)` và `buildJobMatchText(source)` trong `match-text.builder.ts`, `templateVersion = 1`:

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
   ├─ SELECT "contentHash" FROM candidate_embeddings WHERE "candidateId" = ?
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

**Hướng dẫn thao tác** (lệnh cần chạy để seed/gán nhãn/đánh giá — dành cho người mới trong nhóm): `eval/README.md`. Tiêu chí gán nhãn: `eval/labeling-guide.md`.

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
7. `tsc` sạch, `node --import tsx --test tests/unit/*.test.ts` xanh; cập nhật "Ghi chú triển khai" + `PROJECT_STATUS.md`. **Chuyển prompt sinh dữ liệu** `docs/temp/JOB_MATCHER_P2_SYNTHETIC_DATA_PROMPT.md` → `docs/06-backend/job-matcher-phase2/eval/synthetic-data-prompt.md` (chủ dự án chốt 2026-09-21: để đến bước này): đổi đoạn đầu từ "tài liệu tạm" sang mô tả vai trò (phương pháp sinh dữ liệu demo), thêm mục ghi model LLM đã dùng và các chỉnh sửa tay sau khi sinh (chỉ chủ dự án biết), rồi sửa mọi đường dẫn trỏ tới file cũ (mục "Ghi chú triển khai — Bước 5").

## Ngoài phạm vi GĐ2

- Bảng requirements có cấu trúc, `education` có nguồn, kinh nghiệm theo kỹ năng → GĐ3 (chưa có PLAN — dùng cấu hình cuối cùng của GĐ2 làm nền, nên viết sau khi có số liệu).
- Vector index (HNSW), tìm tin/ứng viên gần nhất (B2/A3).
- Embedding cho `Major`/`University`; so sánh nhiều model embedding; fine-tune.
- UI đánh giá (đánh giá chạy bằng script, không có màn hình).

## Rủi ro / hạn chế

- Chất lượng tiếng Việt của model nhỏ chưa được kiểm chứng — bộ đánh giá chính là câu trả lời, kể cả khi kết quả là "không tốt hơn rule".
- Văn bản vượt 128 token vẫn được đọc (cắt ở 512) nhưng ngoài độ dài model được huấn luyện — chất lượng chưa kiểm chứng, nên giữ mẫu ngắn; cold start ~3 giây ở request hybrid đầu tiên nếu model chưa nạp; model chiếm ~0,8–0,95GB RAM khi chạy (không phải 465MB — đó chỉ là kích thước file).
- Bộ nhãn nhỏ và chủ quan; dữ liệu demo do LLM sinh có thể "sạch" hơn dữ liệu thật (nêu trong báo cáo).
- `hybrid` có thể làm điểm của cùng một ứng viên khác nhau giữa hai lần tải (khi model lỗi hoặc vượt hạn mức embed) — được nói rõ bằng `weightsVersion` + `semanticStatus`, không che bằng cách giả vờ.

## Ghi chú triển khai

### Bước 1 — số đo (2026-09-21)

Script tạm ở scratchpad (không commit), mô phỏng đúng cách `SkillEmbeddingService` nạp model (`@huggingface/transformers` 4.2.0, `cacheDir` = ổ D, model đã có sẵn trong cache nên **không phải tải lại**). Máy: i5-11400H, 12 luồng, RAM 15,7GB, Node 24.

| Mục | Kết quả |
|---|---|
| Nạp lần đầu | import thư viện 1,3 s + `pipeline()` 1,6 s ≈ **3 s**; embed đầu tiên sau đó 42 ms |
| Embed nóng (mỗi lần 30 phép đo) | 9 token: median 5 ms · 89 token (tin mẫu v1): 18 ms · 109 token (hồ sơ mẫu v1): 21 ms, p95 28 ms |
| RAM | tiến trình 33MB → **811MB** sau khi nạp → ~940MB sau khi chạy (cộng thêm phần Express/Prisma) |
| Độ dài mẫu v1 (văn bản tiếng Việt điển hình) | hồ sơ 72–109 token, tin 59–89 token — đều dưới 128 |
| Ổn định | embed lại cùng văn bản cho cosine 1,000000 ⇒ cơ chế hash-cache hợp lý |

**Giới hạn token — khác giả định ban đầu.** Văn bản 650 token: vector của bản cắt 512 token trùng vector bản đầy đủ (cosine 1,000); cắt 256 → 0,80; cắt 128 → 0,49. Văn bản gồm 128 token đầu + đuôi khác chủ đề hoàn toàn cho cosine 0,90 với bản gốc và chỉ 0,35 với riêng 128 token đầu. Kết luận: thư viện cắt ở **512** (`model_max_length` trong `tokenizer_config.json`), **không** cắt ở 128 — đuôi văn bản có ảnh hưởng thật. Điều đo *chưa* trả lời được: chất lượng biểu diễn có kém đi khi vượt 128 token hay không (model được huấn luyện ở 128) — nếu cần, đưa vào bộ đánh giá ở bước 6 như một biến thể mẫu. Mẫu v1 giữ nguyên (đã ngắn, xếp theo độ quan trọng); chỉ sửa câu chữ giả định ở mục "Dựng văn bản để embed" và "Rủi ro".

**Cosine hồ sơ × tin trên mẫu v1** (2 hồ sơ, 4 tin tự viết — chỉ để biết cỡ số, **không** dùng hiệu chỉnh):

| | Tin FE | Tin BE | Tin Kế toán | Tin Marketing |
|---|---|---|---|---|
| Hồ sơ FE | 0,810 | 0,598 | 0,455 | 0,533 |
| Hồ sơ Kế toán | 0,304 | 0,267 | 0,810 | 0,347 |

Cặp đúng lĩnh vực ≈ 0,81; cặp liên quan một phần (FE–BE) ≈ 0,60; cặp lạc lĩnh vực 0,27–0,53. Sàn của hồ sơ FE cao hơn hồ sơ Kế toán (0,46–0,53 so với 0,27–0,35), nhiều khả năng do từ khoá chung ("Sinh viên", "Thực tập", "Kỹ năng", "CNTT"). Với `lo = 0,20`, `hi = 0,70` tạm, cặp FE–Kế toán vẫn ra `semantic ≈ 51%` — có vẻ **sàn tạm quá thấp**; giá trị thật do tập dev quyết ở bước 6. Riêng mẫu v1 có thể đáng thử biến thể bỏ nhãn dòng ("Kỹ năng:", "Yêu cầu:") để giảm phần cosine "nền" — cũng để bước 6.

**Quyết định từ số đo:**
- `MAX_NEW_EMBEDDINGS_PER_REQUEST = 30` (tạm): 30 vector × ~20 ms ≈ 0,6 s tính toán. Phần **chưa đo** là ghi vector lên Neon (mỗi truy vấn ~100–150 ms) — vì vậy ghi bằng **một câu lệnh nhiều dòng**, không ghi từng vector; đo lại ở bước 4 rồi chốt.
- **Chưa cần warm-up.** 3 s chỉ xảy ra một lần và chỉ ở request hybrid đầu tiên nếu model chưa nạp (thường model đã nạp sẵn khi module `skills` dùng trước). Xem lại nếu `hybrid` thành mặc định.

### Điểm lệch so với kế hoạch
- Giả định "model cắt ở 128 token" sai (thực tế 512) — đã sửa hai chỗ trong tài liệu, mẫu v1 không đổi.
- Con số RAM "~465MB" là kích thước file model; RAM thực tế ~0,8–0,95GB.

### Bước 2 — đã viết code; migration đã áp lên Neon (2026-09-21)

Đã có: 2 model + 2 quan hệ ngược trong `schema.prisma`; migration `20260921120000_add_match_embeddings` (viết tay, khớp từng dòng với `migrate diff` DB → schema, diff chỉ ra đúng 2 bảng); `EmbeddingProvider` + `SkillEmbeddingProvider`; `MATCH_EMBEDDING_TEMPLATE_VERSION` trong `env.ts` và `.env.example`; `match-text.builder.ts`; `match-embedding.repository.ts` (raw SQL) + `match-embedding.service.ts`. **Chưa nối vào `JobMatchingService`/`jobMatchingRouter`** — việc của bước 4. Test: 15 (builder) + 13 (service, dùng repository/provider giả) — toàn bộ 64/64 xanh, `tsc` sạch.

Kiểm SQL trên Neon thật, **trong một transaction đã rollback** (tạo 2 bảng bằng đúng file migration, chạy service với model thật, rồi rollback — sau đó `to_regclass` = null, DB không đổi): upsert / `ON CONFLICT` cập nhật / đọc hash / cosine nhiều hồ sơ một truy vấn đều chạy đúng; vector 384 chiều; lần gọi thứ hai không embed lại (0 lần); sửa văn bản ⇒ embed lại đúng 1 lần; khoá ngoại chặn id không tồn tại; danh sách 5 hồ sơ (4 vector mới) mất 463 ms gồm cả ghi lên Neon bằng một câu lệnh — số này làm cơ sở giữ `MAX_NEW_EMBEDDINGS_PER_REQUEST = 30` (sẽ đo lại ở bước 4 với dữ liệu nhiều hơn; DB hiện chỉ có 1 hồ sơ thật).

**Điểm lệch so với kế hoạch:**
- Tên cột trong DB là camelCase có ngoặc kép (`"candidateId"`, `"contentHash"`) như mọi bảng khác của repo — SQL mẫu ở trên đã sửa; không dùng snake_case.
- `MatchEmbeddingService` tách repository raw SQL ra riêng (`MatchEmbeddingRepository`) để test logic hash/ngân sách bằng repository giả, không cần DB. API: `similarity(candidate, job)` và `similarityForCandidates(job, candidates, maxNew)`; đầu vào là `{ id, text }` — **văn bản do loader/`JobMatchingService` dựng bằng builder ở bước 4**, service không biết Prisma model của hồ sơ.
- Kiểu nguồn của builder có thêm `isCurrent` (học vấn) và `startDate` (dự án) so với mô tả ban đầu: "đang học" là bản ghi mới nhất dù `endYear` rỗng; dự án chọn theo `startDate` giảm dần để kết quả không phụ thuộc thứ tự DB trả về (thứ tự dao động sẽ làm hash đổi vô cớ).
- Văn bản được chuẩn hoá NFC trước khi băm/cắt (cùng một chữ tiếng Việt dạng dựng sẵn hay tổ hợp phải ra cùng hash) và cắt theo ký tự Unicode, không theo đơn vị UTF-16.
- Mọi lỗi (model, DB, sai số chiều vector) trong service đều bị bắt, ghi log, trả `null` ⇒ rơi về `rule-v1` (quyết định #5), không làm hỏng request. Model lỗi ⇒ dừng embed ở lần thất bại đầu tiên (các hồ sơ còn lại chắc chắn cũng null, lần tải sau tự thử lại).

### Bước 3 + 4 — chấm điểm semantic và tích hợp service (2026-09-21, làm gộp)

Migration `20260921120000_add_match_embeddings` đã áp (`migrate status`: up to date; `migrate diff` DB → schema rỗng).

**Bước 3:** `job-matching.config.ts` có thêm `EMBEDDING_ONLY_WEIGHTS_V1` (`embedding-only-v1`), `HYBRID_WEIGHTS_V1` (`hybrid-v1`), `SEMANTIC_CALIBRATION = { lo: 0.20, hi: 0.70 }` (tạm), `MAX_NEW_EMBEDDINGS_PER_REQUEST = 30`. `ScoringJobMatcher(weights, calibration = SEMANTIC_CALIBRATION)` — tham số thứ hai để test và script đánh giá dùng `lo/hi` khác; `hi ≤ lo` bị từ chối ngay khi khởi tạo. Test S1–S10 (ví dụ 74, kẹp 0..1, `null` ⇒ không áp dụng, `EMBEDDING_ONLY` + `null` ⇒ `INSUFFICIENT_JOB_DATA`, rule bỏ qua cosine…).

**Bước 4:** `JOB_MATCHER_MODE` (`z.enum`, mặc định `rule`) trong `env.ts` + `.env.example`. Router đăng ký `ruleJobMatcher`, `hybridJobMatcher`, `embeddingProvider`, `matchEmbeddingRepository`, `matchEmbeddingService` (thay cho `jobMatcher` của GĐ1). `JobMatchingService`: `rule` ⇒ không chạm model/bảng embedding; `hybrid` ⇒ có cosine thì `hybrid-v1`, không có thì `rule-v1` + `markSemanticPending` (`semantic.enabled = true, available = false` + một câu trong `notes`). Danh sách đơn: một lượt `similarityForCandidates` với hạn mức 30; `semanticStatus` = `OFF` / `AVAILABLE` / `PENDING`. Test service bằng bản giả (6 test); toàn bộ 80/80 xanh, `tsc` sạch.

**Kiểm trên Neon thật** (script tạm, trong transaction đã rollback — sau đó 0 dòng embedding, số Candidate không đổi), 1 hồ sơ thật × 1 tin thật:

| Kiểm | Kết quả |
|---|---|
| `rule` | `rule-v1`, 100, `semantic` tắt, 0 dòng embedding, 0 lần embed; danh sách `OFF` |
| `hybrid` lần đầu | `hybrid-v1`, 75 (cosine 0,405 ⇒ semantic 0,41), 2 lần embed, 1+1 dòng; 1,4 s |
| `hybrid` lần hai | cùng điểm, 0 lần embed; ~1,0 s (qua transaction, mọi truy vấn nối tiếp) |
| Sửa headline | embed lại đúng 1 lần, hash đổi |
| Sửa số điện thoại | 0 lần embed |
| Danh sách đơn `hybrid` | `AVAILABLE` |
| 30 hồ sơ mới một lượt | 1,05 s gồm 30 lần embed + 1 lệnh ghi; tải lại 0,37 s, 0 lần embed ⇒ **giữ `MAX_NEW_EMBEDDINGS_PER_REQUEST = 30`** |
| Xoá Candidate | dòng `candidate_embeddings` bị cascade (khoá ngoại cả hai bảng `confdeltype = c`) |

Ghi nhận: cùng cặp đó `rule-v1` = 100 nhưng `hybrid-v1` = 75, vì cosine 0,405 với `lo/hi` tạm chỉ ra semantic 0,41 — đúng loại lệch mà bước 6 phải hiệu chỉnh, chưa phải kết luận. Chi phí thêm của `hybrid` khi vector đã có là 3 truy vấn (2 lần đọc hash + 1 cosine) ≈ 0,3–0,45 s trên Neon; chấp nhận ở GĐ2, gộp truy vấn nếu `hybrid` thành mặc định.

**Điểm lệch so với kế hoạch:**
- Thay vì khối `textSource`, profile mang luôn `matchText: string` (loader gọi builder). Port không phải biết kiểu nguồn của builder; loader liệt kê từng trường đưa sang builder, không truyền nguyên bản ghi `Candidate` (có SĐT, ngày sinh). Script đánh giá dùng cùng loader nên cùng văn bản.
- `ApplicationMatchSummary.semanticStatus` đã có trong shared-types từ GĐ1 ⇒ **không** sửa `packages/shared-types`, không sửa web.
- Hồ sơ chưa có kỹ năng không được gửi đi embed (luôn `INSUFFICIENT_PROFILE`, không tốn hạn mức); ở chế độ `hybrid` đơn đó mang `semanticStatus = PENDING`.
- `rule-v1` bỏ qua `semanticSimilarity` hoàn toàn (kể cả khi được truyền vào) ⇒ response chế độ `rule` y hệt GĐ1.
- `EMBEDDING_ONLY` + cosine `null` có câu `notes` riêng ("chưa tính được mức tương đồng nội dung…") thay vì câu "tin chưa có kỹ năng…".

### Bước 5 — công cụ dữ liệu và nhãn (2026-09-21); dữ liệu và nhãn thật do chủ dự án làm

**Đã có:** prompt sinh dữ liệu `eval/synthetic-data-prompt.md` (kèm cách dùng; chuyển từ `docs/temp/` ở bước 7 — xem "Bước 7" dưới đây); `apps/server/scripts/seed-match-demo.ts` (`npm run seed-match-demo`, cờ `--check` chỉ đọc DB / mặc định seed idempotent / `--label-sheet` / `--reset`); bộ kiểm fixture thuần `scripts/lib/match-demo-fixture.ts` + 13 test (toàn bộ 93/93 xanh, `tsc` sạch). **Chưa có** (việc của chủ dự án): `scripts/data/match-demo.json` (kết quả của prompt) và `eval/labels.json` đã gán nhãn.

**Số đo catalog trên Neon (2026-09-21):** chỉ 21 kỹ năng `APPROVED`, gần như toàn CNTT — không đủ để dựng tin marketing/kế toán như kế hoạch. Chủ dự án chọn **bổ sung kỹ năng demo**: fixture khai `extraSkills` (30–40 mục); seed tạo chúng ở trạng thái `APPROVED` với `createdByUserId` = employer demo; `--reset` chỉ xoá kỹ năng mang dấu đó **và** không còn hồ sơ/tin nào (kể cả dữ liệu thật) dùng. Kỹ năng mới không có vector `embedding` (chỉ pipeline dedupe kỹ năng dùng cột đó). Ngành học chỉ lấy từ catalog Major (1.081 mục) bằng tên chính xác — prompt liệt kê 25 tên.

**Điểm lệch so với kế hoạch:**
- **Chia dev/test theo tin, không theo cặp:** `job.split` trong fixture; mọi cặp của một tin cùng tập. Lý do: NDCG@3 theo tin cần ≥ 3 ứng viên có nhãn *trong cùng tập* — chia ~60/40 theo cặp trên ~40 cặp sẽ để mỗi tin chỉ còn ~2 cặp ở tập test. Bộ kiểm buộc mỗi tập ≥ 2 tin, mỗi tin ≥ 4 cặp.
- **`labels.json` dùng `ratings { rater1, rater2 }` (nhãn độc lập, để tính κ) + `label` (nhãn cuối sau khi thống nhất)** thay cho `labeledBy[]`: một trường `label` duy nhất không đủ để tính κ. Thêm `category` (kiểu cặp lúc thiết kế fixture) để phân tích lỗi; nhãn dùng chuỗi `GOOD_MATCH`/`PARTIAL_MATCH`/`POOR_MATCH`.
- **Số cặp cần gán nhãn nâng từ 30–50 lên 30–80** (chủ dự án duyệt 2026-09-21; fixture thực tế sinh ra 62 cặp): cỡ mẫu lớn hơn làm Spearman/NDCG/κ ít dao động hơn, nhất là ở tập test (~40%). Ngưỡng 80 chỉ là chốt chặn trong bộ kiểm, không phải giới hạn kỹ thuật; đổi ở `LIMITS.pairs` trong `scripts/lib/match-demo-fixture.ts`. Hạn chế "cỡ mẫu nhỏ, chỉ mang tính chỉ báo" ở mục "Bộ đánh giá" vẫn giữ. Prompt vẫn xin 36–48 cặp; phần thêm do chủ dự án bổ sung tay.
- Danh sách cặp cần gán nhãn (`pairsToLabel`) do fixture đề xuất (không kèm nhãn) để đảm bảo phủ ca khó; **LLM không gán nhãn** — nhãn phải do người gán, kẻo bộ đánh giá đo "LLM đồng ý với LLM".
- Ca khó là danh sách đóng (`hardCase`): 4 kiểu bắt buộc theo PLAN (`irrelevant-experience`, `abbreviated-jd`, `adjacent-field`, `synonym-skill`) + 3 gợi ý (`keyword-stuffing`, `sparse-profile`, `career-switch`).
- Tài khoản demo (`<ref>@match-demo.local`, employer `employer@match-demo.local`) không có mật khẩu/Google ⇒ **không đăng nhập được**; đủ cho script đánh giá (đi thẳng loader). Muốn xem trên giao diện thì cần thêm bước riêng.
- `--label-sheet` không bao giờ ghi đè `labels.json` đã có.
- Tiêu chí gán nhãn và cách điền `labels.json` nằm ở `eval/labeling-guide.md` (câu hỏi "có mời phỏng vấn không?", nhãn là chuỗi `GOOD_MATCH`/`PARTIAL_MATCH`/`POOR_MATCH`, phán đoán tổng thể chứ không đếm kỹ năng). Quy tắc dùng nhãn ở bước 6: `label` nếu có → nhãn chung khi hai người giống nhau → nhãn `rater1` (tạm) khi chưa có `rater2` → cặp bất đồng chưa có `label` bị loại và liệt kê.

**Kiểm trên Neon thật** (fixture thử 12 hồ sơ × 6 tin × 30 cặp, sau đó `--reset`): `--check` chỉ đọc; seed → 12 hồ sơ, 6 tin, +1 kỹ năng; seed lần hai không tạo thêm gì; `JobMatchingService` chế độ `hybrid` chấm được một cặp demo (`hybrid-v1`, cosine 0,763 — cặp giả đồng nhất nên không có ý nghĩa đo); `--label-sheet` tạo 30 dòng và từ chối lần hai; `--reset` đưa mọi số đếm về đúng như trước (4 user, 1 hồ sơ, 6 tin, 21 kỹ năng, 2 công ty, 0 vector), chạy lần hai an toàn. Lần kiểm bắt được một lỗi thật: lọc `NOT (createdByUserId = x)` loại nhầm cả kỹ năng gốc (cột NULL) khiến lần seed thứ hai báo thiếu "React" — đã sửa bằng `OR [null, ≠ x]`.

### Bước 6 — script đánh giá (2026-09-22, cập nhật với nhãn cuối 2026-09-22)

**Đã có:** `apps/server/scripts/eval-job-matching.ts` (`npm run eval-job-matching`) + hàm thuần `scripts/lib/eval-metrics.ts` + 10 test (toàn bộ 104/104 xanh, `tsc` sạch). Script ghi `eval/eval-results.md` (sinh tự động, không sửa tay). Đã chạy một lượt tạm trên nhãn `rater1`, sau đó chạy lại với nhãn cuối cùng (`rater1` + `rater2` + `label` cho 25 cặp bất đồng, 64/64 cặp) — kết quả ở mục "Kết quả cuối" dưới đây không còn tạm nữa.

**Cách script làm:** đọc `labels.json` (sai giá trị thì chỉ đích danh id cặp) → chọn nhãn theo quy tắc ở `eval/labeling-guide.md` → dựng hồ sơ/tin bằng đúng hai loader và cosine bằng `MatchEmbeddingService.similarityForCandidates` (không giới hạn số vector mới; vector được lưu vào bảng embedding như lúc chạy thật, `--reset` của seed xoá theo cascade) → hiệu chỉnh `lo/hi` = trung vị cosine POOR/GOOD của dev → chấm RULE, EMBEDDING_ONLY, hybrid-v1 (lo/hi tạm) và lưới semantic {0,2; 0,3; 0,4} (lo/hi hiệu chỉnh) → chọn trọng số trên dev → áp quy tắc quyết định trên dev → báo cáo dev và test.

**Điểm lệch / chi tiết so với kế hoạch:**
- Lưới semantic chia phần còn lại theo đúng tỉ lệ của hybrid-v1 (0,4 : 0,1 : 0,15 : 0,05); chọn theo ρ, rồi NDCG@3, rồi ít FP.
- Hai loại ngưỡng: **mặc định 70/40** dùng cho FP/FN và quy tắc quyết định (chốt trước, không dịch theo dữ liệu); ngưỡng hiệu chỉnh trên dev (bội số của 5, tối đa accuracy, hoà thì gần 70/40 nhất) chỉ để báo thêm cột accuracy.
- NDCG@3 xử lý điểm hoà bằng độ lợi trung bình của nhóm hoà (McSherry & Najork 2008), để kết quả không phụ thuộc thứ tự DB trả về — quan trọng với rule, nhiều cặp cùng điểm 0. Tin toàn POOR (IDCG = 0) bị bỏ khỏi trung bình.
- Cặp không chấm được ở bất kỳ cấu hình nào (thiếu cosine hoặc `INSUFFICIENT_*`) bị loại khỏi **mọi** cấu hình để so trên cùng một tập.
- κ là Cohen's κ không trọng số trên các cặp có đủ hai người.

**Kết quả cuối (nhãn đầy đủ hai người, 64/64 cặp, 25 cặp bất đồng đã có `label` chốt):**

- Cohen's κ = **0,387**, trùng khớp thô 61% — mức "yếu" theo thang Landis & Koch (0,21–0,40; ngay dưới ngưỡng "vừa"). 25/64 cặp (39%) hai người ban đầu bất đồng — nêu rõ trong báo cáo là hạn chế của nhãn, không che giấu.
- `lo/hi` hiệu chỉnh trên dev: **0,4442 / 0,7277** (khác đáng kể so với giá trị tạm 0,20/0,70 — vì nhãn cuối khác nhãn `rater1` một mình, đặc biệt ở các cặp bất đồng).
- Lưới trọng số semantic: vẫn chọn **s = 0,4** (dev: ρ 0,789, NDCG@3 0,965 — cao nhất trong 3 mức của lưới).
- Bảng dev: RULE ρ=0,671 NDCG@3=0,904 FP=0 FN=1 · HYBRID (đã chọn) ρ=0,789 NDCG@3=0,965 FP=0 FN=0.
- Quy tắc quyết định: **ĐẠT** rõ ràng trên cả ba điều kiện (ρ, NDCG@3, FP) — không còn sát biên như lượt tạm.
- **Quyết định:** đổi `JOB_MATCHER_MODE` mặc định sang `hybrid`, cập nhật `SEMANTIC_CALIBRATION` = `{ lo: 0.4442, hi: 0.7277 }`, thêm `HYBRID_WEIGHTS_V2` (semantic 0,40; requiredSkills 0,3429; preferredSkills 0,0857; experience 0,1286; education 0,0429).

**Đã áp dụng vào code (2026-09-22):**
- `job-matching.config.ts`: `SEMANTIC_CALIBRATION` → `{0.4442, 0.7277}`; thêm `HYBRID_WEIGHTS_V2` (`HYBRID_WEIGHTS_V1` giữ lại làm mốc so sánh trong bộ đánh giá, service không dùng nữa).
- `job-matching.routes.ts`: `hybridJobMatcher` chuyển sang `HYBRID_WEIGHTS_V2`.
- `env.ts` + `.env` + `.env.example`: `JOB_MATCHER_MODE` mặc định/giá trị đang chạy → `hybrid` (trước đó `.env` ghi đè cứng `rule`, phải sửa cả hai chỗ mới có hiệu lực thật).
- `eval-job-matching.ts`: sửa lỗi tiêu đề `hybrid-v1` ghi cứng "lo/hi tạm 0,20/0,70" (giờ lấy đúng giá trị `SEMANTIC_CALIBRATION` hiện hành); thêm dòng "Trạng thái áp dụng" tự so config đang chạy với kết quả đề xuất.
- 104/104 test xanh, `tsc` sạch (cả `src` và `scripts`/`tests` với tsconfig tạm `noUncheckedIndexedAccess`).
- `eval-results.md` đã chạy lại lần cuối, xác nhận `✓ đã áp vào config`.

### Bước 7 — hoàn tất (2026-09-22)

- `tsc` sạch (`src` và `scripts`/`tests` qua tsconfig tạm), `node --import tsx --test tests/unit/*.test.ts` 104/104 xanh — không đổi gì thêm so với cuối bước 6.
- `PROJECT_STATUS.md` cập nhật: GĐ2 chuyển từ "đã lập kế hoạch" sang hoàn thành, tóm tắt kết quả cuối (κ, lo/hi, quyết định `hybrid`).
- **Chuyển prompt sinh dữ liệu:** `docs/temp/JOB_MATCHER_P2_SYNTHETIC_DATA_PROMPT.md` → `docs/06-backend/job-matcher-phase2/eval/synthetic-data-prompt.md`. Đoạn mở đầu đổi từ "tài liệu tạm" sang mô tả vai trò thật (phương pháp tái tạo dữ liệu demo, không phải nguồn sự thật — bộ kiểm `match-demo-fixture.ts` mới là nguồn sự thật). Thêm mục "Model LLM đã dùng và chỉnh sửa tay": **ChatGPT** (chạy trực tiếp, không qua API); sửa tay chỉ ở bước xử lý lỗi `--check` — dán các dòng lỗi cho ChatGPT, nó chỉ ra đoạn cần sửa (không in lại toàn bộ JSON để đỡ tốn token), chủ dự án tự sửa tay đúng đoạn đó rồi chạy lại `--check`; không có chỉnh sửa nội dung nào khác. Đường dẫn cũ trong `apps/server/scripts/seed-match-demo.ts` (dòng comment đầu file) đã sửa theo đường dẫn mới.
- `docs/temp/` bị `.gitignore` nên file cũ chưa từng được commit — việc "chuyển" chỉ là ghi file mới rồi xoá file tạm, không có thao tác git nào.

## Phần ghi chú của chủ dự án

*(để trống)*
