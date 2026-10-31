# Cache danh tính Employer trong bộ nhớ — Backend

Quyết định kiến trúc: AD-19 (`docs/02-architecture/ARCHITECTURE_DECISIONS.md`).
Nền tảng: AD-5 (Employer chỉ được tạo khi đã xác định công ty), AD-17/AD-18 (khoá tài khoản, thu hồi phiên kiểm ở `authenticate`).

**Trạng thái: ĐÃ DUYỆT (2026-10-17), ĐÃ TRIỂN KHAI và đã kiểm trên trình duyệt (2026-10-17).** Q1 (giữ 10.000 mục), Q2 (làm `candidate-outreach`), Q3 (làm dashboard) đã chốt. Không đổi schema, API, frontend. Xem "Ghi chú triển khai" ở cuối.

## Mục tiêu

Bớt 1–2 lượt đi về Neon ở đầu mỗi API của Employer: tra `userId → {employerId, companyId}` từ bộ nhớ thay vì DB. Số đo đã có ở AD-19 (chuông tin nhắn ~110 ms, mở hội thoại ~110 ms, trang Ứng viên ~58 ms mỗi lần gọi).

## Hiện trạng (đọc code 2026-10-17)

| # | Phát hiện | Hệ quả |
|---|---|---|
| H1 | `EmployerRepository.findByUserId` có `include: { company: true }` ⇒ Prisma chạy 2 câu. | Lúc thiếu cache chỉ `select` `id`, `companyId` (1 câu). |
| H2 | `Employer` chỉ được tạo (`employers.service.ts`: tạo công ty, vào bằng mã mời) và sửa `title`/`phone`. Không có code đổi `companyId`, xoá `Employer`, xoá cứng `User`. | `employerId`/`companyId` không đổi sau khi tra được ⇒ cache an toàn. `invalidate` hiện không có chỗ gọi. |
| H3 | Mỗi service tự viết `requireEmployer` riêng, thông báo lỗi giống nhau: 404 `"Employer profile not found"`. | Thay phần thân bằng cache, giữ đúng thông báo và mã lỗi. |
| H4 | Trường thực sự dùng sau khi tra (xem bảng phạm vi): chỉ `id`, `companyId`, `userId` ở 6 module; `company.*` hoặc `isCompanyAdmin` ở 4 module còn lại. | 6 module đổi hẳn. `dashboard` đổi theo kiểu id từ cache + đọc company theo `companyId` (Q3). |
| H7 | `dashboard.overview` tra employer (2 câu) rồi mới chạy song song các khối, trong đó `jobPostsService.ownStats` và `messagingService.getUnreadSummary` **mỗi cái tự tra employer thêm 2 câu**. `SocketProvider` tải lại overview mỗi khi có thông báo hoặc tin nhắn mới. | Overview hiện nằm sau khoảng 4 lượt tra employer nối tiếp nhau. Sau bước 2 còn 1 lượt (đọc company). |
| H5 | Services đăng ký trong `*.routes.ts`; `employerRepository` đăng ký tập trung ở `container.ts` (singleton). | Cache đăng ký cạnh `employerRepository`, **bắt buộc singleton** (scoped thì mỗi request một Map rỗng, mất tác dụng). |
| H6 | Awilix tiêm theo tên từ cradle: tham số nào không đăng ký thì báo lỗi lúc resolve. | Đồng hồ, TTL, giới hạn số mục đặt ở **tham số thứ hai** của constructor (awilix chỉ truyền cradle), test truyền vào được. |

### Phạm vi

