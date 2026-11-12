# Ứng viên thấy nhiều việc phù hợp, xếp theo ưu tiên (0.5) — Backend

> **Trạng thái: ĐÃ LẬP KẾ HOẠCH (2026-11-12), CHƯA TRIỂN KHAI.** Hướng đã chốt ở AD-26 trong buổi trao đổi với chủ dự án ngày 2026-11-12.

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
- **Q2 — Độ hoàn thiện:** tám mục chia theo hậu quả khi thiếu (AD-26 mục 8): kỹ năng 30, CV 15, bật cho liên hệ 10, kinh nghiệm 10, dự án 10, tiêu đề/giới thiệu 10, học vấn có chọn ngành 10, thành phố 5. Kèm "Nên làm trước" theo từng ứng viên. Bộ cũ (40/25/25/10 chia lại) bị bỏ vì không bám vào cách hệ thống chấm. Nếu bước 0 tìm được nguồn về việc nhà tuyển dụng thực tập xem gì trước và nguồn bác thứ tự trên thì chỉnh lại.
- **Q3 — Nhóm kinh nghiệm cho bộ lọc:** "Không yêu cầu" (`null` hoặc 0), "Dưới 1 năm" (0 < x < 1), "1–2 năm" (1 ≤ x ≤ 2), "Trên 2 năm" (x > 2). Bước 0 vẫn đếm phân bố để biết nhóm nào trống.
- **Q4 — Mặc định chế độ kỹ năng:** đổi thành "có ít nhất một"; vẫn chọn lại được "đủ tất cả".

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
- Index `(candidateId, score DESC)` trên `job_candidate_match_scores` (nếu bước 0 xác nhận).
- Migration viết tay, chạy `prisma migrate deploy`; ghi số dòng / thời gian tạo index.

### Bước 2 — "Việc làm phù hợp" đọc bảng điểm

- `JobRecommendationRepository.findScoredPage(candidateId, { offset, take })`: câu SQL trên `job_candidate_match_scores` ⋈ `job_posts` (điều kiện `VISIBLE_JOB` dùng lại từ `match-score.repository.ts`), trừ tin theo D3 (`NOT EXISTS` trên `applications`, `candidate_outreach_invitations`), sắp `score DESC, publishedAt DESC, id`, kèm tổng số dòng. Ngưỡng tối thiểu giữ `MIN_RECOMMENDATION_SCORE = 20`.
- Phân trang bằng offset (`cursor` là số nguyên mã hoá chuỗi) vì thứ tự theo điểm không ổn định với cursor theo id. Kích thước trang 10 (chốt theo bước 0.3).
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

*(Ghi trong quá trình làm, theo từng bước.)*

## Phần 4 — Ghi chú của chủ dự án

