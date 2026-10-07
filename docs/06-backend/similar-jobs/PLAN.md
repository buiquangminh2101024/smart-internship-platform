# Việc làm tương tự (trang chi tiết tin) — Backend

Câu hỏi đã chốt S1–S5: `docs/temp/ADMIN_USERS_AND_SIMILAR_JOBS_DECISIONS.md` (Mục 2). Chủ dự án chấp nhận toàn bộ khuyến nghị ngày 2026-10-07. S6–S7 chốt thêm cùng ngày khi rà plan với code. Dùng lại hạ tầng Job Matcher GĐ2 (AD-13); **không có thay đổi kiến trúc, không migration, không dependency mới.**

Song song: `docs/05-frontend/phases/similar-jobs/PLAN.md`.

**Trạng thái: J1–J4 XONG (2026-10-07), ngưỡng cosine chốt 0,6.** Frontend chưa làm. Thứ tự ưu tiên: làm **sau** `docs/06-backend/admin-users-support/PLAN.md`; thiếu thời gian thì bỏ phần này trước (H1).

## Quyết định đã chốt

| # | Quyết định |
|---|---|
| S1 | Độ tương tự = cosine giữa vector tin (bảng `job_post_embeddings`). Mỗi thẻ kèm danh sách kỹ năng trùng với tin đang xem. |
| S2 | Endpoint công khai, khách chưa đăng nhập cũng xem được. |
| S3 | Chỉ tính vector cho **tin đang xem** nếu thiếu hoặc lỗi thời (một tin). Tin khác chưa có vector thì bỏ qua. |
| S4 | Tối đa 4 tin, cosine ≥ **0,6** (ban đầu 0,5, đổi sau J4, xem "Kết quả J4"). Không tin nào đạt thì trả mảng rỗng, frontend ẩn khối. |
| S5 | Chỉ tin `PUBLISHED` còn hạn (`expiresAt IS NULL OR expiresAt > now()`), bỏ tin đang xem, cho phép cùng công ty. |
| S6 | **Nhánh dự phòng theo kỹ năng trùng.** Dùng khi không có vector: `JOB_MATCHER_MODE=rule` (khi đó không gọi model, không đọc bảng embedding), model lỗi, hoặc tin đang xem không tính được vector. Lấy tin có **≥ 1 kỹ năng `APPROVED` trùng**, sắp theo số kỹ năng trùng giảm dần, hoà thì tin mới đăng trước, tối đa 4 tin. Không có ngưỡng nào khác. Khi nhánh vector **chạy được** mà không tin nào đạt cosine ≥ 0,5 thì vẫn trả `[]` (giữ S4), **không** chuyển sang nhánh kỹ năng. `similarity` của nhánh này là `null`. |
| S7 | Nhánh vector chỉ so các vector **cùng `model` và `templateVersion`** với vector của tin đang xem, để không so lẫn vector của mẫu văn bản cũ và mới. |

## Phần 1 — Công nghệ / kiến trúc sử dụng

- pgvector (toán tử `<=>`), `$queryRaw` giống `cosinesForJob`/`cosinesForCandidate`.
- Dùng lại: `JobMatchProfileLoader.load/loadMany` (có sẵn `matchText` và `skills[].skillId/name`), `MatchEmbeddingService` (tính vector lười theo `contentHash`), `JobRecommendationRepository.findPublicByIds` (trả `JobPostDto` công khai, giữ đúng thứ tự id).
- `JobMatchProfileLoader.load` **không** lấy `status`/`expiresAt`, nên việc kiểm tin đang xem còn công khai là một truy vấn riêng trong repository. Không sửa kiểu `JobMatchProfile`, vì kiểu này dùng chung với matcher.
- Đặt trong module `job-matching` (service mới `similar-jobs.service.ts`), vì toàn bộ nguyên liệu nằm ở đây.

## Phần 2 — Liên kết giữa các phần

