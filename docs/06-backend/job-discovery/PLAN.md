# Ứng viên thấy nhiều việc phù hợp, xếp theo ưu tiên (0.5) — Backend

> **Trạng thái: ĐÃ LẬP KẾ HOẠCH (2026-11-12). XONG BƯỚC 0 (2026-11-13, chỉ đọc). Q1–Q7 đã chốt. XONG BƯỚC 1 (2026-11-13, đã áp lên Neon). XONG BƯỚC 2 (2026-11-13). XONG BƯỚC 3 (2026-11-13). XONG BƯỚC 4 (2026-11-13). XONG BƯỚC 5 (2026-11-13). XONG BƯỚC 6 (2026-11-13). XONG BƯỚC 7 (2026-11-13). XONG BƯỚC 8 (2026-11-13, kiểm qua gateway 8080). XONG BƯỚC 9 (2026-11-13). BACKEND 0.5 XONG; frontend F1–F6 ở `docs/05-frontend/phases/job-discovery/PLAN.md`.** Hướng đã chốt ở AD-26 trong buổi trao đổi với chủ dự án ngày 2026-11-12. Kết quả đo ở "Ghi chú triển khai".

Mục 0.5 của `docs/01-project/FEATURE_BACKLOG.md`. Quyết định kiến trúc: AD-26 (sửa một phần AD-14). Frontend: `docs/05-frontend/phases/job-discovery/PLAN.md`. Nền:
- AD-24 (bảng điểm `job_candidate_match_scores`, lối chấm (a) khi tin được đăng);
- AD-14 và `docs/06-backend/candidate-insights/PLAN.md` ("Việc làm phù hợp", trợ lý hồ sơ, D6/D8/D10/D11);
- AD-8 (outbox email), AD-16 (`dedupeKey`, `notifyOnce`);
- AD-25 (mẫu cron hằng ngày / hằng tuần, chặn thư trong lượt kiểm).

## Mục tiêu

Trả lời nhận xét của giáo viên ở buổi demo 05/11 khi đổi sang vai ứng viên: chỉ thấy 1 tin phù hợp; không biết vì sao tin này hợp hơn tin kia; hệ thống không tự làm gì.

- "Việc làm phù hợp" lấy mọi tin đang hiển thị có điểm, xếp theo điểm, có "Xem thêm", loại tin đã ứng tuyển hoặc đã được mời, mỗi thẻ có lý do theo từng tiêu chí.
- `/jobs` có điểm phù hợp cho ứng viên đăng nhập, sắp "Phù hợp nhất", tổng số kết quả, phân trang, bộ lọc mới.
- Có tin mới phù hợp thì hệ thống tự báo (trong ứng dụng ngay, email gộp mỗi ngày).
- Ứng viên chưa có kỹ năng được nhắc một lần.
- Độ hoàn thiện hồ sơ tính bằng code, luôn có, không gọi LLM.

## Các quyết định đã chốt (2026-11-12)

Tóm tắt từ AD-26; chi tiết và lý do ở AD-26.

| # | Quyết định |
|---|---|
| D1 | "Việc làm phù hợp" đọc bảng điểm, bỏ giới hạn 30 ngày, phân trang. Chấm đầy đủ lại các tin của trang đang trả để có lý do và điểm mới nhất. |
| D2 | Ứng viên chưa có dòng nào trong bảng điểm thì dùng đường chấm trực tiếp hiện có (bỏ giới hạn 30 ngày). |
| D3 | Loại tin có đơn ở mọi trạng thái trừ `CANCELLED`; loại tin có lời mời `PENDING` / `ACCEPTED` / `DECLINED` cho chính ứng viên. |
| D4 | Địa điểm chỉ để lọc, không vào công thức chấm. |
| D5 | `GET /job-posts` dùng `optionalAuthenticate`; khách nhận kết quả như cũ; ứng viên có thêm điểm, đã lưu, đã ứng tuyển, `sort=match`, lọc "phù hợp với tôi" (≥ 70). |
| D6 | Bộ lọc mới: kinh nghiệm yêu cầu, lương rõ / thoả thuận, kỹ năng có-ít-nhất-một / đủ-tất-cả, từ khoá tìm cả tên kỹ năng, tổng số. **Không** lọc ngày đăng, sắp hết hạn (chủ dự án bỏ 2026-11-12). |
| D7 | Job alert sinh ngay sau lối (a) của AD-24, ngưỡng max(`autoOutreachMinScore`, 70), mỗi cặp một lần (`job_alerts`), không sinh từ lượt đêm. |
| D8 | Trong ứng dụng: một thông báo `JOB_ALERT` mỗi ứng viên mỗi ngày, tin sau cập nhật thông báo đó. Email: gộp mỗi ngày 8h giờ Việt Nam. |
| D9 | Job alert bật sẵn; ba công tắc trên `Candidate`: bật job alert, bật email job alert, chỉ thành phố của tôi. |
| D10 | Nhắc một lần `PROFILE_SKILLS_REMINDER` (kèm email) cho tài khoản ≥ 24 giờ chưa có kỹ năng. |
| D11 | Độ hoàn thiện: endpoint riêng, tám mục chia theo hậu quả khi thiếu (AD-26 mục 8), kèm "Nên làm trước" theo từng ứng viên, chỉ để hiển thị. |
| D12 | Backend của "Phân tích hồ sơ" giữ nguyên (frontend chỉ hiện phần LLM). |

## Câu hỏi đã chốt (2026-11-13)

- **Q1 — "Đã ứng tuyển" trên `/jobs`:** tính mọi trạng thái trừ `CANCELLED` (gồm `JOB_CLOSED`, `REJECTED`), cùng quy tắc D3.
- **Q2 — Độ hoàn thiện:** tám mục chia theo hậu quả khi thiếu (AD-26 mục 8): kỹ năng 30, CV 15, bật cho liên hệ 10, **kinh nghiệm 15**, dự án 10, **tiêu đề/giới thiệu 5**, học vấn có chọn ngành 10, thành phố 5. Kèm "Nên làm trước" theo từng ứng viên. Bộ cũ (40/25/25/10 chia lại) bị bỏ vì không bám vào cách hệ thống chấm. Kinh nghiệm 15 và tiêu đề/giới thiệu 5 chỉnh theo nguồn NACE ở Q6 (2026-11-13).
- **Q3 — Nhóm kinh nghiệm cho bộ lọc:** "Không yêu cầu" (`null` hoặc 0), "Dưới 1 năm" (0 < x < 1), "1–2 năm" (1 ≤ x ≤ 2), "Trên 2 năm" (x > 2). Giữ cả bốn nhóm dù bước 0 thấy "Trên 2 năm" hiện có 0 tin (Q5).
- **Q4 — Mặc định chế độ kỹ năng:** đổi thành "có ít nhất một"; vẫn chọn lại được "đủ tất cả".
- **Q5 — Nhóm "Trên 2 năm" đang trống (chốt 2026-11-13):** giữ bốn nhóm như Q3. Bộ lọc ra 0 tin ở nhóm này thì trang hiện trạng thái "không có tin" như mọi bộ lọc khác.
- **Q6 — Trọng số theo nguồn NACE (chốt 2026-11-13):** kinh nghiệm 10 → 15, tiêu đề/giới thiệu 10 → 5 (đã ghi vào Q2).
- **Q7 — Tài khoản demo cho thẻ độ hoàn thiện (chốt 2026-11-13):** `ung-vien-0248@large-demo.local` (định hướng Backend JavaScript; có đủ mọi mục trừ kinh nghiệm ⇒ 85%; 4/10 tin hợp nhất yêu cầu kinh nghiệm; 54 tin điểm ≥ 20, cao nhất 87). Dự phòng: `ung-vien-0599@large-demo.local` (150 tin, 5/10 tin yêu cầu kinh nghiệm). Không sửa hồ sơ trưng bày. Đo ngày 2026-11-13; dữ liệu đổi (seed lại, lượt đêm) thì chọn lại bằng cùng tiêu chí.

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency. Dùng lại: Prisma (`$queryRaw` cho câu đọc bảng điểm theo ứng viên và `sort=match`), `node-cron` như các cron sẵn có trong `main.ts`, awilix.
- Bộ chấm: dùng lại `JobMatcher` hybrid và `MatchEmbeddingService` của `job-matching`. Không đổi trọng số, không đổi `weightsVersion`.
- Thông báo: dùng lại `NotificationsService.notify` / `notifyOnce`, outbox (AD-8), `realtimeNotifier`. Thêm một lối "tạo hoặc cập nhật theo `dedupeKey`" cho thông báo gộp theo ngày.
- Email gộp: tạo `OutboxEvent` kiểu `NOTIFICATION_EMAIL` sẵn có (payload `to`, `subject`, `html`, `notificationType`), worker outbox không đổi.
- Migration viết tay như 0.3/0.4. **Không** dùng `--shadow-database-url` trỏ DB thật.

## Phần 2 — Liên kết giữa các phần

```
Ứng viên mở "Việc làm phù hợp"
  GET /candidate/job-recommendations?cursor=
    JobRecommendationService.listForCandidate
      ├─ JobRecommendationRepository.findScoredPage  ── job_candidate_match_scores ⋈ job_posts (đang hiển thị)
      │                                                 trừ tin có đơn / lời mời (D3)
      ├─ (không có dòng nào) → đường chấm trực tiếp cũ, bỏ 30 ngày (D2)
      ├─ chấm hybrid lại các tin của trang → MatchResult (lý do)
      └─ buildCodeSuggestions(items) → SKILL_GAP / INDUSTRY_MISMATCH (chỉ trang đầu)
  CandidateInsightsService.generate → getTopMatches → cùng lối trên (limit 10)

Ứng viên mở /jobs
  GET /job-posts (optionalAuthenticate)
    JobPostsService.searchPublic
      ├─ khách: như cũ + bộ lọc mới + total
      └─ ứng viên: + viewer {matchScore, saved, applied}, sort=match, minMatch (D5)

Tin chuyển PUBLISHED
  JobPostsService → MatchScoreService.trigger(jobId)          (đã có, AD-24 lối a)
    rescoreJob xong → JobAlertService.onJobScored(jobId)      (mới)
      ├─ chọn ứng viên: điểm ≥ max(X, 70), bật alert, không đơn/lời mời, (cùng thành phố)
      ├─ INSERT job_alerts ON CONFLICT DO NOTHING
      └─ NotificationsService.upsertDaily("JOB_ALERT", …)  → realtime

Cron 8h hằng ngày (giờ VN)
  JobAlertService.sendDailyDigests  → outbox email, đánh dấu emailedAt
  JobAlertService.sendSkillsReminders → notifyOnce PROFILE_SKILLS_REMINDER

GET /candidate/profile-completeness   → CandidateInsightsService.completeness (code, không LLM)
GET/PATCH /candidate/job-alert-settings → JobAlertService
```

`job-alerts` phụ thuộc `match-scores` (đọc bảng), `notifications`; `match-scores` gọi `job-alerts` qua một callback đăng ký trong composition root (tránh phụ thuộc vòng), như cách `job-posts` gọi lối (a).

## Phần 3 — Các bước thực hiện