| Module | Trường dùng | Đổi? | Ghi chú |
|---|---|---|---|
| `messaging` | `employer.id` | Có | `requireEmployer`, `requireConversationAccess` (REST + mỗi tin gửi qua socket), `getUnreadSummary` (chuông). Lợi nhiều nhất vì hiện là 2 câu. |
| `applications` (phía employer) | `companyId` | Có | Đang đọc thẳng `prisma.employer.findUnique` (1 câu). Bulk đổi trạng thái đọc ngoài transaction; `companyId` không đổi nên dùng cache được. |
| `interviews` | `companyId`, `userId` | Có | `book(employer: EmployerWithCompany…)` đổi kiểu tham số sang `EmployerIdentity`. |
| `job-posts` | `companyId`, `id` | Có | `requireVerifiedCompany` vẫn đọc `Company` qua `companyRepository.findById` (cần `isVerified` mới nhất). Hiện đang tra 3 câu (2 của `include` + 1), sẽ còn 1. |
| `job-post-requirements` | `companyId` | Có | |
| `job-matching` | `companyId` | Có | Đang `select companyId` (1 câu). |
| `dashboard` | `id`, `companyId`; overview cần thêm `company.{id,name,verificationStatus,verifiedAt}` | Có (Q3) | `tasks`, `analytics` chỉ cần `companyId` ⇒ 0 câu. `overview`: id từ cache + `companyRepository.findById(companyId)` (1 câu, company vẫn mới nhất). Object `{ id, companyId, company }` ghép lại để truyền cho `candidateOutreachService.getDailyQuotaStatus` như hiện nay. |
| `subscriptions` | `isCompanyAdmin`, `company.verifiedAt` | Không | Quyền mua gói, phải đọc mới nhất. |
| `employers` | toàn bộ hồ sơ | Không | Trang hồ sơ, thủ tục. |
| `candidate-outreach` | `id`, `companyId`; 3 API cần thêm `company.{id,name,verifiedAt}` | Có (Q2) | `listSentInvitations`, `listCompanyInvitations` chỉ dùng cache ⇒ 0 câu. `searchCandidates`, `getCompanySummary`, `invite` dùng cache + đọc company theo `companyId` (1 câu, hiện `findEmployerByUserId` lồng `company` là 2 câu). |

## Phần 1 — Công nghệ / kiến trúc

- Không thêm dependency, không thêm hạ tầng. `Map` của JavaScript, TTL tự tính.
- DI qua awilix: lớp mới `EmployerIdentityCache` đăng ký **singleton** ở `container.ts`, thêm vào `Cradle`.
- Không qua port/adapter (không có hạ tầng ngoài để thay). Test tiêm đồng hồ giả qua tham số thứ hai.
- Thông số: TTL 10 phút, tối đa 10.000 mục (Q1, đã chốt). Đo ngày 2026-10-17 bằng Map có cùng cấu trúc: 10.000 mục ≈ 4,2 MB, mỗi lần đọc khoảng 4 ns; 100.000 mục ≈ 41 MB. DB thật hiện có 3 employer.
- Trần không phải giới hạn số employer. Nó là số employer **cùng hoạt động trong một TTL (10 phút)** mà vẫn trúng cache. Vượt trần không lỗi và không sai dữ liệu, chỉ một số request phải tra DB như hiện nay.

## Phần 2 — Liên kết giữa các phần

```
request ─► authenticate (Redis: blacklist, khoá tài khoản, thu hồi phiên — không đổi)
        ─► controller ─► service.requireEmployer(userId)
                            └─► employerIdentityCache.require(userId)
                                  ├─ có trong Map, còn hạn ─► trả ngay (0 lượt DB)
                                  ├─ đang có request khác tra cùng userId ─► chờ chung promise
                                  └─ thiếu ─► employerRepository.findIdentityByUserId (1 câu, select id)
                                               ├─ null ─► 404, không lưu
                                               ├─ lỗi DB ─► ném lỗi, không lưu
                                               └─ có ─► lưu nếu thế hệ của userId chưa đổi ─► trả
```

Hình dạng lớp:

```ts
// modules/employers/employer-identity-cache.ts
export interface EmployerIdentity { userId: string; employerId: string; companyId: string }

export class EmployerIdentityCache {
  constructor(
    { employerRepository, logger }: { employerRepository: EmployerRepository; logger: Logger },
    options: { ttlMs?: number; maxEntries?: number; now?: () => number } = {},
  );
  get(userId: string): Promise<EmployerIdentity | null>;
  /** 404 "Employer profile not found" như các requireEmployer hiện nay. */
  require(userId: string): Promise<EmployerIdentity>;
  /** Gọi SAU khi transaction commit, khi companyId đổi hoặc Employer/User bị xoá (AD-19 mục 4). */
  invalidate(userId: string): void;
}
```

