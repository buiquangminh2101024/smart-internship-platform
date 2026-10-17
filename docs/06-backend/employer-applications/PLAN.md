# Trang "Ứng viên" của Employer — Backend

Song song: `docs/05-frontend/phases/employer-applications/PLAN.md`.
Nền tảng: Phase 8 (module `applications`), AD-16 (lịch sử trạng thái, thông báo trong transaction), `docs/06-backend/employer-interviews/PLAN.md` (D18, phân trang đánh số).

**Trạng thái: BƯỚC 1 XONG (2026-10-17).** D1–D10 đã chốt theo đề xuất ngày 2026-10-17; Q1 đã chốt (bỏ sắp theo điểm, thay bằng sắp theo kỹ năng khớp — D10). Backend xong, xem "Ghi chú triển khai — Bước 1". Bước 2 (frontend) chờ lệnh.

## Mục tiêu

Một trang gom hồ sơ ứng tuyển của **mọi tin** của công ty (`/employer/applications`), để link "Xem tất cả N hồ sơ" của dashboard có chỗ dẫn tới (hiện đang dẫn về `/employer/jobs`). Trang có lọc, tìm, sắp xếp, phân trang đánh số và thao tác hàng loạt.

## Hiện trạng (đọc code 2026-10-17)

| # | Phát hiện | Hệ quả |
|---|---|---|
| H1 | API danh sách chỉ có theo từng tin: `GET /employer/job-posts/:jobId/applications?status=`. Không tìm kiếm, không sắp xếp, không phân trang, `include` cả hồ sơ ứng viên đầy đủ (học vấn, kỹ năng, dự án…). | Cần API mới cấp công ty, chỉ select đúng trường của một hàng. API cũ giữ nguyên. |
| H2 | Phạm vi theo **công ty**: `findEmployerApplicationById` và danh sách theo tin đều lọc `jobPost.companyId`. | API mới cũng theo công ty (mọi employer cùng công ty thấy như nhau). |
| H3 | State machine nằm trong `updateApplicationStatus`: PENDING → REVIEWING/REJECTED; REVIEWING → SHORTLISTED/REJECTED; SHORTLISTED → INTERVIEWING/REJECTED; INTERVIEWING → ACCEPTED/REJECTED; ACCEPTED, REJECTED, CANCELLED là trạng thái cuối. Mỗi lần đổi: cập nhật, ghi `application_status_history`, (REJECTED/ACCEPTED) huỷ lịch sắp tới, `notify("APPLICATION_STATUS_CHANGED")` (thông báo + outbox email), tất cả chung một transaction. | Thao tác hàng loạt **dùng lại đúng logic này**, tách thành hàm nội bộ nhận `tx`. Không có chuyển ngược nên mọi thao tác đều không hoàn tác được. |
| H4 | Cập nhật hiện đọc trạng thái rồi `update` theo `id`, không kèm điều kiện trạng thái cũ. Hai người cùng công ty bấm cùng lúc có thể ghi đè. | Bản hàng loạt cập nhật có điều kiện (`updateMany where { id, status: from }`); đếm 0 dòng ⇒ hồ sơ bị bỏ qua với lý do `STATUS_CHANGED`. Hàm đơn lẻ dùng chung hàm nội bộ nên cũng được sửa luôn. |
| H5 | Điểm phù hợp **không lưu trong DB**: `listApplicationMatches` tính lúc gọi, cho từng tin (chế độ hybrid gọi embedding). | Không sắp xếp theo điểm trên toàn công ty được. Xem Q1. |
| H6 | Dashboard tính thời gian chờ của hồ sơ chờ bằng `COALESCE(reappliedAt, createdAt)`. | Trang mới dùng cùng mốc (`appliedAt`) để số "chờ N ngày" khớp dashboard. |
| H7 | Index sẵn có: `applications (jobPostId, status)`, `(status, createdAt)`. | Đủ cho quy mô khoá luận (lọc qua `jobPost.companyId`). **Không migration.** |
| H8 | `API_CONVENTIONS.md` quy định cursor; `GET /employer/interviews/awaiting` là ngoại lệ đã ghi (D18). | API mới là **ngoại lệ thứ hai**, phải ghi thêm vào `API_CONVENTIONS.md`. |
| H9 | Đặt lịch hàng loạt: `POST /employer/interviews/batch`, tối đa 20 hồ sơ, không bắt buộc cùng tin. | Dùng lại, không đổi. Trang chỉ cần biết hồ sơ nào đang chờ đặt lịch. |
| H10 | Kỹ năng **có lưu trong DB**: `candidate_skills (candidateId, skillId)` và `job_post_skills (jobPostId, skillId, importance REQUIRED/…, minYears)`. Bí danh đã gộp về một `skillId` lúc nhập. | Đếm kỹ năng trùng bằng SQL được, sắp xếp trước khi chia trang (D10). Không migration. |

