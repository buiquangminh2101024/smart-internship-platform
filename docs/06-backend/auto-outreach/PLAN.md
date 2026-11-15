# Tự động mời ứng viên theo tin (0.2) — Backend

Song song: `docs/05-frontend/phases/auto-outreach/PLAN.md`.
Quyết định: **AD-23** trong `docs/02-architecture/ARCHITECTURE_DECISIONS.md` (sửa một phần AD-15).
Nền tảng: `docs/06-backend/candidate-outreach/PLAN.md` (B3, D1–D7, Q1–Q5), `docs/06-backend/outreach-hub/PLAN.md`.

**Trạng thái: XONG (2026-11-10).** Đã duyệt 2026-11-09. Backend xong bước 0–8 và migration đã áp lên Neon. Frontend F1–F5 cũng xong cùng ngày (`docs/05-frontend/phases/auto-outreach/PLAN.md`). Q1–Q5 đã chốt 2026-11-09.

## Mục tiêu

- **Bước 1:** nút "Mời tất cả gợi ý". Một request mời toàn bộ danh sách gợi ý đang hiện của một tin.
- **Bước 2:** tự động mời. Tin đã bật thì hệ thống tự giữ đủ `hiringTarget × H` lời mời đang hoạt động, tự mời bù, và dừng khi tuyển đủ.
- **Bước 3:** hạn mức mới theo gói, tỉ lệ tự động/mời tay theo công ty, trần 10 lời mời/ngày cho mỗi ứng viên.
- **Chạy nền không làm chậm web:** có giới hạn thời gian mỗi lượt, xoay vòng công ty, và đo để quyết định có cần tách worker hay không.

---

## Phần 1 — Công nghệ / package / kiến trúc

- **Không thêm dependency.** Dùng lại `node-cron`, `ioredis`, Prisma, awilix, bộ chấm điểm của Job Matcher (`ScoringJobMatcher`, `MatchEmbeddingService`) và `NotificationsService.notifyOnce` (AD-16).
- **Chạy nền trong process hiện tại** (AD-23 mục 8). Không thêm hàng đợi. Tách worker là việc sau, chỉ làm nếu số đo ở bước 7 cho thấy cần, và phải có AD riêng.
- **Khoá Redis theo công ty** (`SET key NX PX`): mỗi công ty chỉ có một lượt tự mời chạy cùng lúc, dù lượt đó đến từ cron, từ lúc đăng tin hay từ lúc ứng viên từ chối.
- **Advisory lock của Postgres theo ứng viên** khi tạo lời mời (Q1).
- **Tách logic chia lượt thành hàm thuần** (`allocateRoundRobin`), không chạm DB, để viết unit test giống cách `ScoringJobMatcher` đang làm.

## Phần 2 — Liên kết giữa các phần

```
JobPostsService.submitForApproval (tự đăng) ─┐
JobPostsService.approve (Admin duyệt) ───────┤
CandidateOutreachService.respond (DECLINE) ──┼─(sau commit, không chờ)─► AutoOutreachService.runForCompany(companyId)
PATCH …/auto-outreach (bật / đổi cài đặt) ───┘                                ▲
auto-outreach.job.ts (cron 15 phút) ── công ty chạy lâu nhất chưa chạy trước ──┘

AutoOutreachService.runForCompany
  ├─ khoá Redis theo công ty
  ├─ hạn mức + H của gói; đã dùng hôm nay (tổng, tự động)
  ├─ 1 câu SQL gộp: phần thiếu của mọi tin đang bật          ← lọc rẻ, đa số lượt dừng ở đây
  ├─ với mỗi tin còn thiếu và chưa tới lúc "kiểm lại":
  │    searchCandidatePool (loại người đã đủ trần hôm nay) → scoreCandidates → lọc ≥ ngưỡng
  ├─ allocateRoundRobin(phần thiếu, danh sách ứng viên, lượt còn lại)   ← hàm thuần
  ├─ createInvitation(source = AUTO) — dùng chung với mời tay; advisory lock theo ứng viên
  └─ notifyOnce(AUTO_OUTREACH_SENT, người đăng tin, khoá auto-outreach:<tin>:<ngày>)
```

- **Không có vòng phụ thuộc:** `AutoOutreachService` không phụ thuộc `JobPostsService`. `JobPostsService` chỉ nhận một hàm kích hoạt (`autoOutreachTrigger`) qua awilix.
- **Mời tay, "Mời tất cả gợi ý" và tự động dùng chung một hàm tạo lời mời** (`createInvitation`, tách ra từ `invite` hiện tại). Hàm này gồm: kiểm opt-in, kiểm đã ứng tuyển, kiểm lời mời đang chặn, kiểm trần của ứng viên, kiểm hạn mức, chấm điểm lúc mời (D7), transaction tạo lời mời + thông báo, rồi ghi bộ đếm. Nhờ vậy quy tắc không bị lệch giữa các đường.

---

## Phần 3 — Các bước thực hiện

### Bước 0 — Migration (viết tay, `prisma migrate diff`, xin xác nhận trước khi áp lên Neon)

Theo memory của dự án: **không** dùng `--shadow-database-url` trỏ vào DB thật.

| Bảng | Thay đổi |
|---|---|
| `job_posts` | `autoOutreachEnabled Boolean @default(false)`, `autoOutreachMinScore Int @default(80)`, `hiringTarget Int @default(1)`, `autoOutreachExhaustedAt DateTime?`, `autoOutreachExhaustedReason AutoOutreachExhaustedReason?` (enum mới `NO_MATCH`, `CANDIDATE_CAP`) |
| `companies` | `outreachAutoSharePercent Int @default(80)` |
| `subscription_plans` | `outreachPoolMultiplier Int?` (null ⇒ dùng mặc định trong code) |
| `candidate_outreach_invitations` | enum mới `OutreachInvitationSource { MANUAL AUTO }`, cột `source @default(MANUAL)`; index `(candidateId, createdAt)` để đếm trần của ứng viên |
| enum `NotificationType` | thêm `AUTO_OUTREACH_SENT` |
| Dữ liệu | `UPDATE subscription_plans` theo `name`: Cơ bản 8 / H 4, Tiêu chuẩn 14 / H 5, Doanh nghiệp 86 / H 6. Phải cập nhật trong migration, vì `seed.ts` dùng `upsert` với `update: {}` nên không ghi đè gói đã có. Sửa luôn mảng `subscriptionPlans` trong `seed.ts` cho DB mới. |

Mọi thay đổi đều thêm mới, có mặc định. Lời mời cũ nhận `source = MANUAL`.

### Bước 1 — Config và bộ đếm hạn mức

**`candidate-outreach.config.ts`**