### Bước 0 — Đo và kiểm trên Neon (chỉ đọc)

1. `EXPLAIN ANALYZE` câu lấy dòng điểm theo `candidateId` (có và không có điều kiện loại đơn / lời mời), với 5 ứng viên trưng bày của bộ `large-demo`. Bảng hiện chỉ có index `(jobPostId, score)` → dự kiến quét cả bảng (~132k dòng); xác nhận cần index `(candidateId, score DESC)`.
2. Phân bố số tin có điểm theo ứng viên (trung vị, p90, số người 0 dòng), và số tin ≥ 70 / ≥ 80 theo ứng viên, để biết "Xem thêm" có ý nghĩa và job alert sẽ báo bao nhiêu.
3. Thời gian chấm hybrid lại 10 và 20 tin cho một ứng viên (chọn kích thước trang).
4. `/job-posts` hiện tại: p50/p95 của khách với vài bộ lọc, làm mốc so sánh ở bước 8.
5. Phân bố `minExperienceYears`, `isNegotiable`, tin có `salaryMin/Max` trong 303 tin đang hiển thị (chốt Q3).
6. Ước khối lượng job alert: với 20 tin `PUBLISHED` gần nhất, số ứng viên đạt max(X, 70) mỗi tin, trừ đơn / lời mời; số ứng viên nhận ≥ 2 tin trong một ngày nếu duyệt cùng lúc.
7. Số ứng viên chưa có kỹ năng, chia theo tuổi tài khoản (≥ 24 giờ), để biết lượt nhắc đầu tiên gửi bao nhiêu thư.
8. Phân bố độ hoàn thiện theo tám mục của Q2 trên ứng viên thật và ứng viên demo; với 5 ứng viên trưng bày, "Nên làm trước" ra mục nào và số tin làm bằng chứng.
9. Tìm nguồn (tài liệu chính thức hoặc khảo sát) về việc nhà tuyển dụng thực tập xem gì trước trong hồ sơ, để ghi trích dẫn cho Q2 như AD-25 đã làm. Không tìm được thì ghi rõ "số do thiết kế".

Kết quả ghi vào "Ghi chú triển khai". Nếu số đo bác một quyết định (ví dụ chấm lại 10 tin quá chậm) thì dừng và hỏi chủ dự án.

### Bước 1 — Schema và migration

- `NotificationType`: thêm `JOB_ALERT`, `PROFILE_SKILLS_REMINDER`.
- `Candidate`: `jobAlertEnabled Boolean @default(true)`, `jobAlertEmailEnabled Boolean @default(true)`, `jobAlertSameCityOnly Boolean @default(false)`.
- Bảng `job_alerts` (`JobAlert`): `candidateId`, `jobPostId`, `score Int` (điểm lúc báo), `createdAt`, `emailedAt DateTime?`. Khoá chính `(candidateId, jobPostId)`; index `(emailedAt, createdAt)` cho cron email; cascade khi xoá tin / ứng viên.
- Index `(candidateId, score DESC)` trên `job_candidate_match_scores` (bước 0 chốt giữ: lần lạnh 230 ms, quét khoá chính theo cột thứ hai tăng theo cỡ bảng).
- Migration viết tay, chạy `prisma migrate deploy`; ghi số dòng / thời gian tạo index.

### Bước 2 — "Việc làm phù hợp" đọc bảng điểm

- `JobRecommendationRepository.findScoredPage(candidateId, { offset, take })`: câu SQL trên `job_candidate_match_scores` ⋈ `job_posts` (điều kiện `VISIBLE_JOB` dùng lại từ `match-score.repository.ts`), trừ tin theo D3 (`NOT EXISTS` trên `applications`, `candidate_outreach_invitations`), sắp `score DESC, publishedAt DESC, id`, kèm tổng số dòng. Ngưỡng tối thiểu giữ `MIN_RECOMMENDATION_SCORE = 20`.
- Phân trang bằng offset (`cursor` là số nguyên mã hoá chuỗi) vì thứ tự theo điểm không ổn định với cursor theo id. Kích thước trang 10 (bước 0 mục 3: chấm 10 hay 20 tin đều ~650 ms; một trang ≈ 0,8 giây).
- `JobRecommendationService.listForCandidate(candidateId, { cursor })`:
  - có dòng → nạp hồ sơ ứng viên một lần, nạp `JobMatchProfile` của các tin trên trang, chấm hybrid (cùng `rescoreHybrid` hiện có), **sắp lại trong trang** theo điểm vừa chấm;
  - không có dòng nào → đường cũ (`findCandidatePool` + rule + hybrid), bỏ điều kiện `publishedSince`, áp D3, chỉ một trang (không "Xem thêm"), trả `source: "LIVE"`.
  - trang đầu kèm `suggestions = buildCodeSuggestions(items)` (chuyển hàm từ `candidate-insights` sang chỗ dùng chung hoặc gọi qua import, không chép).
- `getTopMatches(candidateId, { limit, minScore })` gọi lối mới (trang đầu, `limit`) để trợ lý hồ sơ cùng danh sách.
- Xoá hằng `RECOMMENDATION_RECENT_DAYS` chỉ khi không còn chỗ dùng.
- API: `GET /candidate/job-recommendations?cursor=` trả `{ status, source: "TABLE" | "LIVE", total, items, nextCursor, suggestions }`. Giữ `status: "INSUFFICIENT_PROFILE"` khi chưa có kỹ năng.

### Bước 3 — Độ hoàn thiện hồ sơ

- `GET /candidate/profile-completeness` trong module `candidate-insights`: `{ score, items: [{ key, done, weight, group }], nextStep: { key, evidence: { jobCount, ofJobs } | null } | null }`. `group` là `GATE` / `MATCH` / `FILTER`. Nhãn, lợi ích và link do frontend giữ (theo `key`), để server không chứa chữ giao diện.
- **Tám mục và trọng số theo Q2**, đặt trong `candidate-insights.config.ts`, thay `COMPLETENESS_WEIGHTS` cũ. Cách tính "đã có":
  - `skills`: có ít nhất một kỹ năng;
  - `cv`: có ít nhất một CV;
  - `outreach`: `isOpenToOutreach = true`;
  - `experience`: có ít nhất một kinh nghiệm làm việc;
  - `projects`: có ít nhất một dự án;
  - `headlineOrBio`: tiêu đề hoặc giới thiệu không rỗng;
  - `educationMajor`: có học vấn **có `majorId`** (học vấn không chọn ngành không tính, vì bộ chấm không so khớp được);
  - `city`: có `cityId`.
- Tám mục tính bằng một câu đọc riêng (đếm quan hệ, không nạp cả hồ sơ). **Không** sửa `CandidateMatchProfile.completeness`: bốn cờ đó còn dùng để tính độ tin cậy của bộ chấm, thêm cờ sẽ đổi độ tin cậy.
- **`nextStep`** (hàm thuần, test được không cần DB):
  1. thiếu `skills` → `skills`, không có bằng chứng;
  2. ngược lại, lấy `MatchResult` của trang đầu "Việc làm phù hợp" (gọi `getTopMatches`, limit 10); đếm số tin có `experience.status = "UNKNOWN"` (tin yêu cầu kinh nghiệm, hồ sơ chưa có) và số tin có `education.status = "UNKNOWN"` (tin ghi ngành, hồ sơ chưa chọn ngành); mục nào ≥ 3 tin (dùng lại `SKILL_GAP_MIN_JOBS`) và nhiều tin hơn thì chọn, kèm `{ jobCount, ofJobs }`;
  3. không có → mục còn thiếu có trọng số cao nhất, hoà thì theo thứ tự trong bảng Q2;
  4. đủ cả tám mục → `null`.
- Bước 0 đo thời gian của endpoint (phần lớn là `getTopMatches`); nếu quá ~1 giây thì frontend gọi riêng, không chặn hiện thanh %.
- `generate()` của phân tích vẫn ghi `completenessScore` bằng hàm mới (không đổi cột).

### Bước 4 — `GET /job-posts` theo người xem, sắp theo điểm, bộ lọc mới

- Route: thêm `optionalAuthenticate(container)`. Chỉ vai trò `CANDIDATE` mới có phần theo người xem; vai trò khác coi như khách.
- Query schema thêm: `experience` (`none` | `lt1` | `1to2` | `gt2`), `salaryKind` (`disclosed` | `negotiable`), `skillMode` (`any` | `all`, mặc định theo Q4), `sort` (`newest` | `match`), `minMatch` (chỉ nhận `70`, cần token ứng viên; khách gửi thì bỏ qua).
- `q` tìm thêm trong tên kỹ năng `APPROVED` của tin.
- `total`: `count` cùng điều kiện; thêm trường không bắt buộc `total` vào `PaginatedResponse` (không phá chỗ dùng cũ).
- `sort=match` hoặc `minMatch`: lấy id bằng `$queryRaw` (LEFT JOIN `job_candidate_match_scores` của ứng viên, tin không có điểm xếp cuối), phân trang offset; nạp tin theo id như `findPublicByIds`. `sort=newest` giữ đường Prisma + cursor hiện có.
- Mỗi tin trả thêm `viewer?: { matchScore: number | null; saved: boolean; applied: boolean }` khi có token ứng viên: một câu đọc điểm, một câu đọc `saved_jobs`, một câu đọc `applications` (D3) cho id của trang.
- Không đổi `GET /job-posts/:id`.

### Bước 5 — Job alert

- Module `apps/server/src/modules/job-alerts/`: `job-alert.repository.ts`, `job-alert.service.ts`, `job-alerts.config.ts` (sàn 70, giờ cron, số tin tối đa mỗi email = 10), `job-alerts.routes.ts`, `job-alerts.module.ts`.
- `onJobScored(jobPostId)`: gọi sau khi `MatchScoreService.rescoreJob` trả `SCORED` **từ lối (a)** (không từ `rescoreAll`). Một câu `INSERT INTO job_alerts … SELECT … ON CONFLICT DO NOTHING RETURNING candidateId` chọn ứng viên theo D7/D9/D3; với mỗi ứng viên mới được chèn, gọi `notifications.upsertDaily`. Lỗi ở đây chỉ ghi log, không làm hỏng lượt chấm.
- `NotificationsService.upsertDaily(type, userId, data, dedupeKey)`: nếu chưa có thông báo với `dedupeKey` thì `notify` như thường (không email, `email: null` trong template); nếu có thì cập nhật `title`, `body`, `link`, đặt lại chưa đọc, cập nhật `createdAt` để lên đầu danh sách, đẩy realtime. Khoá `job-alert:<candidateId>:<YYYY-MM-DD giờ VN>`. Số tin trong ngày đếm từ `job_alerts` (không lưu trong thông báo).
- Template `JOB_ALERT`: "N tin mới phù hợp với bạn" kèm tên tin mới nhất; link `/recommended-jobs`. Nhóm thông báo: thêm nhóm phía ứng viên phù hợp trong `notification-groups.ts`.
- API cài đặt: `GET` / `PATCH /candidate/job-alert-settings` (`{ enabled, emailEnabled, sameCityOnly }`), validate bằng zod như các route khác. `sameCityOnly` bật khi ứng viên chưa có thành phố thì trả lỗi 400 có mã, để frontend nhắc điền thành phố.