## Lựa chọn đã chốt (2026-10-17)

| # | Nội dung |
|---|---|
| D1 | Phân trang **đánh số** (`page`/`pageSize`), mặc định 20, tối đa 50. `page` vượt trang cuối thì trả trang cuối (giống D18). |
| D2 | Chọn nhiều chỉ trong trang đang xem (giao diện lo, xem plan FE). |
| D3 | Không có "chọn tất cả N hồ sơ khớp bộ lọc". API hàng loạt nhận danh sách id cụ thể. |
| D4 | Thao tác hàng loạt: **Xem xét** (→ REVIEWING), **Vào danh sách rút gọn** (→ SHORTLISTED), **Từ chối** (→ REJECTED), cộng **Đặt lịch** qua API có sẵn (H9). **Được nhận** chỉ làm từng hồ sơ. |
| D5 | Chọn lẫn trạng thái: hồ sơ không chuyển được sang trạng thái đích thì bị **bỏ qua** kèm lý do, không làm hỏng cả lô. |
| D6 | Tối đa **50** hồ sơ mỗi lần (bằng `pageSize` lớn nhất). Đặt lịch vẫn 20. |
| D7 | Lỗi một phần: hồ sơ hợp lệ vẫn được làm, trả danh sách hồ sơ bị bỏ qua (xem dưới). |
| D8 | Từ chối hàng loạt không hỏi lý do, giống từ chối từng hồ sơ hiện nay. Mỗi ứng viên vẫn nhận thông báo và email. |
| D9 | Thêm mục "Ứng viên" vào menu (giao diện). Backend không đổi gì cho việc này. |
| D10 | **Sắp theo kỹ năng khớp** (`sort=skills`), thay cho sắp theo điểm phù hợp (Q1). Mỗi hồ sơ so với kỹ năng của **chính tin nó ứng tuyển**. Thứ tự: (1) tỉ lệ kỹ năng bắt buộc khớp `requiredMatched / requiredTotal` giảm dần; (2) số kỹ năng không bắt buộc khớp giảm dần; (3) `appliedAt` tăng dần; (4) `id`. Tin không có kỹ năng bắt buộc ⇒ tỉ lệ `NULL`, xếp cuối (`NULLS LAST`). Chỉ khớp đúng cùng `skillId`; không xét `minYears`. Tên trên giao diện là "Khớp kỹ năng", **không** gọi là "độ phù hợp" để khỏi lẫn với điểm của Job Matcher. |

## Câu hỏi đã chốt

| # | Câu hỏi | Kết quả (2026-10-17) |
|---|---|---|
| Q1 | Điểm phù hợp không được lưu (H5): muốn sắp trên toàn công ty phải tính điểm cho **mọi** hồ sơ mỗi lần mở trang. Làm sao? | **Bỏ sắp theo điểm ở trang này.** Khi lọc theo một tin, trang hiện link "Xếp theo độ phù hợp" sang trang hồ sơ của tin đó. Thay vào đó có sắp theo kỹ năng khớp (D10), tính được bằng SQL (H10). Lưu điểm phù hợp vào DB là việc riêng. |

## API mới

Cả hai thuộc module `applications`, guard `EMPLOYER` (như các route employer khác của module).

### `GET /employer/applications?status=&jobPostId=&q=&sort=&page=&pageSize=`

| Tham số | Giá trị | Mặc định |
|---|---|---|
| `status` | một `ApplicationStatus` | tất cả |
| `jobPostId` | id tin của công ty; tin công ty khác ⇒ 404 | tất cả |
| `q` | 2–100 ký tự, tìm không phân biệt hoa thường trong tên ứng viên (`candidate.fullName`) **hoặc** email (`user.email`) | không lọc |
| `sort` | `oldest` (nộp lâu nhất trước) \| `newest` \| `skills` (khớp kỹ năng nhiều nhất, D10) | `oldest` nếu `status=PENDING`, còn lại `newest` |
| `page`, `pageSize` | `page` ≥ 1; `pageSize` 1–50 | 1, 20 |

