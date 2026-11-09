# Tự động mời ứng viên theo tin (0.2) — Backend

Song song: `docs/05-frontend/phases/auto-outreach/PLAN.md`.
Quyết định: **AD-23** trong `docs/02-architecture/ARCHITECTURE_DECISIONS.md` (sửa một phần AD-15).
Nền tảng: `docs/06-backend/candidate-outreach/PLAN.md` (B3, D1–D7, Q1–Q5), `docs/06-backend/outreach-hub/PLAN.md`.

**Trạng thái: ĐÃ LẬP KẾ HOẠCH (2026-11-09), CHỜ DUYỆT. Chưa code.** Q1–Q5 đã chốt 2026-11-09.

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
  - Link: `/employer/jobs/<id>/candidate-search?tab=invited`. Trang này hiện giữ tab bằng state cục bộ; frontend bước F1 thêm việc đọc `?tab=`.
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

(trống)

## Phần 4 — Ghi chú của chủ dự án

