# Rút gọn dashboard Employer (bản 2)

Thay bố cục Employer bản C trong `docs/05-frontend/phases/dashboard-employer-admin/PLAN.md`. Phần backend nhỏ nên ghi chung trong file này, không tách plan riêng. Dashboard Admin và trang nhật ký hoạt động **không** thuộc đợt này.

**Trạng thái: ĐỢT 1 — PHẦN 1 (BACKEND) ĐÃ XONG (2026-11-04), chờ chủ dự án kiểm rồi mới làm Phần 2 (frontend).** Q1–Q4 đã chốt (E8–E11). Xem "Kết quả Phần 1" ngay dưới mục Kiểm (backend).

## Lý do

Buổi báo cáo ngày 29/10/2026, giáo viên hướng dẫn nhận xét dashboard Employer "vẫn chưa dùng được, vẫn còn rối":

- Quá nhiều thông tin, không làm nổi cái chính. Thứ người dùng cần nhất phải đặt lên đầu, to và rõ. Chi tiết thì bấm sang trang khác xem.
- Thông tin bị lặp: ba ô trên khối tóm tắt (hồ sơ chờ, tin sắp hết hạn, phỏng vấn sắp tới) lặp lại ở bên dưới.
- Ba ô đó không bấm được. Cần giữ các thẻ chính, cho bấm sang trang tương ứng và đặt tỉ lệ tăng giảm ngay trên thẻ.

Kiểm trên trang thật ngày 03/11/2026 (tài khoản employer demo):

- Trang dài khoảng 5 màn hình, gồm 7 phần.
- Số "hồ sơ chờ" xuất hiện ở 5 chỗ: tiêu đề khối tóm tắt, ô số, thẻ KPI, nhóm việc, huy hiệu trên menu.
- Thẻ KPI "Hồ sơ chờ xử lý" trỏ tới một vị trí trong chính trang này, không trỏ sang `/employer/applications`.
- Dòng phụ "Xử lý ngay tại đây, không cần chuyển trang" đi ngược với hướng giáo viên muốn. Hướng đó có từ plan cũ, khi chưa có trang hồ sơ (`/employer/applications`) và trang lịch phỏng vấn (`/employer/interviews`).

## Quyết định đã chốt (2026-11-03)

| # | Quyết định |
|---|---|
| E1 | Dashboard là **điểm nhìn tổng quan và điểm chuyển trang**, không thao tác tại chỗ. Bỏ các nút Xem xét / Từ chối / Đặt lịch trên dashboard. Những thao tác này đã có ở trang quản lý. |
| E2 | Bốn thẻ chính, **cả thẻ là một link**: Hồ sơ chờ xử lý, Phỏng vấn 7 ngày tới, Tin cần chú ý, Tin nhắn chưa đọc. Thẻ tin nhắn là đề xuất thêm, ngoài ba thẻ giáo viên nêu. |
| E3 | Thẻ "Tin cần chú ý" gồm tin bị từ chối và tin hết hạn trong 7 ngày, thay cho "Tin sắp hết hạn". Lý do: tin bị từ chối mới là việc phải làm ngay. |
| E4 | **Phương án B:** trang `/employer/jobs` nhận `?attention=1` để lọc tin cần chú ý. Dashboard không có danh sách tin riêng. |
| E5 | Thông tin bổ trợ chỉ giữ thứ **không có trang nào khác gom lại**: biểu đồ "Hồ sơ ứng tuyển theo ngày". Bỏ phễu tuyển dụng, nhóm việc, hàng 6 KPI, khối tóm tắt nền tối. |
| E6 | **Giữ** trung tâm thông báo ở cuối trang. Thẻ là **việc đang chờ** (tính từ trạng thái hiện tại); thông báo là **việc đã xảy ra** (có thời gian). |
| E7 | Làm hai đợt: đợt 1 dựng trang mới và gỡ khối cũ khỏi trang, **chưa xoá code**. Đợt 2 xoá API, kiểu dữ liệu và component không còn dùng, trong một commit riêng, sau khi chủ dự án xác nhận lần nữa. |
| E8 | (Q1) Tăng giảm của thẻ phỏng vấn: **số buổi 7 ngày tới so với số buổi trong 7 ngày qua**. Dòng phụ ghi "▲ +N so với 7 ngày qua" (hoặc ▼ −N, "Bằng 7 ngày qua"). |
| E9 | (Q2) Trung tâm thông báo trên dashboard Employer hiện **5 mục** (`NotificationCenter` đã có prop `limit`, mặc định 8; Employer truyền `limit={5}`, Admin giữ 8). |
| E10 | (Q3) **Giữ** nút chuyển "Hồ sơ / Lượt xem" trong biểu đồ. Vì vậy `analytics.viewsDaily` được giữ ở đợt 2. |
| E11 | (Q4) **Có** làm dữ liệu demo cho tài khoản employer demo, nhưng là **việc riêng ngoài plan này** (mục "Việc riêng: dữ liệu demo" ở cuối). |

