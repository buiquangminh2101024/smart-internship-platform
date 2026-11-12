# Hệ thống tự xử lý hồ sơ chờ lâu (0.4) — Backend

> **Trạng thái: ĐÃ LẬP KẾ HOẠCH (2026-11-11), CHƯA TRIỂN KHAI.** Q1–Q3 đã chốt 2026-11-12. Chỉ bắt đầu code khi có lệnh.

Mục 0.4 của `docs/01-project/FEATURE_BACKLOG.md`. Quyết định kiến trúc: AD-25 (sửa một phần AD-13). Frontend: `docs/05-frontend/phases/application-automation/PLAN.md`. Nền: AD-24 (bảng điểm), `docs/06-backend/employer-applications/PLAN.md` (trang "Ứng viên", API hàng loạt), AD-16 (lịch sử trạng thái, thông báo trong transaction).

## Mục tiêu

Trả lời nhận xét của giáo viên ở buổi demo 05/11: "chờ 40 ngày, 70 ngày rồi vẫn còn đang chờ xử lý", "không biết họ phù hợp bao nhiêu", "chưa thấy tính tự động".

- Danh sách hồ sơ có điểm % và mặc định xếp "Phù hợp nhất".
- Hồ sơ đạt ngưỡng được hệ thống tự chuyển sang "Đang xem xét"; hồ sơ điểm thấp được gom thành nhóm đề xuất từ chối, nhà tuyển dụng xác nhận một lần.
- Mỗi tuần hệ thống nhắc công ty về hồ sơ tồn.
- Tin đã đóng thì hồ sơ còn treo được hệ thống tự đóng bằng trạng thái mới "Tin đã đóng".

## Các quyết định đã chốt (2026-11-11)

| # | Vấn đề | Chốt |
|---|---|---|
| 1 | Nguồn điểm ở `/employer/applications` | Đọc bảng `job_candidate_match_scores` (AD-24). Không có dòng điểm thì hiện "Chưa có điểm" |
| 2 | Mức tự động | Điểm ≥ X: tự chuyển `PENDING → REVIEWING`. Điểm < Y: đề xuất từ chối, người xác nhận. Không bao giờ tự từ chối |
| 3 | Ngưỡng | X = `autoOutreachMinScore` của tin (không thêm cột). Y = cột mới theo tin, mặc định 50, Y < X |
| 4 | Nhắc | Mỗi tuần một lần, thứ Hai 8h, một thông báo gộp mỗi công ty. "Tồn" = đứng yên quá 7 ngày, tính từ ngày nộp hoặc lần đổi trạng thái gần nhất. Hằng số trong code |
| 5 | Hồ sơ của tin đã đóng | Trạng thái mới `JOB_CLOSED`, hệ thống tự chuyển. Chờ duyệt: tự đóng. Đang xem xét và Rút gọn chưa phỏng vấn: tự đóng sau 14 ngày, có báo trước |
| 6 | Hồ sơ đã phỏng vấn, chưa có kết quả | Mặc định chỉ nhắc. Công tắc theo tin (mặc định tắt): bật thì tự đóng sau 30 ngày kể từ mốc muộn hơn giữa ngày tin đóng và buổi phỏng vấn gần nhất; chỉ áp khi tin đã đóng |
| 7 | AD | AD-25, đã ghi 2026-11-11 |

Dòng #5 được Q2 làm rõ: hồ sơ Chờ duyệt đóng ngay, không chờ. Mọi con số (7, 14, 30 ngày; 50 điểm) là số do thiết kế. Đã tìm và không thấy nguồn cho chúng (xem AD-25).

## Câu hỏi đã chốt (2026-11-12)

