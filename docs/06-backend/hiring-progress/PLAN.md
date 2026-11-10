# Số ứng viên phù hợp và tiến độ tuyển theo tin (0.3) — Backend

> **Trạng thái: BẢN NHÁP, CHỜ CHỦ DỰ ÁN DUYỆT (2026-11-10).** Chưa code. Duyệt xong thì bước 0 ghi AD-24 vào `docs/02-architecture/ARCHITECTURE_DECISIONS.md` trước khi làm các bước sau.

Mục 0.3 của `docs/01-project/FEATURE_BACKLOG.md`. Frontend: `docs/05-frontend/phases/hiring-progress/PLAN.md`.

## Mục tiêu

Trả lời câu giáo viên hỏi ở buổi demo 05/11: "tuyển được hay chưa, có bao nhiêu ứng viên phù hợp?".

- Mỗi tin đang hiển thị có số **Phù hợp**: số ứng viên đạt ngưỡng tự mời của tin (`autoOutreachMinScore`, mặc định 80), gồm hai nhóm:
  - người bật cho liên hệ (`isOpenToOutreach`) chưa nộp đơn vào tin;
  - người đã nộp đơn vào tin (đơn chưa huỷ, có chung ≥ 1 kỹ năng với tin), hiện tách số, ví dụ "32 (12 đã nộp)".
- Tiến độ tuyển của mỗi tin: Phù hợp → Đã mời → Nhận lời → Phỏng vấn → Đã tuyển / chỉ tiêu (`hiringTarget`).
- Không chấm hybrid lúc mở trang: điểm lấy từ **bảng điểm lưu sẵn**.

## Các quyết định đã chốt (2026-11-10)

| # | Vấn đề | Chốt |
|---|---|---|
| 1 | "Phù hợp" đếm ai | Hai nhóm ở trên, cùng điều kiện điểm ≥ ngưỡng của tin. Người không bật liên hệ và chưa nộp đơn thì không đếm (không liên hệ được) |
| 2 | Bảng điểm chấm bao nhiêu cặp | Mọi ứng viên có chung ≥ 1 kỹ năng đã duyệt với tin, kể cả người đã nộp đơn. **Không** giới hạn 50 như `searchCandidatePool`. Người đã nộp đơn nhưng không có kỹ năng chung thì **không** chấm (gần như luôn dưới ngưỡng) |
| 9 | "Đã mời" | Mọi lời mời đã gửi cho tin (cả tay lẫn tự động, mọi trạng thái), vì đây là phễu. "Đang giữ" vẫn là việc của thẻ 0.2 |
| 3 | Phỏng vấn / Đã tuyển | Theo trạng thái đơn: `INTERVIEWING` / `ACCEPTED`. Khớp `hiredCount` của thẻ 0.2 |
| 4 | Chỉ tiêu | Dùng thẳng `JobPost.hiringTarget` cho mọi tin, không đổi schema của cột này |
| 5 | Khi nào cập nhật bảng điểm | Khi tin chuyển `PUBLISHED` (tự đăng hoặc Admin duyệt) và một job quét mỗi đêm. Tin đang hiển thị không sửa được nội dung, nên không có lối "sửa tin" |
| 6 | Tự mời của 0.2 đọc từ bảng điểm | **Không** trong 0.3. Làm sau khi 0.6 có chấm lại theo ứng viên (đánh dấu tường minh) |
| 7 | Bảng ở trang tổng quan | 5 tin, cả công ty xem |
| 8 | Lượt xem, tỉ lệ nộp | Chuyển sang `/employer/jobs` (frontend) |

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency. Dùng `node-cron` (đã có), Prisma, `$queryRaw` cho các câu đếm gộp.
- Module mới `apps/server/src/modules/match-scores/`, đăng ký qua awilix như các module khác.
- **Bộ chấm dùng lại nguyên** `CandidateOutreachService.scorePool` (cùng bộ chấm với trang tìm ứng viên và tự mời), để điểm trong bảng khớp điểm nhà tuyển dụng thấy ở trang tìm ứng viên.
- 1 migration viết tay bằng `prisma migrate diff` (bảng mới + 1 cột trên `JobPost`). Xin xác nhận trước khi áp lên Neon. **Không** dùng `--shadow-database-url` trỏ vào DB thật.
- Việc nền chạy chung process (như AD-23 mục 8), nhường lượt cho request web giữa các tin.

