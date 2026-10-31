# Lịch phỏng vấn của Employer (trang `/employer/interviews`) — Backend

Song song: `docs/05-frontend/phases/employer-interviews/PLAN.md`.
Các quyết định đã chốt với chủ dự án (2026-10-11) nằm ở `docs/temp/EMPLOYER_INTERVIEWS_DECISIONS.md` (D1–D15, không commit vì `docs/temp` bị gitignore). Phần backend cần dùng được chép lại ở mục "Quyết định đã chốt" bên dưới, nên file này đọc độc lập được.

**Trạng thái: ĐÃ TRIỂN KHAI bước 1–7 (2026-10-12, chủ dự án duyệt cùng ngày).** Kiểm chứng: `tsc` server và web sạch; `tests/unit/interviews-pagination.test.ts` 7/7; thử trên PostgreSQL tạm (container `pgvector/pgvector:pg16`, cổng 55432, không dùng Neon) 82 kiểm tra đều đạt, gồm 3 chế độ "sắp tới" (trang 24/20/6: trang đầu kéo tới hết ngày bận), đủ 4 tổ hợp `sort` × `group` của "chờ đặt lịch", kẹp `page`, `jobCounts`, dashboard giữ hành vi cũ, chi tiết hồ sơ kèm lịch và 404 với công ty khác.

Frontend lượt B (2026-10-12) đã chuyển `useAwaitingSchedule` sang tải lần lượt mọi trang (`pageSize=100`); nút "mở rộng" trên dashboard được thay bằng link sang `/employer/interviews`.

## Mục tiêu

Ba chức năng hiện chỉ có trên dashboard (📌 trong `docs/01-project/FEATURE_BACKLOG.md`) được đưa ra trang riêng:

1. Đặt lịch hàng loạt cho hồ sơ của nhiều tin cùng lúc.
2. Đổi / huỷ lịch ngay tại hồ sơ.
3. Xem tất cả lịch phỏng vấn của mọi tin.

Backend chỉ **bổ sung đọc dữ liệu**. API ghi (đặt, đặt hàng loạt, đổi, huỷ) đã đủ và giữ nguyên.

## Quyết định đã chốt (phần liên quan backend)

| # | Quyết định |
|---|---|
| D3 | `GET /employer/applications/:id` trả kèm lịch phỏng vấn của hồ sơ (sắp tới và lịch sử) bằng một kiểu rút gọn, không lặp các trường hồ sơ đã có. |
| D4 | **Không** thêm lịch vào API danh sách hồ sơ theo tin. |
| D5 | `GET /employer/interviews` thêm chế độ "sắp tới": phân trang cursor theo `scheduledAt`, thêm lọc `jobPostId`. Chế độ `from`/`to` cũ giữ nguyên. |
| D6 | Chế độ "sắp tới" không giới hạn ngày xa nhất, không áp mốc 92 ngày (lịch chỉ đặt được tối đa 180 ngày tới). |
| D7 | `GET /employer/interviews/awaiting` có phân trang, thay mức cắt cứng 100 hồ sơ. |
| D17 | Tab "Chờ đặt lịch" có hàng nút lọc theo tin **kèm số hồ sơ chờ của từng tin**, cách hiển thị "Theo thời gian \| Nhóm theo tin" và sắp xếp "Chờ lâu nhất trước \| Chờ ngắn nhất trước". |
| D18 | Danh sách "chờ đặt lịch" dùng **phân trang đánh số** (offset), 50 hồ sơ mỗi trang. Là **ngoại lệ** của `API_CONVENTIONS.md`. |
| D19 | Nhóm theo tin: tin có hồ sơ đứng đầu theo thứ tự sắp xếp đứng trước; trong mỗi tin vẫn theo thứ tự đó. |
| D10 | Không cần AD mới: chỉ thêm tham số và trường, **không migration**, không phá API cũ. |
| D14 | Mỗi trang "sắp tới" khoảng 20 buổi nhưng **không cắt ngang một ngày**; có mức trần cho một trang. |
| D15 | Chưa có tìm theo tên ứng viên (đã ghi backlog). |

## Phát hiện khi đọc code