## Bố cục mới

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Tổng quan                                                 [+ Đăng tin mới] │
│ Công ty … · cập nhật lúc HH:mm ngày DD/MM/YYYY                             │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐    │
│ │ Hồ sơ chờ     │ │ Phỏng vấn     │ │ Tin cần chú ý │ │ Tin nhắn      │    │
│ │ xử lý         │ │ 7 ngày tới    │ │               │ │ chưa đọc      │    │
│ │   3 hồ sơ     │ │   2 buổi      │ │   1 tin       │ │   2 cuộc      │    │
│ │ ▲ +2 hồ sơ mới│ │ ▲ +1 so với   │ │ 1 bị từ chối  │ │ Từ 2 ứng viên │    │
│ │ so với 7 ngày │ │ 7 ngày qua    │ │ 0 hết hạn     │ │ Mới nhất: …   │    │
│ │ trước         │ │ Gần nhất:     │ │ trong 7 ngày  │ │ · 2 giờ trước │    │
│ │ Cũ nhất: chờ  │ │ T5 06/11 14:00│ │ trên 4 tin    │ │               │    │
│ │ 42 ngày       │ │               │ │ đang hiển thị │ │               │    │
│ │ Xem hồ sơ chờ→│ │ Xem lịch    → │ │ Xem tin     → │ │ Mở tin nhắn → │    │
│ └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘    │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ Hồ sơ ứng tuyển theo ngày                [Hồ sơ|Lượt xem] [7][30][90]  │ │
│ │ (TrendChart hiện có)                                                   │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ Trung tâm thông báo (NotificationCenter hiện có, giữ nguyên)           │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

- Từ 1280px trở lên: 4 thẻ một hàng. Từ 720 đến 1279px: lưới 2 × 2. Hẹp hơn: 1 cột. Dùng container query (`@container`) như trang hiện tại.
- Công ty chưa xác minh: giữ khối hướng dẫn hiện có thay cho thẻ và biểu đồ. Trung tâm thông báo vẫn hiện.

### Bốn thẻ

| Thẻ | Số chính | Dòng phụ | Link | Nguồn dữ liệu |
|---|---|---|---|---|
| Hồ sơ chờ xử lý | `applications.pendingCount` | "+N hồ sơ mới so với 7 ngày trước" (`newLast7Days`), "Cũ nhất: chờ X" (`oldestPendingSince`) | `/employer/applications?status=PENDING` | có sẵn |
| Phỏng vấn 7 ngày tới | `interviews.upcomingCount` | tăng giảm so với 7 ngày qua (**trường mới**, xem B1); "Gần nhất: …" (`interviews.next`) | `/employer/interviews?tab=booked&view=upcoming` | thêm 1 trường |
| Tin cần chú ý | `jobs.attention.total` (**mới**) | "N bị từ chối", "N hết hạn trong 7 ngày", "trên N tin đang hiển thị" (`jobs.published`) | `/employer/jobs?attention=1` | thêm 1 nhóm trường |
| Tin nhắn chưa đọc | `messages.unreadConversations` | "Từ N ứng viên" (`unreadCandidates`), "Mới nhất: tên · thời gian" (`recent[0]`). Không có tăng giảm vì không có ý nghĩa | trang tin nhắn (`MESSAGES_HREF.employer`) | có sẵn |

Quy tắc hiển thị:

- Số chính cỡ lớn (36px như thẻ KPI hiện tại). Cuối thẻ có chữ "Xem … →" để người xem nhận ra thẻ bấm được. Thẻ có trạng thái hover và focus rõ.
- Tăng giảm: nền `success-100` khi tăng, xám khi bằng. Không dùng màu làm kênh duy nhất: luôn có dấu ▲/▼ và chữ.
- Thẻ có số > 0 cần xử lý (hồ sơ chờ, tin cần chú ý) dùng tông `attention` (viền marigold) như thẻ "Hồ sơ chờ xử lý" hiện nay. Số = 0 thì hiện câu trạng thái ("Không có hồ sơ nào đang chờ") và thẻ vẫn bấm được.
- Mỗi thẻ là một `<a>`. Không lồng link trong link. Riêng link từng cuộc trò chuyện ở thẻ tin nhắn hiện nay bị bỏ, chỉ giữ tên người gửi mới nhất dạng chữ.

