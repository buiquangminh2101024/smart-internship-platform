# Việc làm tương tự (trang chi tiết tin) — Backend

Câu hỏi đã chốt S1–S5: `docs/temp/ADMIN_USERS_AND_SIMILAR_JOBS_DECISIONS.md` (Mục 2). Chủ dự án chấp nhận toàn bộ khuyến nghị ngày 2026-10-07. Dùng lại hạ tầng Job Matcher GĐ2 (AD-13); **không có thay đổi kiến trúc, không migration, không dependency mới.**

Song song: `docs/05-frontend/phases/similar-jobs/PLAN.md`.

**Trạng thái: ĐÃ DUYỆT (2026-10-07). Chưa code.** Thứ tự ưu tiên: làm **sau** `docs/06-backend/admin-users-support/PLAN.md`; thiếu thời gian thì bỏ phần này trước (H1).

## Quyết định đã chốt

| # | Quyết định |
|---|---|
| S1 | Độ tương tự = cosine giữa vector tin (bảng `job_post_embeddings`). Mỗi thẻ kèm danh sách kỹ năng trùng với tin đang xem. |
| S2 | Endpoint công khai, khách chưa đăng nhập cũng xem được. |
| S3 | Chỉ tính vector cho **tin đang xem** nếu thiếu hoặc lỗi thời (một tin). Tin khác chưa có vector thì bỏ qua. |
| S4 | Tối đa 4 tin, cosine ≥ 0,5. Không tin nào đạt thì trả mảng rỗng, frontend ẩn khối. |
| S5 | Chỉ tin `PUBLISHED` còn hạn (`expiresAt IS NULL OR expiresAt > now()`), bỏ tin đang xem, cho phép cùng công ty. |

## Phần 1 — Công nghệ / kiến trúc sử dụng

- pgvector (toán tử `<=>`), `$queryRaw` giống `cosinesForJob`/`cosinesForCandidate`.
- Dùng lại: `JobMatchProfileLoader.load/loadMany` (có sẵn `matchText` và `skills[].name`), `MatchEmbeddingService` (tính vector lười theo `contentHash`), `JobRecommendationRepository.findPublicByIds` (trả `JobPostDto` công khai, giữ đúng thứ tự id).
- Đặt trong module `job-matching` (service mới `similar-jobs.service.ts`), vì toàn bộ nguyên liệu nằm ở đây.

## Phần 2 — Liên kết giữa các phần

```text
GET /job-posts/:id/similar  (công khai)
  └─ SimilarJobsService.listSimilar(jobPostId)
       ├─ JobMatchProfileLoader.load(id)                    ─ không có / không PUBLISHED / hết hạn ⇒ []
       ├─ MatchEmbeddingService.ensureJobVector({id, text})  ─ S3, lỗi model ⇒ []
       ├─ MatchEmbeddingRepository.nearestJobs(id, 20)       ─ SQL KNN + lọc S5
       ├─ lọc cosine ≥ 0,5, lấy 4                              ─ S4
       ├─ JobMatchProfileLoader.loadMany(ids)                ─ tính kỹ năng trùng (S1)
       └─ JobRecommendationRepository.findPublicByIds(ids)   ─ dữ liệu thẻ tin
```

## Phần 3 — Các bước thực hiện

### J1 — Repository (~30 phút)

`match-embedding.repository.ts` thêm `nearestJobs(jobPostId, take)`:

```sql
SELECT o."jobPostId" AS id, 1 - (o."embedding" <=> s."embedding") AS cosine
FROM job_post_embeddings s
JOIN job_post_embeddings o ON o."jobPostId" <> s."jobPostId"
JOIN job_posts p ON p."id" = o."jobPostId"
WHERE s."jobPostId" = ${jobPostId}
  AND p."status" = 'PUBLISHED'
  AND (p."expiresAt" IS NULL OR p."expiresAt" > now())
ORDER BY o."embedding" <=> s."embedding"
LIMIT ${take}
```

Khi code, kiểm lại tên cột thật trong `schema.prisma` (cột không `@map` thì giữ camelCase trong dấu ngoặc kép, như các truy vấn hiện có). Hiện có 17 tin, nên không cần index ANN.

### J2 — Service (~45 phút)

- `match-embedding.service.ts` thêm method public `ensureJobVector(target): Promise<boolean>`. Hàm bọc `ensureVectors("job", [target], 1)`; lỗi thì log và trả `false`, giống quy ước "mọi lỗi thành null" của service này.
- `similar-jobs.service.ts`: `listSimilar(jobPostId): Promise<SimilarJobItem[]>`. Kỹ năng trùng = giao theo `skillId` giữa tin đang xem và từng tin gợi ý, giữ thứ tự theo tin gợi ý, tối đa 3 tên.
- Hằng số trong `job-matching.config.ts`: `SIMILAR_JOBS_LIMIT = 4`, `SIMILAR_JOBS_MIN_COSINE = 0.5`, `SIMILAR_JOBS_POOL = 20`.

### J3 — Route + kiểu dùng chung (~20 phút)

- `job-matching.routes.ts`: `router.get("/job-posts/:id/similar", ...)`, không guard. Đăng ký `similarJobsService` trong container của router.
- `packages/shared-types`: `SimilarJobItem { jobPost: JobPostDto; similarity: number; sharedSkills: string[] }`.
- Không tăng `viewCount`, không ghi `JobPostDailyStat` (chỉ `getPublicDetail` mới ghi).

### J4 — Kiểm tra (~20 phút)

- `npx tsc --noEmit` sạch.
- Gọi endpoint cho vài tin trên Neon, xem cosine thực tế. Nếu ngưỡng 0,5 làm hầu hết tin ra rỗng hoặc ra quá nhiều tin không liên quan, **báo chủ dự án kèm số liệu** trước khi đổi ngưỡng. Không tự đổi.
- Tin không tồn tại / không công khai ⇒ trả `[]` (200), không 404, để khối giao diện chỉ việc ẩn đi.

**Tổng ước lượng:** ~2 giờ.

## Rủi ro đã biết

- **Vector của tin khác có thể lỗi thời** (tin bị sửa sau lần tính gần nhất). Theo S3, không tính lại hàng loạt; vector cũ vẫn dùng được vì cùng model và cùng số chiều. Lần xem chi tiết tin đó (hoặc lượt tính điểm ứng viên) sẽ tự cập nhật.
- **Tin mới đăng chưa có vector** sẽ không xuất hiện trong khối của tin khác cho tới khi có người mở tin đó. Chấp nhận được.
- Lần mở đầu tiên của một tin chưa có vector chậm thêm thời gian embed một văn bản (model chạy CPU). Frontend tải khối này riêng, không chặn phần nội dung tin.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