| # | Phát hiện | Hệ quả |
|---|---|---|
| F1 | `reschedule`/`cancel` đi qua `requireUpcoming` (`interviews.service.ts`): buổi đã qua giờ trả 400 "already taken place", buổi của hồ sơ không còn `INTERVIEWING` cũng trả 400. | Trả lời câu hỏi mở của M1: giao diện **ẩn** Đổi/Huỷ với buổi đã qua giờ là đúng với API. Không đổi API. |
| F2 | `listForCompany` (chế độ `from`/`to`) không lọc theo trạng thái hồ sơ; `listUpcomingForCompany` (dashboard) chỉ lấy hồ sơ `INTERVIEWING`. Khi hồ sơ có kết quả, lịch chưa diễn ra bị huỷ tự động (`cancelUpcomingForApplication`), nên khác biệt chỉ còn ở buổi **đã qua giờ** của hồ sơ đã có kết quả. | Chế độ "sắp tới" theo chế độ `from`/`to` (không lọc trạng thái hồ sơ) để hai chế độ của cùng một tab khớp nhau. Số trên dashboard có thể ít hơn số buổi "Hôm nay" ở trang mới đúng phần này; chấp nhận. |
| F3 | API hiện có dùng cursor là `id` (`audit-log`, `companies`). Danh sách lịch xếp theo `(scheduledAt, id)`, nên cursor theo `id` không dùng được. | Chế độ "sắp tới" dùng cursor mờ (opaque) mã hoá cặp `(scheduledAt, id)`, theo `API_CONVENTIONS.md`. Riêng "chờ đặt lịch" dùng số trang (D18, xem bước 4). |
| F4 | `GET /employer/interviews/awaiting` đang được trang `/employer/jobs/[id]/applications` dùng để biết hồ sơ nào chọn được, và dashboard dùng để "mở rộng" nhóm chờ đặt lịch. | Có phân trang thì trang theo tin phải tải hết các trang (xem plan frontend). Dashboard đổi "mở rộng" thành link "Xem tất cả" (D9). |
| F7 | Phân trang theo số (offset) trên danh sách thay đổi liên tục: hồ sơ được đặt lịch thì rời danh sách, các hồ sơ sau dồn lên một bậc. | Chủ dự án chấp nhận rủi ro (D18). Backend luôn tính trang trên dữ liệu hiện tại và kẹp `page` về trang cuối nếu vượt; giao diện giảm rủi ro như plan frontend mô tả. |
| F5 | Mutation ở `useApplications.ts` đã `invalidate` chi tiết hồ sơ sau khi đổi trạng thái/đánh giá, không ghi cache bằng response. | Chỉ `GET /employer/applications/:id` cần kèm lịch. `PATCH .../status` và `PATCH .../evaluation` giữ response cũ. |
| F6 | `Interview` có `@@index([applicationId])` và `@@index([status, scheduledAt])`. | Đủ cho các truy vấn mới ở quy mô khoá luận. Không thêm index (D10). |

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency. Dùng sẵn: Express, awilix, Prisma, zod.
- Giữ cấu trúc module `apps/server/src/modules/interviews` (repository → service → controller, đăng ký trong `interviews.routes.ts`).
- Chi tiết hồ sơ lấy lịch qua `InterviewsRepository`, vốn đã được inject vào `ApplicationsService` (dùng cho huỷ lịch khi hồ sơ có kết quả). Không thêm phụ thuộc vòng.
- Chế độ "sắp tới": phân trang cursor (`API_CONVENTIONS.md`), response bọc `PaginatedResponse<T>`.
- "Chờ đặt lịch": phân trang theo số trang (D18), response riêng `AwaitingSchedulePage`. Đây là ngoại lệ có chủ đích; ghi vào `API_CONVENTIONS.md` ở bước 7.
- Không migration, không đổi schema.

## Phần 2 — Liên kết giữa các phần