`oldest` / `newest` sắp theo `appliedAt` (H6), cùng mốc thì theo `id` để ổn định giữa các trang. `skills` theo thứ tự của D10.

```ts
interface EmployerApplicationListItem {
  applicationId: string;
  status: ApplicationStatus;
  appliedAt: string;                 // COALESCE(reappliedAt, createdAt)
  candidate: { id: string; fullName: string | null; avatarUrl: string | null; universityName: string | null };
  jobPost: { id: string; title: string; status: JobPostStatus };
  /** SHORTLISTED, hoặc INTERVIEWING chưa có lịch SCHEDULED — cùng định nghĩa với `AwaitingScheduleApplication`. */
  awaitingSchedule: boolean;
  /** Lịch SCHEDULED gần nhất còn ở tương lai, nếu có. */
  nextInterviewAt: string | null;
  /** Kỹ năng của ứng viên trùng với kỹ năng của tin (D10). Luôn trả, kể cả khi không sắp theo kỹ năng. */
  skillMatch: {
    requiredMatched: number;
    requiredTotal: number;           // 0 ⇒ tin chưa có kỹ năng bắt buộc
    optionalMatched: number;
    optionalTotal: number;
  };
}

interface EmployerApplicationsPage {
  items: EmployerApplicationListItem[];
  total: number;                     // theo đủ bộ lọc hiện tại
  page: number;                      // trang thực sự trả về (D1)
  pageSize: number;
  /** Số hồ sơ theo từng trạng thái, áp `jobPostId` và `q` nhưng **không** áp `status`, để số trên tab khớp danh sách khi bấm tab. */
  statusCounts: Record<ApplicationStatus, number>;
  /** Mọi tin của công ty có ít nhất một hồ sơ, cho ô lọc theo tin (áp `q`, không áp `status`). */
  jobCounts: Array<{ jobPostId: string; title: string; status: JobPostStatus; count: number }>;
}
```

- `universityName`: cùng quy tắc học vấn đại diện với dashboard (`DashboardPendingApplication.universityName`: đang học → năm kết thúc gần nhất → mới tạo nhất). Viết lại bằng một subquery trong module `applications`, không gọi sang module `dashboard`.
- Không trả email, số điện thoại, CV, thư xin việc. Muốn xem thì mở trang chi tiết hồ sơ có sẵn.
- Viết bằng `$queryRaw` (một câu cho trang, một câu `GROUP BY status`, một câu `GROUP BY jobPostId`), chạy song song. Điều kiện lọc viết một lần (`Prisma.sql`) dùng chung cho cả ba.
- `skillMatch` tính trong câu lấy trang bằng một subquery `LEFT JOIN LATERAL`: `job_post_skills` của tin `LEFT JOIN candidate_skills` của ứng viên theo `skillId`, `COUNT(*) FILTER (...)` theo `importance`. Với `sort=skills`, `ORDER BY` dùng `requiredMatched::float / NULLIF(requiredTotal, 0) DESC NULLS LAST, optionalMatched DESC, appliedAt ASC, id ASC`. Không gọi module `job-matching`.

### `POST /employer/applications/bulk-status`

```ts
// body
interface BulkUpdateApplicationStatusRequest {
  applicationIds: string[];          // 1–50, không trùng (D6)
  status: "REVIEWING" | "SHORTLISTED" | "REJECTED";   // D4
}

// data
interface BulkUpdateApplicationStatusResult {
  updated: string[];                 // id đã đổi
  skipped: Array<{ applicationId: string; reason: BulkStatusSkipReason }>;
}
type BulkStatusSkipReason =
  | "NOT_FOUND"            // không tồn tại hoặc thuộc công ty khác
  | "INVALID_TRANSITION"   // trạng thái hiện tại không chuyển được sang đích (D5)
  | "STATUS_CHANGED";      // trạng thái vừa bị đổi bởi người khác (H4)
```