### Bước 6 — Email gộp, nhắc một lần, cron, script

- `sendDailyDigests()`: lấy `job_alerts` có `emailedAt IS NULL` của ứng viên bật email, nhóm theo ứng viên; bỏ tin không còn hiển thị; mỗi ứng viên một `OutboxEvent` liệt kê tối đa 10 tin (điểm cao trước), rồi đặt `emailedAt` cho mọi dòng đã xét (kể cả dòng bị bỏ) trong cùng transaction với outbox.
- `sendSkillsReminders()`: ứng viên có tài khoản ≥ 24 giờ, đã xác thực, không bị khoá, chưa có kỹ năng → `notifyOnce("PROFILE_SKILLS_REMINDER", …, "profile-skills-reminder:<candidateId>")` (template có email, link `/profile`).
- Cron `0 8 * * *` giờ Việt Nam trong `main.ts` chạy hai hàm trên, theo mẫu cron của 0.4 (khoá chống chạy chồng, log thời gian).
- Script `npm run job-alerts --workspace=apps/server`: `--dry-run` (in số ứng viên / thư sẽ gửi, không ghi), `--digest`, `--reminders`, `--job <id>` (chạy `onJobScored` cho một tin, để demo); chặn tham số lạ như `process-applications`.

### Bước 7 — `packages/shared-types`

- `JobRecommendationList` thêm `source`, `total`, `nextCursor`, `suggestions`.
- `JobPostViewerInfo`, `JobPost.viewer?`, `PaginatedResponse.total?`, `JobPostSearchQuery` thêm các trường của bước 4.
- `ProfileCompleteness`, `ProfileCompletenessKey`.
- `JobAlertSettings`.
- `NotificationType` thêm hai giá trị; payload tương ứng.

### Bước 8 — Kiểm thử

Chặn toàn bộ thư trong các lượt kiểm như 0.4 (outbox không gửi ra ngoài cho tài khoản demo).

1. "Việc làm phù hợp" với 5 ứng viên trưng bày: > 10 tin, "Xem thêm" ra tiếp, không có tin đã ứng tuyển / đã được mời, điểm trang đầu khớp điểm nhà tuyển dụng thấy ở trang tìm ứng viên cho cùng cặp (hồ sơ không đổi từ lượt đêm).
2. Ứng viên mới tạo, thêm kỹ năng → đường `LIVE` có kết quả, không giới hạn 30 ngày.
3. Trợ lý hồ sơ: `topJobPostIds` trùng trang đầu "Việc làm phù hợp".
4. `/job-posts`: khách — kết quả và thứ tự như trước bước 4 với cùng bộ lọc cũ (so 10 truy vấn); p50/p95 không tệ hơn mốc bước 0 quá 20%. Ứng viên — `sort=match` đúng thứ tự điểm, `viewer` đúng với đơn / tin đã lưu thật, `minMatch` chỉ còn tin ≥ 70. Từng bộ lọc mới ra đúng tập.
5. Job alert: tạo một tin bằng Mây Xanh, Admin duyệt → trong vài giây có `job_alerts` và thông báo realtime cho ứng viên đạt ngưỡng; duyệt tin thứ hai cùng ngày → cùng thông báo cập nhật thành "2 tin", không có thông báo thứ hai; ứng viên đã ứng tuyển / tắt alert / khác thành phố khi bật lọc thành phố không nhận; chạy lại lối (a) cho cùng tin không báo lại; lượt đêm không sinh báo.
6. Email gộp: `--dry-run` rồi chạy thật với thư bị chặn; mỗi ứng viên một outbox, `emailedAt` được đặt, chạy lại không gửi lại.
7. Nhắc một lần: chạy hai lần, mỗi ứng viên chỉ một thông báo.
8. Độ hoàn thiện: so tay với 4 hồ sơ (đầy đủ; thiếu kinh nghiệm mà nhiều tin hợp nhất yêu cầu kinh nghiệm; có học vấn nhưng không chọn ngành; chưa có kỹ năng). Kiểm `nextStep` ra đúng mục và đúng số tin; độ tin cậy của bộ chấm không đổi so với trước bước 3.
9. `npm run typecheck` / `tsc` sạch ở server, web, shared-types.

### Bước 9 — Tài liệu

- Cập nhật `FEATURE_BACKLOG.md` (0.5 xong, ghi số đo; dòng "Thông báo việc làm mới" ở mục 3 trỏ về 0.5, phần bộ lọc tự lưu vẫn mở; thêm dòng backlog cho hình thức làm việc / cấp bậc / tìm không dấu).
- AD-26: trạng thái và số đo.
- `docs/06-backend/candidate-insights/PLAN.md`: ghi chú D8 (top 10 cố định) và hằng 30 ngày đã thay bởi AD-26.
- FAQ chatbot hỗ trợ: phần frontend làm (F6), backend chỉ sinh lại `faq-index` nếu đổi.

## Rủi ro

- **Sửa API công khai `/job-posts`:** khách chưa đăng nhập dùng nhiều nhất. Giữ nguyên đường Prisma + cursor cho `sort=newest`; đường `$queryRaw` chỉ chạy khi có token ứng viên và `sort=match` / `minMatch`. Bước 8.4 so kết quả và tốc độ.
- **Điểm trên thẻ `/jobs` là điểm lưu trong bảng, còn "Việc làm phù hợp" là điểm vừa chấm:** hai số có thể lệch khi ứng viên vừa sửa hồ sơ (tới lượt đêm). Chấp nhận cho tới 0.6; frontend ghi "điểm cập nhật hằng đêm" ở `/jobs`.
- **Đổi mặc định kỹ năng sang "có ít nhất một" (Q4)** làm đổi kết quả cho ai đã quen bộ lọc cũ; dự án chưa có người dùng thật nên chấp nhận.
- **Thông báo gộp cập nhật `createdAt`:** danh sách thông báo sắp `createdAt DESC`, cursor theo `id` (`notifications.repository.ts`), bảng không có `updatedAt`. Cập nhật `createdAt` đưa thông báo lên đầu đúng ý muốn; người đang cuộn trang thông báo đúng lúc đó có thể thấy thông báo nhảy vị trí, chấp nhận được.
- **Lượt nhắc một lần đầu tiên** gửi cho mọi tài khoản cũ chưa có kỹ năng; bước 0.7 đếm trước, demo dùng thư bị chặn.

## Ngoài phạm vi

- Bộ lọc tìm kiếm tự lưu làm job alert (backlog mục 3).
- Hình thức làm việc, cấp bậc, quy mô công ty (cần cột mới); tìm không dấu; gợi ý khi gõ.
- Chấm lại theo ứng viên khi sửa hồ sơ (0.6); chuyển tự mời sang đọc bảng (0.6).
- Đổi giao diện trang chủ, trang công ty, trang chi tiết tin.
- Đưa địa điểm hay độ hoàn thiện vào điểm phù hợp.

## Ghi chú triển khai

### Bước 0 — kết quả đo trên Neon (2026-11-13, chỉ đọc)

Cách đo: script tạm ngoài repo, một kết nối thẳng tới endpoint Neon (không qua pooler, vì pooler không giữ cài đặt phiên), phiên `READ ONLY`; script tự thử một câu `UPDATE … WHERE false` và dừng nếu câu đó không bị từ chối. Chấm hybrid ở mục 3 đọc cosine sẵn có (`cosinesForCandidate`), không tính embedding mới, để không ghi gì. Server local không chạy, nên mục 4 đo ở tầng repository (`findPublishedForSearch`), không qua HTTP. Thời gian đo từ máy dev tới Neon (Singapore), cùng đường mạng với server dev.

**1. Câu trang đầu theo ứng viên (6 ứng viên trưng bày).**

- Bảng `job_candidate_match_scores` chỉ có khoá chính `(jobPostId, candidateId)` và index `(jobPostId, score)`. Câu lọc theo `candidateId` dùng khoá chính (cột thứ hai) qua bitmap index scan.
- Thời gian thực thi trong Postgres 5–14 ms; một lần lạnh 269 ms (`uv-audit-5`, phần lớn ở index scan 230 ms). Trang đầu + câu đếm tổng, đo từ client: ~110 ms (lần lạnh 242 ms), phần lớn là độ trễ mạng.
- **Giữ index `(candidateId, score DESC)` ở bước 1.** Hiện chưa chậm, nhưng quét khoá chính theo cột thứ hai tăng theo cỡ bảng (0.6 sẽ thêm dòng), và lần lạnh đã 230 ms. Index nhỏ, ghi thêm không đáng kể so với lượt chấm.

**2. Số tin có điểm theo ứng viên** (tin đang hiển thị, đã trừ đơn / lời mời theo D3), 1.523 ứng viên:

| | trung vị | p90 | max |
|---|---|---|---|
| điểm ≥ 20 (vào "Việc làm phù hợp") | 61 | 123 | 218 |
| điểm ≥ 70 | 6 | 14 | — |
| điểm ≥ 80 | 3 | 10 | — |

- 1.417/1.523 ứng viên có hơn 10 tin ⇒ "Xem thêm" có ý nghĩa với gần hết ứng viên. 6 người không có dòng nào (đi đường dự phòng D2).
- 6 ứng viên trưng bày: 48–103 tin (trước đây chỉ thấy 10); quy tắc D3 loại 4–6 tin mỗi người.
- **143/312 tin đang hiển thị (46%) đăng quá 30 ngày** — trước đây "Việc làm phù hợp" không bao giờ xét tới.

**3. Chấm hybrid lại các tin của một trang:** 10 tin và 20 tin cùng ~650 ms (lần đầu 690–1.530 ms). Thời gian gần như không phụ thuộc số tin: phần lớn là các câu nạp hồ sơ ứng viên và tin (nhiều lượt đi về Neon). Một trang "Việc làm phù hợp" ≈ 110 + 650 ≈ **0,8 giây**, nhanh hơn mức 1,36 giây (trung vị) của đường cũ đo ở 0.1. **Chốt cỡ trang 10** (chi phí như nhau, thẻ có lý do khá dài). Điểm vừa chấm trùng điểm trong bảng ở cả 60 cặp (chênh 0) vì hồ sơ trưng bày không đổi từ lượt đêm.

**4. `/job-posts` của khách (mốc cho bước 8.4),** 7 lần mỗi bộ lọc, ở tầng repository:

| Bộ lọc | p50 | max |
|---|---|---|
| không lọc | 542 ms | 1.104 ms |
| `q=react` | 523 ms | 848 ms |
| thành phố | 518 ms | 853 ms |
| lương ≥ 5 triệu | 538 ms | 2.452 ms |
| 2 kỹ năng (đủ tất cả) | 518 ms | 859 ms |
| `q` + thành phố + thực tập | 502 ms | 830 ms |

Khớp số đo HTTP ở AD-24 (p50 475–485 ms). Phần lớn là `jobPostInclude` (nhiều quan hệ) và độ trễ mạng.

**Q4 có số:** với 2 kỹ năng phổ biến nhất, "đủ tất cả" còn **20** tin, "có ít nhất một" ra **158** tin (trên 312).