## Phần 1 — Backend

### B1. Thêm trường vào `GET /employer/dashboard/overview`

`EmployerDashboardOverview` (shared-types) chỉ **thêm** trường, không đổi trường cũ. Menu bên trái vẫn đọc `applications.pendingCount` như cũ.

- `interviews.last7Days: number` (E8): số lịch `SCHEDULED` của hồ sơ thuộc công ty có `scheduledAt` trong 7 ngày qua, tức từ đúng 7 ngày trước tới hiện tại. Dùng cùng kiểu cửa sổ với `upcomingCount` (hiện tại tới 7 ngày sau) để hai số so được với nhau; khi code đọc lại `upcomingForCompany` để lấy đúng mốc. Không tính lịch đã huỷ. Lịch của hồ sơ đã có kết quả (`ACCEPTED`/`REJECTED`) vẫn tính, vì buổi đó đã diễn ra.
- `jobs.attention: { total: number; rejected: number; expiringIn7Days: number }`.
  - `expiringIn7Days` dùng lại `countExpiringJobs` đang có.
  - `rejected` là số tin `DRAFT` có thao tác kiểm duyệt gần nhất là `REJECTED`, cùng điều kiện với `listRejectedJobs` hiện tại. Thêm `countRejectedJobs` vào `dashboard.repository.ts`, hoặc dùng lại `total` của hàm có sẵn.
  - `total = rejected + expiringIn7Days` (hai tập không giao nhau vì khác trạng thái).
  - Giữ `jobs.expiringIn7Days` cũ tới đợt 2.

### B2. `GET /employer/job-posts?attention=1`

- `employerJobPostListQuerySchema` thêm `attention: z.literal("1").optional()`. Đi cùng `status` thì trả 400 (hai bộ lọc chồng nhau). Kiểu `EmployerJobPostListQuery` thêm `attention?: "1"`.
- `JobPostsService.listOwn` khi có `attention`: tin của công ty thoả **một trong hai** điều kiện:
  - `PUBLISHED`, `expiresAt` trong 7 ngày tới;
  - `DRAFT`, thao tác kiểm duyệt gần nhất là `REJECTED`.
- **Điều kiện "tin cần chú ý" chỉ được định nghĩa một chỗ**, dùng chung cho số đếm của dashboard (B1) và danh sách (B2), để số trên thẻ luôn bằng số dòng của trang. Khi code thì đọc `listRejectedJobs`/`listExpiringJobs` (SQL thô) và phần lọc của `listOwn` (Prisma) rồi chọn một trong hai cách:
  - (a) đưa điều kiện về repository của `job-posts`, module `dashboard` gọi qua `JobPostsService` (giống `ownStats`, đúng AD-16: dashboard chỉ đọc qua service của module chủ);
  - (b) giữ SQL ở `dashboard` và để `listOwn` lấy danh sách id từ đó.

  Ưu tiên (a). Nếu (a) buộc phải viết lại nhiều SQL thì báo lại trước khi làm.
- Hằng số 7 ngày dùng chung một chỗ (hiện là `EXPIRING_WINDOW_DAYS` trong `employer-dashboard.service.ts`).
- Thứ tự và phân trang cursor giữ như `listOwn` hiện tại.

### Kiểm (backend)

- `tsc` server.
- Unit test: `attention` + `status` trả 400; `attention=1` chỉ ra đúng hai loại tin; số `jobs.attention.total` của overview bằng số dòng của `listOwn` với `attention=1` trên cùng dữ liệu giả. Cập nhật `tests/unit/employer-dashboard-service.test.ts` cho hai trường mới.

### Kết quả Phần 1 (2026-11-04)