- Luôn trả `200`, kể cả khi `updated` rỗng; `400` chỉ khi body sai (zod).
- Chạy **một transaction** (timeout 30 giây, như `scheduleBatch`). Trong đó, với từng hồ sơ hợp lệ theo thứ tự gửi lên: cập nhật có điều kiện (H4), ghi lịch sử, huỷ lịch sắp tới nếu REJECTED, `notify` — đúng chuỗi của H3. Hồ sơ không hợp lệ không chạm DB.
- `updateApplicationStatus` (đơn lẻ) chuyển sang gọi cùng hàm nội bộ `applyStatusChange(tx, app, to, actorId)`. Hành vi API đơn lẻ không đổi, trừ việc cập nhật có điều kiện: trạng thái vừa bị đổi ⇒ `409` thay vì ghi đè.

## Thay đổi code

| File | Việc |
|---|---|
| `applications.repository.ts` | `listForCompany(companyId, filter, page, pageSize)`, `countByStatus(companyId, filter)`, `countByJob(companyId, filter)`, `findManyForStatusChange(ids, companyId)`, `updateStatusIf(id, from, to, tx)`. |
| `applications.service.ts` | `listCompanyApplications(userId, query)`, `bulkUpdateStatus(userId, dto)`; tách `applyStatusChange` dùng chung với `updateApplicationStatus`. |
| `applications.dto.ts`, `.controller.ts`, `.routes.ts` | Schema query và body, hai route mới. Route `GET /employer/applications` đăng ký **trước** `GET /employer/applications/:id`; `bulk-status` là `POST` nên không đụng `/:id`. |
| `packages/shared-types` | `EmployerApplicationListItem`, `EmployerApplicationsPage`, `EmployerApplicationsQuery`, `BulkUpdateApplicationStatusRequest`, `BulkUpdateApplicationStatusResult`, `BulkStatusSkipReason`. Build lại `dist`. |
| `docs/04-api/API_CONVENTIONS.md` | Ghi ngoại lệ phân trang thứ hai (H8). |

Không đổi: state machine, API theo từng tin, API đặt lịch, module `dashboard`, schema Prisma.

## Các bước

Toàn bộ trang có 3 bước: **1** backend → **2** frontend → **3** kiểm trên trình duyệt (xem plan FE).

| Bước | Nội dung | Điều kiện xong |
|---|---|---|
| 0 | Chủ dự án duyệt plan, chốt Q1. | Q1 chốt 2026-10-17 (D10). Chờ lệnh bắt đầu code. |
| **1** | Kiểu, repository, service, route, cập nhật `API_CONVENTIONS.md`. Test đơn vị cho service (repository giả): lọc theo công ty, tin công ty khác ⇒ 404, `page` vượt cuối ⇒ trang cuối, sort mặc định theo `status`; `sort=skills` truyền đúng xuống repository. SQL chỉ đọc trên DB thật kiểm thứ tự D10: tỉ lệ thắng số đếm thô (3/3 trên 4/10), hoà tỉ lệ thì xét kỹ năng không bắt buộc, tin không có kỹ năng bắt buộc xếp cuối; hàng loạt: chuyển hợp lệ, `INVALID_TRANSITION`, `NOT_FOUND` (id công ty khác), `STATUS_CHANGED`, trùng id ⇒ 400, quá 50 ⇒ 400, REJECTED huỷ lịch sắp tới, mỗi hồ sơ một thông báo. Chạy SQL chỉ đọc trên DB thật để so số đếm với API theo từng tin. | `tsc` server sạch, test pass. |

## Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| Từ chối nhầm hàng loạt, không hoàn tác được | Chỉ nhận id cụ thể (D3), tối đa 50 (D6); giao diện hỏi xác nhận kèm số hồ sơ. |
| Một lô 50 hồ sơ = 50 email | Email đi qua outbox có sẵn, không gửi trong request. Không đổi cơ chế gửi. |
| Transaction dài khi lô lớn | Tối đa 50, timeout 30 giây như `scheduleBatch`. |
| Hồ sơ dồn trang khi dữ liệu đổi | Chấp nhận như D18; giao diện giữ hàng vừa xử lý tại chỗ cho tới khi đổi trang hoặc bộ lọc. |
| Người dùng tưởng "khớp kỹ năng" là đánh giá toàn diện | Hiện số cụ thể trên từng hàng, tên khác "độ phù hợp" (D10). Kỹ năng gần nghĩa nhưng khác mục trong danh mục (vd. "React" và "ReactJS" chưa gộp) không được tính — ghi rõ trong plan, không che. |