- `TRIAL_OUTREACH_DAILY_QUOTA = 6`
- `DEFAULT_OUTREACH_DAILY_QUOTA`: đổi từ 3 thành 8. Chỉ dùng khi gói để `null`; lấy bằng mức của gói Cơ bản.
- `DEFAULT_POOL_MULTIPLIER = 4`
- `CANDIDATE_DAILY_INVITATION_CAP = 10`
- `AUTO_OUTREACH_PREFILTER_LIMIT = 50`
- `AUTO_OUTREACH_MAX_NEW_EMBEDDINGS = 50`. Chạy nền được phép tính nhiều embedding mới hơn mức 30 của một request thường.
- `AUTO_OUTREACH_RUN_BUDGET_MS = 60_000` (Q4)
- `AUTO_OUTREACH_NO_MATCH_RECHECK_HOURS = 3` (Q5)
- Thêm một khối chú thích ghi công thức của AD-23 mục 4 và các giả định C = 2, T = 14, để khi chỉnh số còn biết số từ đâu ra.

**`candidate-outreach-rate-limit.service.ts`**

- Thêm bộ đếm thứ hai `…:company:<id>:auto:day:<ngày>`.
- `recordUsage(companyId, source)`: luôn tăng bộ đếm tổng; nếu là `AUTO` thì tăng thêm bộ đếm tự động.
- `getUsage(companyId)` trả về `{ total, auto }`.
- Giữ cách "kiểm trước, tăng sau" như cũ. Chấp nhận vượt 1 lượt khi hai request gửi đúng cùng lúc, như ghi chú hiện có.

**`lookupDailyQuota`**

- Trả thêm `poolMultiplier` và `autoAllowed` (false với gói Dùng thử).
- Gói Dùng thử dùng `TRIAL_OUTREACH_DAILY_QUOTA`.

### Bước 2 — Tách `createInvitation`, thêm trần của ứng viên

- Tách phần thân của `invite` thành hàm `createInvitation(employer, jobPost, candidateId, source)`. Hàm trả kết quả có lý do khi bỏ qua (`APPLIED`, `BLOCKED`, `CANDIDATE_CAP`, `NOT_OPEN`, `QUOTA`), không ném lỗi.
- `invite` (mời tay) gọi `createInvitation` rồi đổi lý do bỏ qua thành `AppError` như cũ. Thêm 409 "Ứng viên đã nhận đủ lời mời trong hôm nay. Bạn mời lại được từ 7h sáng mai."
- Trần của ứng viên đếm bằng DB: số lời mời có `candidateId = X` và `createdAt ≥ 0h UTC hôm nay`. Dùng index mới, cùng mốc ngày với bộ đếm Redis (đặt lại lúc 7h sáng giờ Việt Nam).
- **Chống trùng khi chạy đồng thời (Q1):** đầu transaction tạo lời mời gọi `pg_advisory_xact_lock(hashtext(candidateId))`, rồi mới kiểm lời mời đang chặn và trần của ứng viên **bên trong** transaction. Khoá theo ứng viên nên chặn được cả hai lỗi: một cặp ứng viên–tin có 2 lời mời, và ứng viên vượt 10 lời mời/ngày khi nhiều công ty mời cùng lúc.
- **Trang tìm ứng viên (mời tay):** vẫn hiện người đã đủ trần. `CandidateSearchResultDto` thêm `cappedToday: boolean` để frontend làm mờ nút mời. Đếm bằng một câu `GROUP BY candidateId` cho 10 người trong kết quả.

### Bước 3 — "Mời tất cả gợi ý"

- `POST /employer/job-posts/:jobId/invitations/bulk`, body `{ candidateIds: string[] }`, tối đa `TOP_RESULT_COUNT` (10) id.
  - Client gửi đúng danh sách đang hiện. Server kiểm lại từng người bằng `createInvitation`, `source = MANUAL`.
  - Hết hạn mức giữa chừng thì dừng.
- Response: `{ invited: SentOutreachInvitationDto[], skipped: { candidateId, reason }[], quota: OutreachDailyQuotaStatus }`.
- Quyền: chỉ người đăng tin và tin phải `PUBLISHED`, giống mời tay. Có ở mọi gói, kể cả Dùng thử.
- Gửi lần lượt từng người, không song song: chấm điểm lúc mời chạy trên CPU, và cần dừng đúng lúc hết hạn mức.

### Bước 4 — Cài đặt

**Cài đặt của tin**

- `GET /employer/job-posts/:jobId/auto-outreach` trả về:
  - `{ enabled, minScore, hiringTarget }`;
  - `status`: `target` (= hiringTarget × H), `active` (PENDING + ACCEPTED), `pending`, `acceptedInvitations`, `hiredCount` (đơn `ACCEPTED`), `autoSentToday`, `nextCheckAt` (khi đang tạm dừng vì hết ứng viên);
  - `state`: `OFF` | `RUNNING` | `TARGET_MET` | `NO_MATCH` | `CANDIDATES_CAPPED` | `NOT_PUBLISHED` | `PLAN_NOT_ALLOWED`.
- `PATCH /employer/job-posts/:jobId/auto-outreach`, body `{ enabled?, minScore? (0–100), hiringTarget? (1–100) }`.
  - Sửa được ở mọi trạng thái của tin. Quyền: chỉ người đăng tin.
  - Bật khi công ty đang ở gói Dùng thử hoặc không có gói ⇒ 403.
  - Bật, hạ ngưỡng điểm hoặc tăng `hiringTarget` thì xoá dấu "hết ứng viên". Nếu tin đang `PUBLISHED` thì kích hoạt một lượt chạy ngay (không chờ).

**Cài đặt của công ty**

- `GET /employer/outreach/settings` trả `{ autoSharePercent }`.
- `PATCH /employer/outreach/settings`, body `{ autoSharePercent: 0–100 }`. Chỉ `isCompanyAdmin`, người khác nhận 403.

**Mở rộng API có sẵn**

- `GET /employer/outreach/summary`: `quota` trả thêm `autoUsedToday`, `autoLimitToday`, `autoAllowed`.
- DTO lời mời (`SentOutreachInvitationDto`, `CompanyOutreachInvitationDto`): thêm `source`.

### Bước 5 — `AutoOutreachService.runForCompany(companyId, deadline)`

1. Lấy khoá Redis `auto-outreach:lock:<companyId>`, TTL 5 phút. Đang có lượt khác chạy thì bỏ qua.
2. Đọc gói. Nếu `autoAllowed = false` thì dừng.
3. Tính lượt tự động còn lại: `R = min(⌊quota × share / 100⌋ − autoUsed, quota − totalUsed)`. Nếu R ≤ 0 thì dừng.
4. **Lọc rẻ trước:** một câu SQL gộp lấy các tin `PUBLISHED` + `autoOutreachEnabled` của công ty, kèm:
   - `target = hiringTarget × H`;
   - `active` = số lời mời PENDING + ACCEPTED;
   - `hired` = số đơn ACCEPTED.

   Giữ lại tin có `hired < hiringTarget` và `deficit = target − active > 0`. Bỏ qua tin **chưa tới lúc kiểm lại**:
   - `NO_MATCH`: chưa qua `autoOutreachExhaustedAt + 3 giờ`;
   - `CANDIDATE_CAP`: chưa qua mốc đặt lại hằng ngày kế tiếp (0h UTC = 7h sáng giờ Việt Nam).

   Không còn tin nào thì dừng. Đa số lượt cron dừng ở đây, nên chi phí tăng theo số lần cần mời bù, không theo tổng số tin.