```
GET /employer/interviews?scope=upcoming
  InterviewsController.listEmployer
    → InterviewsService.listUpcomingPage   (mốc đầu ngày hôm nay, giải mã cursor, cắt trang theo ngày)
      → InterviewsRepository.listCompanyFrom (keyset (scheduledAt, id), lấy tối đa UPCOMING_PAGE_MAX + 1 dòng)

GET /employer/interviews/awaiting?jobPostId=&sort=&group=&page=&pageSize=
  → InterviewsService.listAwaiting
    → InterviewsRepository.listAwaitingSchedule  (trang theo số, sắp xếp, nhóm theo tin; đếm tổng)
    → InterviewsRepository.countAwaitingByJob    (số hồ sơ chờ của từng tin, cho hàng nút lọc)
  Dashboard: InterviewsService.awaitingForCompany(limit) giữ nguyên hành vi (trang đầu, chờ lâu nhất trước).

GET /employer/applications/:id
  ApplicationsController.getEmployerDetail
    → ApplicationsService.getEmployerApplicationDetail
      → ApplicationsRepository.findEmployerApplicationById (như cũ)
      → InterviewsRepository.listForApplication (mới)
```

## Phần 3 — Các bước thực hiện

### Bước 1 — Kiểu dùng chung (`packages/shared-types/src/index.ts`)

- `EmployerInterviewScope = "range" | "upcoming"`.
- `AwaitingScheduleSort = "oldest" | "newest"` (chờ lâu nhất trước / chờ ngắn nhất trước).
- `AwaitingScheduleJobCount { jobPostId: string; jobPostTitle: string; count: number }`.
- `AwaitingSchedulePage { items: AwaitingScheduleApplication[]; total: number; page: number; pageSize: number; jobCounts: AwaitingScheduleJobCount[] }`:
  - `total`: số hồ sơ chờ theo bộ lọc tin hiện tại (để tính số trang).
  - `page`: trang thực sự trả về (đã kẹp về trang cuối nếu yêu cầu vượt).
  - `jobCounts`: số hồ sơ chờ của **mọi** tin có hồ sơ chờ, **không** phụ thuộc `jobPostId` (hàng nút lọc luôn đủ các tin), xếp theo tên tin. Tổng của mảng là số trên tab và nút "Tất cả".
  - Không dùng `PaginatedResponse` vì không có cursor (D18).
- `ApplicationInterview`: `id`, `scheduledAt`, `durationMinutes`, `mode`, `location`, `note`, `status`, `cancelReason`, `createdById`, `createdAt`. Không có `candidateName`, `candidateAvatarUrl`, `jobPostId`, `jobPostTitle`, `applicationId` (D3: hồ sơ đã có).
- `EmployerApplicationView extends EmployerApplicationDetail { interviews: ApplicationInterview[] }`: chỉ `GET /employer/applications/:id` trả kiểu này.
- Response chế độ "sắp tới" dùng lại `PaginatedResponse<EmployerInterview>` (đã có `nextCursor`, `hasMore`).

### Bước 2 — `GET /employer/interviews`: tham số mới

`listEmployerInterviewsQuerySchema` (`interviews.dto.ts`):

| Tham số | Chế độ | Ghi chú |
|---|---|---|
| `scope` | cả hai | `range` (mặc định, hành vi cũ) hoặc `upcoming`. |
| `jobPostId` | cả hai | Lọc theo một tin. Tin không thuộc công ty thì trả danh sách rỗng (bộ lọc công ty vẫn áp), không trả 404. |
| `includeCancelled` | cả hai | Như cũ. |
| `from`, `to` | `range` | Như cũ (mặc định 30 ngày từ đầu hôm nay, tối đa 92 ngày). Gửi kèm `scope=upcoming` thì 400. |
| `cursor` | `upcoming` | Chuỗi từ `nextCursor` của trang trước. Gửi kèm `scope=range` thì 400. Sai định dạng thì 400 "Invalid cursor". |

Dùng `superRefine` để báo lỗi tham số không hợp với chế độ, thay vì lặng lẽ bỏ qua.

Chế độ `range` chỉ thêm lọc `jobPostId`; response giữ `{ items, hasMore: false }`.

### Bước 3 — Chế độ "sắp tới" (D5, D6, D14)

Hằng số trong `interviews.service.ts`:

- `UPCOMING_PAGE_SIZE = 20`: số buổi tối thiểu của một trang (trừ trang cuối).
- `UPCOMING_PAGE_MAX = 100`: mức trần một trang (D14). Chỉ chạm tới khi **một ngày có hơn khoảng 80 buổi**, việc gần như không xảy ra với công ty tuyển thực tập.

Truy vấn (`InterviewsRepository.listCompanyFrom`, mới):