- **Thế hệ (generation):** `invalidate` xoá mục và xoá promise đang tra của `userId`. Lần tra DB xong mà promise của nó không còn là promise hiện hành thì trả kết quả nhưng **không lưu**. Tránh trường hợp request đọc DB trước khi đổi, ghi giá trị cũ vào cache sau khi đã xoá.
- **Thứ tự trong Map = thứ tự hết hạn.** TTL cố định, mỗi lần lưu đều `delete` rồi `set` (đưa về cuối), trúng cache không đổi thứ tự. Vì vậy mục ở đầu Map luôn là mục hết hạn sớm nhất.
- **Hết hạn:** kiểm lúc đọc, không cần timer. Mục hết hạn bị thay khi tra lại. Mục không ai đọc lại thì nằm đó tới khi bị dọn ở bước dưới, nên cần trần.
- **Vượt `maxEntries` khi lưu mục mới:**
  1. Xoá các mục **đã hết hạn** ở đầu Map (dừng ở mục đầu tiên còn hạn).
  2. Vẫn còn vượt thì bỏ mục cũ nhất **còn hạn** (người đó lần sau tra DB 1 câu rồi được lưu lại).
  3. Mỗi lần phải làm bước 2 thì tăng bộ đếm. Ghi `logger.warn` kèm số mục đã bỏ, **tối đa 1 lần/phút**, để biết cần nâng trần. Không ghi `userId`.
- Không làm LRU (đưa mục về cuối mỗi lần trúng): sẽ phá tính chất thứ tự = thứ tự hết hạn ở trên, mà với TTL 10 phút thì khác biệt không đáng kể.
- Không dùng cache trong transaction cần khoá dòng `Employer` (hiện không có chỗ nào như vậy).

## Phần 3 — Các bước thực hiện

### Bước 1 — Lớp cache

1. `employer.repository.ts`: thêm `findIdentityByUserId(userId)` → `select { id, companyId }`. Không sửa `findByUserId`.
2. Tạo `modules/employers/employer-identity-cache.ts` theo Phần 2.
3. `container.ts`: `employerIdentityCache: asClass(EmployerIdentityCache).singleton()`, thêm vào `Cradle` kèm comment trỏ AD-19.
4. Test mới `tests/unit/employer-identity-cache.test.ts`:
   - lần 2 lấy từ cache, repository gọi đúng 1 lần;
   - `null` không lưu: lần sau vẫn hỏi DB (Employer vừa làm thủ tục xong thấy được ngay);
   - lỗi DB không lưu và được ném tiếp;
   - quá TTL (đồng hồ giả) thì hỏi lại DB;
   - `invalidate` xoá mục;
   - `invalidate` trong lúc đang tra thì kết quả đó không được lưu;
   - 2 request cùng lúc thiếu cache chỉ hỏi DB 1 lần;
   - vượt `maxEntries`: mục đã hết hạn bị dọn trước, mục còn hạn không bị đụng;
   - vượt `maxEntries` mà không có mục hết hạn: mục cũ nhất còn hạn bị bỏ, có đúng 1 lần `logger.warn` dù bỏ nhiều mục trong cùng 1 phút;
   - `require` ném 404 với đúng thông báo cũ.

### Bước 2 — Đổi từng service

Mỗi service: thêm `employerIdentityCache` vào constructor, thay thân `requireEmployer`, đổi `employer.id` → `employerId` ở chỗ dùng. Không đổi logic khác. Thứ tự (lợi nhiều trước):