5. Với mỗi tin còn lại, lần lượt:
   - `searchCandidatePool(tin, 50, { excludeCappedToday: true })`. Điều kiện mới: ứng viên có ít hơn 10 lời mời tạo từ 0h UTC hôm nay;
   - `scoreCandidates` → lọc `score ≥ minScore` → xếp giảm dần;
   - danh sách rỗng ⇒ đánh dấu "hết ứng viên", chọn lý do bằng một câu đếm rẻ: có ứng viên **đã đủ trần** mà có chung kỹ năng với tin ⇒ `CANDIDATE_CAP`, không có ⇒ `NO_MATCH`. Lý do `CANDIDATE_CAP` chỉ là ước đoán: người đã đủ trần chưa chắc đạt ngưỡng, nhưng sai thì cũng chỉ làm tin được kiểm lại sau 7h sáng mai thay vì sau 3 giờ;
   - có người ⇒ xoá dấu "hết ứng viên";
   - giữa hai tin gọi `await new Promise(setImmediate)` để request web được xử lý xen vào;
   - quá `deadline` thì dừng, các tin còn lại để lượt sau.
6. `allocateRoundRobin(jobs, R)`. Thứ tự lượt: `deficit / target` giảm dần, rồi `expiresAt` tăng dần (tin không có hạn xếp cuối). Mỗi vòng cấp 1 lượt cho mỗi tin còn thiếu và còn ứng viên.
7. Gửi theo thứ tự đã chia, qua `createInvitation(source = AUTO, employer = người đăng tin)`.
   - Ứng viên bị bỏ qua (vừa đủ trần vì công ty khác mời trước, vừa bị mời tay…) thì lấy người kế tiếp **trong cùng tin**, không tốn lượt.
   - Gặp `QUOTA` thì dừng cả lượt chạy.
8. Mỗi tin có gửi ít nhất 1 lời mời ⇒ `notifyOnce("AUTO_OUTREACH_SENT", người đăng tin, { jobPostId, jobPostTitle, sentCount }, "auto-outreach:<tin>:<ngày>")`.
9. Ghi mốc `auto-outreach:last-run:<companyId>` vào Redis.
10. Ghi log: số tin đã xét, số tin bỏ qua vì chưa tới lúc kiểm lại, số lời mời đã gửi, số người bị bỏ qua theo lý do, thời gian chạy.

**Bỏ qua cả công ty** khi công ty không còn gói hiệu lực. Bỏ qua tin khi tài khoản người đăng tin bị khoá (AD-17); trường cụ thể kiểm lúc viết code.

**Lối kích hoạt** (`autoOutreachTrigger(companyId)`: gọi, không chờ, `.catch` chỉ ghi log, `deadline` = 60 giây):

- `JobPostsService.submitForApproval` khi `autoPublished`, và `approve`: gọi sau khi `$transaction` trả về.
- `CandidateOutreachService.respond` khi `DECLINED`: gọi sau khi transaction xong.
- `PATCH …/auto-outreach` như mô tả ở bước 4.

**Cron `auto-outreach.job.ts`**

- Chạy `*/15 * * * *`.
- **Không chạy chồng:** biến cờ trong process. Lượt trước chưa xong thì lượt này bỏ qua và ghi log.
- Lấy các `companyId` có ít nhất một tin `PUBLISHED` đang bật tự mời. **Xếp theo `last-run` cũ nhất trước** (công ty chưa chạy bao giờ đứng đầu), để không công ty nào luôn được mời trước.
- Chạy **tuần tự** từng công ty, dùng chung một `deadline` = lúc bắt đầu + 60 giây. Hết thời gian thì dừng; công ty chưa tới lượt có `last-run` cũ hơn, nên lượt sau được xử lý trước.
- Mời bù khi lời mời hết hạn, vì cron hết hạn lời mời (mỗi giờ) đã chuyển chúng sang `EXPIRED`.

### Bước 6 — Thông báo, shared types, main.ts

- `notification.types.ts` và `notification-templates.ts`: thêm `AUTO_OUTREACH_SENT`.
  - Tiêu đề: "Hệ thống đang tự mời ứng viên cho tin «X»".
  - Link: `/employer/jobs/<id>/candidate-search?tab=invited`. Lúc lập plan, trang này giữ tab bằng state cục bộ. Frontend bước F1 đã thêm việc đọc và ghi `?tab=`.
  - Chỉ báo trong app, không gửi email.
- `packages/shared-types`: thêm `AutoOutreachSettings`, `AutoOutreachStatus`, `AutoOutreachState`, `BulkInviteRequest`, `BulkInviteResponse`, `CompanyOutreachSettings`, `OutreachInvitationSource`; mở rộng `OutreachDailyQuotaStatus` và `CandidateSearchResultDto` (`cappedToday`).
- `main.ts`: thêm `startAutoOutreachJob(...)` cạnh `startCandidateOutreachExpiryJob`.
- `candidate-outreach.routes.ts`: đăng ký `autoOutreachService` và 5 route mới.

### Bước 7 — Kiểm thử, đo tải và xem xét tách worker

**7a. Unit test** (`apps/server/tests/unit/`)

- `allocateRoundRobin`: ví dụ trong AD-23 (R = 12, thiếu 10/3/1 ⇒ 8/3/1), đủ hạn mức, hạn mức 0, tin hết ứng viên giữa chừng, thứ tự khi bằng tỉ lệ.
- Công thức hạn mức (`dailyQuotaForPlan`) ra đúng 6 / 8 / 14 / 86.
- Tính `R` với các tỉ lệ 0%, 80%, 100%.
- Quy tắc "chưa tới lúc kiểm lại" cho `NO_MATCH` (3 giờ) và `CANDIDATE_CAP` (mốc 0h UTC kế tiếp).
- Thứ tự công ty theo `last-run`.

**7b. Kiểm chức năng trên bộ dữ liệu demo lớn (0.1)** (chỉ đọc trước, xin xác nhận trước khi ghi)

- Bật tự mời cho 1 tin của Mây Xanh, `hiringTarget = 2` ⇒ đủ 12 lời mời (gói Doanh nghiệp, H = 6) trong một lượt.
- Từ chối 1 lời mời ⇒ có 1 lời mời bù.
- Một ứng viên đã nhận 10 lời mời trong ngày ⇒ không bị mời thêm; trang tìm ứng viên hiện `cappedToday`.
- Hai yêu cầu mời cùng lúc cho cùng một ứng viên ⇒ chỉ 1 lời mời được tạo (kiểm advisory lock).
- `npm run build` / `typecheck` cho server và shared-types.

**7c. Đo tải: tự mời có làm web chậm không**

Kịch bản: bật tự mời cho mọi tin đang mở của khoảng 10 công ty demo (trường hợp xấu: tất cả cùng cần mời ở lượt đầu). Chạy một lượt cron. Trong lúc đó:

- dùng `monitorEventLoopDelay` của `node:perf_hooks` (có sẵn trong Node, không thêm dependency) để đo độ trễ event loop, ghi p50 / p99 / max;
- gọi liên tục một API nhẹ (`GET /api/health`) và một API thường dùng (danh sách tin công khai), so thời gian phản hồi với lúc không chạy cron;
- ghi thời gian chạy của cả lượt, của từng tin, và số embedding mới phải tính.