## Ngoài phạm vi

Sắp theo điểm phù hợp (Q1); khớp kỹ năng gần nghĩa và xét `minYears` (đã có trong Job Matcher); lý do từ chối; "Được nhận" hàng loạt; lọc theo khoảng ngày; xuất file; hoàn tác.

## Ghi chú triển khai — Bước 1 (2026-10-17)

**File đã đổi:** `applications.repository.ts`, `.service.ts`, `.dto.ts`, `.controller.ts`, `.routes.ts`, `application.mapper.ts`; `interviews.repository.ts` (chỉ `export` hằng `AWAITING_SCHEDULE`); `packages/shared-types/src/index.ts` (đã build `dist`); `docs/04-api/API_CONVENTIONS.md`; test mới `tests/unit/employer-applications-service.test.ts`; `prisma/schema.prisma` + migration `20261017120000_add_educations_candidate_id_index` (index, xem "Tăng tốc" bên dưới).

**Khác với plan / chi tiết thêm:**
- **Số câu SQL.** `total` lấy từ `statusCounts` (tab đang chọn, hoặc tổng mọi tab), nên không có câu đếm riêng. Câu `GROUP BY status`, câu `GROUP BY jobPostId`, kiểm tin thuộc công ty và câu lấy trang (theo `page` được hỏi) chạy song song, nên chỉ chờ DB một lượt. `page` vượt trang cuối thì chạy lại câu lấy trang với trang cuối (hiếm: sửa URL, hồ sơ vừa đổi trạng thái).
- **"Chờ đặt lịch"** dùng chung hằng `AWAITING_SCHEDULE` của module `interviews` (export thêm), không viết bản thứ hai. Hai nơi luôn cùng một định nghĩa.
- **Kiểm tin thuộc công ty:** hàm repository `jobPostBelongsToCompany`, không gọi `prisma` trong service, để test giả được.
- **Thứ tự ghi của lô hàng loạt:** xử lý theo id tăng dần, cùng thứ tự khoá với `lockApplications` của đặt lịch hàng loạt, nên hai lô chồng nhau không khoá chéo. `updated` và `skipped` vẫn theo thứ tự gửi lên.
- **Trạng thái đích trùng trạng thái hiện tại** (vd. hồ sơ đã Đang xem xét, chọn "Xem xét") ⇒ `INVALID_TRANSITION`.
- **409 của API đơn lẻ** trả câu tiếng Việt "Trạng thái hồ sơ vừa được thay đổi. Tải lại để xem trạng thái mới." để giao diện hiện thẳng. Câu 400 cũ giữ nguyên.
- **Tìm kiếm không dấu** (thêm 2026-10-17 theo chủ dự án): tên so bằng `lower(translate(normalize(fullName, NFC), <134 chữ có dấu>, <chữ không dấu>))`, từ khoá bỏ dấu phía JS (`stripVietnameseMarks`), thoát `\ % _`. "nguyen", "Nguyễn", "NGUYỄN" ra cùng kết quả; tên lưu dạng tổ hợp (chữ + dấu rời) cũng khớp nhờ `normalize`. Không cần extension, không migration. Đã kiểm trên Neon (Postgres 18, UTF8, ctype `C.UTF-8`): kết quả của Postgres trùng bản JS cho cả 134 ký tự, ở cả hai dạng.
- **Đo (EXPLAIN ANALYZE, chỉ đọc, 2026-10-17).** DB hiện có 23 ứng viên, 9 hồ sơ. Mỗi câu của trang chạy dưới 1 ms trong Postgres. Một lượt đi về Neon khoảng 70 ms, cả trang (2 câu song song rồi câu lấy trang) khoảng 220 ms ⇒ mạng chiếm gần hết thời gian. Trên 100.000 tên giả: `ILIKE` thường ~35 ms, bản bỏ dấu ~1,4 s (`translate` ~1,1 s, `normalize` ~0,35 s), tức khoảng 14 µs mỗi dòng. Với 23 ứng viên, Postgres quét cả bảng `candidates` rồi mới nối sang công ty (rẻ nhất khi bảng nhỏ); với dữ liệu lớn nó tự lọc theo công ty trước (xem "Tăng tốc"), nên bỏ dấu chỉ chạy trên hồ sơ của công ty. Chỉ chỗ tìm trên toàn bộ dữ liệu mới cần index trigram (`pg_trgm`), xem mục "Tăng tốc tìm kiếm khi dữ liệu lớn" trong `FEATURE_BACKLOG.md`.
- **Tăng tốc (2026-10-17, theo chủ dự án).** Đo trên dữ liệu giả 100.000 ứng viên / 100.000 hồ sơ (bảng `TEMP` cùng tên và cùng index với bảng thật, trong một transaction rồi rollback; công ty đo có 500 hồ sơ):
  - *Đã thử, bỏ:* CTE `MATERIALIZED` buộc lọc công ty trước khi bỏ dấu. Không nhanh hơn (Postgres đã tự làm vậy), câu lấy trang còn chậm thêm ~30 ms.
  - *Giữ:* câu lấy trang chạy cùng lúc với các câu đếm (xem "Số câu SQL"). Cả trang trên DB thật, gọi thẳng service, trung vị 15 lần: 173 ms → 116 ms. Phần còn lại là 2 lượt đi về Neon (~60 ms mỗi lượt): lấy công ty của employer, rồi bốn câu song song.
  - *Index `educations(candidateId)`:* câu lấy trang tốn ~150 ms, trong đó ~120 ms là `REPRESENTATIVE_UNIVERSITY` quét cả bảng `educations` cho từng dòng (~6 ms × 20). Thêm index thường (Prisma tự đặt tên). Migration viết tay, không dùng `migrate dev` vì repo chưa có shadow DB riêng; đã kiểm bằng `prisma migrate diff --from-url` (chỉ đọc): DB thật khớp schema cũ, và khác schema mới đúng một câu `CREATE INDEX` này. Chủ dự án tự chạy `npm run db:deploy`.
  - Các câu đếm: 10–17 ms ở cả hai bản.