```text
GET /job-posts/:id/similar  (công khai)
  └─ SimilarJobsService.listSimilar(jobPostId)
       ├─ JobRecommendationRepository.isPubliclyListed(id)       ─ không có / không PUBLISHED / hết hạn ⇒ []
       ├─ JobMatchProfileLoader.load(id)                         ─ null ⇒ []
       ├─ mode = hybrid và MatchEmbeddingService.ensureJobVector({id, text}) = true ?
       │    ├─ có  → MatchEmbeddingRepository.nearestJobs(id, 20)     ─ SQL KNN + lọc S5 + S7
       │    │         → lọc cosine ≥ 0,5, lấy 4                         ─ S4 (rỗng thì trả [], không dự phòng)
       │    └─ không → JobRecommendationRepository.findBySharedSkills(id, 4)  ─ S6, similarity = null
       ├─ JobMatchProfileLoader.loadMany(ids)                    ─ tính kỹ năng trùng (S1), dùng cho cả hai nhánh
       └─ JobRecommendationRepository.findPublicByIds(ids)       ─ dữ liệu thẻ tin
```

## Phần 3 — Các bước thực hiện

### J1 — Repository (~45 phút)

`match-embedding.repository.ts` thêm `nearestJobs(jobPostId, take)` (S5 + S7):

```sql
SELECT o."jobPostId" AS id, 1 - (o."embedding" <=> s."embedding") AS cosine
FROM job_post_embeddings s
JOIN job_post_embeddings o
  ON o."jobPostId" <> s."jobPostId"
 AND o."model" = s."model"
 AND o."templateVersion" = s."templateVersion"
JOIN job_posts p ON p."id" = o."jobPostId"
WHERE s."jobPostId" = ${jobPostId}
  AND p."status" = 'PUBLISHED'
  AND (p."expiresAt" IS NULL OR p."expiresAt" > now())
ORDER BY o."embedding" <=> s."embedding"
LIMIT ${take}
```

`job-recommendation.repository.ts` thêm:

- `isPubliclyListed(jobPostId): Promise<boolean>`. Dùng Prisma `count`, điều kiện `PUBLISHED` và còn hạn, giống S5.
- `findBySharedSkills(jobPostId, take): Promise<string[]>` cho nhánh dự phòng (S6):

```sql
SELECT o."jobPostId" AS id, COUNT(*)::int AS shared
FROM job_post_skills s
JOIN skills k ON k."id" = s."skillId" AND k."status" = 'APPROVED'
JOIN job_post_skills o ON o."skillId" = s."skillId" AND o."jobPostId" <> s."jobPostId"
JOIN job_posts p ON p."id" = o."jobPostId"
WHERE s."jobPostId" = ${jobPostId}
  AND p."status" = 'PUBLISHED'
  AND (p."expiresAt" IS NULL OR p."expiresAt" > now())
GROUP BY o."jobPostId", p."publishedAt"
ORDER BY shared DESC, p."publishedAt" DESC NULLS LAST
LIMIT ${take}
```

Khi code, kiểm lại tên cột thật trong `schema.prisma` (cột không `@map` thì giữ camelCase trong dấu ngoặc kép, như các truy vấn hiện có). Hiện có 17 tin, nên không cần index ANN.

### J2 — Service (~1 giờ)

- `match-embedding.service.ts` thêm method public `ensureJobVector(target): Promise<boolean>`. Hàm bọc `ensureVectors("job", [target], 1)`; lỗi thì log và trả `false`, giống quy ước "mọi lỗi thành null" của service này.
- `similar-jobs.service.ts`: `listSimilar(jobPostId): Promise<SimilarJobItem[]>`. Service nhận `config.JOB_MATCHER_MODE` giống `JobRecommendationService`. Chế độ `rule` thì đi thẳng nhánh kỹ năng, không gọi `ensureJobVector`.
- Kỹ năng trùng = giao theo `skillId` giữa tin đang xem và từng tin gợi ý, giữ thứ tự theo tin gợi ý, tối đa 3 tên. Dùng chung cho cả hai nhánh.
- Hằng số trong `job-matching.config.ts`: `SIMILAR_JOBS_LIMIT = 4`, `SIMILAR_JOBS_MIN_COSINE = 0.6` (plan ban đầu 0.5), `SIMILAR_JOBS_POOL = 20`.

### J3 — Route + kiểu dùng chung (~20 phút)

- `job-matching.routes.ts`: `router.get("/job-posts/:id/similar", ...)`, không guard. Đăng ký `similarJobsService` trong container của router. Đã kiểm: không trùng route nào của `job-posts.routes.ts`.
- `packages/shared-types`: `SimilarJobItem { jobPost: JobPostDto; similarity: number | null; sharedSkills: string[] }`. `similarity` là `null` ở nhánh kỹ năng (S6).
- Không tăng `viewCount`, không ghi `JobPostDailyStat` (chỉ `getPublicDetail` mới ghi).