**5. Cột của 312 tin đang hiển thị:**

- Kinh nghiệm: không yêu cầu 243, dưới 1 năm 37, 1–2 năm 32, **trên 2 năm 0**.
- Lương: thoả thuận 90, có ghi mức 214, cả hai 0, không cả hai 8.
- Không có thành phố: 8.

⇒ Nhóm "Trên 2 năm" của Q3 luôn trống trên dữ liệu hiện tại (xem câu hỏi Q5 bên dưới).

**6. Khối lượng job alert** (20 tin đang hiển thị đăng gần nhất, quy tắc D7 + D3):

- Cả 20 tin đều có ngưỡng 80 (mặc định), nên sàn 70 chưa có tác dụng trên dữ liệu demo.
- Mỗi tin báo cho 0–56 người, trung vị 14; tổng 450 lượt. Nếu ứng viên bật "chỉ thành phố của tôi" thì còn 128 (28%).
- Nếu 20 tin được duyệt cùng ngày: 294 ứng viên nhận báo, **92 người (31%) nhận ≥ 2 tin**, nhiều nhất 5 ⇒ gộp theo ngày (D8) là cần.

**7. Ứng viên chưa có kỹ năng:** **0** (cả 1.500 `large-demo`, 21 `match-demo`, 2 tài khoản khác). Lượt nhắc đầu tiên không gửi thư nào. Để demo phải tạo tài khoản mới.

**8. Độ hoàn thiện theo tám mục (Q2):**

| Nhóm | n | p10 | p50 | p90 | đủ 100% | Thiếu nhiều nhất |
|---|---|---|---|---|---|---|
| `large-demo` | 1.500 | 80 | 90 | 100 | 699 | kinh nghiệm 434, bật liên hệ 422, dự án 230, CV 129 |
| `match-demo` | 21 | 75 | 85 | 85 | 0 | thành phố 21, bật liên hệ 20, kinh nghiệm 8 |
| khác | 2 | 30 | 85 | 85 | 0 | — |

- Câu tính tám mục cho **cả 1.523 ứng viên** mất 234 ms ⇒ cho một người không đáng kể.
- Không ai có học vấn mà thiếu ngành (bộ seed luôn gán ngành).
- **Cả 6 ứng viên trưng bày đủ 100%** ⇒ thẻ độ hoàn thiện ẩn và không có "Nên làm trước" với các tài khoản demo đang dùng. F6 cần thêm một ứng viên còn thiếu mục (xem dưới).
- **"Nên làm trước" trên người thiếu kinh nghiệm** (434 người `large-demo`, 428 có điểm): trong top 10 tin, trung vị 2 tin yêu cầu kinh nghiệm, nhiều nhất 5; **116 người (27%) đạt ≥ 3/10** ⇒ thấy dòng có bằng chứng, 74 người không có tin nào yêu cầu ⇒ theo thứ tự trọng số. Ứng viên không có dòng kinh nghiệm nào được bộ chấm coi là `null` (`UNKNOWN`), không phải 0, nên quy tắc đúng như thiết kế. Không ai có kinh nghiệm chỉ toàn dòng thiếu ngày.

**9. Nguồn cho Q2** (đọc trực tiếp ngày 2026-11-13):

- NACE, *Job Outlook 2022* (bài ngày 07/01/2022, "Employers Prefer Candidates With Work Experience"): mức ảnh hưởng (thang 5) khi chọn giữa các ứng viên mới tốt nghiệp: đã thực tập ở chính công ty 4,4; có kinh nghiệm thực tập cùng ngành 4,3; **ngành học 3,8**; kinh nghiệm làm việc chung 3,7; từng giữ vị trí lãnh đạo 3,6; hoạt động ngoại khoá 3,5; GPA ≥ 3.0: 3,1; trường theo học 2,6. Chỉ hai mục đầu được xếp "ảnh hưởng rất nhiều". https://www.naceweb.org/talent-acquisition/candidate-selection/employers-prefer-candidates-with-work-experience/
- NACE, *Job Outlook 2026 Spring Update* (bài ngày 23/04/2026, 185 nhà tuyển dụng): khi hai ứng viên ngang nhau, nhà tuyển dụng "overwhelmingly choose the candidate who has internship experience"; kỹ năng được tìm nhiều nhất là làm việc nhóm, giải quyết vấn đề, giao tiếp, rồi kỹ năng kỹ thuật. https://naceweb.org/about-us/press/2026/the-high-impact-skills-college-students-should-showcase-on-their-resumes
- Không dùng: bài LinkedIn 2018 về "5 kỹ năng trở lên" (link gốc đã bị gỡ, chỉ còn trang khác chép lại); nghiên cứu eye-tracking 7,4 giây của Ladders (2018) (do một trang việc làm thương mại công bố, không nêu số người tham gia, đã bị phê bình về phương pháp).
- Đây là khảo sát nhà tuyển dụng Mỹ, không phải Việt Nam; dùng làm căn cứ định hướng, không phải số đo trên người dùng của hệ thống.
- **Ý nghĩa với Q2:** nguồn không bác thứ tự giữa các nhóm (kỹ năng, kinh nghiệm, ngành đều là thứ nhà tuyển dụng xem và hệ thống chấm). Trong nhóm "ảnh hưởng điểm", nguồn cho thấy **kinh nghiệm/thực tập nặng hơn** và **ngành học đáng kể**, còn bộ hiện tại để kinh nghiệm, dự án, tiêu đề/giới thiệu, ngành đều 10. Đã chỉnh ở Q6.

**Câu hỏi phát sinh sau bước 0 — đã chốt 2026-11-13** (chi tiết ở mục "Câu hỏi đã chốt" đầu file):

- **Q5:** giữ bốn nhóm kinh nghiệm, kể cả "Trên 2 năm" đang có 0 tin. (Đề xuất gộp thành "Từ 1 năm trở lên" không được chọn.)
- **Q6:** kinh nghiệm 10 → 15, tiêu đề/giới thiệu 10 → 5. Lý do: thực tập/kinh nghiệm là yếu tố nhà tuyển dụng đánh giá cao nhất; tiêu đề/giới thiệu không có trong bảng của NACE và chỉ là một phần văn bản nội dung.
- **Q7:** tài khoản demo `ung-vien-0248@large-demo.local`, dự phòng `ung-vien-0599@large-demo.local`. Chọn bằng một câu đọc trên Neon (cùng cách bảo vệ chỉ đọc): ứng viên sinh thêm (`ung-vien-…`, không phải hồ sơ trưng bày `uv-…`), tài khoản `ACTIVE`, chưa có kinh nghiệm, có đủ bảy mục còn lại, ≥ 3/10 tin hợp nhất yêu cầu kinh nghiệm. Có 8 người đạt (4–5/10 tin); chọn người cùng lĩnh vực CNTT với Mây Xanh để dùng chung kịch bản demo.

### Bước 1 — schema và migration (2026-11-13)

- Trước khi sửa: `prisma migrate status` báo Neon đã áp đủ 36 migration; `migrate diff` từ Neon sang schema ra "empty migration", nên SQL chỉ chứa phần của 0.5.
- `schema.prisma`:
  - `NotificationType` thêm `JOB_ALERT`, `PROFILE_SKILLS_REMINDER`;
  - `Candidate` thêm `jobAlertEnabled` (mặc định `true`), `jobAlertEmailEnabled` (`true`), `jobAlertSameCityOnly` (`false`), quan hệ ngược `jobAlerts`;
  - model `JobAlert` (`job_alerts`): khoá chính `(candidateId, jobPostId)`, `score`, `createdAt`, `emailedAt` null được, index `(emailedAt, createdAt)`, hai khoá ngoại `ON DELETE CASCADE`; quan hệ ngược `jobAlerts` trên `JobPost`;
  - `JobCandidateMatchScore` thêm `@@index([candidateId, score(sort: Desc)])`.
- Migration `20261113120000_add_job_discovery`: SQL sinh bằng `prisma migrate diff --from-schema-datasource --to-schema-datamodel --script` (chỉ đọc cấu trúc Neon, không dùng shadow DB). Gồm 2 câu `ALTER TYPE … ADD VALUE`, 1 câu `ALTER TABLE candidates ADD COLUMN` × 3, 1 bảng, 2 index, 2 khoá ngoại. Không ghi dữ liệu, không câu nào dùng giá trị enum mới.
- Không chạy `prisma format` (lý do như 0.3: căn lại cột ở model khác). `prisma validate` đạt; đã chạy `prisma generate`.
- `tsc` của `apps/server` báo lỗi đúng như dự kiến, chỉ trong module notifications: `notification-groups.ts`, `notification.mapper.ts` (enum Prisma sang `NotificationType` của shared-types), `notification.types.ts` (payload), `notifications.service.ts`, `notification-templates.ts` (thiếu renderer). Hết ở bước 5–7 khi có payload, template và shared-types.
- **Đã áp lên Neon (2026-11-13)** sau khi chủ dự án xác nhận (`npm run db:deploy`). Migration chạy 0,49 s (gồm tạo index trên 132.073 dòng điểm). Kiểm lại bằng kết nối chỉ đọc:
  - hai giá trị enum mới đã có;
  - 1.523/1.523 ứng viên nhận `jobAlertEnabled = true`, `jobAlertEmailEnabled = true`, `jobAlertSameCityOnly = false`;
  - `job_alerts` rỗng, có khoá chính và index `(emailedAt, createdAt)`;
  - `EXPLAIN ANALYZE` câu lấy 11 dòng điểm ≥ 20 của một ứng viên dùng index mới (`Index Scan using job_candidate_match_scores_candidateId_score_idx`), 0,58 ms;
  - `prisma migrate status` báo đủ 37 migration; `migrate diff` ra "empty migration".

### Bước 2 — "Việc làm phù hợp" đọc bảng điểm (2026-11-13)

- `job-recommendation.repository.ts`:
  - `findScoredPage(candidateId, { minScore, offset, take })` trả `{ rows, total }`. Hai câu chạy song song: trang và đếm, cùng điều kiện. Điều kiện gồm `VISIBLE_JOB` (import từ `match-score.repository.ts`), điểm ≥ 20, và `NOT EXISTS` đơn (trừ `CANCELLED`) / lời mời `PENDING`/`ACCEPTED`/`DECLINED`. Sắp `score DESC, publishedAt DESC NULLS LAST, jobPostId`.
  - `hasScoredVisibleJob(candidateId)`: ứng viên có dòng điểm cho ít nhất một tin đang hiển thị, bất kể điểm, đơn hay lời mời. Dùng để quyết định có đi đường LIVE không.
  - `findCandidatePool` bỏ `publishedSince` (bỏ giới hạn 30 ngày), nhận thêm `candidateId` và trừ đơn / lời mời theo D3.