- Chọn cách (a). Điều kiện "tin cần chú ý" nằm duy nhất trong `job-post.repository.ts`: `expiringSoonWhere` (Prisma) + `findRejectedDraftIds` (SQL, vì "thao tác kiểm duyệt gần nhất" không viết được bằng where của Prisma). `findOwnedByCompany` nhận `attention`, `countAttention` dùng cùng hai mảnh đó. Hằng số `ATTENTION_EXPIRING_DAYS = 7` export từ đây; `EXPIRING_WINDOW_DAYS` của dashboard trỏ về nó.
- `JobPostsService.attentionSummaryForCompany(companyId)` cho dashboard (AD-16). `jobs.expiringIn7Days` cũ giờ lấy từ `attention.expiringIn7Days`, nên `DashboardRepository.countExpiringJobs` không còn ai gọi: thêm vào danh sách xoá đợt 2.
- `interviews.last7Days`: `InterviewsService.pastWeekCountForCompany` → `InterviewsRepository.countScheduledForCompany`, cửa sổ từ `vnDayStart(now, -6)` tới `now`, đối xứng với `upcomingForCompany` (`now` tới `vnDayStart(now, 7)`).
- Test: thêm `tests/unit/job-post-attention.test.ts` (8 test), thêm 2 test vào `employer-dashboard-service.test.ts`. Toàn bộ unit: 275/276 đạt; test hỏng `audit-log-actions` ("mọi action thuộc đúng một nhóm") có từ trước, do action `JOB_REPORT_ACTION_EXECUTED` của job-reports chưa được xếp nhóm, không thuộc plan này.
- `tsc` server sạch trừ lỗi `job-reports` có từ trước (Prisma client chưa `prisma generate` lại sau khi merge).
- Script chỉ đọc trên dữ liệu thật: số đếm khớp số dòng danh sách ở cả 3 công ty có tin (công ty demo: 1 tin bị từ chối).
- Chưa kiểm qua HTTP (server đang tắt).

## Phần 2 — Frontend

### F1. Trang `/employer/jobs` đọc bộ lọc từ URL

- Hiện bộ lọc trạng thái nằm trong `useState`. Đổi sang đọc/ghi URL (`useSearchParams` + `router.replace`, bọc `Suspense`), giống `useApplicationsPageParams`. Đọc hướng dẫn trong `node_modules/next/dist/docs/` trước khi viết (theo `apps/web/AGENTS.md`).
- Tham số: `status` (như hiện tại) và `attention=1`.
- Thêm lựa chọn "Tin cần chú ý" cạnh bộ lọc trạng thái. Chọn một trạng thái thì bỏ `attention`, và ngược lại.
- Dòng tin bị từ chối đã có nhãn lý do. Dòng sắp hết hạn thêm "Hết hạn sau N ngày" nếu chưa có.
- Rỗng: "Không có tin nào cần chú ý." kèm link "Xem tất cả tin".

### F2. Trang `/employer/dashboard`

- Component mới `components/dashboard/employer/EmployerSummaryCards.tsx`: 4 thẻ theo bảng trên, nhận `overview` qua props. Dựng trên `StatCard` bố cục KPI (đã có `href`, `delta`, `hint`, `tone="attention"`). Chỉ mở rộng `StatCard` khi cần, và không làm vỡ chỗ dùng cũ.
- Component mới `components/dashboard/employer/ApplicationsTrendPanel.tsx`: phần biểu đồ đường của `EmployerAnalytics` (`TrendChart`, chuyển Hồ sơ/Lượt xem, `RangeChips` 7/30/90), dùng `useEmployerDashboardAnalytics`. Không gồm phễu.
- `page.tsx`: đầu trang → khối chưa xác minh (nếu có) → `EmployerSummaryCards` → `ApplicationsTrendPanel` → `NotificationCenter` với `limit={5}` (E9). Gỡ `SummaryBanner`, `EmployerKpiGrid`, khối "Việc cần làm" (`EmployerTaskBoard`), `EmployerAnalytics` khỏi trang. **Chưa xoá các file đó** (E7).
- Đang tải: 4 khung xám bằng chiều cao thẻ, 1 khung cho biểu đồ. Lỗi: `BlockError` riêng từng khối như hiện tại.
- Theo `sip-ui` (Employer bản C): token `brand-*`, số dùng `--font-num`, chữ ≥ 13px, xưng "bạn". Đọc lại skill `sip-ui` trước khi code.
- `useUpdateApplicationStatus` và `SocketProvider` đang invalidate `["employer","dashboard"]`, nên không phải sửa.

### Kiểm (frontend)

- `tsc`, `npm run lint --workspace web` cho các file sửa.
- Trên trình duyệt, tài khoản employer demo, ở 375px và 1280px: không cuộn ngang; bấm từng thẻ ra đúng trang và đúng bộ lọc; số trên thẻ "Tin cần chú ý" bằng số dòng của `/employer/jobs?attention=1`; số "Hồ sơ chờ" bằng tổng của `/employer/applications?status=PENDING`; dùng được chỉ bằng phím Tab/Enter; trạng thái đang tải, lỗi, số 0.

## Đợt 2 — Xoá phần không còn dùng (làm sau, xác nhận lại trước khi làm)

Chỉ làm khi đợt 1 đã chạy ổn trên trang thật. Trước khi xoá, grep lại từng tên để chắc không còn nơi nào dùng (kể cả `support-chat` và `tests/`).

