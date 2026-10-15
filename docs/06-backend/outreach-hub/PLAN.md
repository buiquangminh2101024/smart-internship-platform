# Trang "Lời mời" của Employer — Backend

Song song: `docs/05-frontend/phases/outreach-hub/PLAN.md`.
Nền tảng: `docs/06-backend/candidate-outreach/PLAN.md` (B3, AD-15: D1–D7, Q1–Q5). Plan này **không đổi** quy tắc nào ở đó.

**Trạng thái: ĐÃ DUYỆT (2026-10-15), Q1–Q3 theo đề xuất. Bước 1 (backend) đã xong.**

## Mục tiêu

Một trang tổng hợp lời mời ở cấp công ty (`/employer/outreach`), để thẻ KPI "Lời mời còn lại hôm nay" của dashboard có chỗ dẫn tới. Trang gồm:

1. Hạn mức hôm nay và kết quả 30 ngày.
2. Danh sách tin đang hiển thị kèm số lời mời của từng tin, nút dẫn sang trang tìm ứng viên **đã có** (`/employer/jobs/[id]/candidate-search`).
3. Mọi lời mời công ty đã gửi, lọc theo trạng thái và theo tin, phân trang.

**Không** chạy tìm kiếm ứng viên trên trang này (mỗi lượt tìm chạy hybrid, tốn, xem D6). Tìm kiếm vẫn gắn theo từng tin, giữ nguyên mục "Ngoài phạm vi" của B3.

## Hiện trạng (đọc code 2026-10-15)

| # | Phát hiện | Hệ quả |
|---|---|---|
| H1 | Bảng `candidate_outreach_invitations` có `companyId`, `employerId`, `jobPostId`, `status`, `createdAt`, `expiresAt`; đã có index `(companyId, createdAt)` và `(jobPostId, createdAt)`. | Đủ cho danh sách cấp công ty và đếm theo tin. **Không migration.** |
| H2 | API hiện chỉ có theo từng tin: `GET /employer/job-posts/:jobId/invitations` (không phân trang). | Cần API danh sách cấp công ty, có phân trang. |
| H3 | Tìm / mời / xem "Đã mời" của một tin chỉ cho **chủ tin** (`requireOwnedJobPost`: `jobPost.employerId === employer.id`). Nhưng hạn mức (D4), danh sách tin (`listOwn`) và số liệu dashboard (`outreachLast30Days`) tính theo **công ty**. | Phạm vi của trang mới cần chốt (câu hỏi Q1 bên dưới). Nút "Tìm ứng viên" chỉ bật cho tin của chính người xem. |
| H4 | Trạng thái hiển thị dùng `effectiveStatus`: lời mời `PENDING` đã quá `expiresAt` hoặc tin không còn `PUBLISHED` được hiện là `EXPIRED` (cron chạy mỗi giờ nên DB có thể chậm). | Bộ lọc trạng thái và số đếm phải dùng **cùng điều kiện** trong SQL, nếu không số đếm lệch với nhãn trên dòng. |
| H5 | `getDailyQuotaStatus(employer)` đã public (AD-16). `dashboardRepository.outreachLast30Days(companyId)` đếm 30 ngày bằng SQL trong module `dashboard`. | Hạn mức gọi lại `getDailyQuotaStatus`. Đếm 30 ngày viết trong repository của `candidate-outreach` (module chủ bảng); dashboard giữ nguyên, không refactor ở plan này. |
| H6 | `PaginatedResponse<T> { items, nextCursor? }` đã có trong `shared-types`. | Dùng lại cho danh sách lời mời. |

## Câu hỏi đã chốt (2026-10-15, theo đề xuất)

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | Danh sách lời mời và số đếm lấy theo **cả công ty** hay **chỉ tin của người đang xem**? | **Cả công ty**, khớp hạn mức (D4) và số liệu dashboard. Mỗi dòng có cờ `sentByMe`; bộ lọc "Do tôi gửi / Cả công ty" ở giao diện. Tìm / mời vẫn chỉ cho chủ tin (không đổi B3). |
| Q2 | Có hiện **người gửi** trên từng dòng không? | Không ở bản này: chỉ cờ `sentByMe` (nhãn "Bạn gửi"). Employer chưa có trường tên hiển thị gọn; thêm sau nếu cần. |
| Q3 | Khối "Tìm theo tin" gồm những tin nào? | Tin `PUBLISHED` của công ty (chỉ tin này mới tìm / mời được, Q2 của B3). Tin của mình xếp trước, rồi theo `expiresAt` gần nhất. Tin đã đóng / hết hạn chỉ xuất hiện trong bộ lọc theo tin của danh sách lời mời. |

Các mục dưới viết theo các câu trả lời trên.

## API mới

Cả hai thuộc module `candidate-outreach` (module chủ bảng), guard `EMPLOYER`, chỉ đọc nên **không** đòi công ty còn gói (giống `listSentInvitations`).

### `GET /employer/outreach/summary`

```ts
interface EmployerOutreachSummary {
  quota: OutreachDailyQuotaStatus;            // tái dùng getDailyQuotaStatus
  last30Days: { sent: number; accepted: number; declined: number; pending: number };
  jobs: OutreachJobSummary[];                 // Q3 + tin đã có lời mời (xem dưới)
}

interface OutreachJobSummary {
  jobPostId: string;
  title: string;
  status: JobPostStatus;
  expiresAt: string | null;
  isOwner: boolean;                           // true ⇒ được tìm / mời (B3)
  invitations: { total: number; pending: number; accepted: number; declined: number; expired: number };
}
```