### J4 — Kiểm tra (~30 phút)

- `npx tsc --noEmit` sạch.
- **Nhánh vector:** gọi endpoint cho vài tin trên Neon, xem cosine thực tế. Nếu ngưỡng 0,5 làm hầu hết tin ra rỗng hoặc ra quá nhiều tin không liên quan, **báo chủ dự án kèm số liệu** trước khi đổi ngưỡng. Không tự đổi.
- **Nhánh kỹ năng:** chạy server với `JOB_MATCHER_MODE=rule` (đặt biến môi trường lúc chạy, không sửa `.env`). Kiểm thứ tự theo số kỹ năng trùng, mọi `similarity` là `null`, và không có truy vấn nào tới bảng embedding.
- Tin không tồn tại / không công khai ⇒ trả `[]` (200), không 404, để khối giao diện chỉ việc ẩn đi.
- Tin không có kỹ năng `APPROVED` nào, ở nhánh kỹ năng ⇒ `[]`.

**Tổng ước lượng:** ~2,5 giờ.

## Rủi ro đã biết

- **Vector của tin khác có thể lỗi thời** (tin bị sửa sau lần tính gần nhất). Theo S3, không tính lại hàng loạt; vector cũ vẫn dùng được vì cùng model và cùng số chiều (S7 bảo đảm điều này). Lần xem chi tiết tin đó (hoặc lượt tính điểm ứng viên) sẽ tự cập nhật.
- **Tin mới đăng chưa có vector** sẽ không xuất hiện trong khối của tin khác cho tới khi có người mở tin đó. Chấp nhận được.
- **Sau khi đổi mẫu văn bản (`templateVersion`)**, theo S7 nhánh vector chỉ thấy các tin đã được tính lại vector theo mẫu mới. Khối có thể thưa đi một thời gian, rồi tự đầy lại khi các tin được mở xem.
- Lần mở đầu tiên của một tin chưa có vector chậm thêm thời gian embed một văn bản (model chạy CPU). Frontend tải khối này riêng, không chặn phần nội dung tin.
- Nhánh kỹ năng ưu tiên tin có nhiều kỹ năng trùng, nên có thể nghiêng về tin liệt kê nhiều kỹ năng. Chấp nhận được, vì đây chỉ là nhánh dự phòng.

## Kết quả J1–J4 (2026-10-07)

- `tsc --noEmit` của server sạch. Server không có cấu hình ESLint nên không chạy lint.
- `packages/shared-types` phải `npm run build --workspace @sip/shared-types` thì server mới thấy `SimilarJobItem`, vì `dist/` bị gitignore.
- Script kiểm tra tạm `.claude-workspace/verify-similar-jobs.ts` (không commit) chạy trên Neon, chỉ đọc. Phần embedding là stub ném lỗi nếu bị gọi. Kết quả: **tất cả đạt**.
  - **Chế độ `rule`, 10 tin công khai:**
    - `similarity` đều `null`; không trả chính tin đang xem; mỗi tin trùng ≥ 1 kỹ năng; sắp theo số kỹ năng trùng giảm dần; tối đa 4 tin / 3 kỹ năng.
    - Không gọi `ensureJobVector`/`nearestJobs`, tức không chạm model hay bảng embedding.
    - "Kế toán" không trùng kỹ năng với tin nào nên ra `[]`.
  - **Model lỗi** (`ensureJobVector` = `false`): kết quả giống hệt chế độ `rule`.
  - **Vector chạy được nhưng mọi cosine < 0,5:** trả `[]` và không gọi `findBySharedSkills` (S4).
  - **Tin không công khai:** id không tồn tại ⇒ `[]`; tin `CLOSED` ⇒ `[]`.
  - Không có tin công khai nào thiếu kỹ năng, nên chưa thử được ca này trên dữ liệu thật. Câu SQL dùng `JOIN` theo kỹ năng nên tin không có kỹ năng sẽ ra `[]`.
- **Lệch nhỏ so với plan:**
  - Tên kỹ năng trùng sắp theo **bắt buộc trước, rồi theo tên** (không theo "thứ tự của tin gợi ý"), vì Prisma không bảo đảm thứ tự của quan hệ lồng nhau.
  - Thêm hằng số `SIMILAR_JOBS_MAX_SHARED_SKILLS = 3`.

### Kết quả J4 — cosine thực tế (nhánh vector, 10 tin công khai)