- Điều kiện: lịch của công ty (`application.jobPost.companyId`), `scheduledAt >= vnDayStart(now)` (đầu ngày hôm nay, giờ Việt Nam, để nhóm "Hôm nay" giữ cả buổi đã qua giờ), lọc `jobPostId`, `status = SCHEDULED` trừ khi `includeCancelled`.
- Có cursor `(t, id)` thì thêm `OR [{ scheduledAt > t }, { scheduledAt = t, id > id }]`.
- `orderBy [scheduledAt asc, id asc]`, `take UPCOMING_PAGE_MAX + 1`, `include interviewInclude`.

Cắt trang bằng hàm thuần `cutAtDayBoundary(rows, pageSize, max)` (export để test):

1. `rows.length <= pageSize` → trả hết, `hasMore = false`.
2. Ngược lại `n = pageSize`; khi `n < rows.length`, `n < max` và dòng `n` cùng **ngày giờ Việt Nam** với dòng `n - 1` thì `n++`.
3. `items = rows[0..n)`, `hasMore = rows.length > n`, `nextCursor` mã hoá `(scheduledAt, id)` của `items[n - 1]`.

Vì đã lấy `max + 1` dòng nên bước 3 biết chắc còn dữ liệu hay không mà không cần truy vấn thêm. Chỉ khi chạm trần mới có trường hợp một ngày bị chia sang trang sau; giao diện gộp nhóm cùng ngày (plan frontend).

Cursor: `base64url("<ISO scheduledAt>|<id>")`. Hai hàm `encodeCursor` / `decodeCursor` đặt trong module `interviews` (chỉ module này cần). Giải mã lỗi hoặc ngày không hợp lệ → `AppError(400, "Invalid cursor")`.

Ghi chú hành vi:

- Không trả tổng số buổi (cursor không cần đếm; M2 chỉ ghi "Đã tải N buổi").
- Một buổi bị đổi giờ giữa hai lần tải có thể xuất hiện hai lần hoặc bị lỡ. Giao diện bỏ trùng theo `id`; sau mỗi thao tác đổi/huỷ, giao diện tải lại từ đầu.

### Bước 4 — `GET /employer/interviews/awaiting`: phân trang đánh số, sắp xếp, nhóm theo tin (D7, D17–D19)

Tham số trong `listAwaitingScheduleQuerySchema`:

| Tham số | Giá trị | Mặc định |
|---|---|---|
| `jobPostId` | id tin (như cũ) | không lọc |
| `sort` | `oldest` \| `newest` | `oldest` |
| `group` | `job` \| `none`. Gửi `group=job` kèm `jobPostId` thì bỏ qua `group` (một tin thì không cần nhóm). | `none` |
| `page` | số nguyên ≥ 1 | 1 |
| `pageSize` | 1–100 | 50 (`AWAITING_PAGE_DEFAULT`, `AWAITING_PAGE_MAX`; thay `AWAITING_LIST_LIMIT`) |

`InterviewsRepository.listAwaitingSchedule(companyId, { jobPostId, sort, group, offset, limit })`:

- Giữ cách tính `waitingSince` và điều kiện `AWAITING_SCHEDULE` hiện có, bọc thành CTE.
- Thứ tự:
  - `sort=oldest`: `ORDER BY "waitingSince" ASC, "applicationId" ASC`. `sort=newest`: cả hai `DESC`.
  - `group=job`: thêm trước một khoá nhóm. Với `oldest` là `MIN("waitingSince") OVER (PARTITION BY "jobPostId")` tăng dần; với `newest` là `MAX(...)` giảm dần; hoà thì theo `"jobPostId"`. Nhờ vậy các hồ sơ của một tin nằm liền nhau, tin có hồ sơ đứng đầu theo thứ tự đó đứng trước (D19).
  - Thứ tự xác định hoàn toàn (luôn kết thúc bằng id), để hai lần gọi cùng tham số trên cùng dữ liệu cho cùng trang.
- `LIMIT pageSize OFFSET (page - 1) * pageSize`.
- `total`: một câu đếm riêng cùng điều kiện (thay `COUNT(*) OVER ()`, vì trang rỗng không có dòng nào mang tổng).

`InterviewsRepository.countAwaitingByJob(companyId)`: `GROUP BY` tin trên cùng điều kiện `AWAITING_SCHEDULE`, trả `jobPostId`, `jobPostTitle`, `count`, xếp theo tên tin. Không nhận `jobPostId`.