1. `messaging.service.ts`
2. `applications.service.ts` (các method phía employer; method phía candidate không đổi)
3. `interviews.service.ts` (kèm kiểu tham số `book`)
4. `job-posts.service.ts` (`requireEmployer`, `requireVerifiedCompany`)
5. `job-post-requirements.service.ts`
6. `job-matching.service.ts`
7. `employer-dashboard.service.ts` (Q3): `tasks`, `analytics` chỉ dùng cache. `overview` dùng cache + `companyRepository.findById` (thêm `companyRepository` vào constructor; đã đăng ký ở `container.ts`). Company không tìm thấy ⇒ 404 như khi thiếu employer. Làm sau bước 2.1 và 2.4 để `getUnreadSummary`/`ownStats` bên trong đã dùng cache.
8. `candidate-outreach.service.ts` (Q2):
   - `candidate-outreach.repository.ts`: thêm `findOutreachCompany(companyId)` → `select { id, name, verifiedAt }`. Giữ kiểu `OutreachEmployer` (`{ id, companyId, company }`) để `getDailyQuotaStatus`, `resolveDailyQuota`, `requireOwnedJobPost` và lời gọi từ dashboard không đổi.
   - Tách 2 helper: `requireEmployerIdentity(userId)` (chỉ cache) cho `listSentInvitations`, `listCompanyInvitations`; `requireEmployer(userId)` (cache + `findOutreachCompany`, ghép thành `OutreachEmployer`) cho `searchCandidates`, `getCompanySummary`, `invite`. Company không tìm thấy ⇒ 404 như khi thiếu employer.
   - Bỏ `findEmployerByUserId` của repository nếu không còn ai gọi (grep lại lúc làm). Không đổi luồng `invite` ngoài phần lấy employer.

Test cần sửa fake (tiêm `employerIdentityCache` giả thay cho `prisma.employer.findUnique` / `employerRepository.findByUserId`): `employer-applications-service.test.ts`, `job-matching-service.test.ts`, `job-post-requirements.test.ts`, `employer-dashboard-service.test.ts` (thêm fake `companyRepository`), `outreach-hub-service.test.ts` (thay fake `findEmployerByUserId` bằng cache giả + `findOutreachCompany`). Đây là các test duy nhất dựng những service trong phạm vi (đã grep 2026-10-17). `messaging`, `interviews`, `job-posts` chưa có test service.

### Bước 3 — Kiểm

1. `tsc` sạch, toàn bộ test unit xanh.
2. Đo lại bằng script tạm trong scratchpad, chỉ đọc, gọi service thật với cache thật, như lần đo ở AD-19. Đo xong thì xoá script.
3. Bạn bật web + server, mình kiểm qua `:8080` bằng tài khoản test bạn chỉ định: dashboard (overview, việc cần làm, phân tích), trang Lời mời (số liệu, danh sách, tìm ứng viên của một tin), chuông tin nhắn, mở hội thoại và gửi tin, trang Ứng viên, Phỏng vấn, Tin tuyển dụng, so khớp hồ sơ. Không bấm thao tác ghi gửi email nếu bạn chưa chỉ dữ liệu test.
4. Cập nhật AD-19 sang ĐÃ DUYỆT / đã triển khai, ghi số đo vào "Ghi chú triển khai" của plan này.

### Hoàn tác

Mỗi service chỉ đổi phần thân `requireEmployer`. Muốn bỏ cache thì trả phần thân về gọi `employerRepository` như cũ, không có dữ liệu nào phải dọn.

## Câu hỏi cần chốt

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | TTL 10 phút, tối đa 10.000 mục có được không? | **Đã chốt 2026-10-17: giữ 10.000.** Vượt trần xử lý như Phần 2. |
| Q2 | Có đổi `candidate-outreach` không? 5 API của Employer: `listSentInvitations`, `listCompanyInvitations` chỉ cần id; `searchCandidates`, `getCompanySummary`, `invite` cần thêm `company.{name, verifiedAt}` (hạn mức lời mời theo gói, tên công ty trong thông báo). | **Đã chốt 2026-10-17: làm** (bước 2.8), theo kiểu dashboard: id từ cache, cần company thì đọc theo `companyId`. `invite` là thao tác ghi gửi thông báo nên chỉ kiểm bằng unit test, trừ khi có dữ liệu test. |
| Q3 | `dashboard` overview được tải lại mỗi khi có tin nhắn hay thông báo mới. Có đổi sang id từ cache + `companyRepository.findById` không? | **Đã chốt 2026-10-17: làm** (bước 2.7). |

