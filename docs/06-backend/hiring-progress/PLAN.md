# Số ứng viên phù hợp và tiến độ tuyển theo tin (0.3) — Backend

> **Trạng thái: XONG BACKEND, BƯỚC 0–9 (2026-11-11).** Bảng điểm đã nạp lần đầu lên Neon. Đã có job đêm 3h30, `GET /employer/dashboard/hiring-progress`, số Phù hợp trên thẻ tự mời và trong danh sách tin. Tin demo đã có chỉ tiêu 1–10 trên Neon. Bước 8 (kiểm thử) đạt hết. Đã cập nhật backlog và AD-24 (bước 9). Tiếp theo là frontend (F1–F5). Chi tiết ở mục Ghi chú triển khai.

Mục 0.3 của `docs/01-project/FEATURE_BACKLOG.md`. Frontend: `docs/05-frontend/phases/hiring-progress/PLAN.md`.

## Mục tiêu

Trả lời câu giáo viên hỏi ở buổi demo 05/11: "tuyển được hay chưa, có bao nhiêu ứng viên phù hợp?".

- Mỗi tin đang hiển thị có số **Phù hợp**: số ứng viên đạt ngưỡng tự mời của tin (`autoOutreachMinScore`, mặc định 80), gồm hai nhóm:
  - người bật cho liên hệ (`isOpenToOutreach`) và **chưa có đơn nào** vào tin: đúng nhóm mà trang tìm ứng viên và tự mời 0.2 lấy ra;
  - người có đơn **đang xét hoặc đã tuyển** vào tin (không phải `CANCELLED` / `REJECTED`, có chung ≥ 1 kỹ năng với tin), hiện tách số, ví dụ "32 (12 đã nộp)".
  - Người đã huỷ đơn hoặc bị từ chối thì không đếm (chốt 2026-11-11).
- Tiến độ tuyển của mỗi tin: Phù hợp → Đã mời → Nhận lời → Phỏng vấn → Đã tuyển / chỉ tiêu (`hiringTarget`).
- Không chấm hybrid lúc mở trang: điểm lấy từ **bảng điểm lưu sẵn**.

## Các quyết định đã chốt (2026-11-10)

| # | Vấn đề | Chốt |
|---|---|---|
| 1 | "Phù hợp" đếm ai | Hai nhóm ở trên, cùng điều kiện điểm ≥ ngưỡng của tin. Người không bật liên hệ và chưa nộp đơn thì không đếm (không liên hệ được). *Sửa 2026-11-11:* nhóm đã nộp chỉ gồm đơn đang xét hoặc đã tuyển; người huỷ đơn hoặc bị từ chối không đếm ở nhóm nào, kể cả khi có bật liên hệ, vì hệ thống không mời lại họ. Người đã tuyển (`ACCEPTED`) vẫn đếm |
| 2 | Bảng điểm chấm bao nhiêu cặp | Mọi ứng viên có chung ≥ 1 kỹ năng đã duyệt với tin, kể cả người đã nộp đơn. **Không** giới hạn 50 như `searchCandidatePool`. Người đã nộp đơn nhưng không có kỹ năng chung thì **không** chấm (gần như luôn dưới ngưỡng) |
| 9 | "Đã mời" | Mọi lời mời đã gửi cho tin (cả tay lẫn tự động, mọi trạng thái), vì đây là phễu. "Đang giữ" vẫn là việc của thẻ 0.2 |
| 3 | Phỏng vấn / Đã tuyển | Theo trạng thái đơn: `INTERVIEWING` / `ACCEPTED`. Khớp `hiredCount` của thẻ 0.2 |
| 4 | Chỉ tiêu | Dùng thẳng `JobPost.hiringTarget` cho mọi tin, không đổi schema của cột này |
| 5 | Khi nào cập nhật bảng điểm | Khi tin chuyển `PUBLISHED` (tự đăng hoặc Admin duyệt) và một job quét mỗi đêm. Tin đang hiển thị không sửa được nội dung, nên không có lối "sửa tin" |
| 6 | Tự mời của 0.2 đọc từ bảng điểm | **Không** trong 0.3. Làm sau khi 0.6 có chấm lại theo ứng viên (đánh dấu tường minh) |
| 7 | Bảng ở trang tổng quan | 5 tin, cả công ty xem |
| 8 | Lượt xem, tỉ lệ nộp | Chuyển sang `/employer/jobs` (frontend) |
| 10 | Cách chấm của job đêm (chốt 2026-11-11, sau số đo bước 0) | Nạp hồ sơ ứng viên **một lần mỗi lượt** rồi dùng lại cho mọi tin. Chấm từng tin như trang tìm ứng viên mất ≈ 24 phút, vì 80% thời gian là nạp lại hồ sơ; cách này ≈ 2–3 phút. Điểm không đổi vì dùng chung hàm chấm |

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency. Dùng `node-cron` (đã có), Prisma, `$queryRaw` cho các câu đếm gộp.
- Module mới `apps/server/src/modules/match-scores/`, đăng ký qua awilix như các module khác.
- **Cùng bộ chấm** với trang tìm ứng viên và tự mời, để điểm trong bảng khớp điểm nhà tuyển dụng thấy ở trang tìm ứng viên. `CandidateOutreachService` tách phần chấm của `scoreCandidates` thành hàm public `scoreProfiles(job, profiles, maxNewEmbeddings)`, nhận hồ sơ đã nạp sẵn. `scoreCandidates` (trang tìm ứng viên, tự mời, lời mời) nạp hồ sơ rồi gọi lại hàm này, nên hành vi hiện có không đổi. Quyết định #10.
- 1 migration viết tay bằng `prisma migrate diff` (bảng mới + 1 cột trên `JobPost`). Xin xác nhận trước khi áp lên Neon. **Không** dùng `--shadow-database-url` trỏ vào DB thật.
- Việc nền chạy chung process (như AD-23 mục 8), nhường lượt cho request web giữa các tin.

### AD-24

Đã ghi vào `docs/02-architecture/ARCHITECTURE_DECISIONS.md` ở bước 0 (2026-11-11), kèm số đo. Bản nháp từng nằm ở đây đã được thay bằng bản đó.

## Phần 2 — Liên kết giữa các phần

```text
JobPostsService.submitForApproval (tự đăng) ─┐
JobPostsService.approve (Admin duyệt) ───────┴─► matchScoreTrigger(jobPostId)   (sau commit, không chờ)
                                                      │
match-score.job.ts (3h30 mỗi đêm) ──────────────► MatchScoreService.rescoreAll()   ─┐ một CandidateProfileCache
scripts/rescore-match-scores.ts (chạy tay) ─────┘                                   │ cho cả lượt
                                                                                    ▼
                                                 MatchScoreService.rescoreJob(jobPostId, cache)
                                                      │   (lối kích hoạt khi tin PUBLISHED: cache mới, chỉ tin đó)
                                                      ├─ MatchScoreRepository.findScoringPool(jobPostId)   (SQL, không LIMIT)
                                                      ├─ cache.getMany(ids)              (chỉ nạp hồ sơ chưa có, lô 500)
                                                      ├─ CandidateOutreachService.scoreProfiles(job, profiles, maxNew)
                                                      └─ MatchScoreRepository.replaceForJob(...)           (1 transaction)

EmployerDashboardService.hiringProgress ──► MatchScoreRepository.progressForCompany(companyId)
AutoOutreachService (GET thẻ của tin)    ──► MatchScoreRepository.progressForJob(jobPostId)
JobPostsService.listOwn                  ──► MatchScoreRepository.matchedCounts(jobIds)   (bước 6, không bắt buộc)
```

- `match-scores` phụ thuộc `candidate-outreach` (bộ chấm `scoreProfiles`, `loadJobProfile`) và `job-matching` (`candidateMatchProfileLoader`, cho cache hồ sơ). Ngược lại `candidate-outreach` và `dashboard` chỉ đọc qua `MatchScoreRepository`. Không có vòng phụ thuộc: lối kích hoạt là `asValue` resolve lúc gọi, giống `autoOutreachTrigger`.

## Phần 3 — Các bước thực hiện

### Bước 0 — Đo trên Neon (chỉ đọc), ghi AD-24

Chưa biết một tin có bao nhiêu người chung kỹ năng khi bỏ `LIMIT 50`. Trước khi chốt cách chia lô:

> **Đã đo 2026-11-11.** Kết quả ở mục Ghi chú triển khai: 311 tin, 131.928 cặp, ≈ 34 MB, ≈ 24 phút nếu chấm từng tin (≈ 2–3 phút nếu nạp hồ sơ một lần mỗi lượt, đã chốt: quyết định #10). Không chạm ngưỡng dừng. AD-24 đã ghi.

- Với các tin đang hiển thị (lúc viết plan là 303): phân bố kích thước pool (min / trung vị / p95 / max) và tổng số cặp. Từ đó ước dung lượng bảng.
- Chấm thử 3 tin (pool nhỏ, trung vị, lớn) bằng script tạm, ghi thời gian.
- Ước thời gian job đêm cho cả 303 tin.

Nếu tổng thời gian ước lượng > 30 phút, hoặc bảng > 50 MB, dừng lại báo chủ dự án trước khi đi tiếp. Đây là số do thiết kế, không có nguồn.

Duyệt xong ghi AD-24 (đã ghi 2026-11-11).

### Bước 1 — Schema và migration

```prisma
model JobCandidateMatchScore {
  jobPostId       String
  jobPost         JobPost   @relation(fields: [jobPostId], references: [id], onDelete: Cascade)
  candidateId     String
  candidate       Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  score           Int
  // true ⇒ chưa có embedding, điểm là rule-only (markSemanticPending).
  semanticPending Boolean   @default(false)
  weightsVersion  String
  scoredAt        DateTime  @default(now())

  @@id([jobPostId, candidateId])
  @@index([jobPostId, score])
  @@map("job_candidate_match_scores")
}
```

- `JobPost.matchScoresAt DateTime?`: lần chấm gần nhất của tin. Job đêm dùng để xếp tin chấm lâu nhất trước. UI hiện "cập nhật lúc…".
- Chỉ lưu kết quả có `score` khác null. Ứng viên không chấm được thì không có dòng, tức là không được đếm.
- Migration viết tay, `prisma migrate diff --from-schema-datasource … --to-schema-datamodel …` rồi xem SQL. Xin xác nhận trước khi `migrate deploy` lên Neon.

### Bước 2 — `MatchScoreRepository`

- `findScoringPool(jobPostId): string[]`
  - Người có chung ≥ 1 kỹ năng `APPROVED` với tin (như `searchCandidatePool`), nhưng **không** lọc opt-in, đơn hay lời mời, và **không** `LIMIT`.
  - Không thêm người đã nộp đơn mà không có kỹ năng chung (chốt 2026-11-10). Nhóm "đã nộp" của số Phù hợp vì vậy chỉ gồm người có kỹ năng chung, và đạt ngưỡng.
- `replaceForJob(jobPostId, rows, scoredAt)`: trong 1 transaction, xoá các dòng cũ của tin, `createMany` theo lô 1.000, cập nhật `JobPost.matchScoresAt`. Người đọc không bao giờ thấy bảng của tin bị trống giữa chừng.
- `deleteForInactiveJobs()`: xoá dòng của tin không còn `PUBLISHED`, để bảng không phình. Job đêm gọi.
- `progressForCompany(companyId)` và `progressForJob(jobPostId)`: một câu SQL gộp cho mỗi tin trả về:
  - `matched`: dòng có `score ≥ j."autoOutreachMinScore"` và (bật liên hệ **và không có đơn** vào tin, **hoặc** có đơn không phải `CANCELLED` / `REJECTED`);
  - `matchedApplied`: phần có đơn không phải `CANCELLED` / `REJECTED`;
  - `invited`: số lời mời của tin (mọi trạng thái, cả tay lẫn tự động);
  - `acceptedInvitations`: lời mời `ACCEPTED`;
  - `interviewing`: đơn `INTERVIEWING`;
  - `hired`: đơn `ACCEPTED`;
  - kèm `hiringTarget`, `autoOutreachEnabled`, `expiresAt`, `matchScoresAt`, `employerId`, tiêu đề.

### Bước 3 — `MatchScoreService` và lối kích hoạt

**3a. Tách hàm chấm trong `CandidateOutreachService`** (quyết định #10):

- Thêm hàm public `scoreProfiles(job: JobMatchProfile, profiles: CandidateMatchProfile[], maxNewEmbeddings): Promise<Map<string, MatchResult>>`. Thân hàm là phần sau bước nạp hồ sơ của `scoreCandidates` hiện tại: gọi `similarityForCandidates` một lần, rồi `score()` cho từng người.
- `scoreCandidates` chỉ còn: `loadMany(ids)` → `scoreProfiles(...)`. Trang tìm ứng viên, tự mời và chấm lúc gửi lời mời không đổi hành vi.
- Thêm `loadJobProfile(jobPostId)` public (bọc `requireJobProfile` hiện có), để `MatchScoreService` nạp tin một lần.
- `scorePool` giữ nguyên cho tự mời của 0.2.

**3b. `CandidateProfileCache`** (trong module `match-scores`, không đăng ký awilix, tạo mới mỗi lượt):

- `Map<candidateId, CandidateMatchProfile>`.
- `getMany(ids)`: nạp các id chưa có bằng `candidateMatchProfileLoader.loadMany`, lô 500, rồi trả hồ sơ theo đúng `ids`. Id không còn hồ sơ thì bỏ qua.
- Trần `MATCH_SCORE_PROFILE_CACHE_MAX = 20_000` hồ sơ. Vượt trần thì xoá sạch cache trước khi nạp tiếp. Ở bộ demo (1.523 ứng viên) không bao giờ chạm; trần chỉ để bộ nhớ không phình khi dữ liệu lớn. Đây là số do thiết kế, không có nguồn.
- Hồ sơ nạp đầu lượt dùng tới cuối lượt (≈ 2–3 phút). Ứng viên sửa hồ sơ trong lúc chạy thì đêm sau mới vào bảng; chấm lại theo ứng viên là việc của 0.6.

**3c. `MatchScoreService`:**

- `rescoreJob(jobPostId, cache = new CandidateProfileCache(...))`:
  1. Tin không còn `PUBLISHED` thì bỏ qua.
  2. Lấy pool (`findScoringPool`).
  3. `loadJobProfile` một lần.
  4. Lấy hồ sơ từ `cache.getMany(pool)`.
  5. Chấm theo khúc 1.000 hồ sơ bằng `scoreProfiles`, giữa các khúc nhường lượt (`await new Promise(setImmediate)`). Pool lớn nhất hiện là 882 nên thường chỉ một khúc, tức một câu tra hash và một câu cosine cho cả tin. Số đo bước 0: tin pool 538 mất 0,4 s khi hồ sơ đã nạp sẵn.
  6. Ghi bằng `replaceForJob`.
- `rescoreAll({ budgetMs, companyId? })`: tạo **một** cache cho cả lượt, chấm lần lượt các tin `PUBLISHED`, `matchScoresAt` cũ nhất (hoặc null) trước. Nhường lượt giữa các tin. Hết `budgetMs` thì dừng. Trả về tổng kết: số tin, số dòng, thời gian, số hồ sơ đã nạp, số embedding mới.
- Lối kích hoạt khi tin `PUBLISHED` gọi `rescoreJob(id)` với cache mới: chỉ nạp hồ sơ của pool tin đó. Số đo bước 0: ≤ 9 s với pool 882.
- Giới hạn embedding mới mỗi tin: hằng số `MATCH_SCORE_MAX_NEW_EMBEDDINGS = 200` (đã chốt ở bước 0: trường hợp xấu nhất ≈ 22 s mỗi tin, hiện gần như không phải embed). Người vượt giới hạn có điểm rule-only, `semanticPending = true`, và được chấm lại ở lượt đêm sau.
- Chống chạy trùng cùng một tin: `Set<jobPostId>` trong bộ nhớ (một process, AD-23 mục 8). Tin đang chấm thì lượt gọi sau bỏ qua.
- `matchScoreTrigger: (jobPostId) => void` đăng ký bằng `asValue`, gọi `rescoreJob` không chờ, lỗi chỉ ghi log.
- `job-posts.service.ts`: gọi `matchScoreTrigger(id)` ngay cạnh hai chỗ đang gọi `autoOutreachTrigger` (dòng ~298 tự đăng, ~356 Admin duyệt). Khác 0.2: gọi **mọi** tin vừa hiển thị, không chỉ tin bật tự mời.

### Bước 4 — Job đêm và script chạy tay

- `match-score.job.ts`: `cron.schedule("30 3 * * *", …, { timezone: "Asia/Ho_Chi_Minh" })`, sau job dọn nhật ký lúc 3h.
  - Không chạy chồng.
  - Xoá dòng của tin hết hiển thị.
  - Gọi `rescoreAll` (một cache hồ sơ cho cả lượt, bước 3c).
  - Giới hạn thời gian mỗi lượt `MATCH_SCORE_NIGHTLY_BUDGET_MS = 45 phút`. Ước tính hiện ≈ 2–3 phút; 45 phút là dư địa khi dữ liệu tăng, không phải thời gian mong đợi. Hết thời gian thì dừng; các tin chưa chấm có `matchScoresAt` cũ nhất nên đêm sau được chấm trước.
  - Ghi log tổng: số tin, số dòng, thời gian, số hồ sơ đã nạp, số embedding mới.
- `scripts/rescore-match-scores.ts` + `npm run rescore-match-scores --workspace=apps/server`:
  - Gọi cùng `rescoreAll` / `rescoreJob` như job đêm.
  - `--company <id>` chỉ chấm một công ty; `--job <id>` chỉ chấm một tin; `--dry-run` chỉ in kích thước pool.
  - Dùng để nạp dữ liệu lần đầu sau migration, và để demo ("chạy lượt quét ngay").
- `main.ts`: `startMatchScoreJob(...)` cạnh các job khác.

### Bước 5 — API

**5a. `GET /employer/dashboard/hiring-progress`** (`dashboard.routes.ts`, quyền `EMPLOYER`, số liệu của cả công ty):

```ts
interface EmployerHiringProgress {
  totals: { publishedJobs: number; matched: number; hired: number; hiringTarget: number };
  items: HiringProgressItem[];   // tối đa 5
  /** Lần chấm cũ nhất trong các tin ở items (ISO), null khi chưa chấm. */
  scoredAt: string | null;
}
interface HiringProgressItem {
  jobPostId: string; title: string; expiresAt: string | null;
  matched: number; matchedApplied: number;
  invited: number; acceptedInvitations: number;
  interviewing: number; hired: number; hiringTarget: number;
  autoOutreachEnabled: boolean;
  /** Người xem là người đăng tin ⇒ frontend được hiện link "Bật tự mời". */
  ownedByViewer: boolean;
  /** null ⇒ tin chưa được chấm lần nào (vừa đăng, đang chấm). */
  matchScoresAt: string | null;
}
```

Thứ tự "cần chú ý" (làm trong service, có unit test):

1. Tin chưa đạt chỉ tiêu (`hired < hiringTarget`) trước.
2. Trong đó, tin còn ≤ 7 ngày tới hạn trước (cùng `EXPIRING_DAYS` với "Tin cần chú ý").
3. Tỉ lệ `hired / hiringTarget` thấp trước.
4. Hạn nộp gần trước.

Một endpoint riêng, không nhét vào `overview`, để khối này tải và báo lỗi riêng như các khối khác của trang tổng quan.

**5b. Thẻ tự mời của tin:** `AutoOutreachStatus` thêm `matched`, `matchedApplied`, `interviewing`, `matchScoresAt`. Đọc từ `progressForJob`, không chấm.

**5c. Shared types:** thêm vào `packages/shared-types/src/index.ts`.

### Bước 6 — Danh sách tin (không bắt buộc)

`GET /employer/job-posts`: mỗi tin `PUBLISHED` thêm `matchedCount?: number` (nhóm đã nộp + nhóm bật liên hệ, như 5a), tính bằng **một** câu SQL gộp cho các id trong trang. Tin khác trạng thái thì bỏ trống trường này.

### Bước 7 — Dữ liệu demo

- Tin của bộ demo lớn đều có `hiringTarget = 1` (mặc định), nên cột "Đã tuyển a/b" sẽ trông giả.
- Sửa thư viện `scripts/data/large-demo/` để tin mới sinh có chỉ tiêu 1–10 (theo loại tin `jobType`: thực tập, bán thời gian, toàn thời gian, hợp đồng).
- Thêm tuỳ chọn `--targets-only` cho `seed-large-demo` để gán lại chỉ tiêu cho các tin `@large-demo.local` hiện có, không đụng dữ liệu khác.
- Xin xác nhận trước khi ghi lên Neon.

### Bước 8 — Kiểm thử

- **Unit** (`apps/server/tests/unit/`):
  - hàm xếp "cần chú ý";
  - hàm chia lô;
  - quy tắc bỏ qua tin không `PUBLISHED`;
  - `CandidateProfileCache`: chỉ nạp id chưa có, giữ đúng thứ tự, bỏ id không còn hồ sơ, xoá sạch khi vượt trần.
- **Trên Neon** (chỉ đọc trước, xin xác nhận trước khi ghi):
  - nạp lần đầu bằng script, ghi thời gian và số dòng. So với ước tính 2–3 phút ở bước 0; lệch nhiều (> 10 phút) thì dừng tìm nguyên nhân;
  - **Tách hàm chấm không đổi điểm:** với 3 tin, so từng người giữa `scorePool` (cách cũ) và `rescoreJob` dùng cache. Điểm phải trùng hoàn toàn, trừ người `semanticPending` ở một bên;
  - với 2–3 tin, đối chiếu tay: số `matched` khớp với số người đạt ngưỡng nếu chấm trực tiếp toàn pool;
  - **(a) Kiểm đúng bộ chấm** (đạt / không đạt):
    - với tin có ≤ 50 người chung kỹ năng (hai bên chấm cùng một nhóm người), top 10 của bảng (chỉ người bật liên hệ, chưa mời, chưa nộp) trùng hoàn toàn top 10 của trang tìm ứng viên;
    - với tin lớn, 10 người trang tìm ứng viên trả về có cùng điểm trong bảng. Ngoại lệ được chấp nhận: một bên chưa có embedding lúc chấm (`semanticPending`).
  - **(b) Đo mức bỏ sót của `LIMIT 50`** (chỉ ghi số, không tính đạt hay trượt). Với 5–10 tin lớn của bộ demo, ghi:
    - số người đạt ngưỡng trong bảng (số "Phù hợp");
    - trong số đó, bao nhiêu người nằm ngoài nhóm 50 của trang tìm ứng viên, tức là cả trang tìm ứng viên lẫn tự mời của 0.2 đều không thấy;
    - trong top 10 của bảng (chỉ người bật liên hệ, chưa mời, chưa nộp), bao nhiêu người có trong top 10 của trang tìm ứng viên.

    Số đo này là căn cứ cho việc chuyển trang tìm ứng viên và tự mời sang đọc bảng sau 0.6: nếu số người bị bỏ sót lớn thì lợi ích không chỉ là nhanh hơn mà còn là mời đúng người hơn. Ghi kết quả vào "Ghi chú triển khai".
  - đổi ngưỡng 80 → 70 ⇒ số Phù hợp tăng ngay, không chấm lại;
  - Admin duyệt một tin mới ⇒ vài giây sau tin có `matchScoresAt` và số Phù hợp;
  - chạy job đêm bằng tay trong lúc gọi liên tục `GET /api/health` và danh sách tin công khai: so thời gian phản hồi với lúc không chạy, như 7c của 0.2.
- `npm run build` / `typecheck` cho server và shared-types.

### Bước 9 — Tài liệu

- Cập nhật dòng 0.3 trong `FEATURE_BACKLOG.md`, trạng thái AD-24, và ghi số đo vào "Ghi chú triển khai" bên dưới.

## Ngoài phạm vi

- Chấm lại theo ứng viên (đánh dấu tường minh) và script mô phỏng dữ liệu đổ vào: mục 0.6.
- Tự mời của 0.2 đọc từ bảng điểm: sau 0.6.
- "Việc làm phù hợp" của ứng viên đọc từ bảng điểm: không làm. Bảng chỉ chứa tin đang hiển thị và ứng viên có kỹ năng chung, nên không thay được truy vấn của 0.5.
- Tách worker cho job đêm.

## Ghi chú triển khai

### Bước 0 — Kết quả đo trên Neon (2026-11-11, chỉ đọc)

Script tạm `.claude-workspace/scratch/measure-match-pool.ts` và `measure-match-breakdown.ts` (không commit). Chấm với `maxNewEmbeddings = 0` để không ghi vector. Embed thử thì gọi thẳng provider, không lưu. Kiểm sau khi chạy: 0 dòng embedding mới.

**Kích thước pool** (chung ≥ 1 kỹ năng APPROVED, không lọc gì thêm):

| Chỉ số | Giá trị |
|---|---|
| Tin `PUBLISHED` | 311 (plan ghi 303 là số cũ) |
| Ứng viên | 1.523, trong đó 1.080 bật cho liên hệ |
| Pool mỗi tin | min 22 · p25 328 · trung vị 438 · p75 513 · p90 668 · p95 698 · max 882 |
| Tin có pool > 50 | 309/311, tức `LIMIT 50` hiện tại cắt gần như mọi tin |
| Tổng số cặp (số dòng của bảng) | 131.928 |
| Đơn nộp không có kỹ năng chung với tin (không chấm, chốt #2) | 109/4.050 (2,7%) |

Mỗi ứng viên ở pool của gần 1/3 số tin. Nguyên nhân là chỉ cần chung một kỹ năng.

**Dung lượng:**

- Dòng dữ liệu 96 byte (`pg_column_size` một dòng mẫu đúng kiểu cột).
- Cộng header, PK và index `(jobPostId, score)`: khoảng 228 byte/dòng.
- Ước tính **≈ 34 MB** (đã nhân 1,2 cho phần phình sau mỗi lần thay). Dưới ngưỡng 50 MB.
- Cả DB hiện là 35 MB, nên bảng mới làm DB gần gấp đôi. Neon gói miễn phí cho 0,5 GB, vẫn còn rộng.
- Không bỏ được dòng điểm thấp, vì ngưỡng của tin cho chỉnh 0–100.

**Embedding:**

- 1.521/1.523 ứng viên đã có vector đúng hash. 2 người lệch hash, 0 người chưa có.
- 311/311 tin có vector.
- Embed một hồ sơ mất khoảng 112 ms (model cục bộ, đo trên 2 mẫu).
- Lượt đầu gần như không phải embed. `MATCH_SCORE_MAX_NEW_EMBEDDINGS = 200` giữ nguyên: trường hợp xấu nhất khoảng 22 giây mỗi tin.

**Chấm thử 3 tin** bằng `scorePool`, lô 100, trung vị của 3 lần chạy:

| Tin | Pool | Thời gian | ms/người | ≥ 80 | ≥ 70 |
|---|---|---|---|---|---|
| Kỹ thuật tự động hoá (nhỏ nhất) | 22 | 0,8 s | 37 | 12 | 15 |
| Frontend React (trung vị) | 438 | 5,0 s | 11,5 | 12 | 26 |
| Business Analyst (lớn nhất) | 882 | 8,9 s | 10,1 | 21 | 44 |

**Thời gian chạy hết các tin:**

- Cách của plan (gọi `scorePool` cho từng tin): 131.928 cặp × ~11 ms ≈ **24 phút**. Dưới ngưỡng 30 phút nhưng sát.
- Tách thời gian một tin pool 538 (lần chạy nóng):

  | Khâu | Thời gian |
  |---|---|
  | Nạp hồ sơ ứng viên (`loadMany`) | 2,7 s |
  | Nạp tin | 0,3 s |
  | Tra hash | 0,3 s |
  | Cosine | 0,3 s |
  | Chấm thuần | 24 ms |

  **Khoảng 80% thời gian là nạp lại hồ sơ.** Cùng 1.523 hồ sơ bị nạp lại khoảng 87 lần mỗi đêm (131.928 / 1.523).
- Nạp mọi hồ sơ một lần mất 4,1 s. Chấm lại một tin bằng hồ sơ đã nạp, một câu cosine, mất 0,4 s. Ước cả đêm **≈ 2–3 phút**.

**Kết luận bước 0:**

- Hai ngưỡng dừng (30 phút, 50 MB) đều không chạm. Đi tiếp được theo plan.
- Thời gian mỗi người ổn định từ pool 438 tới 882 (10–11,5 ms), nên không cần chia lô nhỏ để tránh chậm. Sau khi chốt cách nạp hồ sơ một lần, bước 3 nạp hồ sơ theo lô 500 và chấm theo khúc 1.000 thay cho lô 100.
- **Đã chốt 2026-11-11 (quyết định #10, bước 3–4):** job đêm nạp hồ sơ ứng viên **một lần mỗi lượt** rồi dùng lại cho mọi tin. Cách làm: thêm vào `CandidateOutreachService` một hàm chấm nhận hồ sơ đã nạp. Hàm này dùng chung `score()`, `similarityForCandidates`, cùng quy tắc, nên điểm vẫn khớp trang tìm ứng viên. `scoreCandidates` hiện có thì gọi lại hàm này.
  - Lợi: 24 phút → 2–3 phút. Còn dư nhiều khi dữ liệu tăng hoặc khi 0.6 chấm 15 phút/lần.
  - Giá: giữ khoảng 1.500 hồ sơ trong bộ nhớ trong lúc chạy, vài MB.
  - Khi dữ liệu lớn hơn nhiều thì nạp theo từng khúc ứng viên. Chưa cần ở quy mô này.
  - Lối kích hoạt khi một tin vừa `PUBLISHED` vẫn chấm riêng tin đó như plan (≤ 9 s).

### Bước 1 — Schema và migration (2026-11-11)

- `schema.prisma`: model `JobCandidateMatchScore` đúng như mục Bước 1; `JobPost.matchScoresAt`; quan hệ ngược `matchScores` trên `JobPost` và `Candidate`.
- Migration `20261111120000_add_job_candidate_match_scores`:
  - Sinh bằng `prisma migrate diff --from-schema-datasource --to-schema-datamodel --script`. Trước khi sửa schema đã chạy cùng lệnh và ra "empty migration", nên Neon không lệch schema và SQL chỉ chứa phần của 0.3.
  - Nội dung: 1 cột null, 1 bảng mới, 1 index, 2 khoá ngoại `ON DELETE CASCADE`. Không đụng dữ liệu cũ.
- `prisma migrate status` trước khi làm: 34 migration, Neon đã áp hết.
- Không chạy `prisma format`, vì nó căn lại cột ở các model khác (Company, SubscriptionPlan) và làm diff dính file không liên quan. `prisma validate` đạt; `tsc --noEmit` của server sạch.
- **Không thêm index theo `candidateId`.**
  - Hiện chỉ cần khi xoá ứng viên: khoá ngoại cascade sẽ quét bảng khoảng 34 MB. Việc này hiếm.
  - 0.6 (chấm lại theo ứng viên) sẽ xoá và ghi theo `candidateId` thường xuyên, nên thêm index ở migration của 0.6.
- **Đã áp lên Neon 2026-11-11** (chủ dự án xác nhận) bằng `npm run db:deploy`, 35/35 migration. Kiểm sau khi áp:
  - `migrate diff` ra "empty migration", nên Neon khớp schema;
  - đọc được bảng mới: 0 dòng; 422 tin đều có `matchScoresAt = null`.
  - Bảng được nạp ở bước 4 bằng script `rescore-match-scores`.

### Bước 2 — `MatchScoreRepository` (2026-11-11)

File `apps/server/src/modules/match-scores/match-score.repository.ts`. Chưa đăng ký awilix: bước 3 đăng ký cùng service.

- **"Tin đang hiển thị"** = `PUBLISHED` và chưa quá `expiresAt`. Cùng điều kiện với tìm kiếm công khai và câu lọc của tự mời 0.2. Lý do: job chuyển `EXPIRED` chạy theo lịch, nên có lúc tin đã quá hạn mà vẫn `PUBLISHED`.
- **Có thêm hai hàm ngoài danh sách của plan**, cần cho bước 3:
  - `isJobVisible(jobPostId)`;
  - `findJobsToRescore({ companyId?, jobPostId? })`: tin chưa chấm (null) xếp trước, rồi tới tin chấm lâu nhất.
- **`replaceForJob`:**
  - Transaction tương tác, timeout 30 giây (mặc định 5 giây không chắc đủ với Neon).
  - Ghi `matchScoresAt` bằng SQL để **không đổi `updatedAt`** của tin, cùng lý do với `markExhausted` của 0.2.
  - Nếu tin thôi hiển thị trong lúc chấm thì không ghi, chỉ xoá dòng cũ, và trả `false`.
  - Ứng viên bị xoá giữa lúc chấm và lúc ghi thì khoá ngoại báo lỗi, cả transaction huỷ. Tin đó giữ điểm cũ và được chấm lại lượt sau.
- **`deleteForInactiveJobs`:** xoá dòng của tin không còn hiển thị, đồng thời đặt `matchScoresAt = null`. Nhờ vậy tin hiển thị lại thì được coi là chưa chấm: frontend hiện "Đang chấm…" thay vì 0.
- **`progressForCompany` / `progressForJob`:** một câu SQL với 3 `CROSS JOIN LATERAL` (điểm, lời mời, đơn).
  - Định nghĩa `matched` sửa ngày 2026-11-11 (chốt #1):
    - Bản đầu tính "bật liên hệ **hoặc** đơn chưa huỷ". Như vậy đơn `REJECTED` vẫn được đếm, và người đã huỷ hoặc bị từ chối mà có bật liên hệ cũng lọt qua nhánh opt-in, dù trang tìm ứng viên và tự mời loại mọi người đã có đơn.
    - Bản mới dùng `LEFT JOIN applications` (unique `jobPostId + candidateId` nên không nhân dòng): nhóm chưa nộp là `a.id IS NULL AND isOpenToOutreach`; nhóm đã nộp là `a.status NOT IN ('CANCELLED','REJECTED')`.
    - Kiểm trên Neon, chỉ đọc (`verify-matched.ts`): thay bảng điểm bằng CTE cho mọi người trong pool 100 điểm, rồi so với cách đếm bằng Prisma trên 3 tin có đủ 7 trạng thái đơn. Kết quả khớp cả 3 tin: 301/12, 422/10, 247/12. Ở tin đầu, 12 trên 26 đơn trong pool là `REJECTED`, nên bản cũ thổi số "đã nộp" lên gấp đôi.
  - `progressForJob` không lọc trạng thái tin, vì thẻ 0.2 hiện ở mọi trạng thái.
  - Hàm `matchedCounts` của bước 6 chưa làm.
- **Kiểm trên Neon, chỉ đọc** (`.claude-workspace/scratch/verify-match-repo.ts`):
  - `findJobsToRescore` ra 311 tin, đúng bằng số tin `PUBLISHED`, tất cả `matchScoresAt = null`.
  - Pool của tin Business Analyst có 538 người, không trùng, chạy 122 ms.
  - `isJobVisible` đúng với cả id có thật lẫn id không tồn tại.
  - `progressForCompany` cho Mây Xanh: 32 tin, khoảng 100–130 ms. `hired`, `interviewing`, `invited`, `acceptedInvitations` khớp với đếm bằng Prisma.
  - `progressForJob` với id không tồn tại trả `null`.
  - Bảng còn rỗng nên `matched` đều bằng 0. Phần đếm `matched` / `matchedApplied` sẽ đối chiếu sau khi nạp bảng ở bước 4 (bước 8 đã có mục đối chiếu tay).
  - Chưa gọi `replaceForJob` / `deleteForInactiveJobs` trên Neon, vì đó là thao tác ghi. Sẽ kiểm ở bước 4, khi nạp lần đầu.
- `tsc --noEmit` của server sạch.

### Bước 3 — `MatchScoreService` và lối kích hoạt (2026-11-11)

Các file:

- `candidate-outreach.service.ts`:
  - thêm public `scoreProfiles(job, profiles, maxNew)` và `loadJobProfile(jobPostId)`;
  - `scoreCandidates` giờ chỉ nạp hồ sơ rồi gọi `scoreProfiles`, nên trang tìm ứng viên, tự mời và chấm lúc gửi lời mời không đổi hành vi;
  - `scorePool` giữ nguyên.
- Module `match-scores`:
  - `match-scores.config.ts`: `MATCH_SCORE_MAX_NEW_EMBEDDINGS = 200`, `MATCH_SCORE_CHUNK_SIZE = 1_000`, `MATCH_SCORE_PROFILE_LOAD_BATCH = 500`, `MATCH_SCORE_PROFILE_CACHE_MAX = 20_000`;
  - `candidate-profile-cache.ts`;
  - `match-score.service.ts`;
  - `match-scores.module.ts`.
- `job-posts.service.ts`: gọi `matchScoreTrigger(id)` khi tự đăng (`autoPublished`) và khi Admin duyệt, cho **mọi** tin, sau khi transaction đã commit.
- `main.ts`: `registerMatchScores(container)` ngay sau `candidateOutreachRouter`.

Khác hoặc thêm so với plan:

- **Đăng ký awilix bằng `registerMatchScores`** (file `match-scores.module.ts`), không qua một router. Module chưa có route riêng: API của bước 5 nằm ở `dashboard.routes.ts` và thẻ tự mời. Script dựng container (bước 4) cũng phải gọi hàm này.
- **`rescoreAll` có khoá riêng:** đang có lượt khác thì trả `{ status: "LOCKED" }`. Job đêm và script chạy tay vì vậy không chạy chồng nhau, nên bước 4 không cần khoá riêng. `Set` chống chạy trùng theo tin vẫn giữ, để lối kích hoạt và job đêm không chấm cùng một tin một lúc.
- **Tổng kết lượt không có "số embedding mới".** `similarityForCandidates` không trả con số này. Thay bằng `pendingRows`: số dòng rule-only vì chưa có embedding. Số này cho biết lượt sau còn bao nhiêu người cần embed, và đủ cho log của bước 4.
- **Giới hạn embedding mới tính theo khúc 1.000 hồ sơ**, không theo tin. Pool lớn nhất hiện là 882 nên hai cách như nhau.
- **`scoredAt` / `matchScoresAt` lấy lúc bắt đầu chấm tin**, không phải lúc ghi. Hồ sơ dùng để chấm là hồ sơ ở khoảng thời điểm đó.
- **Kết quả `rescoreJob`:**
  - `SKIPPED` với lý do `RUNNING` hoặc `NOT_VISIBLE`;
  - `GONE`: tin thôi hiển thị trong lúc chấm;
  - `DONE`: kèm `pool`, `rows`, `pendingRows`, `durationMs`.
  - Lỗi thì ném ra. `rescoreAll` bắt lỗi từng tin, ghi log rồi đi tiếp.
- **Cache:** vượt trần thì xoá sạch, rồi nạp lại **toàn bộ** danh sách đang cần, kể cả id vừa có trong cache. Id không còn hồ sơ thì không lưu, nên lần sau vẫn hỏi lại loader.

Kiểm thử:

- `tests/unit/match-scores.test.ts`: 13 test, gồm 3 cho cache và 10 cho service (bản giả của repository, loader và bộ chấm):
  - nạp theo lô, bỏ trùng, giữ thứ tự, trần;
  - bỏ điểm null, `semanticPending`;
  - `NOT_VISIBLE` / `GONE`;
  - chấm theo khúc 1.000;
  - chống chạy trùng và nhả khoá khi lỗi;
  - một cache cho cả lượt (ứng viên chung giữa các tin chỉ nạp một lần);
  - lỗi một tin thì đi tiếp;
  - hết thời gian thì `jobsDeferred`;
  - `LOCKED`.
- Hai test có sẵn dựng `JobPostsService` được truyền thêm `matchScoreTrigger`:
  - `job-post-resubmit.test.ts`: no-op;
  - `auto-outreach-run.test.ts`: kiểm tin tự đăng được chấm **cả khi không bật tự mời**, còn tin phải chờ duyệt thì không.
- Cả bộ unit test 450/450 xanh. `tsc --noEmit` của server sạch.
- **Đối chiếu trên Neon, chỉ đọc** (`.claude-workspace/scratch/verify-score-profiles.ts`, `maxNewEmbeddings = 0`, không gọi `replaceForJob`):
  - container dựng được `matchScoreService`, `matchScoreTrigger` và `jobPostsService`;
  - so từng người giữa `scorePool` (lối cũ) và `cache.getMany` + `scoreProfiles` (lối mới, một cache cho 3 tin) trên 3 tin pool 22 / 438 / 882;
  - **lệch 0** về điểm, trạng thái, `weightsVersion` và `semantic` ở cả 3 tin. Có 1 người `semanticPending` ở tin pool 438, khớp với số 1.521/1.523 ứng viên có embedding đúng hash ở bước 0;
  - số embedding và `embeddedAt` mới nhất không đổi trước và sau, tức không ghi gì;
  - thời gian chấm ở lần chạy này chưa có ý nghĩa để so: cả hai lối đều nạp hồ sơ lần đầu, và độ trễ tới Neon dao động. Thời gian thật của lượt đêm sẽ đo ở lần nạp đầu của bước 4.

### Bước 4 — Job đêm, script chạy tay, nạp lần đầu (2026-11-11)

Các file:

- `match-score.job.ts`:
  - `runMatchScoreNightly(deps, { budgetMs, onJobDone })`: gọi `deleteForInactiveJobs` rồi `rescoreAll`;
  - `startMatchScoreJob`: `"30 3 * * *"`, timezone `Asia/Ho_Chi_Minh`, ghi log tổng; `LOCKED` thì chỉ warn.
- `match-scores.config.ts`: thêm `MATCH_SCORE_NIGHTLY_BUDGET_MS = 45 phút`.
- `match-score.service.ts`: `rescoreAll` nhận thêm `onJobDone(jobPostId, result | null)`, để script in tiến độ.
- `main.ts`: `startMatchScoreJob(...)` đặt ngay trước outbox job.
- `scripts/rescore-match-scores.ts` + `npm run rescore-match-scores --workspace=apps/server`:
  - không có bộ lọc: gọi đúng `runMatchScoreNightly` như job đêm, nhưng không giới hạn thời gian;
  - `--company <id>` / `--job <id>`: chỉ `rescoreAll` theo bộ lọc, không dọn gì;
  - `--dry-run`: in số tin, phân bố pool và tổng số cặp; không chấm, không ghi.
  - Cuối lượt in số dòng và dung lượng bảng.

Khác plan:

- **Script không dựng cả container** (không có script nào trong repo làm vậy; dựng container phải mount gần hết router). Script tự tạo đúng các phụ thuộc mà `loadJobProfile` / `scoreProfiles` dùng, cùng cấu hình với `job-matching.routes.ts`. Các phụ thuộc còn lại của `CandidateOutreachService` (mời, thông báo, hạn mức) để trống, kèm chú thích.
- **Khoá chống chạy trùng chỉ có tác dụng trong một process.** Script chạy cùng lúc với job đêm của server thì một tin có thể bị chấm hai lần. Không sai dữ liệu, vì mỗi lần thay trọn điểm của tin trong một transaction. Đã ghi ở đầu script.
- Log tổng dùng `pendingRows` thay cho "số embedding mới" (xem bước 3).

Kiểm thử:

- Unit test thêm 1 test cho `runMatchScoreNightly`: dọn trước rồi chấm, budget 45 phút. `match-scores.test.ts` có 14 test. Cả bộ unit test xanh, `tsc` sạch (kể cả script và test, kiểm bằng tsconfig tạm).
- `--dry-run` trên Neon: 311 tin, pool min 22 / trung vị 438 / p95 698 / max 882, 131.928 cặp. Khớp số đo bước 0.

**Nạp lần đầu lên Neon** (chủ dự án xác nhận, 2026-11-11 03:48–03:53 UTC, `npm run rescore-match-scores`):

- 311/311 tin, không bỏ qua, không lỗi. 131.928 dòng, 0 dòng rule-only. 1.523 hồ sơ nạp đúng một lần.
- Bảng 22 MB (ước 34 MB). Cả DB 57 MB.
- **Thời gian 301 giây**, so với ước 2–3 phút. Lệch khoảng 2–3 phút, dưới ngưỡng dừng 10 phút của bước 8. Đã tách bằng một lượt chấm cả 311 tin mà không ghi (chỉ đọc, `measure-score-only.ts`), tổng 183 giây:

  | Phần | Thời gian |
  |---|---|
  | `findScoringPool` | 17 s |
  | `loadJobProfile` (311 lần, mỗi lần vài câu tới Neon) | 73 s |
  | Nạp hồ sơ ứng viên (một lần cho cả lượt) | 23 s |
  | `scoreProfiles` (tra hash, cosine, chấm) | 71 s |
  | Phần ghi `replaceForJob` (suy ra: 301 − 183) | ≈ 118 s |

  Ước tính ở bước 0 chỉ đo phần chấm có nạp hồ sơ ứng viên, chưa tính phần ghi và phần nạp hồ sơ tin. Không cần tối ưu: 5 phút còn rất xa giới hạn 45 phút. Nếu sau này cần nhanh hơn, chỗ dễ làm nhất là nạp hồ sơ tin theo lô.

**Kiểm sau khi nạp, chỉ đọc** (`.claude-workspace/scratch/verify-first-load.ts`):

- 311 tin hiển thị đều có `matchScoresAt`. Không tin ẩn nào có `matchScoresAt`. Có đúng một `weightsVersion`.
- **`updatedAt` không đổi:** 0 tin có `updatedAt` ≥ lúc bắt đầu chấm.
- **Số dòng mỗi tin = kích thước pool** ở cả 311 tin: không người nào có điểm null.
- **`matched` / `matchedApplied` của `progressForJob` khớp đếm bằng Prisma trên điểm thật**, ở 3 tin có nhiều trạng thái đơn nhất: 45/3, 4/2, 10/1 (ngưỡng 80). Đây là mục đối chiếu tay của bước 8.
- **Điểm đã lưu khớp chấm lại bằng `scorePool`** (lối cũ, `maxNewEmbeddings = 0`) ở 3 tin pool 698 / 313 / 474: lệch 0.
- Phân bố: 7.587 cặp ≥ 80 điểm, trung vị 33 điểm.
- `progressForCompany` với bảng đã đầy (Mây Xanh, 32 tin): 141 ms lần đầu, ≈ 60 ms các lần sau.

### Bước 5 — API (2026-11-11)

Các file:

- `packages/shared-types`: thêm `HiringProgressItem`, `EmployerHiringProgress`; `AutoOutreachStatus` thêm `matched`, `matchedApplied`, `interviewing`, `matchScoresAt`.
- `dashboard/hiring-progress.policy.ts` (hàm thuần, không đọc DB):
  - `compareHiringProgress(a, b, now)`: thứ tự "cần chú ý" của 5a, dùng `ATTENTION_EXPIRING_DAYS` của job-posts (cùng mốc 7 ngày với "Tin cần chú ý");
  - `buildHiringProgress(rows, viewerEmployerId, now)`: tổng, cắt `HIRING_PROGRESS_LIMIT = 5` tin, `scoredAt`, `ownedByViewer`.
- `EmployerDashboardService.hiringProgress(userId)`: id lấy từ `employerIdentityCache` (AD-19, không hỏi DB), một câu `progressForCompany`, rồi `buildHiringProgress`.
- `GET /employer/dashboard/hiring-progress` trong `dashboard.routes.ts`, quyền `EMPLOYER`, endpoint riêng.
- `AutoOutreachService.toJobDto`: đọc `progressForJob` song song với `countJob`.

Các điểm chốt khi làm, plan chưa nói rõ:

- **`totals` tính trên mọi tin đang hiển thị của công ty**, không chỉ 5 tin ở `items`. `totals.matched` cộng theo tin: một ứng viên hợp nhiều tin được đếm ở từng tin. Đã ghi trong shared types.
- **`scoredAt` bỏ qua tin chưa chấm.** Là lần chấm cũ nhất trong các tin ở `items` đã có `matchScoresAt`. Null chỉ khi không tin nào được chấm. Tin chưa chấm vẫn có `matchScoresAt = null` của riêng nó, để frontend hiện "Đang chấm…".
- **Thứ tự:**
  - Quy tắc 2 (≤ 7 ngày tới hạn) chỉ áp cho tin chưa đạt chỉ tiêu, đúng chữ "trong đó" của 5a.
  - Tin đã đạt chỉ tiêu xếp theo tỉ lệ rồi theo hạn nộp.
  - Tin không có hạn nộp xếp sau cùng ở quy tắc 4 và không được coi là sắp hết hạn.
  - Hoà hết thì xếp theo id, để thứ tự không đổi giữa các lần tải.
- **Response không có `employerId`** của tin. Chỉ trả `ownedByViewer`.
- **Thẻ tự mời, tin không hiển thị:** job đêm đã xoá điểm của tin, nên `matched = 0`, `matchScoresAt = null`.

Kiểm thử:

- `tests/unit/hiring-progress.test.ts`: 8 test, gồm:
  - các quy tắc thứ tự;
  - tổng tính trên mọi tin, cắt 5 tin;
  - `scoredAt`;
  - chuyển trường và `ownedByViewer`;
  - service đọc theo công ty của người xem.
- `auto-outreach-settings.test.ts`:
  - test GET cài đặt tin kiểm thêm 4 trường mới;
  - thêm 1 test cho tin chưa chấm hoặc không hiển thị.
- Cả bộ unit test xanh (460 test).
- `tsc` sạch cho server (kể cả test đã sửa), shared-types và web.
- Đã build lại `packages/shared-types`, vì server đọc bản build của gói này.

**Trên Neon, chỉ đọc** (`.claude-workspace/scratch/verify-hiring-progress-api.ts`). Gọi các service qua container thật, với công ty Mây Xanh (32 tin):

- `totals`: 32 tin, 497 phù hợp, đã tuyển 7 / chỉ tiêu 33. Khớp tổng cộng tay từ `progressForCompany`.
- Chỉ tiêu toàn 1 nên trông giả; bước 7 sửa.
- Thời gian `hiringProgress`: 110 ms lần đầu, ≈ 60 ms các lần sau.
- 5 tin trả về đều chưa đạt chỉ tiêu, xếp theo hạn nộp từ 20/11 đến 01/12. Không tin nào còn ≤ 7 ngày.
- Với hai employer khác nhau của công ty, `ownedByViewer` đúng theo người đăng tin. Response không có `employerId`.
- Thẻ tự mời của một tin: `matched` 10, `matchedApplied` 2, `interviewing` 1, `hiredCount` 0. Khớp `progressForJob`.
- Thẻ tự mời của một tin DRAFT: `matched` 0, `matchScoresAt` null.

### Bước 6 — Số Phù hợp trong danh sách tin (2026-11-11)

Các file:

- `MatchScoreRepository.matchedCounts(jobPostIds)`: một câu gộp cho các id trong trang, trả `Map<jobPostId, matched>`. Chỉ tin đang hiển thị có trong Map.
- Phần đếm Phù hợp tách thành hằng `MATCHED_COUNTS` (một LATERAL subquery). `progress` (bước 5) và `matchedCounts` dùng chung hằng này, nên hai nơi luôn ra cùng một số.
- `JobPostsService.listOwn` gọi `matchedCounts` với các tin `PUBLISHED` trong trang, rồi gắn `matchedCount` vào DTO.
  - Trang không có tin `PUBLISHED` thì không gọi.
  - Tin `PUBLISHED` đã quá hạn nhưng chưa bị job đóng thì không có trong Map, nên không có trường này.
- Shared types: `JobPost.matchedCount?: number`. Chỉ `GET /employer/job-posts` điền trường này; API công khai không có.

Kiểm thử:

- `hiring-progress.test.ts` thêm 2 test cho `listOwn`:
  - chỉ tin `PUBLISHED` có trong kết quả đếm mới có `matchedCount`;
  - một lần gọi cho cả trang;
  - giữ phân trang;
  - trang không có tin `PUBLISHED` thì không hỏi bảng điểm.
- Cả bộ unit test xanh (462 test). `tsc` sạch cho server, test, shared-types và web.
- **Trên Neon, chỉ đọc** (`verify-matched-counts.ts`), với công ty Mây Xanh, duyệt hết 3 trang (43 tin):
  - 32 tin `PUBLISHED` có `matchedCount`, khớp `progressForCompany` ở cả 32 tin;
  - không tin nào ở trạng thái khác có trường này;
  - tổng Phù hợp sau khi tách `MATCHED_COUNTS` vẫn là 497, như bước 5;
  - `matchedCounts` cho 16 tin mất ≈ 55 ms;
  - cả trang `listOwn` mất 0,6–1,8 s từ máy tới Neon, chủ yếu là phần sẵn có (tin kèm kỹ năng, ngành, kiểm duyệt).

### Bước 7 — Chỉ tiêu cho dữ liệu demo (2026-11-11)

Các file:

- File mới `apps/server/scripts/lib/large-demo/hiring-targets.ts`:
  - `HIRING_TARGET_WEIGHTS`: phân bố chỉ tiêu theo loại tin (`jobType`). Chủ dự án chốt dùng loại tin (2026-11-11); schema không có cột cấp bậc (Intern / Fresher / Junior...).
  - `baseHiringTarget(id, jobType)`: lấy giá trị theo trọng số.
  - `hiringTargetFor(id, jobType, hired)` và `raiseTargetsToHired(jobPosts, applications)`: chỉ tiêu không nhỏ hơn số đơn `ACCEPTED`.
- `generate.ts`: mỗi tin sinh ra có `hiringTarget = baseHiringTarget(...)`.
- `seed-large-demo.ts`:
  - gọi `raiseTargetsToHired` sau khi sinh lịch sử;
  - thêm `--targets-only`, chạy kèm được `--dry-run`.

Các điểm tự chốt:

- **Đặt phân bố trong code, không đặt trong `scripts/data/large-demo/`.** Bảng phân bố chỉ có 4 dòng. Thêm vào JSON thì phải sửa schema thư viện (`library.ts`) và bộ kiểm thư viện, mà không được gì thêm.
- **Chỉ tiêu băm từ id tin (FNV-1a), không lấy từ `rng` của bộ sinh.**
  - Thêm chỉ tiêu không làm lệch phần còn lại của bộ demo.
  - `--targets-only` ra đúng số mà một lần seed đầy đủ sẽ sinh, không phụ thuộc `--seed`.
- **Phân bố lệch về số nhỏ, không rải đều 1–10.** Lịch sử demo chỉ có 0–3 đơn `ACCEPTED` mỗi tin.
  - Bản đầu rải đều: thực tập 2–10, trung bình 6. Chạy thử ra 42/1.417 và chỉ 1 tin đạt, gần như tin nào cũng hiện "0/7".
  - Bản chốt:

    | Loại tin | Phân bố chỉ tiêu |
    | --- | --- |
    | Thực tập | 2–4 là chính, một số đợt 5–10 |
    | Bán thời gian | 1–5 |
    | Toàn thời gian | 1–3 |
    | Hợp đồng | 1–2 |

- **Không để tin có số đã tuyển vượt chỉ tiêu.** Số đã tuyển lớn hơn chỉ tiêu gốc thì nâng chỉ tiêu lên bằng số đã tuyển, để không có tin "Đã tuyển 3/2".
- **`--targets-only` chỉ đổi tin còn chỉ tiêu mặc định 1.**
  - Tin đã được sửa chỉ tiêu thì giữ nguyên. Hiện có `clargedemojob0340` = 2.
  - Câu `UPDATE` lặp lại điều kiện `"hiringTarget" = 1`, nên tin ai đó vừa sửa trong lúc chạy không bị ghi đè.
  - Chạy lại thì không đổi gì thêm.
- **Ghi bằng SQL, không đổi `updatedAt`.** Cùng lý do với `matchScoresAt`.
- **Script in trước số tin đang bật tự mời.** Chỉ tiêu tăng thì lượt tự mời sau sẽ giữ nhiều lời mời hơn (`hiringTarget × H`). Hiện không có tin demo nào bật tự mời.

Kiểm thử:

- `large-demo-generate.test.ts` thêm 2 test:
  - mỗi tin lấy giá trị của loại tin, trọng số cộng lại 100, các giá trị trong 1–10;
  - thực tập dùng ≥ 7 giá trị, trung bình 2,5–4,5;
  - đổi `--seed` không đổi chỉ tiêu của tin chính;
  - nâng chỉ tiêu bằng số `ACCEPTED`, không hạ chỉ tiêu đang cao hơn.
- Cả bộ unit test xanh (464 test). `tsc` sạch cho `src`, `tests` và phần script demo.
- **Chạy thử trên Neon, chỉ đọc** (`--targets-only --dry-run`):
  - 400 tin demo: sẽ đổi 318 tin, giữ 1 tin, 81 tin lấy đúng giá trị 1;
  - chỉ tiêu trung bình: thực tập 3,6, bán thời gian 2,1, toàn thời gian 1,7, hợp đồng 1,4;
  - 303 tin `PUBLISHED`: đã tuyển 45 / chỉ tiêu 926, có 7 tin đạt chỉ tiêu, 3 tin được nâng chỉ tiêu lên bằng số đã tuyển;
  - Mây Xanh: đã tuyển 7 / chỉ tiêu 33 → 7 / 82.
- **Đã ghi lên Neon (có xác nhận):** đổi 318 tin trong 0,9 s. Kiểm lại sau khi ghi:
  - chạy lại `--dry-run` ra 0 tin cần đổi;
  - 400 tin demo có chỉ tiêu 1–10, tổng 1.227;
  - 22 tin ngoài bộ demo vẫn là 1;
  - không tin nào đổi `updatedAt`, không tin nào có số đã tuyển vượt chỉ tiêu;
  - 5 tin "cần chú ý" của Mây Xanh, ví dụ: "Thực tập sinh Phân tích dữ liệu", Phù hợp 23, đã tuyển 0/6.

### Bước 8 — Kiểm thử (2026-11-11)

Các mục đã làm ở bước trước, không làm lại:

| Mục | Đã làm ở |
| --- | --- |
| Unit: xếp "cần chú ý" | bước 5 (`hiring-progress.test.ts`) |
| Unit: chia khúc 1.000, bỏ tin không hiển thị, cache hồ sơ | bước 3 (`match-scores.test.ts`) |
| Nạp lần đầu, thời gian, số dòng | bước 4 (301 s, 131.928 dòng) |
| Tách hàm chấm không đổi điểm | bước 3 (lệch 0 trên 3 tin) |
| Đối chiếu tay số `matched` | bước 2 (CTE) và bước 4 (điểm thật) |

**(a) Kiểm đúng bộ chấm. ĐẠT.** Chỉ đọc, `.claude-workspace/scratch/verify-step8-search.ts`.

- Trang tìm ứng viên được mô phỏng đúng như `searchCandidates`: `searchCandidatePool(50)`, `scorePool` không tính embedding mới, xếp ổn định, lấy 10.
- Phía bảng lấy người bật liên hệ, chưa nộp, chưa có lời mời chặn.
- Trong 311 tin, chỉ có 2 tin có nhóm được tìm ≤ 50 người: `clargedemojob0323` (16 người) và `clargedemojob0345` (9 người). Ở cả 2 tin, top 10 trùng hoàn toàn cả người lẫn điểm.
- Ở 8 tin có nhóm được tìm lớn nhất (518–626 người), cả 10 người trang tìm ứng viên trả về đều có cùng điểm trong bảng (10/10). Không có ngoại lệ `semanticPending`.

**(b) Mức bỏ sót của `LIMIT 50`** (chỉ ghi số). 8 tin trên, ngưỡng 80:

| Tin | Pool bảng | Nhóm được tìm | Phù hợp | Phù hợp chưa nộp, được tìm | Ngoài nhóm 50 | Top 10 bảng ∩ top 10 tìm | Điểm thứ 10 bảng / tìm |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `clargedemojob0343` | 882 | 626 | 19 | 17 | 2 | 9/10 | 85 / 85 |
| `clargedemojob0085` | 882 | 623 | 16 | 14 | 1 | 9/10 | 82 / 82 |
| `clargedemojob0099` | 882 | 622 | 22 | 18 | 1 | 9/10 | 88 / 87 |
| `clargedemojob0076` | 882 | 621 | 15 | 14 | 1 | 9/10 | 83 / 82 |
| `clargedemojob0090` | 882 | 620 | 21 | 20 | 2 | 9/10 | 88 / 86 |
| `clargedemojob0133` | 713 | 520 | 3 | 3 | 1 | 6/10 | 70 / 67 |
| `clargedemojob0193` | 718 | 520 | 16 | 12 | 0 | 10/10 | 81 / 81 |
| `clargedemojob0372` | 718 | 518 | 19 | 16 | 0 | 10/10 | 90 / 90 |

Nhận xét:

- Lọc thô theo số kỹ năng chung giữ được phần lớn người điểm cao. Trong số người phù hợp mà trang tìm ứng viên được phép thấy, chỉ 0–2 người mỗi tin nằm ngoài nhóm 50 (tổng 8/114, ≈ 7%).
- Khi có bỏ sót thì thường chỉ lệch một người ở top 10. Điểm thứ 10 của trang tìm ứng viên thấp hơn bảng 0–3 điểm.
- Riêng `clargedemojob0133` (chỉ 3 người phù hợp) lệch 4/10 ở top 10. Trong 4 người lệch:
  - 1 người đạt ngưỡng, chính là người nằm ngoài nhóm 50;
  - 3 người còn lại dưới ngưỡng (điểm thứ 10 của bảng là 70).
- Căn cứ cho 0.6: chuyển trang tìm ứng viên và tự mời sang đọc bảng chủ yếu là để nhanh hơn. Mời đúng người hơn chỉ là lợi ích nhỏ ở quy mô này (≈ 1 người phù hợp bị bỏ sót mỗi tin lớn). Kết luận này chỉ đúng với bộ demo hiện tại (khoảng 1.500 ứng viên). Khi số ứng viên tăng, nhóm 50 sẽ bỏ sót nhiều hơn.

**(c) Đổi ngưỡng 80 → 70. ĐẠT.** `verify-threshold-change.ts`: đổi ngưỡng trong một transaction, đọc qua `MatchScoreRepository` dựng trên chính transaction đó, rồi rollback.

- Tin `clargedemojob0343`: số Phù hợp 19 → 46, khớp đếm tay (46). Số đã nộp giữ là 1.
- `matchScoresAt` không đổi, tức không chấm lại.
- Sau rollback, ngưỡng vẫn là 80, số Phù hợp 19.

**(d) Admin duyệt tin mới. ĐẠT.** Chủ dự án xác nhận ghi.

- Tin `clargedemojob0093` (PENDING) được duyệt bằng `JobPostsService.approve` thật: có `matchScoreTrigger` thật và audit log.
- Thông báo được thay bằng bản giả, vì `.env` đang để `DEV_SKIP_EMAIL_SENDING=false`.
- `approve` mất 2,0 s. **4,2 s** sau khi bắt đầu duyệt thì tin có `matchScoresAt`, 145 dòng điểm, Phù hợp 9, chỉ tiêu 8.
- Outbox giữ 82, thông báo giữ 233.
- Tin này giờ ở trạng thái PUBLISHED trên Neon (303 → 304 tin demo đang hiển thị).

**(e) Tải khi job đêm chạy. ĐẠT: không làm web chậm.** Chủ dự án xác nhận ghi.

Script tạm `load-test-nightly.ts`, đo như 7c của 0.2:

- Một process chạy Express (phần đầu của `main.ts`, đủ router, không bật cron) trên cổng 4999, đồng thời chạy `runMatchScoreNightly` thật (ghi Neon).
- Hai vòng gọi liên tục `GET /api/health` và `GET /api/job-posts?page=1&limit=20`.
- Event loop đo bằng `monitorEventLoopDelay` (resolution 10 ms).

| Tình huống | Thời gian | Event loop p50 / p99 / max | `/api/health` p50 / p95 (số mẫu) | `/api/job-posts` p50 / p95 (số mẫu) | Lỗi |
| --- | --- | --- | --- | --- | --- |
| Nền | 20,3 s | 15,5 / 22,4 / 31,1 ms | 48 / 51 ms (411) | 475 / 507 ms (41) | 0 |
| Job đêm | 291,5 s | 15,3 / 22,6 / 29,7 ms | 48 / 51 ms (5.978) | 485 / 528 ms (591) | 0 |
| Nền lần 2 | 20,4 s | 15,4 / 21,5 / 23,4 ms | 49 / 51 ms (398) | 488 / 510 ms (41) | 0 |

- Lượt đêm: chấm 312/312 tin (gồm tin vừa duyệt ở (d)), không lỗi. Ghi 132.073 dòng, 0 dòng rule-only, nạp 1.523 hồ sơ. Không có tin ẩn nào cần dọn.
- Outbox giữ nguyên 82.
- Event loop và `/api/health` không đổi. `/api/job-posts` chậm thêm khoảng 2–4% (p50 475 → 485 ms, p95 507 → 528 ms), nằm trong mức dao động giữa hai lần đo nền. Job đêm gần như chỉ chờ I/O tới Neon, nên chạy chung process với web là được, không cần tách worker.
- Giới hạn của số đo, giống 7c:
  - máy dev Windows có timer khoảng 15 ms, nên p50 của event loop luôn ≈ 15 ms;
  - client gọi API chạy chung process;
  - không có embedding mới nào phải tính (dữ liệu demo đã tính sẵn). Tính embedding là phần làm tăng event loop ở 0.2, và job đêm giới hạn tối đa 200 embedding mới mỗi khúc 1.000 hồ sơ.

**Build:** `npm run build` của `shared-types` và server đều qua. `tsc --noEmit` của server sạch.

**Kết luận bước 8:** mọi mục đạt. Dữ liệu trên Neon thay đổi so với trước bước 8 ở hai chỗ:

- tin `clargedemojob0093` đã được duyệt;
- bảng điểm đã được chấm lại lúc 09:29–09:34 UTC ngày 2026-11-11.

### Bước 9 — Tài liệu (2026-11-11)

- `FEATURE_BACKLOG.md` dòng 0.3: thêm đường dẫn plan và AD-24, ghi "Backend xong 2026-11-11; frontend (F1–F5) chưa làm" kèm tóm tắt những gì đã có và số đo. Chưa đánh dấu ✅ vì frontend chưa làm.
- AD-24: trạng thái đổi thành "đã triển khai backend"; mục Số đo thêm kết quả kiểm thử của bước 8; mục Ảnh hưởng thêm `JobPost.matchedCount`.

## Phần 4 — Ghi chú của chủ dự án