- `last30Days`: lời mời của công ty có `createdAt` trong 30 ngày, cùng định nghĩa với `outreachLast30Days` của dashboard, thêm `pending` (theo H4).
- `jobs`: tin `PUBLISHED` của công ty **cùng các tin khác đã có lời mời** (để bộ lọc theo tin có cả tin đã đóng / hết hạn; khối "Tìm theo tin" chỉ lấy tin `PUBLISHED`). Thứ tự: tin `PUBLISHED` trước, trong đó tin của người xem trước rồi `expiresAt` gần nhất (không hạn xếp cuối); các tin còn lại theo tên. *(Bổ sung khi code, 2026-10-15.)*
- `jobs[].invitations`: một câu SQL `GROUP BY jobPostId` với `COUNT(*) FILTER (...)`, trạng thái tính theo H4. Không giới hạn số tin (số tin `PUBLISHED` của một công ty nhỏ, bị chặn bởi gói).

### `GET /employer/outreach/invitations?status=&jobPostId=&mine=&cursor=&limit=`

| Tham số | Giá trị | Mặc định |
|---|---|---|
| `status` | `PENDING` \| `ACCEPTED` \| `DECLINED` \| `EXPIRED` | tất cả |
| `jobPostId` | id tin của công ty; tin công ty khác ⇒ 404 | tất cả |
| `mine` | `true` ⇒ chỉ lời mời có `employerId` = người xem | `false` |
| `cursor`, `limit` | `nextCursor` của trang trước (= id lời mời cuối trang); vị trí theo `(createdAt, id)`; cursor không thuộc công ty ⇒ 400; `limit` 1–50 | 20 |

Trả `PaginatedResponse<CompanyOutreachInvitationDto>`, mới nhất trước:

```ts
interface CompanyOutreachInvitationDto extends SentOutreachInvitationDto {
  jobPost: { id: string; title: string; status: JobPostStatus };
  sentByMe: boolean;
}
```

- Lọc `status` theo đúng H4: `EXPIRED` = `status = 'EXPIRED'` **hoặc** (`status = 'PENDING'` và (`expiresAt <= now` hoặc tin không `PUBLISHED`)); `PENDING` = `status = 'PENDING'` và `expiresAt > now` và tin `PUBLISHED`.
- Thẻ ứng viên và `canViewProfile` lấy qua `findSearchCards` + `findProfileAccessibleCandidateIds` có sẵn; mapper mở rộng từ `toSentOutreachInvitationDto`. Vẫn **không** select phone / email / dateOfBirth (D2).
- Validate query bằng zod trong `candidate-outreach.dto.ts`, cùng kiểu với các DTO hiện có.

## Thay đổi code

| File | Việc |
|---|---|
| `candidate-outreach.repository.ts` | `listForCompany(companyId, filter, cursor, limit)`, `countByJobPost(companyId)`, `countLast30Days(companyId)`, `findPublishedJobsOfCompany(companyId)`. Điều kiện trạng thái hiệu lực viết một lần (hằng `Prisma.sql`) dùng chung cho lọc và đếm. |
| `candidate-outreach.service.ts` | `getCompanySummary(userId)`, `listCompanyInvitations(userId, query)`. |
| `candidate-outreach.mapper.ts` | `toCompanyOutreachInvitationDto` (gọi lại `toSentOutreachInvitationDto`). |
| `candidate-outreach.controller.ts`, `.routes.ts`, `.dto.ts` | Hai route mới, schema query. |
| `packages/shared-types` | `EmployerOutreachSummary`, `OutreachJobSummary`, `CompanyOutreachInvitationDto`, `CompanyOutreachInvitationQuery`. |

Không đổi: quy tắc tìm / mời / hạn mức, cron hết hạn, module `dashboard`.

## Các bước

| Bước | Nội dung | Điều kiện xong |
|---|---|---|
Gộp BE-1 + BE-2 thành **bước 1** (2026-10-15). Toàn bộ trang có 3 bước: 1 backend → 2 frontend → 3 kiểm trên trình duyệt (xem plan FE).

| Bước | Nội dung | Điều kiện xong |
|---|---|---|
| BE-0 | Chủ dự án duyệt plan, chốt Q1–Q3. | Xong 2026-10-15. |
| **1** (BE-1 + BE-2) | Kiểu trong `shared-types`, repository, service, mapper, route. Test đơn vị cho service (repository giả): lọc trạng thái theo H4, `sentByMe`, tin công ty khác ⇒ 404, cursor lạ ⇒ 400, phân trang. Chạy SQL chỉ đọc trên DB thật để so với `effectiveStatus`. | **Xong 2026-10-15**: `tsc` server sạch; `tests/unit/outreach-hub-service.test.ts` 8/8 pass; SQL đối chiếu khớp (DB thật mới có 1 lời mời, nên thêm một lượt chạy đúng SQL của repository trên dữ liệu giả che bằng CTE, phủ đủ PENDING quá hạn, tin đã đóng, trùng `createdAt`, mốc 30 ngày, công ty khác). Chưa gọi thử qua HTTP vì server không chạy lúc kiểm. |

## Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| Số đếm lệch nhãn do cron hết hạn chạy mỗi giờ | Mọi chỗ lọc / đếm dùng chung điều kiện H4. |
| Lộ thông tin ứng viên qua danh sách công ty | Dùng lại đúng nguồn thẻ của B3 (không có liên hệ); `canViewProfile` theo 3 đường truy cập sẵn có. |

## Ngoài phạm vi

Tìm ứng viên không gắn theo tin; huỷ / gửi lại lời mời; tên người gửi (Q2); gợi ý "N ứng viên mới" theo tin (cần cache, để sau).

## Ghi chú của chủ dự án

<!-- Để trống — dành cho chủ dự án. -->