Đoạn đo chỉ là script tạm, không đưa vào code chính.

**7d. Quyết định có tách worker không**

Đề xuất ngưỡng: số do thiết kế, không có nguồn; chỉnh sau khi có số đo.

| Kết quả đo | Quyết định |
|---|---|
| Độ trễ event loop p99 < 100 ms, và API nhẹ chậm đi không quá 2 lần | Giữ chạy chung process. Ghi số đo vào "Ghi chú triển khai". |
| Vượt ngưỡng, nhưng do tính nhiều embedding mới cùng lúc | Thử hạ `AUTO_OUTREACH_MAX_NEW_EMBEDDINGS` hoặc giới hạn thời gian mỗi lượt, rồi đo lại. |
| Vẫn vượt ngưỡng | Viết **AD mới** về tách worker trước khi code, xem xét hai hướng: (1) `worker_threads` chỉ cho phần tính embedding, vẫn chung process; (2) process riêng (ví dụ `npm run worker:auto-outreach`) dùng chung code `apps/server`, cron chỉ chạy ở process đó. Hướng (2) thêm một tiến trình cần chạy lúc demo và lúc triển khai (Phase 14). |

Việc tách worker **không thuộc 0.2**, chỉ ghi kết quả đo và đề xuất ở đây.

### Bước 8 — Tài liệu

- Cập nhật dòng 0.2 trong `FEATURE_BACKLOG.md` và trạng thái của AD-23.
- Ghi số đo ở 7c và kết luận ở 7d vào phần "Ghi chú triển khai".
- Nếu 7d cần tách worker: thêm một dòng vào backlog, trỏ tới AD mới.

---

## Câu hỏi đã chốt (2026-11-09)

- **Q1 — Chống trùng khi chạy đồng thời: advisory lock theo ứng viên.** Hàm `invite` hiện kiểm trước rồi mới tạo lời mời, nên hai yêu cầu cùng lúc có thể tạo 2 lời mời PENDING cho một cặp ứng viên–tin, hoặc đẩy ứng viên vượt trần 10/ngày. Cách chốt: `pg_advisory_xact_lock(hashtext(candidateId))` ở đầu transaction tạo lời mời; khoá tự trả khi commit/rollback, dùng được qua connection pooler của Neon. Không đổi schema. Không chọn partial unique index: theo hiểu biết hiện tại `schema.prisma` không khai báo được loại index này (kiểm lại với phiên bản Prisma đang dùng), nên các lần `migrate diff` sau dễ sinh lệnh xoá nó. Hạn mức công ty trên Redis vẫn có thể vượt 1 lượt khi trùng thời điểm, giữ nguyên như ghi chú hiện có.
- **Q2 — Ngưỡng điểm mặc định 80**, chủ dự án chọn, nhà tuyển dụng chỉnh được. Số đo ở 0.1: điểm top 10 của các tin trưng bày nằm trong khoảng 63–100 (thấp nhất ở UI/UX), nên tin ít ứng viên mạnh có thể sớm vào trạng thái `NO_MATCH`. Khi kiểm ở bước 7b, ghi lại tin nào bị như vậy.
- **Q3 — Cron 15 phút.** Lúc đăng tin, lúc ứng viên từ chối và lúc đổi cài đặt đều đã chạy ngay, nên cron chỉ là lưới an toàn.
- **Q4 — Bảo vệ tải** (đề xuất của Claude, chủ dự án duyệt): lọc rẻ bằng một câu SQL gộp trước; giới hạn 60 giây mỗi lượt; không chạy chồng; nhường lượt cho request web giữa các tin; xoay vòng công ty theo `last-run`. Số 60 giây do thiết kế, chỉnh được.
- **Q5 — Tin "hết ứng viên" chia hai lý do.** `CANDIDATE_CAP` (người phù hợp hôm nay đã đủ lời mời) kiểm lại sau mốc đặt lại hằng ngày. `NO_MATCH` (không ai đạt ngưỡng) kiểm lại mỗi **3 giờ**, vì ứng viên mới hoặc hồ sơ thay đổi có thể đổi kết quả trong ngày. 3 giờ do thiết kế, chủ dự án chọn giữ. Xoá dấu ngay khi có dữ liệu mới là việc của 0.6.

## Ngoài phạm vi

- Bảng điểm lưu sẵn và số ứng viên phù hợp trên trang tổng quan: mục 0.3. Bảng này cũng là cách giảm tải lâu dài cho tự mời (không phải chấm lại mỗi lượt).
- Mục 0.6:
  - xoá dấu "hết ứng viên" ngay khi ứng viên bật opt-in hoặc lưu kỹ năng (một câu SQL xoá dấu cho các tin đang mở có chung kỹ năng);
  - chấm lại khi ứng viên sửa hồ sơ;
  - script mô phỏng dữ liệu đổ vào theo đợt.
- Tách worker cho tự mời: chỉ làm nếu bước 7d kết luận cần, với AD riêng.
- "Chấp nhận và ứng tuyển" (mục 3 của backlog): giữ nguyên, Accept vẫn chỉ tạo hội thoại.
- Email cho nhà tuyển dụng về lời mời tự động.

## Ghi chú triển khai

**Bước 0 (2026-11-09)**

- Migration `20261109120000_add_auto_outreach`. Phần DDL sinh bằng `prisma migrate diff --from-schema-datamodel <schema ở HEAD> --to-schema-datamodel prisma/schema.prisma`, không cần shadow DB. Thêm tay 3 câu `UPDATE subscription_plans`.
- Trước khi áp, kiểm chỉ đọc trên Neon: `migrate status` thấy đủ 33 migration cũ, chỉ còn migration mới; `migrate diff --from-schema-datasource` so với schema ở HEAD ra rỗng (không lệch).
- **Làm sớm phần thông báo của bước 6.** Thêm `AUTO_OUTREACH_SENT` vào enum thì các map `Record<NotificationType, …>` không còn biên dịch được, nên đã thêm luôn: payload `{ jobPostId, jobPostTitle, sentCount }`, nhóm `INVITATIONS`, template (chỉ trong app), `NotificationType` ở `shared-types`, nhóm và nhãn nút ở `apps/web/src/lib/notifications.ts`, và `SocketProvider` làm mới query lời mời khi nhận loại này. Các type khác của bước 6 vẫn để tới bước 6.
- Không chạy `prisma format`: lệnh này căn lại cả các model không liên quan (Candidate, JobPost). Các trường mới được căn tay.
- Đã áp lên Neon bằng `npm run db:deploy` (2026-11-09). Đọc lại: ba gói có 8/4, 14/5, 86/6; 333 lời mời cũ đều `MANUAL`; 422 tin đều tắt tự mời.

**Bước 1 (2026-11-09)**