### Bản nháp AD-24 (ghi vào `ARCHITECTURE_DECISIONS.md` ở bước 0, sau khi duyệt)

#### AD-24 — Bảng điểm lưu sẵn theo cặp tin–ứng viên (0.3)

- **Bối cảnh:** trang tổng quan cần số ứng viên phù hợp cho mọi tin đang hiển thị. Chấm hybrid mất khoảng 1 giây cho 50 người (số đo ở 0.2), nên không chấm lúc mở trang được.
- **Quyết định:**
  - Bảng `job_candidate_match_scores` lưu điểm mới nhất của từng cặp (tin, ứng viên). Đây là **dữ liệu dẫn xuất**: xoá hết vẫn tính lại được.
  - Ngưỡng điểm, lời mời và đơn **không** lưu trong bảng, mà so lúc đọc. Đổi ngưỡng không cần chấm lại.
  - Cập nhật khi tin chuyển `PUBLISHED`, và bằng job đêm (3h30 giờ Việt Nam) chấm lại mọi tin đang hiển thị.
  - Tự mời (AD-23) vẫn chấm trực tiếp. Chỉ chuyển sang đọc bảng sau khi 0.6 có chấm lại theo ứng viên.
- **Phương án không chọn:**
  - Gắn vào cron 15 phút của 0.2: tăng tải cho lượt tự mời (60 giây chỉ đủ ~38 tin), và một cron phải làm hai việc.
  - Chấm phần thay đổi bằng thời gian sửa của ứng viên: dễ sót, vì sửa kỹ năng không đổi `updatedAt` của ứng viên. Đó là việc của 0.6, bằng đánh dấu tường minh.
  - Chấm lúc mở trang: quá chậm.
- **Ảnh hưởng:** 1 bảng mới, `JobPost.matchScoresAt`, module `match-scores`, 1 cron, sửa `job-posts.service.ts` (gọi lối kích hoạt), 1 endpoint dashboard, mở rộng `AutoOutreachStatus`.

## Phần 2 — Liên kết giữa các phần

```text
JobPostsService.submitForApproval (tự đăng) ─┐
JobPostsService.approve (Admin duyệt) ───────┴─► matchScoreTrigger(jobPostId)   (sau commit, không chờ)
                                                      │
match-score.job.ts (3h30 mỗi đêm) ──────────────► MatchScoreService.rescoreJob(jobPostId)
scripts/rescore-match-scores.ts (chạy tay) ─────┘     │
                                                      ├─ MatchScoreRepository.findScoringPool(jobPostId)   (SQL, không LIMIT)
                                                      ├─ CandidateOutreachService.scorePool(...)           (chia lô)
                                                      └─ MatchScoreRepository.replaceForJob(...)           (1 transaction)

EmployerDashboardService.hiringProgress ──► MatchScoreRepository.progressForCompany(companyId)
AutoOutreachService (GET thẻ của tin)    ──► MatchScoreRepository.progressForJob(jobPostId)
JobPostsService.listOwn                  ──► MatchScoreRepository.matchedCounts(jobIds)   (bước 6, không bắt buộc)
```

- `match-scores` phụ thuộc `candidate-outreach` (bộ chấm). Ngược lại `candidate-outreach` và `dashboard` chỉ đọc qua `MatchScoreRepository`. Không có vòng phụ thuộc: lối kích hoạt là `asValue` resolve lúc gọi, giống `autoOutreachTrigger`.

## Phần 3 — Các bước thực hiện

### Bước 0 — Đo trên Neon (chỉ đọc), ghi AD-24

Chưa biết một tin có bao nhiêu người chung kỹ năng khi bỏ `LIMIT 50`. Trước khi chốt cách chia lô:

- Với 303 tin đang hiển thị: phân bố kích thước pool (min / trung vị / p95 / max) và tổng số cặp. Từ đó ước dung lượng bảng.
- Chấm thử 3 tin (pool nhỏ, trung vị, lớn) bằng script tạm, ghi thời gian.
- Ước thời gian job đêm cho cả 303 tin.

Nếu tổng thời gian ước lượng > 30 phút, hoặc bảng > 50 MB, dừng lại báo chủ dự án trước khi đi tiếp. Đây là số do thiết kế, không có nguồn.