- `job-recommendation.service.ts`:
  - `listForCandidate(candidateId, { cursor })`: trang 10 tin.
  - `getTopMatches` gọi cùng lối đó cho trang đầu, nên trợ lý hồ sơ và "Việc làm phù hợp" ra cùng danh sách.
  - Đường TABLE: chấm rule (và hybrid nếu bật) các tin của trang, rồi sắp lại trong trang. Thứ tự của bảng dùng làm thứ tự hoà (sort ổn định). Tin đã bị xoá thì bỏ qua.
  - `total = 0` và `hasScoredVisibleJob = false` thì đi đường LIVE. Đường này chỉ có một trang; trang sau trả rỗng, không lọc lại.
  - Có dòng điểm nhưng không tin nào qua lọc thì trả danh sách rỗng, không chạy LIVE.
  - Chưa có kỹ năng thì trả `INSUFFICIENT_PROFILE` như cũ.
  - `suggestions = buildCodeSuggestions(items)` chỉ có ở trang đầu. Hàm import từ `candidate-insights/profile-suggestions.util.ts`, không chép. `candidate-insights.service.ts` đổi sang dùng `recommendations.suggestions`, kết quả không đổi.
  - `cursor` là offset dạng chuỗi (`^\d{1,5}$`, tối đa 10.000); sai định dạng thì trả 400 `INVALID_CURSOR`.
  - Nạp hồ sơ chạy song song với câu trang; chấm điểm chạy song song với nạp tin công khai (xem số đo dưới).
  - Đã xoá `RECOMMENDATION_RECENT_DAYS` vì không còn chỗ dùng.
- Controller đọc `?cursor=`, route không đổi. API trả `{ status, source, items, total, nextCursor, suggestions }`.
- `packages/shared-types`: `JobRecommendationList` thêm `source` (`JobRecommendationSource` = `TABLE` | `LIVE`), `total`, `nextCursor`, `suggestions`. Phần này của bước 7 làm luôn ở đây vì server cần kiểu để biên dịch. Đã build lại `dist`; `tsc` web vẫn sạch vì web chỉ đọc `status` và `items`.
- Test `tests/unit/job-recommendation-service.test.ts` có 11 ca: TABLE sắp lại trong trang, `nextCursor`/`total`, gợi ý chỉ ở trang đầu, tin bị xoá, bảng có dòng nhưng rỗng, LIVE một trang, LIVE trang sau, chưa có kỹ năng, 404, `getTopMatches`, hybrid kèm semantic PENDING, cursor sai. Toàn bộ unit test server: 516/516 qua. `tsc` server chỉ còn lỗi notifications đã biết từ bước 1.
- **Kiểm trên Neon (chỉ đọc, chế độ rule để không ghi vector, pool 5 kết nối):**
  - Đối tượng: 6 ứng viên trưng bày `uv-ads-1…6`, hai tài khoản Q7 và ứng viên có nhiều đơn nhất (`ung-vien-0918`).
  - Duyệt hết mọi trang: số tin trả về đúng bằng `total` (54–150), không trùng, không tin nào đã ứng tuyển / được mời; 1–6 tin như vậy mỗi người bị ẩn đúng.
  - Trang sau không có gợi ý; trang đầu có 1–6 gợi ý.
  - `cursor=abc` trả 400.
  - Đường LIVE: lọc thô ra 50 tin trong ~105 ms. Hiện **0 ứng viên có kỹ năng mà đi đường LIVE** (mọi người đều đã có dòng điểm).
- **Thời gian trang đầu** (đo từ máy local tới Neon Singapore, chế độ rule):
  - Tách từng phần: câu trang 55–110 ms, nạp hồ sơ ~350 ms, nạp `JobMatchProfile` ~300 ms, nạp tin công khai ~600 ms. Phần lớn là độ trễ mạng của các câu Prisma nối tiếp nhau.
  - Chạy tuần tự: 1,2–1,7 s (lần lạnh 2,7 s).
  - Sau khi cho các bước độc lập chạy song song: 0,9–1,1 s (lần lạnh 2,1 s).
  - Chế độ hybrid cộng thêm thời gian lấy vector (~650 ms theo bước 0), phần này chạy song song với nạp tin công khai. Ước khoảng 1,3 s, ngang đường cũ (1,36 s ở bước 0) nhưng giờ có phân trang và không giới hạn 30 ngày.
  - Số đo hybrid thật làm ở bước 8, khi server chạy.

### Bước 3 — Độ hoàn thiện hồ sơ (2026-11-13)

- `GET /candidate/profile-completeness` (vai trò `CANDIDATE`) trong `candidate-insights` trả `{ score, items: [{ key, done, weight, group }], nextStep: { key, evidence } | null }`. Không gọi LLM, không tốn hạn mức "Phân tích hồ sơ", tính lại mỗi lần gọi.
- `candidate-insights.config.ts`: `PROFILE_COMPLETENESS_ITEMS` (tám mục, trọng số và nhóm theo Q2/Q6) thay `COMPLETENESS_WEIGHTS`. Thứ tự mảng là thứ tự hoà của "Nên làm trước".
- `profile-completeness.util.ts` (hàm thuần): `buildCompletenessItems`, `computeCompletenessScore`, `pickNextStep`, `needsTopMatchesForNextStep`, `buildProfileCompleteness`. `computeCompletenessScore` cũ trong `profile-suggestions.util.ts` đã chuyển sang đây.
- `CandidateInsightsRepository.loadCompletenessFacts`: một câu Prisma đọc `headline`, `bio`, `cityId`, `isOpenToOutreach` và `_count` các quan hệ. Hai chỗ cần lưu ý:
  - **CV chỉ đếm CV hiện trong "Quản lý CV"** (`isHidden = false`). CV tải lên lúc nộp đơn mà không lưu vào danh sách có `isHidden = true`; ứng viên không chọn lại được CV đó cho đơn sau, nên không tính.
  - Học vấn chỉ đếm dòng có `majorId`.
- **"Nên làm trước" dùng lối nhẹ `JobRecommendationService.getTopMatchResults`** thay vì `getTopMatches` như plan ghi:
  - cùng tập 10 tin của trang đầu (cùng câu `findScoredPage`), chỉ chấm rule, không nạp tin công khai, không lấy vector;
  - "Nên làm trước" chỉ đọc `experience.status` và `education.status`, hai thứ không phụ thuộc thành phần nội dung, nên số đếm giống hệt (đã đối chiếu trên Neon, xem dưới);
  - chỉ chạy khi ứng viên có kỹ năng và thiếu kinh nghiệm hoặc ngành; các trường hợp khác endpoint chỉ có một câu đọc;
  - ứng viên đi đường LIVE thì dùng trang LIVE như `getTopMatches`.
- `generate()` của "Phân tích hồ sơ" ghi `completenessScore` bằng công thức mới (không đổi cột). `CandidateInsightsService` không còn phụ thuộc `CandidateMatchProfileLoader`. `CandidateMatchProfile.completeness` (bốn cờ cho độ tin cậy của bộ chấm) **không đổi**.
- Chatbot hỗ trợ: công cụ `getMyProfileCompleteness` đổi sang tám mục và cùng công thức, đọc qua `loadCompletenessFacts`; nhãn tiếng Việt của tám mục nằm trong công cụ (chatbot là chữ do server sinh). Bỏ `candidateMatchProfileLoader` khỏi `SupportChatToolRegistry` vì không còn chỗ dùng. FAQ `02-ung-vien-ho-so-cv.md` vẫn nói độ hoàn thiện nằm trong "Phân tích hồ sơ"; sửa cùng FAQ ở phía frontend (plan frontend, mục FAQ).
- `packages/shared-types`: thêm `ProfileCompleteness`, `ProfileCompletenessItem`, `ProfileCompletenessKey`, `ProfileCompletenessGroup`, `ProfileCompletenessNextStep` (phần của bước 7, làm luôn để server biên dịch); sửa chú thích `ProfileInsight.completenessScore`. Đã build lại `dist`; `tsc` web vẫn sạch.
- Test: `tests/unit/profile-completeness.test.ts` 12 ca (trọng số, điểm, bốn quy tắc của "Nên làm trước" kể cả hoà và dưới ngưỡng, khi nào cần chấm trang đầu, service, 404); thêm 2 ca `getTopMatchResults` vào `job-recommendation-service.test.ts`. Toàn bộ unit test server: 530/530 qua. `tsc` server chỉ còn lỗi notifications đã biết.
- **Kiểm trên Neon (chỉ đọc, chế độ rule):**
  - Tám cờ của `loadCompletenessFacts` khớp một câu SQL viết tay độc lập ở cả 8 ứng viên kiểm.
  - `ung-vien-0248`: 85%, thiếu kinh nghiệm, "Nên làm trước: kinh nghiệm 4/10" (đúng Q7). `ung-vien-0599`: 85%, "kinh nghiệm 5/10".
  - `uv-ads-2`: 85%, thiếu kinh nghiệm nhưng chỉ 1/10 tin cần ⇒ "kinh nghiệm" không kèm bằng chứng (theo trọng số). Năm hồ sơ trưng bày còn lại: 100%, `nextStep = null`.
  - Số tin `UNKNOWN` đếm qua `getTopMatches` (đường đầy đủ) bằng đúng số của lối nhẹ ở mọi ứng viên.
  - Phân bố điểm mới trên 1.523 ứng viên: trung vị 90, thấp nhất 30, 699 người đủ 100%, khớp bước 0.
  - Trên Neon không có ứng viên chưa có kỹ năng, có học vấn mà không chọn ngành, hay chỉ có CV ẩn, nên ba trường hợp này chỉ kiểm bằng unit test. Bước 8 cần tạo tài khoản thử để kiểm tay.
- **Thời gian** (máy local tới Neon, ấm, 3 lượt × 2 ứng viên Q7):
  - câu tám mục ~50 ms;
  - nạp hồ sơ ~330–390 ms, song song với câu trang ~50 ms;
  - nạp `JobMatchProfile` ~240 ms;
  - cả endpoint **0,61–0,71 s**, lần lạnh 1,2–1,6 s. Đi qua `getTopMatches` là 0,83–1,1 s ở chế độ rule, chậm hơn nữa ở hybrid.
  - Ứng viên không cần bằng chứng (đủ mục, hoặc chỉ thiếu mục khác): ~50 ms.
  - Dưới ngưỡng ~1 giây của plan. Frontend vẫn nên gọi endpoint bằng query riêng (`useProfileCompleteness`) để thẻ có skeleton riêng, không chặn phần còn lại của trang.

### Bước 4 — `GET /job-posts` theo người xem, sắp theo điểm, bộ lọc mới (2026-11-13)