- `candidate-outreach.config.ts`: thêm các hằng số như plan, kèm khối chú thích công thức và bảng số của các gói.
- `CandidateOutreachRateLimitService`: `getUsedToday` được thay bằng `getUsage` → `{ total, auto }` (một lệnh `MGET`); `recordUsage(companyId, source)` bắt buộc truyền nguồn; khoá tự động là `candidate-outreach-quota:company:<id>:auto:day:<ngày UTC>`.
- `lookupDailyQuota` chuyển sang `public` (bước 5 cần), trả kiểu `OutreachQuotaPolicy`. Đây là union: gói Dùng thử có `autoAllowed: false` và không có `poolMultiplier`, nên code phải kiểm `autoAllowed` trước khi đọc hệ số.
- Script dữ liệu demo lớn (`scripts/lib/large-demo/history.ts`) trước đây giới hạn lời mời lịch sử bằng `DEFAULT_OUTREACH_DAILY_QUOTA`, nên đổi 3 → 8 sẽ làm chạy lại script ra bộ dữ liệu khác. Chủ dự án chọn giữ nguyên: thêm `HISTORY_DAILY_INVITATION_CAP = 3` riêng cho script (lịch sử mô phỏng giai đoạn trước 0.2), test của script dùng hằng số này.
- `content/support-faq/07-quan-ly-ung-vien.md`: sửa số hạn mức (trước ghi "dùng thử: 3 lời mời/ngày").
- Kiểm: typecheck server qua; 382/382 unit test qua; thử bộ đếm trên Redis thật bằng một company id giả (1 tay + 2 tự động ⇒ `{ total: 3, auto: 2 }`, TTL 2 ngày), rồi xoá key.

**Bước 2 (2026-11-10)**

- `CandidateOutreachService.createInvitation(input)` trả `{ created: true, invitation }` hoặc `{ created: false, reason }` với `reason` ∈ `NOT_FOUND | NOT_OPEN | APPLIED | BLOCKED | CANDIDATE_CAP | QUOTA`. Thứ tự:
  1. kiểm rẻ ngoài transaction (ứng viên, opt-in, đã ứng tuyển, lời mời đang chặn, trần ứng viên, hạn mức), chạy song song;
  2. chấm điểm nếu nơi gọi không truyền `match` (không giữ khoá lúc chấm);
  3. transaction: `lockCandidate` → kiểm lại lời mời đang chặn và trần **dưới khoá** → tạo lời mời có `source` → thông báo;
  4. `recordUsage(companyId, source)` khi đã tạo.
- `invite` (mời tay) gọi `createInvitation`, đổi lý do thành lỗi bằng `inviteSkipError`: giữ nguyên mã và câu báo cũ; thêm `CANDIDATE_CAP` ⇒ 409.
- `assertWithinQuota` được thay bằng hàm thuần `hasDailyRoom(usage, limit, source)` trong `candidate-outreach-rate-limit.service.ts`, vì `createInvitation` không ném lỗi. `limit.auto` là phần tự động (= daily × tỉ lệ %); bỏ trống ⇒ 0.
- Repository: `lockCandidate` (`pg_advisory_xact_lock(hashtext(candidateId))`, gọi bằng `$executeRaw` vì hàm trả `void`), `countReceivedToday`, `countReceivedTodayByCandidate` (một câu `groupBy`), `startOfUtcDay`; `hasBlockingInvitation` nhận thêm `db` để chạy trong transaction.
- `CandidateSearchResultDto.cappedToday` (shared-types + mapper). Thêm sớm vào shared-types (plan để ở bước 6) vì DTO cần ngay.
- Kiểm:
  - `tests/unit/outreach-create-invitation.test.ts` (17 test): thứ tự khoá/kiểm lại/tạo, từng lý do bỏ qua, kiểm lại dưới khoá, mời tay dùng được phần tự động, `invite` ⇒ 409, `cappedToday`. Cả bộ 399/399 qua.
  - Thử trên Neon (không ghi dữ liệu): hai transaction khoá cùng một id ⇒ transaction sau chờ đúng tới khi transaction trước xong (~1,5 giây giữ khoá); hai id khác nhau ⇒ không chờ. Hai câu đếm chạy được.

**Bước 3 (2026-11-10)**

- `POST /employer/job-posts/:jobId/invitations/bulk`, body `bulkInviteSchema` (1–10 id). Trả 200 kèm `BulkInviteResponse` (shared-types, cùng `OutreachInviteSkipReason`). `InvitationSkipReason` ở server giờ là alias của type này.
- `bulkInvite`:
  - gộp id trùng, giữ thứ tự gửi lên;
  - hết lượt ngay từ đầu thì trả mọi người là `QUOTA`, không chấm điểm;
  - còn lượt thì **chấm một lô** (`scoreManyForInvitation`: nạp tin một lần, embedding một lô, tối đa `MAX_NEW_EMBEDDINGS_PER_REQUEST`), rồi truyền điểm xuống `createInvitation`. Chấm lô lỗi thì để từng lời mời tự chấm;
  - gặp `QUOTA` thì dừng: người đó và mọi người sau đều vào `skipped` với lý do `QUOTA`.
- Kiểm: `tests/unit/outreach-bulk-invite.test.ts` (7 test). Cả bộ 406/406 qua; typecheck server và web qua. **Chưa** gọi API thật, vì sẽ tạo lời mời và thông báo trên dữ liệu Neon; để tới bước 7b.

**Bước 4 (2026-11-10)**

- File mới trong `candidate-outreach/`:
  - `auto-outreach.policy.ts`: hàm thuần `autoOutreachRecheckAt`, `resolveAutoOutreachState`, `reopensAutoOutreach`. Bước 5 dùng lại;
  - `auto-outreach.repository.ts`: đọc/ghi các cột tự mời của tin, đếm số liệu của thẻ;
  - `auto-outreach.service.ts`, `auto-outreach.controller.ts`.
- `AutoOutreachService` phụ thuộc một chiều vào `CandidateOutreachService` (`lookupDailyQuota`, bước 5 thêm `createInvitation`). Cài đặt của tin nằm ở đây chứ không ở `CandidateOutreachService`, để bước 5 gọi `runForCompany` từ `PATCH` mà không tạo vòng phụ thuộc trong awilix.
- 4 route: `GET`/`PATCH /employer/job-posts/:jobId/auto-outreach`, `GET`/`PATCH /employer/outreach/settings`, đăng ký trong `candidate-outreach.routes.ts`.
- Cài đặt của tin:
  - `state` xét theo thứ tự `PLAN_NOT_ALLOWED` → `OFF` → `TARGET_MET` → `NOT_PUBLISHED` → `NO_MATCH`/`CANDIDATES_CAPPED` → `RUNNING`. `TARGET_MET` đứng trước `NOT_PUBLISHED` để tin đã đóng mà tuyển đủ vẫn hiện "đã tuyển đủ". Dấu "hết ứng viên" đã qua lúc kiểm lại thì trả `RUNNING` (lượt cron kế tiếp xét lại).
  - `active` gồm cả lời mời tay lẫn tự động. `pending` chỉ đếm PENDING chưa quá `expiresAt`, cùng quy tắc với trạng thái hiển thị. `target = null` khi gói không có tự động mời.
  - `PATCH` chỉ trả 403 khi **bật** ở gói Dùng thử hoặc khi không có gói; các trường khác vẫn sửa được (form tạo tin của gói Dùng thử vẫn lưu số người cần tuyển, F3). Trả lại cả cài đặt lẫn trạng thái. Câu báo 403: "Tự động mời ứng viên có từ gói Cơ bản. Gói Dùng thử chỉ mời tay."
  - Bật lại, hạ ngưỡng hoặc tăng số người cần tuyển thì xoá dấu "hết ứng viên". Việc **kích hoạt lượt chạy ngay** để bước 5, vì `runForCompany` chưa có; điều kiện là tin `PUBLISHED`, đang bật và `reopensAutoOutreach`.
  - `jobPost.update` làm Prisma cập nhật `JobPost.updatedAt`. Hiện web không hiển thị cột này.