Gọi `GET /api/job-posts/:id/similar` trên server dev, ngưỡng 0,5:

| Tin đang xem | Gợi ý (cosine) |
|---|---|
| Digital Marketing | Content Marketing 0,860 · Frontend Web 0,501 |
| Thiết kế UI | Frontend Product 0,773 · Frontend Web 0,531 |
| Kế toán | QA Automation 0,598 · Data & AI 0,549 · Frontend Product 0,528 |
| Content Marketing | Digital Marketing 0,860 |
| QA Automation | Data & AI 0,628 · Kế toán 0,598 · Frontend Product 0,522 · Java Backend 0,503 |
| Data & AI | QA Automation 0,628 · Kế toán 0,549 · Frontend Product 0,514 |
| Java Backend | Backend Node TypeScript 0,686 · Frontend Web 0,643 · Frontend Product 0,611 · QA Automation 0,503 |
| Backend Node TypeScript | Java Backend 0,686 · Frontend Web 0,663 · Frontend Product 0,571 |
| Frontend Product | Thiết kế UI 0,773 · Frontend Web 0,756 · Java Backend 0,611 · Backend Node TypeScript 0,571 |
| Frontend Web | Frontend Product 0,756 · Backend Node TypeScript 0,663 · Java Backend 0,643 · Thiết kế UI 0,531 |

**Nhận xét:**

- Ngưỡng 0,5 **lọt vài cặp không liên quan**, rõ nhất là "Kế toán" với QA Automation (0,598), Data & AI (0,549) và Frontend Product (0,528), và "Digital Marketing" với Frontend Web (0,501).
- Cosine giữa **hai tin** nhìn chung cao hơn cosine giữa hồ sơ và tin (mốc hiệu chỉnh GĐ2 là `lo` 0,444 / `hi` 0,728). Lý do có thể là mọi tin cùng khuôn văn bản ("Vị trí: Thực tập sinh…", "Kỹ năng bắt buộc: …").
- Các cặp hợp lý đều từ khoảng 0,6 trở lên. Ngưỡng **0,6** sẽ bỏ hết các cặp lạc ở trên: "Kế toán" ra `[]`, mỗi tin còn 1–3 gợi ý. Tuy vậy cặp lạc cao nhất (0,598) chỉ cách 0,6 một chút, và mẫu mới có 10 tin, nên căn cứ còn mỏng.

**Quyết định (chủ dự án, 2026-10-07): đổi ngưỡng sang 0,6.**
- Thêm tin không làm 0,6 thành "quá cao". Mức cosine chung phụ thuộc model và khuôn văn bản, không phụ thuộc số tin. Tin cùng ngành nhiều lên thì top 4 vẫn vượt ngưỡng. Ngưỡng chỉ có tác dụng với tin "lẻ loi", và ẩn khối tốt hơn gợi ý sai.
- **Đo lại bảng trên khi** số tin công khai vượt khoảng 50, hoặc khi đổi model / `templateVersion`. Nếu nhiều tin bị ẩn khối dù có tin cùng ngành (ví dụ tin mô tả tiếng Anh hoặc quá ngắn) thì cân nhắc hạ xuống khoảng 0,55.
- **Chạy lại sau khi đổi:**
  - "Kế toán" ra `[]`.
  - Digital Marketing, Content Marketing, Thiết kế UI, QA Automation, Data & AI mỗi tin còn 1 gợi ý.
  - Backend Node TypeScript còn 2 gợi ý.
  - Java Backend, Frontend Product, Frontend Web mỗi tin còn 3 gợi ý.
  - Không còn cặp lạc nào. `tsc` sạch.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*

## Lịch sử thay đổi

- **2026-10-07** — Rà plan với code trước khi làm. Chủ dự án chốt thêm:
  - **S6:** dự phòng bằng kỹ năng trùng, gồm cả chế độ `rule`; `similarity: number | null`; nhánh vector rỗng vẫn trả `[]`.
  - **S7:** lọc cùng `model` + `templateVersion`.

  Bổ sung theo code thật: `isPubliclyListed`, vì `load()` không có `status`/`expiresAt`. Ước lượng tăng từ ~2 giờ lên ~2,5 giờ.
- **2026-10-07** — Làm xong J1–J4. Sau khi đo cosine thực tế, chủ dự án đổi ngưỡng S4 từ 0,5 sang 0,6.