- Route `GET /job-posts` thêm `optionalAuthenticate`. Controller chỉ truyền `userId` vào service khi vai trò là `CANDIDATE`; vai trò khác và khách đi đường cũ. Token sai hoặc hết hạn thì trả 401 như mọi route có xác thực tuỳ chọn. Web hiện gọi `/job-posts` bằng `publicFetch` (không gửi token), nên trang `/jobs` chưa đổi cho tới F2.
- Query schema (`job-posts.dto.ts`): `skillMode` (`any` mặc định theo Q4 | `all`), `experience` (`none` | `lt1` | `1to2` | `gt2`), `salaryKind` (`disclosed` | `negotiable`), `sort` (`newest` mặc định | `match`), `minMatch` (chỉ nhận `"70"`, giá trị khác trả 400).
- `job-post.repository.ts`:
  - `publicSearchWhere(filter)`: một nguồn điều kiện cho cả hai đường. Thêm nhóm kinh nghiệm (`null` hoặc ≤ 0 là "không yêu cầu"), loại lương (`disclosed` = không thoả thuận và có ghi ít nhất một mức), kỹ năng "có ít nhất một" (`some … in`) hoặc "đủ tất cả" (mỗi kỹ năng một `some`, như cũ). `q` tìm thêm trong tên kỹ năng `APPROVED` của tin.
  - `findPublishedForSearch` trả thêm `total` (`count` cùng điều kiện, chạy song song với trang).
  - `findPublishedIdsForSearch`, `findManyWithRelationsByIds` (giữ thứ tự id), `findViewerState` (đã lưu, đã ứng tuyển trừ `CANCELLED`).
  - **Sửa lỗi phân trang có từ trước:** đường cũ chỉ sắp `publishedAt DESC` mà cursor theo id. Seed có nhiều tin cùng `publishedAt`, nên duyệt hết trang bằng code **trước bước 4** ra 311/312 tin; với một số bộ lọc, code mới (chưa sửa) ra tin lặp (`experience=none`: 246 dòng cho 243 tin). Thêm `id DESC` làm thứ tự hoà (`SEARCH_ORDER`) cho cả hai đường. Thứ tự với khách chỉ đổi giữa các tin cùng `publishedAt`.
- `MatchScoreRepository.scoresForCandidate(candidateId, jobPostIds)`: điểm lưu của một ứng viên cho các tin.
- `JobPostsService.search(query, viewerUserId?)`:
  - Khách: như cũ, thêm `total`. Khách gửi `sort=match` / `minMatch` thì bỏ qua.
  - Ứng viên, `sort=newest`, không `minMatch`: đường Prisma + cursor như cũ. Mỗi tin của trang thêm `viewer` qua ba câu đọc chạy song song (điểm, đã lưu, đã ứng tuyển). Tra `candidateId` chạy song song với câu trang.
  - Ứng viên, `sort=match` hoặc có `minMatch`: **khác plan ở cách làm.** Plan ghi một câu `$queryRaw` LEFT JOIN bảng điểm, nhưng như vậy phải viết lại mọi bộ lọc bằng SQL tay, có hai nguồn điều kiện dễ lệch nhau. Cách làm: lấy mọi id qua `publicSearchWhere` (chỉ cột `id`, ~50 ms), ghép điểm của ứng viên, lọc ≥ 70 nếu có `minMatch`, sắp điểm giảm dần (tin chưa có điểm xếp cuối, hoà giữ thứ tự mới đăng; sort ổn định), phân trang offset 20 tin, rồi nạp tin của trang theo id. Cursor của đường này là offset (`parseOffsetCursor`, dùng chung với "Việc làm phù hợp", chuyển sang `shared/utils/offset-cursor.ts`); gửi cursor theo id thì trả 400 `INVALID_CURSOR`. Cách này đọc mọi id qua lọc, hợp với số tin đang hiển thị hiện nay (312); khi lên hàng chục nghìn tin thì chuyển sang SQL.
  - Tài khoản ứng viên chưa có hồ sơ thì như khách.
- `packages/shared-types` (phần bước 7): `PaginatedResponse.total?`, `JobPost.viewer?` (`JobPostViewerInfo`), `JobPostSearchQuery` thêm `skillMode`, `experience`, `salaryKind`, `sort`, `minMatch` và chú thích hai loại cursor; các kiểu `JobPostSkillMode`, `JobPostExperienceFilter`, `JobPostSalaryKind`, `JobPostSort`. Đã build lại `dist`; `tsc` web vẫn sạch.
- **Ảnh hưởng tới web hiện tại trước F2:** bộ lọc kỹ năng ở `/jobs` không gửi `skillMode`, nên từ giờ ra "có ít nhất một" (Q4), không còn "đủ tất cả". Ô tìm kiếm cũng khớp tên kỹ năng.
- Test `tests/unit/job-post-search-viewer.test.ts` 8 ca: khách (đường cũ, `total`, không `viewer`, không tra ứng viên), khách gửi `sort=match` bị bỏ qua, ứng viên `newest` có `viewer`, `sort=match` thứ tự / chưa có điểm xếp cuối / hoà, trang sau theo offset, `minMatch` giữ thứ tự mới đăng, cursor theo id ở đường điểm trả 400, ứng viên chưa có hồ sơ. Toàn bộ unit test server: 538/538 qua. `tsc` server chỉ còn lỗi notifications đã biết.
- **Kiểm trên Neon (chỉ đọc).** Dùng repository bản `HEAD` (trước bước 4) chạy cạnh code mới:
  - **Khách, 10 truy vấn bộ lọc cũ** (kỹ năng gửi `skillMode=all` để giữ nghĩa cũ). Code mới duyệt hết trang ra đúng `total`, không lặp, khớp số đếm thật. Tập của code cũ nằm trọn trong tập mới. Chuỗi `publishedAt` của trang đầu giống hệt code cũ, trừ hai truy vấn có `q`, vì `q` nay khớp cả tên kỹ năng (`react` 23 → 27 tin, `Java` 19 → 57). Không tin nào có `viewer`.
  - **Bộ lọc mới so với SQL viết tay** (duyệt hết trang, so tập id), cả 9 trường hợp khớp: kinh nghiệm 243 / 37 / 32 / 0, thoả thuận 90, có ghi lương 214, hai kỹ năng "ít nhất một" 158, "đủ tất cả" 20, `q=Excel` (chỉ có trong tên kỹ năng) 101. Các số khớp bước 0.
  - **Ứng viên** (`ung-vien-0248`, `uv-ads-1`, `uv-backend-6` có nhiều tin đã lưu nhất): `sort=match` duyệt hết ra đủ 312 tin, không lặp, điểm giảm dần. `viewer` (điểm, đã lưu, đã ứng tuyển) khớp SQL ở mọi tin, ở cả hai đường. `minMatch=70` ra 14 / 15 / 11 tin, đúng bằng số tin đang hiển thị có điểm ≥ 70. Khách gửi `sort=match&minMatch=70` ra đúng như `newest`. `minMatch=50` bị từ chối.
- **Thời gian** (máy local tới Neon, 9 lần mỗi truy vấn):
  - Khách, cả service, p50 549–595 ms (code cũ ở tầng repository 508–565 ms; mốc bước 0 502–542 ms). Câu đếm `total` chạy song song nên gần như không cộng thêm.
  - `q`: câu lọc chỉ ~54 ms. Phần còn lại là nạp đủ quan hệ cho 20 tin. Truy vấn có `q` khớp tên kỹ năng trả nhiều tin hơn nên chậm hơn khi cũ chưa đủ trang (`q=Excel` 737 so với 630 ms; `q=Java` 595 so với 566 ms ở tầng repository). Một lần đo cả service ra `q=Java` 708 ms, nhưng nhiễu mạng ±100 ms giữa các lượt. Bước 8.4 đo lại qua HTTP.
  - Ứng viên `sort=match`: trang đầu 0,84–1,3 s, p50 0,78–0,92 s. Ứng viên `newest` có `viewer`: 0,53–1,07 s (thêm một lượt đi về cho ba câu `viewer` song song).

### Bước 5 — Job alert (2026-11-13)

- **Module `apps/server/src/modules/job-alerts/`:** `job-alerts.config.ts` (sàn 70, giờ VN), `job-alert.repository.ts`, `job-alert.service.ts`, `job-alerts.dto.ts`, `job-alerts.controller.ts`, `job-alerts.module.ts` (đăng ký awilix), `job-alerts.routes.ts` (route cài đặt, gọi đăng ký). Mount trong `main.ts` ngay sau `registerMatchScores`. Hằng giờ cron và số tin tối đa mỗi email thêm ở bước 6, khi có code dùng.
- **Nối với lối (a):** `MatchScoreService` nhận thêm `jobScoredListener` (module job-alerts đăng ký, resolve `jobAlertService` lúc gọi ⇒ không vòng phụ thuộc). Chỉ `trigger()` gọi listener, và chỉ khi `rescoreJob` trả `DONE` (plan ghi `SCORED`; tên thật trong code là `DONE`). `rescoreJob` / `rescoreAll` gọi trực tiếp (lượt đêm, script `rescore-match-scores`) không gọi, nên lượt đêm không sinh báo. Script truyền listener rỗng. Hệ quả nhỏ: lối (a) gặp lúc lượt đêm đang chấm đúng tin đó (`SKIPPED: RUNNING`) thì tin không được báo; chỉ xảy ra khi Admin duyệt tin lúc 03:30–04:15.
- **`JobAlertService.onJobScored(jobPostId)`:**
  - Một câu `WITH inserted AS (INSERT INTO job_alerts … SELECT … ON CONFLICT DO NOTHING RETURNING …)`, nối lại `candidates` để lấy `userId`. Điều kiện: tin đang hiển thị (`VISIBLE_JOB`); điểm ≥ `GREATEST(autoOutreachMinScore, 70)`; `jobAlertEnabled`; bật "chỉ thành phố của tôi" thì `c.cityId = j.cityId` (hồ sơ hoặc tin không có thành phố ⇒ không báo); tài khoản `ACTIVE`; D3 (đơn trừ `CANCELLED`, lời mời `PENDING` / `ACCEPTED` / `DECLINED`). Thêm điều kiện tài khoản `ACTIVE` so với plan: tài khoản bị khoá hay chưa xác thực không đăng nhập được để xem thông báo.
  - Đếm số tin đã báo trong ngày giờ VN cho các người vừa ghi (một câu `groupBy` trên `job_alerts`), rồi mỗi người một `upsertDaily("JOB_ALERT", …, "job-alert:<candidateId>:<YYYY-MM-DD giờ VN>")`. Lỗi thông báo của một người chỉ ghi log rồi đi tiếp; dòng `job_alerts` vẫn còn nên email gộp vẫn liệt kê tin.
  - `trigger()` xếp các lượt vào một hàng đợi trong process: hai tin chấm xong cùng lúc mà chạy song song thì lượt đếm sau có thể ghi đè "N tin" bằng số nhỏ hơn. Lỗi chỉ ghi log, không chặn lượt sau, không làm hỏng lượt chấm.
- **`NotificationsService.upsertDaily(type, userId, data, dedupeKey)`:** chưa có khoá ⇒ `notifyOnce` (tạo, email nếu template có). Có rồi ⇒ thay `title` / `body` / `link`, đặt lại chưa đọc (`isRead=false`, `readAt=null`), `createdAt = now` để lên đầu, đẩy realtime với cùng `id`, không gửi email. Hai lượt cùng tạo một khoá ⇒ bên chậm hơn (P2002) chuyển sang cập nhật. Khoá thuộc người khác ⇒ bỏ qua, ghi log. Repository thêm `findOwnerByDedupeKey`, `refresh`.
- **Template:**
  - `JOB_ALERT`: tiêu đề "N tin mới phù hợp với bạn" (N = tổng trong ngày), nội dung `"<tin>" của <công ty>, phù hợp <điểm>%.`, từ tin thứ hai thêm "Mới nhất: ". Link `/recommended-jobs`, không email.
  - `PROFILE_SKILLS_REMINDER` (dùng ở bước 6, thêm ngay vì `Record<NotificationType, …>` bắt buộc): link `/profile`, có email.
  - Payload trong `notification.types.ts`: `JOB_ALERT { jobPostId, jobPostTitle, companyName, score, todayCount }`, `PROFILE_SKILLS_REMINDER` rỗng.