- Cài đặt của công ty: mọi employer của công ty xem được; chỉ `isCompanyAdmin` sửa được, người khác nhận 403. Đổi tỉ lệ không kích hoạt lượt chạy; cron 15 phút sẽ xét.
- `OutreachDailyQuotaStatus` thêm `autoAllowed`, `autoLimitToday` (= `autoDailyLimit(dailyQuota, tỉ lệ)`, làm tròn xuống: 14 × 80% ⇒ 11), `autoUsedToday`. Vì là cùng một type nên dashboard Employer và kết quả "Mời tất cả gợi ý" cũng có các trường này. Dùng thử: `autoAllowed = false`, `autoLimitToday = 0`.
- `SentOutreachInvitationDto` (và `CompanyOutreachInvitationDto` kế thừa) thêm `source`.
- Thêm sớm vào shared-types (plan để ở bước 6): `AutoOutreachSettings`, `UpdateAutoOutreachSettingsRequest`, `AutoOutreachState`, `AutoOutreachStatus`, `JobAutoOutreachDto`, `CompanyOutreachSettings`, `OutreachInvitationSource`.
- `HIRING_TARGET_MAX = 100` trong config; schema `updateJobAutoOutreachSchema` (cần ít nhất một trường, số nguyên) và `updateCompanyOutreachSettingsSchema` (0–100).
- Kiểm:
  - `tests/unit/auto-outreach-settings.test.ts` (13 test): phần tự động của hạn mức, lúc kiểm lại, thứ tự trạng thái, khi nào xoá dấu, schema, quyền 404/403, Dùng thử sửa được số người cần tuyển, quyền sửa tỉ lệ. Sửa `outreach-bulk-invite.test.ts` theo các trường hạn mức mới. Cả bộ 419/419 qua; typecheck server và web qua.
  - Thử trên Neon, chỉ đọc: `findJob`, `countJob`, `findAutoSharePercent` chạy đúng trên tin có nhiều lời mời nhất (3 ACCEPTED + 1 EXPIRED ⇒ `pending 0`, `acceptedInvitations 3`; đơn không có ACCEPTED ⇒ `hiredCount 0`). Chưa gọi `PATCH` thật.

**Bước 5 (2026-11-10)**

- `AutoOutreachService.runForCompany(companyId, deadline)` (`deadline` là epoch ms), trả `AutoOutreachRunResult`: `LOCKED`, `SKIPPED` (`NO_COMPANY` | `PLAN_NOT_ALLOWED` | `NO_ROOM` | `NO_JOB`) hoặc `DONE` kèm số tin đã xét / chờ kiểm lại / để lượt sau / vừa đặt dấu, số lời mời đã gửi, số người bị bỏ qua theo lý do, `stoppedByQuota`. Kết quả `DONE` được ghi log cùng thời gian chạy.
- File mới:
  - `auto-outreach-run-store.ts`: khoá `auto-outreach:lock:<công ty>` (`SET … EX 300 NX`, nhả bằng `DEL` trong `finally`, cùng cách khoá của module CV) và mốc `auto-outreach:last-run:<công ty>` (TTL 7 ngày, chỉ dùng để xếp thứ tự). Mốc được ghi cả khi lượt dừng sớm.
  - `auto-outreach.job.ts`: `runAutoOutreachCycle` và `startAutoOutreachJob` (`*/15 * * * *`, cờ trong process để không chạy chồng). **Chưa gọi trong `main.ts`**: việc này thuộc bước 6, nên hiện cron chưa chạy.
- Hàm thuần mới trong `auto-outreach.policy.ts`: `isAwaitingRecheck`, `autoRunRemaining` (R), `allocateRoundRobin`, `orderCompaniesByLastRun`.
- Repository:
  - `AutoOutreachRepository.findRunnableJobs`: câu lọc rẻ, thêm điều kiện tin còn hạn (`expiresAt` null hoặc chưa qua) và cột `posterSuspended` (`users.status = 'SUSPENDED'`, AD-17).
  - `markExhausted` / `clearExhausted` ghi bằng SQL nên **không** đổi `updatedAt` của tin (việc của hệ thống, không phải người đăng sửa tin). `clearExhausted` chỉ ghi khi tin đang có dấu.
  - `hasCappedSkillMatch`: câu đoán lý do; không lọc kỹ năng `APPROVED` vì chỉ là ước đoán.
  - `findCompaniesWithAutoJobs` cho cron.
  - `CandidateOutreachRepository.searchCandidatePool` thêm `{ excludeCappedToday }`. Mốc ngày tính trong SQL (`date_trunc('day', now() AT TIME ZONE 'UTC')`, export `START_OF_UTC_DAY`), không truyền `Date` làm tham số, vì cột lưu UTC không múi giờ.
- `CandidateOutreachService.scorePool` (public): chấm cả pool của một tin bằng bộ chấm hiện có; lỗi thì ném ra, lượt chạy bỏ qua tin đó (không đặt dấu).
- Khác hoặc chi tiết hơn plan:
  - Các tin được xét theo tỉ lệ thiếu giảm dần, để khi hết giờ giữa chừng thì tin cần nhất đã được xét.
  - Phần **gửi** không xét mốc dừng: đã bị chặn bởi R (tối đa 68 với gói Doanh nghiệp ở 80%), và dừng giữa chừng thì phí phần chấm điểm vừa làm. Phần tìm + chấm vẫn dừng đúng mốc.
  - Hàng chờ của một tin có thể cạn vì người trong đó bị bỏ qua. Khi đó lượt đã cấp cho tin này bị dư; vòng lặp chia lại phần dư cho các tin còn người, dừng khi một vòng không gửi được ai.
  - Lời mời đứng tên người đăng tin (`employerId` của tin), tên công ty lấy một lần đầu lượt.
  - Thông báo `AUTO_OUTREACH_SENT` dùng `notifyOnce` theo tin theo ngày, nên `sentCount` là số của lượt đầu tiên trong ngày; câu thông báo đã ghi các lời mời gửi thêm cũng hiện ở tab "Đã mời". Lỗi thông báo chỉ ghi log.