- `q` toàn khoảng trắng hoặc rỗng coi như không tìm (không trả 400), vì link có `?q=` trống là chuyện thường.

**Kiểm:**
- `tsc` server sạch (cả file test, qua tsconfig tạm không commit). `shared-types` build sạch.
- Test đơn vị: 20/20 xanh trong file mới; cả bộ `tests/unit/*.test.ts` 194/194 xanh. Các ca: bảng bỏ dấu (134 ký tự, dạng tổ hợp, mẫu ILIKE); query/body (trùng id, quá 50, `q` 1 ký tự, đích `ACCEPTED` ⇒ 400); state machine; sort mặc định; bộ lọc và `sort=skills` xuống repository; `statusCounts` đủ 7 trạng thái; `page` vượt cuối ⇒ trang cuối; rỗng; tin công ty khác ⇒ 404; lô lẫn trạng thái (`INVALID_TRANSITION`, `NOT_FOUND`, `STATUS_CHANGED`, thứ tự ghi, timeout 30 giây, không ghi lịch sử/thông báo cho hồ sơ bỏ qua); từ chối huỷ lịch sắp tới và mỗi hồ sơ một thông báo; API đơn lẻ 400 / 409 / được nhận.
- **SQL chỉ đọc trên DB thật** (script tạm, chỉ `SELECT`, không in tên/email), 3 công ty có hồ sơ (9 hồ sơ): `countByStatus` khớp Prisma `groupBy`; `countByJob` khớp API theo từng tin; `skillMatch` khớp khi tính lại bằng Prisma; thứ tự `sort=skills` đúng D10; ghép các trang 7 dòng = danh sách đầy đủ ở cả 3 sort; lọc theo trạng thái / tin; `awaitingSchedule` khớp `countAwaitingSchedule`; tìm không phân biệt hoa thường; `%_` không khớp bừa. Dữ liệu thật quá ít để thấy đủ các trường hợp D10, nên biểu thức `ORDER BY` được chạy thêm trên Postgres với dữ liệu dựng sẵn: 2/2 + 3 nên có > 2/2 + 1 > 3/3 nộp sớm > 3/3 > 4/10 > 0/4 > tin không có kỹ năng bắt buộc — đúng.
- **Chưa kiểm:** gọi HTTP thật (server do chủ dự án bật) và ghi thật của API hàng loạt. Ghi thật gửi thông báo và email cho ứng viên, nên chỉ làm ở bước 3 với dữ liệu test được chỉ định.

## Ghi chú của chủ dự án

<!-- Để trống — dành cho chủ dự án. -->