- **Nhóm thông báo:** phía ứng viên chỉ có bốn nhóm (Hồ sơ, Lịch phỏng vấn, Lời mời, Tài khoản). `JOB_ALERT` vào **Lời mời** (cơ hội việc làm được đưa tới ứng viên), `PROFILE_SKILLS_REMINDER` vào **Tài khoản**. Không thêm nhóm mới để không phải đổi `NotificationGroup` và các tab của web; F5 có thể đổi nếu muốn tab "Việc làm" riêng.
- **API cài đặt:** `GET` / `PATCH /candidate/job-alert-settings` (chỉ `CANDIDATE`). PATCH nhận một phần `{ enabled?, emailEnabled?, sameCityOnly? }`, phải có ít nhất một khoá. Bật `sameCityOnly` khi hồ sơ chưa có thành phố ⇒ 400 `JOB_ALERT_CITY_REQUIRED`. Phản hồi thêm `cityName` (chỉ đọc) so với plan, để F4 ghi "Chỉ tin ở Đà Nẵng" và cảnh báo khi đã bật mà hồ sơ không còn thành phố.
- **`packages/shared-types` (phần bước 7):** `JobAlertSettings`, `UpdateJobAlertSettingsRequest`. `NotificationType` của shared-types **chưa** thêm hai giá trị mới (bước 7), vì web có `Record<NotificationType, …>` ở `lib/notifications.ts` sẽ lỗi tới khi làm F5. Nên `tsc` server còn đúng một lỗi ở `notification.mapper.ts` (enum Prisma có `JOB_ALERT` mà shared-types chưa có); các lỗi notifications khác của bước 1 đã hết. `tsc` web sạch.
- **Test:** `tests/unit/job-alerts.test.ts` 17 ca (ngày giờ VN và khoá; `onJobScored` ghi với sàn 70, đúng khoá, đúng số tin trong ngày, không ai mới, tin không còn, lỗi một người; hàng đợi `trigger`; cài đặt GET / 404 / 400 `JOB_ALERT_CITY_REQUIRED` / bật được khi có thành phố / PATCH rỗng; template; nhóm; `upsertDaily` tạo, cập nhật tại chỗ, ngày khác, tranh chấp tạo, khoá của người khác). `tests/unit/match-scores.test.ts` thêm 3 ca: `trigger` DONE gọi listener một lần; không hiển thị / GONE / lỗi không gọi; `rescoreJob` / `rescoreAll` không gọi. Toàn bộ unit test server: 558/558 qua.
- **Kiểm trên Neon (chỉ đọc, cùng cách bảo vệ như bước 0).** Câu `INSERT` không chạy được trong phiên chỉ đọc nên chưa ghi thử; phần ghi kiểm ở bước 8.5 với Mây Xanh.
  - `EXPLAIN` (không `ANALYZE`) đúng câu của repository: hợp lệ với schema thật, `ON CONFLICT` dùng `job_alerts_pkey`, lấy điểm qua index `(jobPostId, score)`, anti join cho đơn và lời mời qua index của từng bảng.
  - Phần chọn ứng viên của câu repository so với một câu viết lại bằng cách khác (LEFT JOIN chống trùng) trên 20 tin mới nhất: **cùng tập ở cả 20 tin.** Mỗi tin báo 0–56 người, trung vị 14, tổng 450; 294 người nhận, 92 người nhận ≥ 2 tin, nhiều nhất 5; nếu mọi người bật "chỉ thành phố của tôi" còn 128. Khớp đúng số ước ở bước 0 mục 6. 505 cặp đạt điểm trước khi trừ đơn / lời mời; không cặp nào bị loại vì tài khoản không `ACTIVE`.
  - Phiên Neon dùng `TimeZone = GMT`; `Date` gửi qua tham số ra đúng giờ UTC khi đổi sang `timestamp(3)` (như `replaceForJob` đang dùng).
  - Repository đọc đúng: tên tin và công ty; cài đặt của `ung-vien-0248` (Đà Nẵng, bật / bật / tắt) và của một ứng viên chưa có thành phố (`cityName: null`). `job_alerts` và thông báo `JOB_ALERT` đang 0 dòng.

### Bước 6 — Email gộp, nhắc một lần, cron, script (2026-11-13)

- **`job-alerts.config.ts`** thêm `JOB_ALERT_DAILY_CRON = "0 8 * * *"`, `JOB_ALERT_DIGEST_MAX_JOBS = 10`, `SKILLS_REMINDER_MIN_ACCOUNT_AGE_HOURS = 24`.
- **`JobAlertService.sendDailyDigests(now)`:**
  - Lấy ứng viên có dòng `job_alerts` chưa xét (`emailedAt IS NULL`, tạo trước lúc chạy), kèm cờ "gửi được" = bật job alert, bật email, tài khoản `ACTIVE`.
  - **Người không gửi được** (tắt email, tắt alert, tài khoản không còn `ACTIVE`): một câu đánh dấu `emailedAt` cho mọi dòng của họ, không gửi. **Thêm so với plan:** plan chỉ lấy người bật email, nên dòng của người tắt email sẽ nằm mãi và dồn thành một email dài khi họ bật lại. Nay họ chỉ nhận email cho tin báo sau khi bật.
  - **Người gửi được:** mỗi người một transaction. (1) Câu `UPDATE job_alerts SET emailedAt … WHERE candidateId … AND emailedAt IS NULL RETURNING jobPostId` nhận các dòng. Lượt chạy chồng (cron và script) nhận 0 dòng nên không gửi trùng. (2) Đọc các tin đã nhận còn đáng gửi: đang hiển thị, và ứng viên chưa ứng tuyển / chưa được mời **kể từ lúc báo** (thêm so với plan, cùng quy tắc D3, để email không gợi ý tin đã nộp). Sắp theo điểm lúc báo, rồi tin báo sau trước. (3) Còn tin thì tạo một `OutboxEvent` `NOTIFICATION_EMAIL` (`aggregateType = "Candidate"`, `notificationType = "JOB_ALERT"`) liệt kê tối đa 10 tin, kèm "và N tin khác". Không còn tin thì không gửi, nhưng các dòng vẫn được đánh dấu. Lỗi của một người huỷ transaction của người đó (dòng còn nguyên cho lượt sau), ghi log rồi đi tiếp.
  - Email gộp không tạo thông báo trong ứng dụng, vì thông báo `JOB_ALERT` đã có từ lúc báo.
- **Mẫu email** `renderJobAlertDigestEmail` trong `notification-templates.ts`: tiêu đề "N tin mới phù hợp với bạn"; mỗi tin là link tuyệt đối tới `/jobs/<id>` kèm tên công ty và "phù hợp X%"; nút "Xem việc làm phù hợp"; dòng cuối "Tắt trong Cài đặt" trỏ `/settings`. Mọi chuỗi do người dùng nhập đều được escape.
- **`sendSkillsReminders(now)`:** một câu chọn ứng viên có tài khoản `ACTIVE` (tức đã xác thực, không bị khoá), tạo từ ≥ 24 giờ, không có dòng nào trong `candidate_skills` (cùng cách đếm với độ hoàn thiện), chưa có thông báo khoá `profile-skills-reminder:<candidateId>`. Mỗi người một `notifyOnce("PROFILE_SKILLS_REMINDER")` (kèm email). Lỗi một người ghi log rồi đi tiếp.
- **`runDaily(now)`:** gọi email gộp rồi nhắc kỹ năng; cờ chống chạy chồng trong process (trả `LOCKED`); ghi log tổng kết và thời gian.
- **Cron** `job-alerts.job.ts` → `startJobAlertsJob`, 08:00 giờ Việt Nam, mount trong `main.ts` sau cron nhắc tuần của 0.4. Mẫu như `application-automation.job.ts`.
- **Script** `npm run job-alerts --workspace=apps/server -- [--dry-run] [--digest] [--reminders] [--job <id>]` (`scripts/job-alerts.ts`):
  - không có `--digest` / `--reminders` / `--job` thì chạy như cron 8h;
  - `--job <id>` gọi `onJobScored` cho tin đó, đọc điểm đang lưu, không chấm lại. Tin không tồn tại hoặc không hiển thị thì dừng với mã lỗi; tin chưa có điểm thì nhắc chạy `rescore-match-scores --job` trước;
  - `--dry-run` chỉ đếm: số người đạt điều kiện của tin và trong đó đã báo bao nhiêu; số email sẽ xếp, số người không còn tin, số dòng sẽ đánh dấu; số người sẽ nhắc;
  - tham số lạ hoặc `--job` thiếu id thì dừng, như `process-applications`;
  - script không có Socket.IO nên thông báo tạo từ đây không đẩy realtime.
- `JobAlertService` nhận thêm `outboxRepository` và `config` (`CORS_ORIGIN` làm gốc link email, như `NotificationsService`).
- **Test:** `tests/unit/job-alert-digest.test.ts` 7 ca:
  - email gộp: outbox nằm cùng transaction với câu nhận dòng; tối đa 10 tin kèm "và 2 tin khác"; người tắt email chỉ được đánh dấu; không còn tin thì không gửi; lượt khác đã nhận thì không gửi; lỗi một người không chặn người sau;
  - `--dry-run` không ghi;
  - mẫu email escape và có link tuyệt đối;
  - nhắc kỹ năng: mốc 24 giờ, khoá, trùng, lỗi;
  - `runDaily` trả `LOCKED` khi đang chạy.

  `job-alerts.test.ts` cập nhật hàm dựng service. Toàn bộ unit test server: 565/565 qua. `tsc` server vẫn chỉ còn lỗi `notification.mapper.ts` (hết ở bước 7); script `job-alerts.ts` kiểm kiểu riêng, không lỗi.
- **Kiểm trên Neon (chỉ đọc; script chạy với `DATABASE_URL` trỏ endpoint trực tiếp, phiên read-only):**
  - `EXPLAIN` câu nhận dòng (`UPDATE … RETURNING`) dùng index `(emailedAt, createdAt)` của `job_alerts`. `EXPLAIN` câu đọc tin của email dùng khoá chính `job_alerts`, `job_posts`, `companies`, rồi anti join cho đơn và lời mời qua index. Cả hai câu hợp lệ với schema thật.
  - `job_alerts` đang rỗng, nên email gộp ra 0 ứng viên, 0 email. Chạy thật có dữ liệu ở bước 8.6.
  - Nhắc kỹ năng: service ra 0 người; bỏ điều kiện tuổi tài khoản vẫn 0. Đếm bằng SQL tay: 0/1.523 ứng viên chưa có kỹ năng, khớp bước 0 mục 7. Để demo phải tạo tài khoản mới (bước 8.7).
  - `countTargetsForJob` cho 5 tin mới nhất ra 14 / 8 / 30 / 10 / 46 người, trùng số mỗi tin ở bước 5.
  - `npm run job-alerts -- --dry-run` in đúng hai dòng 0; `--dry-run --job clargedemojob0093` ra "14 đạt, 0 đã báo ⇒ sẽ báo 14"; `--job khong-co` dừng với "Không có tin"; `--bogus` và `--job` thiếu id bị từ chối.