- Lối kích hoạt (`autoOutreachTrigger`, đăng ký bằng `asValue` trong `candidate-outreach.routes.ts`, resolve `autoOutreachService` lúc gọi ⇒ không có vòng phụ thuộc awilix):
  - `JobPostsService.submitForApproval` khi tự đăng, và `approve`: chỉ khi tin đã bật tự mời; gọi sau khi transaction trả về.
  - `CandidateOutreachService.respond` khi từ chối: luôn gọi (dữ liệu lời mời không có cờ của tin); công ty không có tin nào bật thì lượt dừng ở câu lọc rẻ.
  - `PATCH …/auto-outreach`: khi `reopensAutoOutreach`, tin `PUBLISHED`, đang bật và gói có tự động mời.
- Kiểm:
  - `tests/unit/auto-outreach-run.test.ts` (18 test): ví dụ AD-23 (R = 12, thiếu 10/3/1 ⇒ 8/3/1), đủ lượt, R = 0, tin hết ứng viên giữa chừng, thứ tự khi bằng tỉ lệ; R với tỉ lệ 0/80/100% và khi mời tay dùng gần hết; chờ kiểm lại; thứ tự công ty; `runForCompany` (khoá, dừng sớm, lọc rẻ, bỏ qua người không mời được, đặt/xoá dấu, chấm lỗi, R, QUOTA, chia lại phần dư, quá mốc dừng); lượt cron (thứ tự, lỗi một công ty, hết giờ); các lối kích hoạt (từ chối/nhận lời, tự đăng/chờ duyệt/chưa bật). `auto-outreach-settings.test.ts` thêm kiểm `PATCH` có/không kích hoạt. Cả bộ 437/437 qua; typecheck server và web qua.
  - Thử trên Neon, chỉ đọc: chưa tin nào bật tự mời ⇒ `findCompaniesWithAutoJobs` và `findRunnableJobs` rỗng. Cùng câu lọc rẻ chạy trên tin có nhiều lời mời nhất (bỏ điều kiện đang bật) ra đúng kiểu dữ liệu (`active 4`, `hired 0`, `posterSuspended false`). Pool có và không loại người đủ trần đều 50 người (hôm nay chưa ai đủ trần); `hasCappedSkillMatch` = false. Hai câu `UPDATE` chỉ chạy `EXPLAIN` (không thực thi) để kiểm tên cột và ép kiểu enum.
  - **Chưa** chạy lượt nào trên dữ liệu thật: lượt chạy tạo lời mời và thông báo. Để tới bước 7b.

**Bước 6 (2026-11-10)**

- Phần lớn bước 6 đã làm sớm: thông báo `AUTO_OUTREACH_SENT` (bước 0), các type trong `shared-types` gồm `cappedToday`, `BulkInviteRequest`/`BulkInviteResponse` và phần tự động của `OutreachDailyQuotaStatus` (bước 3–4), đăng ký service và 5 route mới (bước 4–5). Đã rà lại: đủ các type plan liệt kê.
- `main.ts`: gọi `startAutoOutreachJob({ autoOutreachRepository, autoOutreachRunStore, autoOutreachService, logger })` ngay sau `startCandidateOutreachExpiryJob`. Từ đây cron 15 phút chạy cùng server; hiện chưa tin nào bật tự mời nên mỗi lượt chỉ chạy một câu `SELECT DISTINCT` rồi dừng, không ghi log.
- `AutoOutreachService` lấy phụ thuộc ngay trong constructor, nên resolve lúc khởi động kéo theo `candidateOutreachService`, `notificationsService`… Đã kiểm bằng script tạm (dựng container và mount router đúng thứ tự `main.ts`, không chạy cron, không ghi DB): resolve được `autoOutreachRepository`, `autoOutreachRunStore`, `autoOutreachService`, `jobPostsService`, `candidateOutreachService`. Script đã xoá.
- Kiểm: cả bộ 437/437 qua; typecheck server qua.

**Bước 7 (2026-11-10)**

*7a. Unit test.* Các mục plan liệt kê đã có từ bước 4–5 (`auto-outreach-run.test.ts`, `auto-outreach-settings.test.ts`). Riêng "công thức hạn mức `dailyQuotaForPlan`": code không có hàm này, hạn mức lấy thẳng từ cột `outreachInvitationDailyQuota` của gói (Dùng thử là hằng `TRIAL_OUTREACH_DAILY_QUOTA = 6`), nên kiểm bằng dữ liệu thay vì unit test. Đọc trên Neon: Cơ bản 8 (H = 4), Tiêu chuẩn 14 (H = 5), Doanh nghiệp 86 (H = 6), đúng AD-23.

*Q2: tin dễ rơi vào `NO_MATCH` ở ngưỡng 80.* Chấm thử (chỉ đọc, không tính embedding mới) 15 tin đang mở chưa có lời mời của Mây Xanh, pool 50 người. Số người đạt ≥ 80 từ 0 đến 32. `clargedemojob0025` (Business Analyst part-time) không có ai đạt 80 (cao nhất 78) nên sẽ vào `NO_MATCH`. Hai tin BA `0312` và `0067` chỉ có 2 người đạt. Tin kỹ thuật (Frontend, Java, Data) có 16–32 người.

*7b. Kiểm chức năng trên Neon* (chủ dự án duyệt ghi, công ty Mây Xanh, gói Doanh nghiệp; script tạm gọi đúng các service, đã xoá; bắt đầu 2026-11-10 03:33 UTC):

- Bật tự mời cho `clargedemojob0138` (Thực tập sinh Java Backend) bằng `updateJobSettings` với `hiringTarget = 2` ⇒ `PATCH` trả `RUNNING`, target 12. Lượt chạy do `PATCH` kích hoạt gửi đúng **12 lời mời AUTO** (điểm 90–96, đều ≥ 80), đều đứng tên người đăng tin. Người đăng nhận 1 thông báo `AUTO_OUTREACH_SENT` (dedupe `auto-outreach:clargedemojob0138:2026-11-10`, link `?tab=invited`). Hạn mức: `{ total: 12, auto: 12 }`. Lượt chạy mất 15,3 s.
- Ứng viên `clargedemocand0953` từ chối ⇒ lượt chạy do từ chối kích hoạt gửi **1 lời mời bù** (`clargedemocand0031`, điểm 89) sau 2,7 s; số lời mời PENDING của tin lại là 12.
- Trần 10 lời mời/ngày và advisory lock (ứng viên `cmub8c39u002qyg7s782pleql`, tài khoản demo cũ `@match-demo.local`, đã có 1 lời mời AUTO):
  - 2 yêu cầu mời cùng lúc, cùng ứng viên, cùng tin ⇒ 1 lời mời được tạo, yêu cầu kia nhận 409 "đã được mời".
  - Mời tay qua các tin khác tới 9 lời mời. Ở mức 9, 2 yêu cầu cùng lúc trên **hai tin khác nhau** ⇒ chỉ 1 được tạo, yêu cầu kia nhận 409 "đã nhận đủ lời mời trong hôm nay": advisory lock theo ứng viên chặn đúng trường hợp vượt trần khi chạy đồng thời.
  - Lần thứ 11 ⇒ 409 như trên. Trang tìm ứng viên của `clargedemojob0293` hiện ứng viên này với `cappedToday = true`. Pool của tự mời (`excludeCappedToday`) không còn người này, pool thường vẫn còn.