`InterviewsService.listAwaiting`:

1. Chạy song song câu đếm `total` và `countAwaitingByJob`.
2. `lastPage = max(1, ceil(total / pageSize))`; `page = min(page, lastPage)` (kẹp, không báo lỗi, F7).
3. Lấy trang, trả `AwaitingSchedulePage`.

`awaitingForCompany(companyId, limit)` cho dashboard giữ nguyên chữ ký và kết quả (trang đầu, `oldest`, không nhóm).

Controller trả `AwaitingSchedulePage` thay cho `{ items, hasMore: false }`. Trang theo tin (`/employer/jobs/[id]/applications`) và dashboard chỉ đọc `items`, nên không vỡ.

### Bước 5 — Chi tiết hồ sơ kèm lịch (D3)

- `InterviewsRepository.listForApplication(applicationId, limit = 50)`: `where { applicationId }`, `orderBy [scheduledAt asc, id asc]`, chỉ chọn cột của `Interview` (không `include`).
- `toApplicationInterview` trong `interview.mapper.ts`.
- `ApplicationsService.getEmployerApplicationDetail` chạy hai truy vấn song song (hồ sơ, lịch) sau khi đã biết `companyId`. Hồ sơ không thuộc công ty thì vẫn 404 như cũ, không lộ lịch.
- `ApplicationsController.getEmployerDetail` trả `EmployerApplicationView`.
- `PATCH /employer/applications/:id/status` và `/evaluation` giữ response cũ (F5).

Lịch được trả theo thứ tự thời gian; giao diện tự tách "sắp tới" (`SCHEDULED` và chưa diễn ra) với "lịch sử".

### Bước 6 — Kiểm chứng

Repo chưa có test runner riêng; test đơn vị chạy bằng `node --import tsx --test` như `tests/unit/employer-dashboard-service.test.ts`.

- `tsc` cho server và web (web dùng kiểu mới ở bước 1).
- Test đơn vị (`tests/unit/interviews-pagination.test.ts`):
  - `cutAtDayBoundary`: ít hơn 20 dòng; đúng 20 dòng; ngày cuối kéo dài qua dòng 20; ranh giới ngày theo giờ Việt Nam (23:30 và 00:30 hôm sau là hai ngày, dù cùng ngày UTC); một ngày vượt `max`.
  - `encodeCursor` / `decodeCursor`: đi về khớp; chuỗi rác báo lỗi.
- Thử trên PostgreSQL tạm (không dùng Neon, không dùng `DATABASE_URL` làm shadow): tạo khoảng 60 buổi trải 3 tháng, có một ngày 6 buổi nằm vắt qua mốc 20; gọi lần lượt các trang, kiểm tra không trùng, không sót, không cắt ngày; bật/tắt `includeCancelled`, lọc `jobPostId`.
- "Chờ đặt lịch" (khoảng 140 hồ sơ của 4 tin, `pageSize=50`): đủ 4 tổ hợp `sort` × `group`; ghép các trang lại đúng bằng toàn bộ danh sách, không trùng; ở `group=job` hồ sơ cùng tin liền nhau và thứ tự tin đúng D19; `page` vượt thì nhận trang cuối; `jobCounts` không đổi khi thêm `jobPostId` và tổng bằng `total` khi không lọc.
- Gọi `GET /employer/applications/:id` của hồ sơ có một lịch đã huỷ và một lịch sắp tới; hồ sơ của công ty khác vẫn 404.

### Bước 7 — Tài liệu

- `docs/04-api/` hiện chỉ có `API_CONVENTIONS.md`, chưa có mục riêng cho lịch phỏng vấn; tham số mới được mô tả trong file này và trong chú thích của `interviews.dto.ts`.
- Thêm vào `API_CONVENTIONS.md`, ngay dưới đoạn "Dùng cursor-based pagination…", một dòng ngoại lệ: `GET /employer/interviews/awaiting` dùng `page`/`pageSize` vì giao diện cần nhảy tới trang bất kỳ (D18); danh sách ngắn, chấp nhận việc hồ sơ dồn trang khi dữ liệu đổi.
- Ghi trạng thái triển khai vào đầu file này.

## Phần 4 — Ghi chú của chủ dự án

<!-- Dành cho chủ dự án. Claude Code không tự ghi vào đây. -->