### Bước 7 — `packages/shared-types` (2026-11-13)

- Phần lớn bước 7 đã làm dần ở bước 2–5, vì server cần kiểu để biên dịch:
  - `JobRecommendationList` (bước 2);
  - `ProfileCompleteness*` (bước 3);
  - `JobPostViewerInfo`, `JobPost.viewer?`, `PaginatedResponse.total?`, các trường mới của `JobPostSearchQuery` (bước 4);
  - `JobAlertSettings`, `UpdateJobAlertSettingsRequest` (bước 5).
- Bước này chỉ còn thêm `JOB_ALERT` và `PROFILE_SKILLS_REMINDER` vào `NotificationType`. Payload của hai loại nằm ở `notification.types.ts` phía server (bước 5); `Notification` của shared-types không có payload nên không đổi gì thêm.
- **Khác plan:** web có `Record<NotificationType, …>` ở `apps/web/src/lib/notifications.ts`, nên đã thêm luôn hai dòng ở đó để web không lỗi biên dịch trong lúc chờ F5:
  - `NOTIFICATION_GROUP_BY_TYPE`: `JOB_ALERT` → `INVITATIONS`, `PROFILE_SKILLS_REMINDER` → `ACCOUNT`, giống `notification-groups.ts` của server;
  - `NOTIFICATION_ACTION_LABEL`: "Xem việc làm phù hợp" (`/recommended-jobs`) và "Cập nhật hồ sơ" (`/profile`).

  F5 vẫn còn icon, realtime và invalidate.
- Đã build lại `dist`. `tsc` sạch ở shared-types, server (hết lỗi `notification.mapper.ts`), web và script `job-alerts.ts`. Toàn bộ unit test server: 565/565 qua.

### Bước 8 — Kiểm thử qua gateway 8080 (2026-11-13)

Mọi lời gọi qua `http://localhost:8080/api` (server, web, gateway do chủ dự án chạy). Server chạy với `DEV_SKIP_EMAIL_SENDING=true` nên không thư nào ra ngoài. Số liệu so sánh đọc từ DB ở phiên chỉ đọc.

1. **"Việc làm phù hợp", 6 ứng viên trưng bày `uv-ads-1…6`:** đều đi đường `TABLE`.
   - Duyệt hết trang ra 110 / 95 / 73 / 62 / 78 / 75 tin. `total` đúng, không lặp.
   - Không lọt tin đã ứng tuyển / được mời (SQL loại 1–7 tin mỗi người).
   - Trang đầu giảm dần theo điểm, điểm bằng bảng điểm (chênh 0), gợi ý chỉ ở trang đầu.
   - So với điểm nhà tuyển dụng (đăng nhập đúng người đăng tin) thấy ở trang tìm ứng viên: 23/30 cặp bằng nhau, 0 cặp lệch. 7 cặp còn lại không so được vì ứng viên không nằm trong 10 người đầu của trang tìm ứng viên.
   - Thời gian qua HTTP: trang đầu khoảng 0,94–1,2 s (lần đầu lạnh 2 s), trang sau khoảng 1 s.
2. **Ứng viên mới** `uv-kiem-0-5@large-demo.local` (đăng ký qua API, OTP dev):
   - Chưa có kỹ năng ⇒ `INSUFFICIENT_PROFILE`.
   - Thêm 4 kỹ năng ⇒ đường `LIVE`: 10 tin, điểm 81…67, `nextCursor = null`. 4/10 tin đăng quá 30 ngày, tức không còn giới hạn 30 ngày.
   - Lần gọi đầu 3,1 s, vì phải chấm trực tiếp.
3. **Trợ lý hồ sơ:** gọi "Phân tích hồ sơ" (một lần LLM) cho tài khoản trên. `topJobPostIds` trùng đúng thứ tự trang đầu "Việc làm phù hợp" (điểm ≥ 20). `completenessScore` bằng `GET /candidate/profile-completeness` (30).
4. **`/job-posts`:**
   - Khách, 10 truy vấn bộ lọc cũ: duyệt hết trang ra đúng `total`, không lặp, tập của repository cũ nằm trọn trong tập mới. Trang đầu giống hệt, trừ hai truy vấn có `q` (khớp thêm tên kỹ năng). Không có `viewer`.
   - Không lọc: code cũ ra 311 tin, code mới ra đủ 312. Đây là lỗi sót tin cùng ngày đăng mà bước 4 đã sửa.
   - p50 qua HTTP 539–617 ms, p95 600–1.031 ms. Mốc bước 0 là 502–542 ms ở tầng repository; ngưỡng +20% là 650 ms ⇒ đạt.
   - Ứng viên `ung-vien-0248`, `uv-ads-1`:
     - `sort=match` ra đủ 312 tin, điểm giảm dần;
     - `viewer` khớp SQL ở cả `match` và `newest`;
     - `minMatch=70` ra 14 / 15 tin, đúng số SQL;
     - trang đầu `sort=match` 0,84–0,94 s.
   - `minMatch=50` ⇒ 400.
5. **Job alert:** Mây Xanh đăng hai bản sao của tin `clargedemojobscmxbackendintern`, tiêu đề `[Kiểm 0.5 #1]` / `[Kiểm 0.5 #2]`.
   - Mây Xanh là công ty không cần duyệt tin, nên tin lên `PUBLISHED` ngay khi gửi duyệt. Đường Admin duyệt (`approve`) gọi cùng `matchScoreTrigger`.
   - Trước khi đăng, tắt alert của `uv-backend-6` và bật "chỉ cùng thành phố" cho `uv-backend-2` (Hà Nội, tin ở TP.HCM); khôi phục sau khi kiểm.
   - `job_alerts` có sau khoảng 2–6 s: 15 và 14 người, đúng tập của SQL tay. 17 và 16 người đạt điểm trước khi lọc; hai người bị loại do cài đặt không nhận.
   - `uv-backend-1` nghe socket qua 8080. Tin #1 ⇒ một thông báo realtime "1 tin mới phù hợp với bạn". Tin #2 ⇒ **cùng thông báo** (cùng id) thành "2 tin mới…", phần thân "Mới nhất: …", realtime lần hai.
   - `uv-backend-6` không nhận sự kiện nào. Không ai có hơn một thông báo `JOB_ALERT`. `/notifications?group=INVITATIONS` trả thông báo với link `/recommended-jobs`.
   - Chạy lại lối (a) bằng `job-alerts --job` cho tin #1: báo đúng 2 người vừa khôi phục cài đặt, không báo lại 15 người cũ. Lần chạy sau ra 0.
   - Lượt đêm (`rescoreAll`) không đi qua `trigger` nên không gọi listener. Đã có unit test `match-scores.test.ts`; không chạy cả lượt đêm trên Neon.
6. **Email gộp:** `--dry-run --digest` ⇒ 17 email (31 tin).
   - Chạy thật ⇒ 17 outbox `NOTIFICATION_EMAIL`, mỗi ứng viên một dòng, mọi dòng `job_alerts` có `emailedAt`. Chạy lại ⇒ 0.
   - Sau ≤ 1 phút worker xử lý xong 17/17 `COMPLETED`, không lỗi.
   - Email mẫu "2 tin mới phù hợp với bạn": hai tin xếp theo điểm, link `/jobs/<id>`, `/recommended-jobs`, `/settings`. Link theo `CORS_ORIGIN` như mọi email khác.
7. **Nhắc một lần:** tài khoản kiểm chưa đủ 24 giờ ⇒ dry-run 0. Lùi `users.createdAt` của riêng tài khoản này 25 giờ (một câu `UPDATE`).
   - Dry-run ⇒ 1. Lần 1 ⇒ tạo 1 thông báo kèm email. Lần 2 ⇒ 0.
   - Có đúng một thông báo (link `/profile`) và một outbox; `/notifications?group=ACCOUNT` có thông báo này.
8. **Độ hoàn thiện, so tay bằng SQL độc lập** (điểm, tám mục, "Nên làm trước"):
   - `uv-ads-1` 100%, `null`;
   - `ung-vien-0248` 85%, "kinh nghiệm 4/10";
   - tài khoản kiểm: chưa có kỹ năng ⇒ "kỹ năng", không bằng chứng. Sau khi thêm học vấn **không chọn ngành** và kỹ năng ⇒ 30%, "ngành học 8/10" (8 tin ghi ngành nhiều hơn 4 tin cần kinh nghiệm).
   - Không có ứng viên demo nào "có học vấn nhưng chưa chọn ngành" nên dùng tài khoản kiểm. Độ tin cậy của bộ chấm không đổi: đã kiểm ở bước 3, bước này không đụng.
9. `tsc` sạch ở server, web, shared-types (bước 7). Unit test server 565/565.

**Dữ liệu kiểm còn lại trên Neon:**

- hai tin `[Kiểm 0.5 #1/#2]` của Mây Xanh, đang hiển thị;
- tài khoản `uv-kiem-0-5@large-demo.local`;
- thông báo `JOB_ALERT` của 17 ứng viên demo;
- 31 dòng `job_alerts`.

Tất cả thuộc phần `@large-demo.local`, nên `seed-large-demo --reset` xoá được.

### Bước 9 — Tài liệu (2026-11-13)

- `FEATURE_BACKLOG.md`:
  - dòng 0.5 ghi "backend xong, frontend F1–F6 chưa làm", kèm số đo;
  - dòng "Thông báo việc làm mới" ở mục 3 trỏ về 0.5; phần lưu bộ lọc tìm kiếm làm job alert vẫn mở;
  - thêm dòng 🟢 cho bộ lọc hình thức làm việc, cấp bậc và tìm không dấu (`job_posts` chưa có cột cho hai bộ lọc đầu, DB chưa có `unaccent`).
- AD-26: dòng trạng thái ghi backend xong bước 0–9.
- `docs/06-backend/candidate-insights/PLAN.md`: thêm ghi chú đầu file và đánh dấu tại chỗ:
  - D8 (top 10 cố định) đã thay bằng phân trang;
  - `RECOMMENDATION_RECENT_DAYS` đã xoá;
  - D10 (bốn cờ 40/25/25/10) đã thay bằng tám mục của AD-26 mục 8;
  - mục "Ngoài phạm vi" ghi phân trang đã làm.
- FAQ chatbot hỗ trợ: backend chưa sửa file FAQ nào, nên không cần sinh lại `faq-index`. Câu hỏi về job alert, "Việc làm phù hợp" và độ hoàn thiện (kể cả sửa `02-ung-vien-ho-so-cv.md`, nơi vẫn nói độ hoàn thiện nằm trong "Phân tích hồ sơ") làm ở F6, rồi sinh lại `faq-index` và chạy eval như 0.4.

## Phần 4 — Ghi chú của chủ dự án