- Tổng ghi lên Neon: 22 lời mời (12 AUTO PENDING, 1 AUTO DECLINED, 9 MANUAL PENDING), 22 thông báo lời mời cho ứng viên, 1 thông báo từ chối và 1 `AUTO_OUTREACH_SENT` cho người đăng. Hạn mức hôm nay của Mây Xanh: `{ total: 22, auto: 13 }`.
- Sau khi kiểm:
  - Giữ lời mời làm dữ liệu demo. Tin 0138 được tắt tự mời và `hiringTarget` về 1, để cron không tự mời bù khi chạy server dev.
  - 22 email lời mời trong outbox (12 tới `@large-demo.local`, 10 tới `backend-java-01@match-demo.local`) được chuyển `FAILED` kèm `lastError` ghi lý do, nên không bao giờ được gửi.
- Gửi lời mời mất khoảng 1,1 s mỗi lời mời từ máy dev tới Neon (transaction có advisory lock, thông báo, outbox). Một công ty dùng hết R = 68 sẽ mất khoảng 75 s ở phần gửi, vẫn dưới TTL 300 s của khoá.
- Build `shared-types` và typecheck server qua.

*7c. Đo tải* (script tạm, đã xoá; **không ghi Neon**):

- Cách đo:
  - Một process chạy cả Express (đủ router như `main.ts`) lẫn lượt tự mời.
  - Hai vòng gọi liên tục `GET /api/health` và `GET /api/job-posts?page=1&limit=20`.
  - Độ trễ event loop đo bằng `monitorEventLoopDelay` (resolution 10 ms).
- Phạm vi dữ liệu:
  - Lượt cron dùng đúng `runAutoOutreachCycle` và `runForCompany`, cho 10 công ty gói Doanh nghiệp có nhiều tin đang mở nhất (127 tin), coi như mọi tin đều bật tự mời (trường hợp xấu).
  - `createInvitation` được thay bằng các câu đọc của chính nó (không tạo lời mời). Đặt/xoá dấu, thông báo và khoá Redis là bản giả.
  - Chấm điểm với 0 embedding mới; phần embedding đo riêng bằng cách gọi thẳng model.
- Số đo:

| Tình huống | Thời gian | Event loop p50 / p99 / max | `/api/health` p50 / p95 | `/api/job-posts` p50 / p95 |
|---|---|---|---|---|
| Nền (không tự mời) | 20 s | 15,5 / 22,0 / 25,3 ms | 44 / 49 ms | 477 / 498 ms |
| Một lượt cron, 10 công ty | 62,9 s | 15,4 / 22,4 / 25,3 ms | 50 / 58 ms | 525 / 592 ms |
| Nền lần 2 | 20 s | 15,4 / 21,9 / 84,9 ms | 48 / 55 ms | 507 / 599 ms |
| 30 embedding mới liên tiếp (3 lần) | 1,0–1,1 s | p99 57,8–87,9 ms | 129–144 / 153–177 ms (7–8 mẫu) | 603–620 ms (2 mẫu) |
| 50 embedding mới liên tiếp (3 lần) | 1,3–1,7 s | p99 41,9–71,6 ms, max 119,3 ms | 114–128 / 142–220 ms (12–13 mẫu) | 578–669 ms (3 mẫu) |

- Lượt cron:
  - 60 giây xử lý được 4/10 công ty (38 tin), 6 công ty để lượt sau.
  - Chấm một tin (pool 50) mất p50 936 ms, p95 1.371 ms, gần như toàn bộ là chờ I/O tới Neon: event loop không tăng.
  - 1.900 hồ sơ được chấm, chỉ 1 hồ sơ thiếu vector. Dữ liệu demo đã tính sẵn embedding.
  - 191 lời mời (giả); công ty Gia Hòa dừng đúng ở R = 68 (86 × 80%). Không tin nào bị đặt dấu.
  - Lượt dài 62,9 s, vượt mốc 60 s vì phần gửi không xét mốc dừng (xem ghi chú bước 5).
- Một embedding mới mất p50 33 ms, p95 52 ms (model `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, nạp model lần đầu 3 s).
- Giới hạn của số đo:
  - Máy dev Windows: timer khoảng 15 ms nên p50 của event loop luôn ≈ 15 ms.
  - Client gọi API chạy chung process nên làm số đo xấu đi một chút.
  - Thời gian chấm phụ thuộc độ trễ mạng tới Neon.
  - Mẫu lúc tính embedding ít vì mỗi đợt chỉ kéo dài khoảng 1 giây.

*7d. Kết luận: giữ chạy chung process, không tách worker, không viết AD mới.*

- Lượt cron (trường hợp thường, vector đã có) đạt cả hai ngưỡng: event loop p99 22 ms (< 100 ms); API nhẹ chậm thêm khoảng 14% (p50 44 → 50 ms), API danh sách tin khoảng 10%.
- Khi phải tính nhiều embedding mới, API nhẹ chậm khoảng 2,3–2,9 lần trong 1–1,7 giây (vượt ngưỡng 2 lần), event loop p99 vẫn dưới 100 ms.
  - Plan gợi ý hạ `AUTO_OUTREACH_MAX_NEW_EMBEDDINGS`. Đo 30 so với 50 thì mức chậm lúc cao điểm như nhau; hạ xuống chỉ rút ngắn thời gian bị chậm từ khoảng 1,6 s xuống khoảng 1 s.
  - Trang tìm ứng viên hiện có cũng tính tới 30 embedding trong một request web (`MAX_NEW_EMBEDDINGS_PER_REQUEST`). Vậy đây là đặc điểm của việc chạy model embedding trong process, không riêng gì tự mời.
  - Việc này chỉ xảy ra với hồ sơ mới hoặc vừa sửa.
  - **Giữ 50**: hạ xuống làm nhiều người trong pool chỉ có điểm theo luật, không đổi được mức chậm.
- Điều cần theo dõi là **thông lượng**, không phải độ trễ: 60 giây chấm được khoảng 38 tin. Trường hợp xấu (cả 127 tin cùng bật) cần khoảng 4 lượt cron (khoảng 1 giờ) để xét hết. Chấp nhận được vì lúc đăng tin, ứng viên từ chối và đổi cài đặt đều đã chạy ngay; cron chỉ là lưới an toàn. Nếu sau này cần nhanh hơn, hướng đúng là bảng điểm lưu sẵn của 0.3 (không phải chấm lại mỗi lượt), không phải tách worker.

**Bước 8 (2026-11-10)**

- `FEATURE_BACKLOG.md`: dòng 0.2 ghi backend xong, còn frontend F1–F5; giữ 📌 vì chưa xong cả mục.
- AD-23: trạng thái "backend đã triển khai, frontend chưa làm", thêm "Ghi chú triển khai backend" (lối kích hoạt thứ tư khi `PATCH`, bảo vệ tải, kết quả đo giữ mục 8, hạn mức đọc từ cột của gói).
- 7d không cần tách worker nên không thêm dòng backlog hay AD mới.

## Phần 4 — Ghi chú của chủ dự án