| # | Câu hỏi | Kết quả |
|---|---|---|
| Q1 | Tự chuyển "Đang xem xét" có cần công tắc theo tin không? Ứng viên sẽ nhận thông báo và email "hồ sơ đang được xem xét" dù chưa ai mở hồ sơ. | **Có công tắc `autoReviewEnabled`, mặc định bật.** Công tắc **chỉ** điều khiển bước `PENDING → REVIEWING`. Đề xuất từ chối, nhắc tuần và tự đóng không phụ thuộc nó; tự đóng hồ sơ đã phỏng vấn có công tắc riêng (#6) |
| Q2 | "Chờ duyệt" tự đóng bao lâu sau khi tin đóng? | **Không chờ.** Đóng ở lượt chạy hằng ngày đầu tiên sau khi tin đóng (8h30 sáng, tức muộn nhất khoảng một ngày) |
| Q3 | Tên giá trị enum. `CLOSED` trùng tên với `JobPostStatus.CLOSED`. | **`JOB_CLOSED`**, nhãn "Tin đã đóng" |

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency. Dùng `node-cron`, Prisma, `$queryRaw`, `notifyOnce` + `dedupeKey` như các job nhắc sẵn có.
- Module mới `apps/server/src/modules/application-automation/`, đăng ký awilix bằng hàm `registerApplicationAutomation(container)` như `match-scores`.
- **Một lối duy nhất để đổi trạng thái:** module mới không tự `UPDATE` bảng `applications`. `ApplicationsService` mở hàm public `changeStatusBySystem(target, to)`, bên trong gọi đúng `applyStatusChange` hiện có với `actorId = null`. Nhờ vậy cập nhật có điều kiện, lịch sử, huỷ lịch và thông báo vẫn đi chung một transaction (AD-16).
- **Quy tắc là hàm thuần** (`application-automation.policy.ts`): phân nhóm hồ sơ, tính ngày tự đóng, tính tuần của `dedupeKey`. Có unit test, không cần DB.
- 1 migration viết tay bằng `prisma migrate diff` (xem bước 1). Xin xác nhận trước khi áp lên Neon. **Không** dùng `--shadow-database-url` trỏ vào DB thật.
- Việc nền chạy chung process, không tách worker (AD-23 mục 8). Mỗi hồ sơ một transaction nhỏ, có giới hạn số hồ sơ mỗi lượt.

## Phần 2 — Liên kết giữa các phần

```text
ApplicationsService.createApplication ──(sau commit, không chờ)──► autoReviewTrigger(applicationId)
AutoOutreachService (PATCH ngưỡng X)   ──(sau commit, không chờ)──► autoReviewTrigger theo tin
                                                                        │
application-automation.job.ts (hằng ngày 8h30) ─► ApplicationAutomationService.runDaily()
scripts/process-applications.ts (chạy tay)     ─┘        ├─ autoReview()   PENDING, điểm ≥ X  → REVIEWING
                                                         └─ autoClose()    tin đã đóng, tới hạn → JOB_CLOSED
                                                                │
                                                                ▼
                                           ApplicationsService.changeStatusBySystem(target, to)
                                             (applyStatusChange: đổi có điều kiện, lịch sử actorId = null,
                                              thông báo + outbox, chung một transaction)

stale-application-reminder.job.ts (thứ Hai 8h) ─► ApplicationAutomationService.runWeeklyReminder()
                                                     ├─ ApplicationAutomationRepository.backlogByCompany()
                                                     └─ NotificationsService.notifyOnce("APPLICATIONS_NEED_ATTENTION", …)

GET /employer/applications ─► ApplicationsRepository.listForCompany
                                 LEFT JOIN job_candidate_match_scores   (điểm, sort=match)
                                 + bộ lọc focus=reject | result          (nhóm đề xuất)
```

- `application-automation` phụ thuộc `applications` (đổi trạng thái), `notifications`, `employers` (người nhận). Chỉ **đọc** bảng điểm bằng SQL, không gọi `match-scores`.
- `applications` không phụ thuộc ngược: lối kích hoạt là `asValue` resolve lúc gọi, giống `autoOutreachTrigger` và `matchScoreTrigger`.
- Từ chối theo đề xuất dùng lại `POST /employer/applications/bulk-status` sẵn có. Không có API từ chối mới.

## Phần 3 — Các bước thực hiện

### Bước 0 — Đo và kiểm trên Neon (chỉ đọc)

Trước khi code, ghi kết quả vào "Ghi chú triển khai":

- Số hồ sơ theo từng nhóm trên dữ liệu hiện tại: Chờ duyệt quá 7 ngày; hồ sơ chưa kết thúc ở tin đã đóng (theo từng trạng thái và số ngày từ khi tin đóng); hồ sơ đã phỏng vấn chưa có kết quả.
- Trong hồ sơ `PENDING` của tin đang hiển thị: bao nhiêu có dòng điểm, bao nhiêu ≥ X, bao nhiêu < 50. Từ đó biết lượt chạy đầu sẽ đổi bao nhiêu hồ sơ và tạo bao nhiêu thông báo, email.
- **Mốc "ngày tin đóng":** `CLOSED` có `closedAt`; `EXPIRED` dùng `expiresAt`. `TAKEN_DOWN` không có cột riêng: kiểm xem `updatedAt` có dùng được không (các lần ghi của hệ thống như `matchScoresAt` đã cố ý không đổi `updatedAt`). Nếu không chắc thì báo lại, không tự thêm cột.
- **Tin đã đóng có lối hiển thị lại không** (gia hạn, đăng lại). Nếu có thì bước 2 phải cho nộp lại trên đơn `JOB_CLOSED`.
- Trang chi tiết hồ sơ và trang ứng viên có đang hiện lịch sử trạng thái với tên người thực hiện không (để biết chỗ nào cần chữ "Hệ thống").

Nếu lượt chạy đầu sẽ đóng hoặc chuyển trên 1.000 hồ sơ, dừng lại báo chủ dự án để chốt cách chạy lần đầu (theo đợt, hay tắt email).

### Bước 1 — Schema và migration

```prisma
enum ApplicationStatus {
  …
  JOB_CLOSED // AD-25 — hệ thống đóng vì tin đã ngừng tuyển
}

enum NotificationType {
  …
  APPLICATIONS_NEED_ATTENTION // AD-25 — employer: nhắc hằng tuần về hồ sơ tồn
}

model JobPost {
  …
  // AD-25 — tự xử lý hồ sơ (0.4). Sửa qua API riêng như cài đặt tự mời.
  autoReviewEnabled           Boolean @default(true)   // Q1
  rejectSuggestBelowScore     Int     @default(50)
  autoCloseInterviewedEnabled Boolean @default(false)
}
```

- Migration viết tay: `prisma migrate diff --from-schema-datasource … --to-schema-datamodel … --script`, xem SQL rồi mới lưu. `ALTER TYPE … ADD VALUE` không được dùng giá trị mới trong cùng transaction, nên migration chỉ thêm giá trị, không ghi dữ liệu.
- Tin có `autoOutreachMinScore ≤ 50` (nếu có) sẽ vi phạm Y < X: bước 0 đếm; migration không sửa dữ liệu, service kẹp Y = X − 1 lúc đọc.
- Không thêm index: các câu quét lọc theo `applications (status, createdAt)` và `(jobPostId, status)` đã có. Bước 6 đo lại bằng `EXPLAIN ANALYZE`.
- Xin xác nhận trước khi `npm run db:deploy` lên Neon.

### Bước 2 — Thêm `JOB_CLOSED` vào mọi chỗ liệt kê trạng thái

| Chỗ | Việc |
|---|---|
| `packages/shared-types` | Thêm vào `ApplicationStatus`. Build lại `dist` |
| `applications.service.ts` | `STATUS_TRANSITIONS`: `JOB_CLOSED: []`. Lối người dùng **không** có chuyển nào sang `JOB_CLOSED` (API đơn lẻ và hàng loạt vẫn từ chối). `createApplication` **không đổi**: đơn `JOB_CLOSED` không nộp lại được, vì tin đã đóng không có lối hiển thị lại (bước 0; chốt 2026-11-12). Khi làm "gia hạn tin" (backlog mục 4) thì thêm lối nộp lại |
| `match-score.repository.ts` | `MATCHED_COUNTS`: `NOT IN ('CANCELLED','REJECTED','JOB_CLOSED')` |
| `notification-templates.ts` | Nhãn trạng thái; `APPLICATION_STATUS_CHANGED` với `newStatus = JOB_CLOSED` có lời riêng (xem bước 4) |
| `support-chat/tools/*` | Nhãn "Tin đã đóng" |
| `dashboard.repository.ts` | Rà các câu phễu và câu đếm theo trạng thái |
| `scripts/lib/large-demo/history.ts`, `seed-dashboard-demo.ts` | Rà chỗ dùng `Record<ApplicationStatus, …>`; không sinh dữ liệu `JOB_CLOSED` |

Cách rà: `tsc` sẽ báo mọi `Record<ApplicationStatus, …>` thiếu khoá; phần SQL thô và chuỗi so sánh thì grep `'REJECTED'`, `"REJECTED"`, `CANCELLED`.

### Bước 3 — Điểm, sắp xếp và bộ lọc gợi ý ở `GET /employer/applications`

- `listForCompany`: `LEFT JOIN job_candidate_match_scores ms ON ms."jobPostId" = a."jobPostId" AND ms."candidateId" = a."candidateId"`. Khoá chính của bảng điểm là đúng cặp này nên không nhân dòng.
- Trường mới của `EmployerApplicationListItem`:

```ts
/** Điểm lưu sẵn (AD-24). null ⇒ chưa có điểm. */
matchScore: number | null;
/** Dải theo ngưỡng của tin. null khi không có điểm. */
matchBand: "ABOVE" | "MIDDLE" | "BELOW" | null;
/** Lần đổi trạng thái gần nhất do hệ thống làm (actorId = null, không phải dòng khởi tạo). */
changedBySystem: boolean;
/** Đã có buổi phỏng vấn diễn ra, không có lịch sắp tới, chưa có kết quả. */
needsResult: boolean;
```

- `sort=match`: `ms."score" DESC NULLS LAST, appliedAt ASC, a."id" ASC`. `sort=skills` giữ nguyên.
- `defaultSort`: `match` cho tab `PENDING` và `REVIEWING`; tab khác giữ `newest`. (Tab `PENDING` trước đây mặc định `oldest`; lựa chọn này vẫn còn trong ô sắp xếp.)
- Tham số mới `focus`:
  - `reject`: hồ sơ `PENDING` của tin đang hiển thị có điểm < Y của tin;
  - `result`: hồ sơ `needsResult`.
- `EmployerApplicationsPage` thêm `focusCounts: { reject: number; result: number }`, áp `jobPostId` và `q`, không áp `status`. Một câu `COUNT(*) FILTER` chạy song song với các câu đếm sẵn có.
- `statusCounts` có thêm `JOB_CLOSED` (đã theo bước 2).
- Không đổi `bulk-status`. Nhóm đề xuất từ chối xử lý theo từng trang (tối đa 50 id mỗi lần), đúng D3 và D6 của plan employer-applications.

### Bước 4 — `ApplicationAutomationService`: tự chuyển và tự đóng

**4a. `ApplicationsService.changeStatusBySystem(target, to)`** — public, bọc `applyStatusChange` trong một transaction với `actorId = null`. Chỉ nhận `to` là `REVIEWING` hoặc `JOB_CLOSED`; giá trị khác thì ném lỗi lập trình. Trả `false` nếu trạng thái vừa bị người khác đổi.

**4b. Tự chuyển `autoReview`:**

- Chọn bằng một câu SQL: hồ sơ `PENDING`, tin đang hiển thị (cùng điều kiện `VISIBLE_JOB` của AD-24), `autoReviewEnabled`, có dòng điểm với `score ≥ autoOutreachMinScore`.
- Ba lối gọi:
  1. hằng ngày trong `runDaily` (bắt các hồ sơ vừa có điểm sau lượt chấm đêm 3h30);
  2. `autoReviewTrigger(applicationId)` ngay sau khi `createApplication` commit: có điểm trong bảng thì chuyển luôn, chưa có thì chờ lối 1;
  3. khi `PATCH` hạ ngưỡng X hoặc bật lại `autoReviewEnabled`: quét riêng tin đó.
- Ứng viên nhận `APPLICATION_STATUS_CHANGED` như khi người bấm "Xem xét".

**4c. Tự đóng `autoClose`:** hàm thuần `closeDueAt(input)` trả ngày tới hạn hoặc `null`:

| Nhóm | Điều kiện | Tới hạn |
|---|---|---|
| G1 | `PENDING` | ngày tin đóng, không chờ (Q2) |
| G2 | `REVIEWING`; hoặc `SHORTLISTED` / `INTERVIEWING` chưa có buổi nào diễn ra và không có lịch sắp tới | ngày tin đóng + 14 ngày |
| G3 | Có lịch `SCHEDULED` ở tương lai | không đóng |
| G4 | Đã có buổi diễn ra, không có lịch sắp tới | `autoCloseInterviewedEnabled` ? max(ngày tin đóng, buổi gần nhất) + 30 ngày : không đóng |

- Chỉ xét tin `EXPIRED`, `CLOSED`, `TAKEN_DOWN`. Mốc "ngày tin đóng" theo kết quả bước 0.
- "Buổi đã diễn ra" = lịch `SCHEDULED` có `scheduledAt` trong quá khứ (AD-16 M2 không lưu `COMPLETED`).
- Thông báo cho ứng viên: `APPLICATION_STATUS_CHANGED` với `newStatus = JOB_CLOSED`. Lời theo nhóm:
  - G1, G2: "Tin … đã ngừng nhận hồ sơ. Hồ sơ của bạn đã được đóng.";
  - G4: "Tin … đã ngừng tuyển và nhà tuyển dụng chưa cập nhật kết quả. Hồ sơ của bạn đã được đóng."
  - Template cần biết nhóm: thêm trường tuỳ chọn `closeReason: "JOB_ENDED" | "NO_RESULT"` vào payload.

**4d. Bảo vệ tải và an toàn:**

- Mỗi hồ sơ một transaction. Mỗi lượt tối đa `AUTOMATION_MAX_PER_RUN = 500` hồ sơ cho mỗi loại; còn lại để lượt sau. Nhường event loop sau mỗi 50 hồ sơ.
- Không chạy chồng (cờ trong bộ nhớ, một process).
- Lỗi một hồ sơ thì ghi log và đi tiếp.
- `runDaily` trả tổng kết: số đã chuyển, số đã đóng theo nhóm, số bỏ qua, thời gian.

### Bước 5 — Nhắc hằng tuần

- `stale-application-reminder.job.ts`: `cron.schedule("0 8 * * 1", …, { timezone: "Asia/Ho_Chi_Minh" })`.
- `backlogByCompany()`: một câu SQL gộp theo công ty, trả các số (mốc 7 ngày, quyết định #4):
  - `pendingStale`: `PENDING` nộp quá 7 ngày, tin đang hiển thị;
  - `reviewingStale`: `REVIEWING` đứng yên quá 7 ngày;
  - `awaitingSchedule`: `SHORTLISTED` quá 7 ngày chưa có lịch (dùng lại hằng `AWAITING_SCHEDULE`);
  - `needsResult`: đã phỏng vấn quá 7 ngày chưa có kết quả;
  - `closingSoon` và `closingOn`: hồ sơ nhóm G2 / G4 sẽ tự đóng trong 7 ngày tới, và ngày gần nhất.
- Công ty có mọi số bằng 0 thì không nhắc.
- Người nhận: mọi employer của công ty (`findManyByCompanyId`), như `APPLICATION_RECEIVED`.
- `notifyOnce("APPLICATIONS_NEED_ATTENTION", userId, payload, "APPLICATIONS_NEED_ATTENTION:<companyId>:<userId>:<thứ Hai của tuần, YYYY-MM-DD giờ VN>")`.
- Nội dung: "12 hồ sơ chờ duyệt quá 7 ngày · 3 ứng viên đã phỏng vấn chưa có kết quả · 5 hồ sơ sẽ tự đóng ngày 18/11". Nhóm bằng 0 thì bỏ. Thứ tự: cần kết quả, sắp tự đóng, chờ duyệt, đang xem xét, chờ đặt lịch.
- Kênh: trong app **và email** (qua outbox). Lý do: người quên xử lý thường là người không mở app. Các nhắc khác (`JOB_POST_EXPIRING`) chỉ trong app; nếu chủ dự án muốn giống vậy thì bỏ email ở template.
- Thêm vào `notification-groups.ts` (nhóm `APPLICATIONS`), `notification.types.ts`, template.

### Bước 6 — API cài đặt theo tin

- `GET` / `PATCH /employer/job-posts/:jobId/application-automation`, quyền như cài đặt tự mời (chỉ người đăng tin sửa; kiểm lại `requireOwnedJob` khi làm).

```ts
interface JobApplicationAutomationSettings {
  autoReviewEnabled: boolean;
  /** X, chỉ đọc ở đây: sửa ở cài đặt tự mời. */
  matchThreshold: number;
  rejectSuggestBelowScore: number;      // Y, 0 ≤ Y < X
  autoCloseInterviewedEnabled: boolean;
}
```

- `PATCH` gửi ít nhất một trường. Y ≥ X ⇒ 400 kèm câu tiếng Việt.
- `PATCH` cài đặt tự mời hạ X xuống ≤ Y ⇒ 400 "Ngưỡng phù hợp phải lớn hơn ngưỡng đề xuất từ chối (Y%)". Đây là thay đổi nhỏ ở `auto-outreach.service.ts`.
- Ghi bằng SQL không đổi `updatedAt` của tin, cùng lý do với `matchScoresAt`.
- Shared types: thêm interface trên, `EmployerApplicationsSort` thêm `"match"`, các trường của bước 3, payload thông báo.

### Bước 7 — Cron, script chạy tay, đăng ký

- `application-automation.job.ts`: `"30 8 * * *"` giờ Việt Nam, gọi `runDaily`. Chạy ban ngày để email tới ứng viên không gửi lúc nửa đêm, và sau lượt chấm 3h30.
- `main.ts`: `registerApplicationAutomation(container)`, `startApplicationAutomationJob`, `startStaleApplicationReminderJob` cạnh các job khác.
- `scripts/process-applications.ts` + `npm run process-applications --workspace=apps/server`:
  - `--dry-run`: in số hồ sơ sẽ chuyển / sẽ đóng theo nhóm và số thông báo nhắc sẽ tạo, không ghi;
  - `--review`, `--close`, `--remind`: chỉ chạy một phần;
  - `--company <id>`: giới hạn một công ty (dùng khi demo và khi kiểm thử).
  - Dùng để chạy lần đầu có kiểm soát và để demo "chạy ngay".

### Bước 8 — Kiểm thử

- **Unit** (`apps/server/tests/unit/application-automation.test.ts`):
  - `closeDueAt`: đủ G1–G4, công tắc bật / tắt, mốc muộn hơn giữa ngày tin đóng và buổi phỏng vấn, có lịch sắp tới thì không đóng;
  - dải điểm: đúng biên X và Y, không có điểm ⇒ `null`;
  - khoá tuần của `dedupeKey` (Chủ nhật và thứ Hai theo giờ Việt Nam);
  - `autoReview`: bỏ qua tin tắt công tắc, tin không hiển thị, hồ sơ không có điểm; trạng thái vừa bị đổi thì bỏ qua, không ghi lịch sử;
  - `autoClose`: giới hạn mỗi lượt, lỗi một hồ sơ thì đi tiếp;
  - nhắc: công ty không có việc tồn thì không thông báo; chạy lại trong tuần không tạo trùng;
  - `changeStatusBySystem`: từ chối đích khác `REVIEWING` / `JOB_CLOSED`; lịch sử có `actorId = null`;
  - API người dùng (đơn lẻ, hàng loạt) không chuyển được sang `JOB_CLOSED`.
- Sửa các test sẵn có dùng `Record<ApplicationStatus, …>` hoặc đếm đủ 7 trạng thái (`employer-applications-service.test.ts`: `statusCounts` thành 8).
- **Trên Neon** (chỉ đọc trước; mỗi bước ghi đều xin xác nhận):
  - `--dry-run` cho cả ba phần, so với số đo ở bước 0;
  - `listForCompany` với `sort=match`: điểm trên dòng khớp bảng điểm; ghép các trang ra đúng danh sách; `EXPLAIN ANALYZE` câu lấy trang với công ty nhiều hồ sơ nhất;
  - `focusCounts.reject` khớp đếm tay ở 2–3 tin;
  - **thư `.local` (chốt 2026-11-12):** sau mỗi lượt chạy thật, đánh dấu `FAILED` kèm ghi chú "Không gửi: …" cho các dòng outbox tới địa chỉ `.local` vừa sinh ra, như đã làm ở 0.2, để outbox không thử lại. Là thao tác ghi lên Neon nên xin xác nhận trước khi chạy;
  - chạy thật cho **một công ty demo** (`--company`): kiểm trạng thái, lịch sử `actorId = null`, số thông báo và outbox tăng đúng bằng số hồ sơ, số "Phù hợp" của 0.3 không đếm đơn `JOB_CLOSED`;
  - chạy lại lần hai: không đổi gì thêm;
  - nhắc tuần cho công ty đó: mỗi employer một thông báo, chạy lại không tạo trùng;
  - **đo tải lượt 8h30** (như mục (e) bước 8 của 0.3): chạy `runDaily` thật với lượt lớn nhất có được (tới giới hạn 500 hồ sơ mỗi loại) trong lúc gọi liên tục `GET /api/health` và danh sách tin công khai; so độ trễ event loop và thời gian phản hồi với lúc không chạy. Ghi thời gian mỗi hồ sơ. Nếu API chậm thêm rõ rệt (p95 tăng trên 20%) thì giảm số hồ sơ mỗi lượt hoặc dời giờ chạy, và báo chủ dự án.
- `npm run build` / `tsc --noEmit` cho server, shared-types và web.

### Bước 9 — Tài liệu

- Cập nhật dòng 0.4 của `FEATURE_BACKLOG.md`, trạng thái AD-25, ghi số đo vào "Ghi chú triển khai".
- FAQ trợ lý hỗ trợ (`content/support-faq/03-tim-viec-ung-tuyen.md`, `07-quan-ly-ung-vien.md`): thêm trạng thái "Tin đã đóng" và việc hệ thống tự chuyển "Đang xem xét".
- `docs/04-api/API_CONVENTIONS.md`: không có ngoại lệ mới (trang vẫn phân trang đánh số như đã ghi).

## Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| Lượt chạy đầu đóng hàng loạt hồ sơ cũ, tạo rất nhiều thông báo và email | Bước 0 đếm trước; chạy lần đầu bằng script theo từng công ty, có `--dry-run`; giới hạn 500 hồ sơ mỗi loại mỗi lượt. Email của bộ demo là địa chỉ `.local`: Resend từ chối và outbox thử lại 5 lần, nên phải xử lý các thư này trước lượt đầu (bước 0, mục Email) |
| Ứng viên nhận "Đang xem xét" khi chưa ai mở hồ sơ | Công tắc theo tin (Q1). Giao diện ghi rõ "Hệ thống tự chuyển" |
| Điểm trong bảng cũ tới một ngày, hoặc chưa có | Hiện "Chưa có điểm"; không tự xử lý hồ sơ thiếu điểm. 0.6 sẽ chấm lại theo ứng viên |
| Điểm ở trang "Ứng viên" (bảng) lệch điểm ở trang hồ sơ theo tin (chấm trực tiếp) khi ứng viên vừa sửa hồ sơ | Cùng bộ chấm (AD-24 mục 4), chỉ lệch tới lượt chấm đêm sau. Ghi rõ, không che |
| Tự đóng nhầm hồ sơ nhà tuyển dụng còn muốn giữ | Hồ sơ Chờ duyệt đóng ngay (Q2), chấp nhận: chưa ai xem các hồ sơ này. Hồ sơ Đang xem xét có 14 ngày và nhắc tuần báo trước ngày đóng. Hồ sơ đã đóng không mở lại được và ứng viên không nộp lại được (tin đã đóng không hiển thị lại); "gia hạn tin" ở backlog mục 4 sẽ thêm lối nộp lại |
| Thêm giá trị enum làm vỡ chỗ so sánh chuỗi | Bước 2: `tsc` cho `Record`, grep cho SQL thô |

## Ngoài phạm vi

- Tự từ chối dưới mọi hình thức; câu hỏi sàng lọc (backlog mục 3).
- Lý do từ chối, mẫu email từ chối hàng loạt (backlog mục 4).
- Chấm lại theo ứng viên ngay khi nộp đơn (0.6): ứng viên mới chưa có điểm thì chờ lượt đêm.
- Cho công ty chỉnh số ngày nhắc hoặc số ngày tự đóng.
- Thay đổi ở trang tổng quan của nhà tuyển dụng.
- Chuyển `GET …/application-matches` (trang hồ sơ theo tin) sang đọc bảng điểm.

## Ghi chú triển khai

### Bước 0 — kết quả đo trên Neon (2026-11-12, chỉ đọc)

Script: `.claude-workspace/scratch/step0-automation.ts` và ba script phụ cùng thư mục, chạy bằng `npx dotenv -e ../../.env -- tsx …` từ `apps/server`. Mọi câu lệnh là `SELECT`.

**Tin theo trạng thái:** 312 `PUBLISHED`, 31 `EXPIRED`, 19 `CLOSED`, 0 `TAKEN_DOWN` (ngoài ra 42 `DRAFT`, 18 `PENDING`).

**Mốc "ngày tin đóng"** (dùng cho G1–G4):

| Trạng thái tin | Mốc | Căn cứ |
|---|---|---|
| `CLOSED` | `closedAt` | 19/19 tin có `closedAt`; `close()` luôn ghi |
| `TAKEN_DOWN` | `createdAt` của dòng `RETRACTED` mới nhất trong `job_post_moderation_actions` | `retract()` ghi dòng này cùng transaction với đổi trạng thái. Neon hiện không có tin nào để kiểm |
| `EXPIRED` | `LEAST(expiresAt, updatedAt)` | Có hai lối sang `EXPIRED`: cron hằng giờ (`expireOverdue`, lúc `expiresAt` đã qua, nên `updatedAt` ≈ `expiresAt`) và hết gói (`expirePublishedByCompany`, trước `expiresAt`, nên `updatedAt` là ngày thật). Nếu sau đó có lần sửa đổi `updatedAt` (PATCH tự mời sửa được ở mọi trạng thái), mốc chỉ muộn hơn, tức đóng muộn chứ không đóng sớm |

Không thêm cột. Dữ liệu demo của `EXPIRED` không khớp hai lối trên: 23 tin có `updatedAt` sớm hơn `expiresAt` 34–67 ngày ở công ty không hết gói, 7 tin có `updatedAt` = `expiresAt` + 7 ngày. Đây là dấu vết của bộ sinh demo. Với dữ liệu này, nhóm G2 ở tin `EXPIRED` tới hạn 65 hồ sơ theo `LEAST`, 10 hồ sơ nếu chỉ theo `expiresAt`.

**Tin đã đóng không có lối hiển thị lại.** Trong code, `PUBLISHED` chỉ đến từ `DRAFT` (gửi duyệt, tự đăng) hoặc `PENDING` (Admin duyệt). Không có gia hạn hay đăng lại cho `EXPIRED`, `CLOSED`, `TAKEN_DOWN`. Vì vậy phần "cho nộp lại trên đơn `JOB_CLOSED`" ở bước 2 và F1 không bao giờ xảy ra (xem phần đã chốt cuối mục).

**Lịch sử trạng thái trên giao diện:** không trang nào của web hiện lịch sử trạng thái hay người thực hiện; API không trả lịch sử (chỉ `interviews.repository.ts` đọc `MAX(createdAt)`). Nhãn "Hệ thống tự chuyển" chỉ cần trường `changedBySystem` như bước 3. Bảng lịch sử có 9.818 dòng, mọi hồ sơ đều có lịch sử; 8 dòng `actorId` null đều là dòng khởi tạo (`fromStatus` null), nên định nghĩa `changedBySystem` (actorId null và không phải dòng khởi tạo) không gắn nhầm nhãn cho dữ liệu cũ.

**Hồ sơ theo trạng thái tin:**

| Tin | Chờ duyệt | Đang xem xét | Rút gọn | Mời PV | Nhận | Từ chối | Huỷ |
|---|---|---|---|---|---|---|---|
| `PUBLISHED` | 1.246 | 674 | 383 | 140 | 46 | 1.356 | 205 |
| `EXPIRED` | 22 | 33 | 32 | 10 | 3 | 158 | 19 |
| `CLOSED` | 13 | 15 | 14 | 14 | 6 | 103 | 10 |

**Chờ duyệt ở tin đang hiển thị (1.246 hồ sơ):** mọi tin đang hiển thị có X = 80. Có điểm 1.221; ≥ 80: **258**; 50–79: 422; < 50: **541** (43%); không có điểm 25 (tin đã chấm, ứng viên không có kỹ năng chung với tin). Nộp quá 7 ngày: 565.

**Hồ sơ tồn > 7 ngày ở tin đang hiển thị** (tính từ ngày nộp, lần đổi trạng thái gần nhất, buổi PV gần nhất): Chờ duyệt 565 (quá 60 ngày: 8), Đang xem xét 393, Rút gọn 250, Mời PV 23. Nhắc tuần lượt đầu: **46 công ty, 80 employer** nhận (80 thông báo + 80 email).

**Tin đã đóng, hồ sơ chưa kết thúc (theo mốc ở trên):**

| Nhóm | `EXPIRED` | `CLOSED` | Tới hạn ở lượt đầu |
|---|---|---|---|
| G1 Chờ duyệt | 22 | 13 | 35 (đóng ngay) |
| G2 chưa PV | 65 | 29 | 94 (đã quá 14 ngày) |
| G3 có lịch sắp tới | 2 | 3 | không đóng |
| G4 đã PV, chưa kết quả | 8 | 11 | 0 (kể cả khi bật công tắc) |

G2 chỉ gồm Đang xem xét (48) và Rút gọn (46); không có hồ sơ Mời PV nào chưa có buổi diễn ra. Đã PV, chưa kết quả, không có lịch sắp tới: 85 hồ sơ (66 ở tin đang hiển thị, 19 ở tin đã đóng) — đây là cỡ nhóm "Cần kết quả".

**Lượt chạy đầu:** tự chuyển 258 + tự đóng 129 = **387 hồ sơ**, dưới ngưỡng dừng 1.000 và dưới giới hạn 500 mỗi loại. Trải trên 44 công ty, không công ty nào chiếm phần lớn (cao nhất 30 hồ sơ). Sinh 387 thông báo và 387 email cho 319 ứng viên.

**Email (phát hiện mới, cần chốt trước lượt chạy thật đầu tiên ở bước 8):**

- `.env` đang `DEV_SKIP_EMAIL_SENDING=false`, Resend ở chế độ thử chỉ gửi được tới email của chủ tài khoản. Thư tới địa chỉ `.local` lỗi rồi được thử lại 5 lần (giãn 1, 5, 15, 30 phút). Outbox xử lý tối đa 20 thư mỗi phút, nên 382 thư × 5 lần thử là khoảng 1.900 lượt, tức khoảng 1,5 giờ của outbox, và làm trễ email khác trong lúc đó. Đây là ước tính từ cấu hình, chưa đo.
- Trong 387 thư có 5 thư tới 1 địa chỉ thật (không phải `.local`); 382 thư còn lại là `.local`.
- Tiền lệ 0.2: các thư demo `.local` được đánh dấu `FAILED` kèm ghi chú "Không gửi: …" (58 dòng hiện có trong outbox). Lượt đầu của 0.4 làm giống vậy (đã chốt, xem cuối mục); đó là thao tác ghi lên Neon nên phải xin xác nhận.

**Chủ dự án chốt sau bước 0 (2026-11-12):**

- Bỏ phần "cho nộp lại trên đơn `JOB_CLOSED`" ở bước 2 (`createApplication`) và F1 (nút "Ứng tuyển lại"), vì tin đã đóng không mở lại được. Đã sửa bước 2, bước 8, bảng rủi ro, plan frontend và AD-25.
- "Gia hạn tin" không làm trong 0.4; đã ghi thành một dòng ở `FEATURE_BACKLOG.md` mục 4. Khi làm mục đó thì thêm lối nộp lại.
- Thư `.local`: xử lý như 0.2 (đánh dấu `FAILED` kèm ghi chú), xin xác nhận trước khi ghi lên Neon. Đã ghi vào bước 8.

### Bước 1 — schema và migration (2026-11-12)

- `schema.prisma`: thêm `ApplicationStatus.JOB_CLOSED`, `NotificationType.APPLICATIONS_NEED_ATTENTION` và 3 cột `JobPost` (`autoReviewEnabled` mặc định `true`, `rejectSuggestBelowScore` mặc định 50, `autoCloseInterviewedEnabled` mặc định `false`).
- Migration `20261112120000_add_application_automation`: SQL sinh bằng `prisma migrate diff --from-schema-datasource --to-schema-datamodel --script` (chỉ đọc cấu trúc Neon, không dùng shadow DB). Gồm 2 câu `ALTER TYPE … ADD VALUE` và 1 câu `ALTER TABLE job_posts ADD COLUMN` × 3. Không ghi dữ liệu. Trước đó `prisma migrate status` báo Neon đã áp đủ 35 migration.
- Kiểm `autoOutreachMinScore ≤ 50`: 0 tin ở mọi trạng thái (mọi tin X = 80), nên không tin nào vi phạm Y < X khi Y = 50.
- Đã chạy `prisma generate`. `tsc` của `apps/server` báo lỗi ở những chỗ liệt kê trạng thái, đúng như dự kiến, sẽ hết sau bước 2 và bước 4. Ngoài các file đã ghi ở bước 2, `tsc` còn chỉ ra: `application.mapper.ts`, `users.service.ts` (gán enum Prisma sang `ApplicationStatus` của shared-types, hết khi shared-types có `JOB_CLOSED`); `notification-groups.ts`, `notification.mapper.ts`, `notification.types.ts` (payload), `notification-templates.ts` (thiếu renderer cho `APPLICATIONS_NEED_ATTENTION`).
- **Đã áp lên Neon (2026-11-12)** sau khi chủ dự án xác nhận (`npm run db:deploy`). Kiểm lại: hai giá trị enum mới đã có; 422/422 tin nhận `autoReviewEnabled = true`, `rejectSuggestBelowScore = 50`, `autoCloseInterviewedEnabled = false`; `prisma migrate status` báo đủ 36 migration.

### Bước 2 — `JOB_CLOSED` ở mọi chỗ liệt kê trạng thái (2026-11-12)

- `packages/shared-types`: `ApplicationStatus` thêm `JOB_CLOSED`, đã build lại `dist`. `NotificationType` **chưa** thêm `APPLICATIONS_NEED_ATTENTION` (để bước 5 thêm cùng payload và template).
- `applications.service.ts`: `STATUS_TRANSITIONS.JOB_CLOSED = []`, không trạng thái nào có đích `JOB_CLOSED`. `statusCounts` tự có khoá `JOB_CLOSED` (lấy từ khoá của bảng chuyển). `createApplication` không đổi.
- `match-score.repository.ts`: `MATCHED_COUNTS` loại thêm `JOB_CLOSED`.
- Nhãn "Tin đã đóng": `notification-templates.ts` (chỉ nhãn; lời riêng theo `closeReason` để bước 4), `support-chat-tool-format.ts` (tool của ứng viên lấy danh sách trạng thái từ bảng nhãn này nên tự nhận `JOB_CLOSED`).
- Rà, không cần sửa: `dashboard.repository.ts` (chỉ đếm `PENDING`, không có câu phễu theo trạng thái hồ sơ); `interviews.service.ts` (đặt lịch chỉ nhận `SHORTLISTED` / `INTERVIEWING`, nên đơn `JOB_CLOSED` không đặt lịch được); `scripts/lib/large-demo/history.ts`, `seed-dashboard-demo.ts` (không có `Record<ApplicationStatus, …>`, không sinh `JOB_CLOSED`); `applications.dto.ts` (PATCH đơn lẻ dùng `nativeEnum` nên nhận chữ `JOB_CLOSED`, nhưng `canTransition` trả 400; `bulk-status` chỉ nhận `REVIEWING` / `SHORTLISTED` / `REJECTED`).
- Test: `employer-applications-service.test.ts` sửa `statusCounts` thành 8 khoá; thêm test người dùng không chuyển sang / ra khỏi `JOB_CLOSED` (bảng chuyển, `bulk-status`, PATCH đơn lẻ ⇒ 400). Toàn bộ unit test server: 467/467 qua.
- `tsc` server: hết lỗi về `JOB_CLOSED`; còn lỗi của `APPLICATIONS_NEED_ATTENTION` (notifications), hết ở bước 5.
- `tsc` web: lỗi ở `lib/application-status.ts` và `components/admin/UserDetailSections.tsx` (thiếu khoá `JOB_CLOSED`), đúng như plan frontend dự kiến, sửa ở F1. Chưa sửa web trong bước này.
- Việc để bước 9: FAQ `content/support-faq/03-tim-viec-ung-tuyen.md` và `07-quan-ly-ung-vien.md` liệt kê trạng thái, cần thêm "Tin đã đóng" khi tính năng chạy thật.

### Bước 3 — điểm, sắp xếp, nhóm gợi ý ở `GET /employer/applications` (2026-11-12)

- `application-automation/application-automation.policy.ts` (mới): `effectiveRejectThreshold(X, Y)` (kẹp Y = X − 1) và `matchBand(score, X, Y)`. Bản SQL cùng quy tắc là `REJECT_SUGGEST_THRESHOLD` trong `applications.repository.ts`.
- `applications.repository.ts`: `MATCH_SCORE_JOIN` (LEFT JOIN bảng điểm theo khoá chính), các hằng `LAST_INTERVIEW_AT`, `NEEDS_RESULT`, `SUGGEST_REJECT`, `CHANGED_BY_SYSTEM`; `listForCompany` trả thêm điểm, X, Y, `lastInterviewAt`, `changedBySystem`, `needsResult` và nhận `focus`; `ORDER_BY.match`; hàm mới `countFocus` (một câu `COUNT(*) FILTER`, chạy song song với các câu đếm sẵn có). `VISIBLE_JOB` của `match-score.repository.ts` được export để dùng chung.
- `applications.service.ts`: `defaultSort(status, focus)`; `total` lấy từ `focusCounts` khi có `focus`; trả `focusCounts`.
- Shared types: `EmployerApplicationsSort` thêm `"match"`, kiểu mới `EmployerApplicationsFocus`, `ApplicationMatchBand`; `EmployerApplicationListItem` thêm `matchScore`, `matchBand`, `changedBySystem`, `needsResult`, `lastInterviewAt`; `EmployerApplicationsPage` thêm `focusCounts`.
- **Chọn thêm khi làm (plan chưa ghi):**
  - `focus` **không dùng chung** với `status`: gửi cả hai ⇒ 400 "Không lọc theo trạng thái cùng lúc với nhóm gợi ý". Plan frontend coi nhóm gợi ý là một chế độ riêng, nên không cần kết hợp; nhờ vậy `total` lấy thẳng từ `focusCounts`.
  - Sắp xếp mặc định khi có `focus`: `oldest` (chờ lâu nhất trước, như tab Chờ duyệt trước đây).
  - `needsResult` chỉ xét `SHORTLISTED` / `INTERVIEWING` (chỉ hai trạng thái này có lịch).
  - Thêm trường `lastInterviewAt` (buổi gần nhất đã diễn ra), vì F2 cần hiện "phỏng vấn N ngày trước" ở nhóm `focus=result`.
- Test: `employer-applications-service.test.ts` sửa sort mặc định (`PENDING` thành `match`), thêm test query (`sort=match`, `focus`, `focus` + `status` ⇒ lỗi), `focus` chuyển xuống repository và `total`, các trường mới trên dòng. Thêm `application-automation.test.ts` (biên X, Y, không có điểm, kẹp Y ≥ X). Toàn bộ unit test server: 473/473 qua.
- **Chạy thử trên Neon (chỉ `SELECT`)**, công ty nhiều hồ sơ nhất (450 hồ sơ): `focusCounts` = `{ reject: 54, result: 8 }`, khớp đếm tay bằng câu SQL viết riêng; tab Chờ duyệt với `sort=match` sắp đúng điểm giảm dần; `focus=reject` ra 50/50 dòng `BELOW`; `focus=result` ra 8 dòng, đều có `needsResult` và `lastInterviewAt`; điểm trên dòng khớp bảng điểm (97 = 97). Thời gian mỗi câu 110–280 ms tính cả đường mạng tới Neon; `EXPLAIN ANALYZE` để bước 8. `changedBySystem` hiện đều `false` (chưa có lần tự chuyển nào).
- `tsc` server: chỉ còn lỗi của `APPLICATIONS_NEED_ATTENTION` (bước 5). Web chưa dùng các trường mới (F2).

### Bước 4 — tự chuyển và tự đóng (2026-11-12)

- `applications.service.ts`:
  - `changeStatusBySystem(target, to, { closeReason })` mở transaction riêng rồi gọi `applyStatusChange`, với `actorId` nay nhận `null`.
  - Bảng `SYSTEM_TRANSITIONS` tách khỏi `STATUS_TRANSITIONS`: `REVIEWING` chỉ từ `PENDING`; `JOB_CLOSED` từ 4 trạng thái chưa kết thúc. Đích khác, trạng thái gốc khác, hoặc `closeReason` đi với đích khác `JOB_CLOSED` ⇒ ném lỗi lập trình.
  - `createApplication` gọi `autoReviewTrigger({ applicationId })` sau commit.
- `notification.types.ts`: payload `APPLICATION_STATUS_CHANGED` thêm `closeReason?`.
- `notification-templates.ts`: `newStatus = JOB_CLOSED` có tiêu đề "Hồ sơ ứng tuyển đã được đóng" và lời theo `closeReason`, đúng như 4c. Các trạng thái khác giữ lời cũ.
- Module mới `application-automation/`:
  - `.config.ts`: 14, 30 ngày; 500 hồ sơ mỗi loại mỗi lượt; nhường event loop mỗi 50 hồ sơ.
  - `.policy.ts`: `closeDecision` / `closeDueAt` theo bảng G1–G4.
  - `.repository.ts`: chỉ đọc. `findAutoReviewTargets`, `findCloseTargets`; hằng SQL `JOB_CLOSED_AT`, `CLOSE_DUE_AT` (giữ cùng quy tắc với `closeDecision`), `OPEN_ON_CLOSED_JOB` (để bước 5 dùng lại).
  - `.service.ts`: `autoReview`, `autoClose`, `runDaily` (cờ không chạy chồng), `trigger`.
  - `.module.ts`: `registerApplicationAutomation`.
- `applications.repository.ts`: export `APPLIED_AT`, `LAST_INTERVIEW_AT` để dùng chung.
- **Chọn thêm khi làm (plan chưa ghi):**
  - **Đăng ký module ngay ở bước 4** (`main.ts` gọi `registerApplicationAutomation` sau `registerMatchScores`), không đợi bước 7: `ApplicationsService` cần `autoReviewTrigger`, thiếu đăng ký thì API nộp đơn lỗi. Cron và script vẫn để bước 7.
  - `JOB_CLOSED` cũng huỷ lịch `SCHEDULED` chưa diễn ra, `cancelReason` "Tin tuyển dụng đã ngừng tuyển". Hệ thống không đóng hồ sơ có lịch sắp tới (G3), nên việc này chỉ phòng trường hợp lịch được đặt chen vào giữa lúc chọn và lúc đóng.
  - Mốc ngày tin đóng: `CLOSED` thiếu `closedAt`, hoặc `TAKEN_DOWN` thiếu dòng `RETRACTED`, thì lùi về `updatedAt`. Như vậy hồ sơ chỉ đóng muộn hơn, không sớm hơn. Neon hiện không có tin nào rơi vào trường hợp này.
  - SQL lọc hạn trước để giới hạn 500 không bị hồ sơ G3, G4 (tắt) chiếm chỗ. Service xét lại từng dòng bằng `closeDecision`. Dòng lệch (giờ DB và giờ app khác nhau) đếm vào `notDue` và để lượt sau.
  - Thứ tự xử lý: tự chuyển xếp nộp sớm nhất trước; tự đóng xếp hạn sớm nhất trước.
  - `AutoReviewTrigger` nhận `{ applicationId }` hoặc `{ jobPostId }`. Lối 3 (PATCH hạ X, bật lại công tắc) sẽ nối ở bước 6, cùng API cài đặt.
- Test:
  - `application-automation.test.ts`: `closeDecision` đủ G1–G4, công tắc bật/tắt, mốc muộn hơn, trạng thái đã kết thúc; `autoReview`, `autoClose` với repository giả (raced, lỗi một hồ sơ thì đi tiếp, `limited`, `notDue`, `closeReason` theo nhóm); `runDaily` chạy chồng ⇒ `LOCKED`; lời thông báo `JOB_CLOSED`.
  - `employer-applications-service.test.ts`: `changeStatusBySystem` ghi lịch sử `actorId = null`; `JOB_CLOSED` kèm `closeReason` và lý do huỷ lịch riêng; trạng thái vừa đổi ⇒ `false`, không ghi gì; đích hay gốc sai ⇒ lỗi.
  - Toàn bộ unit test server: 488/488 qua.
- **Chạy thử câu chọn trên Neon (chỉ `SELECT`, script `.claude-workspace/scratch/step4-verify.ts`):**
  - Tự chuyển: **258** hồ sơ ở 145 tin, đều `PENDING`.
  - Tự đóng: **129** hồ sơ, gồm G1 35 (Chờ duyệt) và G2 94 (Đang xem xét 48, Rút gọn 46). `closeDecision` xét lại không lệch dòng nào. Khớp đếm tay theo định nghĩa bước 0 (35 / 94) và khớp số đo bước 0.
  - Phạm vi một hồ sơ / một công ty lọc đúng.
  - Thời gian khi kết nối đã mở: 50–210 ms mỗi câu. Lần gọi đầu 3,7 s, gồm cả mở kết nối.
  - **Chưa ghi gì lên Neon.** Chạy thật để bước 8, xin xác nhận trước.
- `tsc` server: chỉ còn lỗi của `APPLICATIONS_NEED_ATTENTION` (bước 5).

### Bước 5 — nhắc hằng tuần (2026-11-12)

- Loại `APPLICATIONS_NEED_ATTENTION`:
  - Thêm vào shared-types `NotificationType` (đã build lại `dist`), `notification-groups.ts` (nhóm `APPLICATIONS`) và payload trong `notification.types.ts`.
  - Payload: `companyId`, `companyName`, 5 con số, `closingOn`.
- Template:
  - Tiêu đề "Có hồ sơ ứng viên cần xử lý".
  - Thân gồm các ý nối bằng " · ", theo thứ tự của plan, bỏ ý bằng 0.
  - Có email; tiêu đề thư "[Công ty] Hồ sơ ứng viên cần xử lý tuần này". Khi có hồ sơ sắp tự đóng, thư thêm một câu giải thích.
- `application-automation`:
  - `.config.ts`: `STALE_AFTER_DAYS` = 7, `CLOSING_SOON_DAYS` = 7, `AUTOMATION_DAILY_RUN_VN` = 8h30.
  - `.policy.ts`: `vnWeekKey` (thứ Hai của tuần theo giờ VN) và `nextAutoCloseRun`.
  - `.repository.ts`: `backlogByCompany`, một câu SQL gộp theo công ty, chỉ trả công ty có số khác 0.
  - `.service.ts`: `runWeeklyReminder`. Có cờ không chạy chồng; lỗi của một người nhận hay một công ty thì ghi log rồi đi tiếp.
  - `stale-application-reminder.job.ts`: `"0 8 * * 1"` giờ VN. **Chưa gọi trong `main.ts`**, để bước 7 như plan.
- `applications.repository.ts`: export thêm `NEEDS_RESULT`.
- **Chọn thêm khi làm (plan chưa ghi):**
  - **Phạm vi từng số:**
    - Chờ duyệt, Đang xem xét, Chờ đặt lịch: chỉ tính tin đang hiển thị (`VISIBLE_JOB`). Hồ sơ cùng loại ở tin đã đóng đã nằm trong "sắp tự đóng" hoặc đã bị đóng.
    - Cần kết quả: tính mọi tin, đúng quyết định #6 "mặc định chỉ nhắc".
  - **Mốc "đứng yên":** lần đổi trạng thái gần nhất (`MAX` lịch sử), không có thì ngày nộp. Riêng "cần kết quả" tính từ buổi phỏng vấn gần nhất.
  - **Chờ đặt lịch:** dùng `AWAITING_SCHEDULE` và bỏ hồ sơ đã phỏng vấn, để một hồ sơ không bị đếm hai lần.
  - **Hồ sơ G4 bật công tắc** sắp tới hạn có thể nằm ở cả "cần kết quả" lẫn "sắp tự đóng": đây là hai việc khác nhau, chấp nhận.
  - **Ngày "sẽ tự đóng"** không lấy thẳng `dueAt` mà lấy ngày của lượt 8h30 đầu tiên kể từ hạn (`nextAutoCloseRun`), để ngày báo trước khớp ngày ứng viên nhận thông báo. Hạn đã qua mà chưa đóng thì lấy lượt kế tiếp.
  - **Lời "từ ngày dd/mm"** thay cho "ngày dd/mm" của plan, vì các hồ sơ có thể tới hạn ở nhiều ngày khác nhau.
  - **Định dạng ngày:** ICU ghi ngày/tháng của `vi-VN` là "18-11", nên template tự ghép `dd/mm`.
  - **Link:** theo ý đầu tiên khác 0 và lọc được (`focus=result`, `status=PENDING`, `REVIEWING`, `SHORTLISTED`); chỉ có "sắp tự đóng" thì mở `/employer/applications`. Đã sửa dòng tương ứng ở plan frontend (F5).
  - **Hằng 7 ngày trong lời nhắc** lấy từ `STALE_AFTER_DAYS`, nên template import config của module `application-automation`.
- Test (`application-automation.test.ts`):
  - `vnWeekKey`: Chủ nhật và thứ Hai theo giờ VN, cùng tuần.
  - `nextAutoCloseRun`: trước/sau 8h30, đúng 8h30, hạn đã qua, 23h giờ VN.
  - Lượt nhắc: mỗi employer một thông báo, đúng khoá; `closingOn` đã đổi sang ngày lượt chạy; không công ty nào ⇒ không thông báo; chạy lại trong tuần ⇒ không trùng; lỗi một người nhận ⇒ đi tiếp.
  - Lời nhắc: thứ tự, bỏ ý bằng 0, email, link.
  - Toàn bộ unit test server: 494/494 qua.
- **Chạy thử trên Neon (chỉ `SELECT`, `.claude-workspace/scratch/step5-verify.ts`, chỉ dựng lời nhắc, không gửi):**
  - **45 công ty, 79 employer** sẽ nhận. Bước 0 ước 46 / 80 theo định nghĩa rộng hơn (mọi tin, mốc gồm cả buổi phỏng vấn).
  - Tổng: chờ duyệt quá 7 ngày 579, đang xem xét 415, chờ đặt lịch 268, cần kết quả 31, sắp tự đóng 94.
  - Hai số chờ duyệt và cần kết quả khớp đếm tay bằng câu SQL viết riêng (579 / 31).
  - 94 "sắp tự đóng" chính là 94 hồ sơ G2 đã quá hạn ở bước 4. Lượt 8h30 đầu tiên sẽ đóng chúng, nên lần nhắc thứ Hai sau đó sẽ không còn.
  - Thời gian: 591 ms lần đầu, 66 ms lần hai.
  - Ví dụ một lời nhắc: "5 ứng viên đã phỏng vấn chưa có kết quả · 13 hồ sơ sẽ tự đóng từ ngày 13/11 · 16 hồ sơ chờ duyệt quá 7 ngày · 12 hồ sơ đang xem xét quá 7 ngày · 8 ứng viên chờ đặt lịch phỏng vấn quá 7 ngày" → `?focus=result`.
  - **Chưa ghi gì lên Neon.**
- **Email lượt nhắc đầu:** 79 thư cho employer. Số thư tới địa chỉ `.local` chưa đếm; sẽ đếm ở `--dry-run` bước 8 và xử lý như thư `.local` của ứng viên (đã chốt, xin xác nhận trước khi ghi).
- `tsc` server: **hết lỗi**. `tsc` web còn 4 lỗi, đều do thiếu khoá: `lib/application-status.ts` và `components/admin/UserDetailSections.tsx` thiếu `JOB_CLOSED` (F1); `lib/notifications.ts` thiếu 2 khoá `APPLICATIONS_NEED_ATTENTION` (F5). Chưa sửa web.

### Bước 6 — API cài đặt theo tin (2026-11-12)

- `GET` / `PATCH /employer/job-posts/:jobId/application-automation`:
  - Quyền giống cài đặt tự mời: chỉ người đăng tin (so `employerId` của tin với employer của người gọi); tin của người khác hoặc không có ⇒ 404. Đọc và sửa được ở mọi trạng thái của tin.
  - Shared types: `JobApplicationAutomationSettings`, `UpdateJobApplicationAutomationRequest` (đã build lại `dist`).
- File mới trong `application-automation/`: `.dto.ts` (zod: ít nhất một trường; Y nguyên 0–100), `.controller.ts`. `.module.ts` thêm `applicationAutomationRouter` (gọi `registerApplicationAutomation` rồi trả route); `main.ts` đổi lời gọi `registerApplicationAutomation(container)` thành `app.use("/api", applicationAutomationRouter(container))`, cùng vị trí.
- `.repository.ts`: `findJobSettings`, `updateJobSettings`.
  - Ghi bằng `UPDATE job_posts` thô, không đổi `updatedAt`. Thêm lý do so với plan: `updatedAt` là mốc "ngày tin đóng" của tin `EXPIRED` (`JOB_CLOSED_AT`), nên bật công tắc tự đóng ở tin đã hết hạn mà đổi `updatedAt` sẽ dời ngày tự đóng.
  - Gửi Y thì câu UPDATE có thêm điều kiện `"autoOutreachMinScore" > Y`.
- `.service.ts`: `getJobSettings`, `updateJobSettings`; thêm dependency `employerIdentityCache`.
  - Y ≥ X ⇒ 400 "Ngưỡng đề xuất từ chối phải nhỏ hơn ngưỡng phù hợp (X%)."
  - Câu UPDATE không ghi được dòng nào (X vừa bị hạ ở cài đặt tự mời giữa lúc đọc và lúc ghi) ⇒ đọc lại, trả 400 theo X mới.
  - Bật lại `autoReviewEnabled` (từ tắt sang bật) ở tin `PUBLISHED` ⇒ `trigger({ jobPostId })` (lối 3).
- `auto-outreach.service.ts`:
  - PATCH gửi `minScore` ≤ Y của tin ⇒ 400 "Ngưỡng phù hợp phải lớn hơn ngưỡng đề xuất từ chối (Y%)." Không ghi gì. Không gửi `minScore` thì không kiểm.
  - Hạ X ở tin `PUBLISHED` ⇒ `autoReviewTrigger({ jobPostId })` (lối 3).
  - Thêm dependency `autoReviewTrigger`; `auto-outreach.repository.ts` đọc thêm cột `rejectSuggestBelowScore`.
- **Chọn thêm khi làm (plan chưa ghi):**
  - **Y trả về là Y thực dùng** (`effectiveRejectThreshold`, kẹp về X − 1), để thẻ hiện đúng ngưỡng mà nhóm đề xuất từ chối đang áp. Neon hiện không có tin nào cần kẹp (bước 1).
  - **Lối 3 khi hạ X không xét công tắc tự mời hay gói**: X dùng chung, nên hạ X ở gói Dùng thử (vẫn sửa được ngưỡng) cũng làm hồ sơ vừa đạt ngưỡng được tự chuyển. Câu chọn tự lọc `autoReviewEnabled` và tin không hiển thị. Tăng X, giữ nguyên X, tin chưa đăng thì không quét.
  - **Còn một khe nhỏ khi hai PATCH chạy cùng lúc:** cài đặt tự mời kiểm X > Y theo Y đọc lúc đầu, không có điều kiện trong câu ghi. Nếu cùng lúc có người tăng Y, có thể ra Y ≥ X. Không sửa thêm vì Y luôn bị kẹp lúc đọc (bước 1), nhóm đề xuất từ chối vẫn đúng.
  - Ghi lỗi 400 ở service (cần X của tin), không ở zod.
- Form tạo tin hiện chỉ gửi `hiringTarget` và `enabled` qua cài đặt tự mời, không gửi X, nên điều kiện mới không ảnh hưởng. Thẻ "Tự động mời ứng viên" sẽ nhận 400 khi hạ X ≤ Y; F4 hiện câu của server như plan frontend đã ghi.
- Test:
  - `application-automation.test.ts`: GET (Y thực dùng); 404 khi không phải người đăng tin; Y ≥ X ⇒ 400, biên Y = X − 1 và Y = 0; X bị hạ chen giữa ⇒ 400 theo X mới; sửa được ở tin đã đóng; lối 3 chỉ khi bật lại ở tin đang đăng; schema.
  - `auto-outreach-settings.test.ts`: hạ X ≤ Y ⇒ 400, không ghi, X = Y + 1 thì được; dữ liệu cũ Y ≥ X vẫn sửa được số người cần tuyển; hạ X ở tin đang đăng ⇒ quét (kể cả gói Dùng thử); tăng hoặc giữ X, tin nháp ⇒ không quét.
  - Toàn bộ unit test server: 503/503 qua. `tsc` server: hết lỗi.
- **Trên Neon (chỉ đọc, `.claude-workspace/scratch/step6-verify.ts`):**
  - `findJobSettings` đọc đúng tin có nhiều hồ sơ Chờ duyệt nhất (X 80, Y 50, công tắc mặc định); id không có ⇒ `null`.
  - Câu UPDATE chỉ in ra bằng prisma giả, **không chạy**: `UPDATE job_posts SET "autoReviewEnabled" = $1, "rejectSuggestBelowScore" = $2 WHERE "id" = $3 AND "autoOutreachMinScore" > $4`. PATCH thật để bước 8, xin xác nhận trước.
  - **`EXPLAIN ANALYZE` các câu quét** (mục "không thêm index" của bước 1), lần chạy thứ hai: tự chuyển toàn hệ thống 5 ms, theo một tin (lối 3) 0,2 ms, tự đóng 2 ms, nhắc tuần 18 ms. Lần chạy đầu, câu tự chuyển mất 1,2 s, lần hai chỉ còn 5 ms. Có thể do cache nguội ở lần đầu, chưa kiểm. Các câu đều quét tuần tự `applications` (bảng vài nghìn dòng), không chậm. **Không thêm index.**

## Phần 4 — Ghi chú của chủ dự án

<!-- Để trống — dành cho chủ dự án. -->