Không thuộc plan này: gộp 3 lần hỏi Redis trong `authenticate` thành 1 lượt. Plan riêng: `docs/06-backend/auth-redis-parallel/PLAN.md`.

## Ghi chú triển khai (2026-10-17)

**File đã đổi:**

- Mới: `modules/employers/employer-identity-cache.ts`, `tests/unit/employer-identity-cache.test.ts` (10 test).
- `employer.repository.ts`: thêm `findIdentityByUserId`. `container.ts`: đăng ký singleton, thêm vào `Cradle`.
- 8 service theo bước 2. `messaging`, `interviews`, `job-post-requirements` không còn phụ thuộc `employerRepository`. `applications`, `job-posts` vẫn giữ (dùng `findManyByCompanyId` để gửi thông báo).
- `candidate-outreach.repository.ts`: `findEmployerByUserId` được thay bằng `findOutreachCompany` (đã grep, không còn ai gọi). `requireOwnedJobPost` nhận `Pick<OutreachEmployer, "id">` để dùng được cho cả 2 helper.
- 5 test cũ đổi fake theo bước 2.

**Lệch nhỏ so với plan:**

- Thế hệ không dùng `Map` bộ đếm riêng mà dùng chính promise đang tra (Phần 2). Cùng tác dụng, và không có `Map` nào lớn dần theo số lần `invalidate`.
- Company không tìm thấy (dashboard overview, 3 API outreach) trả 404 `"Employer profile not found"`. Trước đây không xảy ra được vì `include` theo khoá ngoại.

**Kiểm:**

- `tsc` sạch (cả `src` lẫn 6 file test liên quan). Toàn bộ test unit: 204/204 xanh.
- Đo trên DB thật (script tạm, chỉ đọc, trung vị 15 lần, đã xoá). Kết quả cũ và mới trùng khớp ở cả 3 chức năng:

| Chức năng | Cũ | Có cache |
|---|---|---|
| Số tin chưa đọc (chuông) | 148 ms | 49 ms |
| Trang Ứng viên (trang 1) | 120 ms | 56 ms |
| Quyền vào hội thoại (mỗi tin gửi qua socket) | 505 ms | 393 ms |

  Lần thiếu cache (`findIdentityByUserId`, 1 câu) mất 56 ms. Lần trúng cache dưới 1 ms.
- Kiểm trên trình duyệt qua `:8080` bằng tài khoản `employer@match-demo.local` (chỉ đọc, không gửi tin, không đổi trạng thái): mọi request API của các trang sau đều trả 200, không có lỗi console.
  - Tổng quan: overview, tasks, analytics. Số liệu hiển thị đầy đủ.
  - Lời mời: summary, danh sách. Tìm ứng viên của một tin: candidate-search, invitations.
  - Tin nhắn: danh sách, mở hội thoại (messages, đánh dấu đã đọc), chuông `unread-summary`.
  - Tin tuyển dụng: danh sách, stats, chi tiết tin. Hồ sơ theo tin: applications, application-matches, lịch phỏng vấn theo tin.
  - Lịch phỏng vấn: awaiting. Chi tiết hồ sơ và điểm so khớp (`/match`).
  - API trang Ứng viên (chưa có frontend), gọi trực tiếp: mặc định, `status=PENDING`, `sort=skills`, `q=java` đều trả 200. Số hồ sơ chờ (3) khớp với dashboard.
  - Chưa kiểm qua giao diện: gửi tin qua socket, gửi lời mời, đổi trạng thái hồ sơ, gợi ý yêu cầu cho tin nháp (thao tác ghi, hoặc không có tin nháp). Các luồng này đi qua cùng `requireEmployer` đã kiểm ở trên, và đã có unit test.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