| Phía | Xoá | Ghi chú |
|---|---|---|
| Server | `GET /employer/dashboard/tasks`: route, controller, `EmployerDashboardService.tasks`, các hàm repository chỉ nó dùng (`listPendingApplications`, `listExpiringJobs`, `listRejectedJobs` nếu B2 không còn dùng) | `InterviewsService.awaitingForCompany`/`upcomingForCompany` vẫn được trang lịch phỏng vấn dùng: giữ |
| Server | Trong `analytics`: `funnel`, `firstResponse` và hàm repository tương ứng | Giữ `applicationsDaily`, `viewsDaily` (E10) |
| Server | Trong `overview`: `outreach`, `jobs.topJob`, `applications.pendingWait`, `interviews.next7Days`, `jobs.expiringIn7Days` (đã chuyển vào `jobs.attention`); `DashboardRepository.countExpiringJobs` (từ Phần 1 không còn ai gọi) | Bỏ phụ thuộc `candidateOutreachService` của service nếu không còn dùng |
| Shared types | `EmployerDashboardTasks`, `DashboardPendingApplication`, `DashboardAttentionJob`, các trường vừa bỏ | |
| Web | `useEmployerDashboardTasks`; `SummaryBanner`, `EmployerKpiGrid`, `EmployerTaskBoard`, `EmployerAnalytics`; `InterviewGroups` (kiểm lại); `DayColumns`, `CompareBars`, `BarList` (hiện chỉ dashboard Employer dùng) | **Giữ** `QuotaBar`, `SegmentBar`, `RangeChips`, `TaskGroup`, `TrendChart` vì trang khác hoặc Admin đang dùng |
| Test | Cập nhật `employer-dashboard-service.test.ts` | |

## Đợt 3 — Tài liệu

- `docs/05-frontend/phases/dashboard-employer-admin/PLAN.md` và `docs/06-backend/dashboard-employer-admin/PLAN.md`: ghi ở đầu file rằng bố cục Employer bản C đã được thay bởi plan này, kèm danh sách API đã bỏ ở đợt 2.
- `sip-ui`: sửa các quy tắc nói về khối tóm tắt nền tối và hàng 6 KPI của Employer.
- `ARCHITECTURE_DECISIONS.md` (AD-16): nếu có nhắc endpoint `tasks` của Employer thì cập nhật.
- `FEATURE_BACKLOG.md` (chủ dự án đang có thay đổi chưa commit trong file này, nên chỉ sửa khi được đồng ý): ghi mục đã làm.

## Ước lượng

| Phần | Thời gian |
|---|---|
| B1, B2 + test | 2–3 giờ |
| F1 | 1,5 giờ |
| F2 + kiểm trên trình duyệt | 2,5 giờ |
| Đợt 2 | 1,5 giờ |
| Đợt 3 | 0,5 giờ |

## Câu hỏi đã chốt (2026-11-03)

Chủ dự án đồng ý cả bốn khuyến nghị.

| # | Câu hỏi | Đã chốt |
|---|---|---|
| Q1 | ~~Tăng giảm của thẻ phỏng vấn so với cái gì?~~ | Số buổi 7 ngày tới so với số buổi trong 7 ngày qua (E8). |
| Q2 | ~~Trung tâm thông báo giữ 8 hay 5 mục?~~ | 5 mục trên dashboard Employer (E9). |
| Q3 | ~~Giữ nút "Hồ sơ / Lượt xem"?~~ | Giữ (E10). |
| Q4 | ~~Có làm dữ liệu demo không?~~ | Có, việc riêng (E11, mục dưới). |

## Việc riêng: dữ liệu demo (ngoài plan, chưa lên chi tiết)

- Mục tiêu: tài khoản employer demo có đủ dữ liệu để cả 4 thẻ, biểu đồ và trung tâm thông báo không toàn số 0 khi báo cáo: vài tin đang hiển thị (có tin hết hạn trong 7 ngày), hồ sơ nộp rải trong 30 ngày, vài hồ sơ chờ, lịch phỏng vấn trong 7 ngày qua và 7 ngày tới, một tin bị từ chối, tin nhắn chưa đọc.
- Làm thành script trong `apps/server/scripts/`, đánh dấu được dữ liệu demo để chạy lại không nhân đôi và xoá được.
- Script ghi vào Neon chính, nên **chỉ chủ dự án chạy**, sau khi xem script. Không gửi email thật (lịch phỏng vấn tạo thẳng trong DB, không qua outbox).
- Lên plan chi tiết sau khi đợt 1 xong, vì dữ liệu cần theo đúng các trường của trang mới.

## Ghi chú của chủ dự án

<!-- Để trống — dành cho chủ dự án ghi thêm. -->