Duyệt xong ghi AD-24 (bản nháp ở Phần 1).

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
  - `matched`: dòng có `score ≥ j."autoOutreachMinScore"` và (ứng viên bật liên hệ **hoặc** có đơn chưa huỷ vào tin);
  - `matchedApplied`: phần có đơn chưa huỷ;
  - `invited`: số lời mời của tin (mọi trạng thái, cả tay lẫn tự động);
  - `acceptedInvitations`: lời mời `ACCEPTED`;
  - `interviewing`: đơn `INTERVIEWING`;
  - `hired`: đơn `ACCEPTED`;
  - kèm `hiringTarget`, `autoOutreachEnabled`, `expiresAt`, `matchScoresAt`, `employerId`, tiêu đề.

### Bước 3 — `MatchScoreService` và lối kích hoạt

- `rescoreJob(jobPostId)`:
  1. Tin không còn `PUBLISHED` thì bỏ qua.
  2. Lấy pool.
  3. Chấm theo lô (cỡ lô chốt ở bước 0, tạm 100), giữa các lô nhường lượt (`await new Promise(setImmediate)`).
  4. Ghi bằng `replaceForJob`.
- Giới hạn embedding mới mỗi tin: hằng số `MATCH_SCORE_MAX_NEW_EMBEDDINGS` (tạm 200, chốt ở bước 0). Người vượt giới hạn có điểm rule-only, `semanticPending = true`, và được chấm lại ở lượt đêm sau.
- Chống chạy trùng cùng một tin: `Set<jobPostId>` trong bộ nhớ (một process, AD-23 mục 8). Tin đang chấm thì lượt gọi sau bỏ qua.
- `matchScoreTrigger: (jobPostId) => void` đăng ký bằng `asValue`, gọi `rescoreJob` không chờ, lỗi chỉ ghi log.
- `job-posts.service.ts`: gọi `matchScoreTrigger(id)` ngay cạnh hai chỗ đang gọi `autoOutreachTrigger` (dòng ~298 tự đăng, ~356 Admin duyệt). Khác 0.2: gọi **mọi** tin vừa hiển thị, không chỉ tin bật tự mời.

### Bước 4 — Job đêm và script chạy tay

- `match-score.job.ts`: `cron.schedule("30 3 * * *", …, { timezone: "Asia/Ho_Chi_Minh" })`, sau job dọn nhật ký lúc 3h.
  - Không chạy chồng.
  - Xoá dòng của tin hết hiển thị.
  - Chấm lần lượt mọi tin `PUBLISHED`, `matchScoresAt` cũ nhất (hoặc null) trước.
  - Giới hạn thời gian mỗi lượt `MATCH_SCORE_NIGHTLY_BUDGET_MS` (tạm 45 phút). Hết thời gian thì dừng; các tin chưa chấm có `matchScoresAt` cũ nhất nên đêm sau được chấm trước.
  - Ghi log tổng: số tin, số dòng, thời gian, số embedding mới.
- `scripts/rescore-match-scores.ts` + `npm run rescore-match-scores --workspace=apps/server`:
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
- Sửa thư viện `scripts/data/large-demo/` để tin mới sinh có chỉ tiêu 1–10 (theo cấp bậc tin).
- Thêm tuỳ chọn `--targets-only` cho `seed-large-demo` để gán lại chỉ tiêu cho các tin `@large-demo.local` hiện có, không đụng dữ liệu khác.
- Xin xác nhận trước khi ghi lên Neon.

### Bước 8 — Kiểm thử

- **Unit** (`apps/server/tests/unit/`):
  - hàm xếp "cần chú ý";
  - hàm chia lô;
  - quy tắc bỏ qua tin không `PUBLISHED`.
- **Trên Neon** (chỉ đọc trước, xin xác nhận trước khi ghi):
  - nạp lần đầu bằng script, ghi thời gian và số dòng;
  - với 2–3 tin, đối chiếu tay: số `matched` khớp với số người đạt ngưỡng nếu chấm trực tiếp toàn pool;
  - top 10 của bảng khớp trang tìm ứng viên (cùng điểm, trừ người đã mời hoặc đã nộp);
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

Điền khi làm.

## Phần 4 — Ghi chú của chủ dự án
