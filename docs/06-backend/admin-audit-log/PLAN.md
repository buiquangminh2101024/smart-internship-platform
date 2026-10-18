# Trang nhật ký hoạt động (audit log) cho Admin — Backend

Mục backlog: "📌 Trang nhật ký hoạt động toàn hệ thống (audit log) cho Admin" (`docs/01-project/FEATURE_BACKLOG.md`, thêm 2026-10-11). Nối tiếp module `audit-log` của AD-16 (bảng `audit_logs`, `AuditLogService.record`, `GET /admin/activity`).

Frontend: `docs/05-frontend/phases/admin-audit-log/PLAN.md`. Chủ dự án đã chọn **bản C "Bàn điều tra"** của mẫu thử `docs/temp/ui-compare/admin-nhat-ky-hoat-dong.html` (2026-10-18).

**Trạng thái: ĐÃ ĐƯỢC CHỦ DỰ ÁN DUYỆT (2026-10-18), gồm lần sửa 3 và toàn bộ Q1–Q9 theo khuyến nghị. ĐANG TRIỂN KHAI theo đợt: đợt 1 (B0, B1, B1a, B2) xong code 2026-10-18; đợt 2 (B3, B4) xong 2026-10-18: đã đo lần 1, migration đã áp lên branch đo `perf-audit-log`; đợt 3 (B5, B5a, B6, B6a, B9) xong code 2026-10-18, đã kiểm trên branch đo; đợt 4 (B7, B8) xong 2026-10-18: đã chuyển lưu trữ và đo lần 2 trên branch đo.** Chủ dự án đã `db:deploy` migration này lên Neon chính (2026-10-18, `migrate status`: up to date). Q11 đã chốt (a) và đã làm. Tiếp theo là đợt 5 (FE-0..FE-8). Branch đo không còn cần cho BE; chủ dự án có thể xoá nó và bỏ `PERF_DATABASE_URL`.

Ghi chú khi làm đợt 4 (2026-10-18):

- Chạy tay: `npm run audit:archive --workspace server -- --days=N [--dry-run] [--perf]`.
  - `--perf` chạy trên branch đo. Chỉ khi có `--perf` mới được `--days` nhỏ hơn 30 (nhỏ nhất 1).
  - Script không giới hạn số lô như cron mà chạy tới khi hết dòng cũ hơn mốc.
  - Cron 03:00 không chạy bù lúc khởi động, khác cron gộp số. Lỡ một đêm thì đêm sau làm tiếp.
- **Thêm chốt chặn cho mốc chuyển:** mốc không vượt quá giờ mới nhất đã gộp số lùi 2 giờ. Nếu bảng thống kê còn rỗng thì không chuyển gì. Lý do: chuyển dòng của giờ chưa gộp thì biểu đồ mất số của giờ đó vĩnh viễn, vì cron gộp số chỉ đọc bảng chính. Với thời hạn ≥ 30 ngày, chốt chặn này gần như không bao giờ có tác dụng. Đã ghi vào AD-20 mục 3.
- `archivedAt` được ghi tường minh theo giờ UTC từ ứng dụng, không dựa vào `DEFAULT CURRENT_TIMESTAMP` (giá trị mặc định này phụ thuộc TimeZone của phiên).
- `listByEntity` không đổi; chỉ thêm ghi chú trong code. Câu "Lịch sử cũ hơn N ngày nằm ở nhật ký đã lưu trữ" sẽ hiển thị trên giao diện ở đợt FE.
- `AUDIT_RETENTION_DAYS` nhỏ hơn 30 thì server không khởi động, báo `AUDIT_RETENTION_DAYS must be at least 30`.

Ghi chú khi làm đợt 3 (2026-10-18):

- **`group` và `actorRole` nhận nhiều giá trị** (`a,b`), cho khớp với bảng tham số URL của plan FE. `AuditActivityQuery.group`/`actorRole` trong shared-types đổi thành mảng; FE chưa dùng nên không ảnh hưởng gì.
- Ràng buộc thêm (400): `limit` > 50 chỉ được khi `order=asc` (tối đa 200); `dow`/`hour` ở danh sách và CSV cần đủ hai đầu khoảng (`from`+`to` hoặc `since`+`until`), còn `/stats` có sẵn mặc định 30 ngày. `until` tính cả mốc đó (là thời điểm của dòng cuối phiên).
- `resubmit=false` gồm cả dòng thiếu khoá hoặc `metadata` null. Lý do: phép `NOT` trên đường dẫn JSON so với NULL nên bỏ sót những dòng này; trên branch đo bị lệch đúng 1 dòng trước khi sửa.
- `/stats`:
  - Có `action`/`resubmit` thì đếm trực tiếp cả khoảng, vì bảng thống kê chỉ gộp theo nhóm.
  - `securityAlerts` cho `q` khớp cả người làm lẫn đối tượng, như danh sách: dòng `AUTH_LOGIN_FAILED_REPEATED` không có người làm (Q10), và bấm "Xem cả N dòng" phải ra đúng N.
  - Top người làm lấy `5 + L` người đầu bảng thống kê (L là số người có trong phần đếm trực tiếp) cộng số chính xác của L người đó, nên không sót người nào.
- Cron gộp số chạy một lần khi khởi động, rồi phút 5 mỗi giờ. Thuật toán chọn khoảng giờ được chỉnh cho chắc chắn luôn tiến lên: tính lại phần lùi 2 giờ, phần mới bắt đầu từ dòng đầu tiên sau giờ đã gộp (nhảy qua quãng trống). Đã ghi vào AD-20 mục 6. **Cho B7:** mốc chuyển lưu trữ phải cắt tròn theo giờ, để không có giờ nào chỉ còn một phần dòng trong bảng chính.
- CSV:
  - Chặn thêm ô bắt đầu bằng tab hoặc CR (theo OWASP).
  - Mã lỗi `AUDIT_EXPORT_TOO_LARGE` (422) và `AUDIT_EXPORT_RATE_LIMITED` (429).
  - Redis lỗi thì vẫn cho xuất và chỉ ghi log, vì giới hạn này để đỡ tải chứ không phải chốt bảo mật.
- Kiểm trên branch đo (200.014 dòng):
  - Ở 8 bộ lọc (mặc định, Bảo mật, hai vai trò, ô giờ, 366 ngày, `action`+`resubmit`, `q`, kết hợp), kết quả `/stats` đọc bảng thống kê cộng phần đếm trực tiếp **giống hệt** kết quả đếm trực tiếp toàn bộ.
  - `total` của danh sách khớp với biểu đồ ở cả 5 phép so: ô giờ với ô heatmap; nhóm Bảo mật với tổng `byDay`; cảnh báo với `securityAlerts`; gửi duyệt = gửi lại + lần đầu; vai trò Hệ thống với `byRole`.
  - Gộp số toàn bộ 18 tháng mất 19 lần chạy, ghi 147.161 dòng thống kê, khoảng 21–28 giây. **Bảng thống kê trên branch đo vì vậy đã có dữ liệu cho B8.**
  - Thời gian gọi từ máy dev (gồm mạng, khoảng 60 ms mỗi lượt): `/stats` 30 ngày đếm trực tiếp mất khoảng 0,9 giây, đọc bảng thống kê mất khoảng 0,4 giây; 366 ngày mất 4,0 giây so với 0,6–1,0 giây. Số đo phía Postgres sẽ ghi ở B8.

Ghi chú khi làm đợt 2 (2026-10-18):

- Sinh dữ liệu: `npm run perf:audit-seed --workspace server -- [--rows=200000] [--months=18] [--reset]`. Mọi dòng giả có `entityId` (và người làm giả) bắt đầu bằng `perf-`; hạt giống cố định nên chạy lại ra cùng dữ liệu.
- Đo: `npm run perf:audit-measure --workspace server -- --label=<tên> [--out=<file.json>]`. Mỗi truy vấn chạy `EXPLAIN (ANALYZE, BUFFERS)` 1 lần làm nóng và 5 lần đo, lấy trung vị thời gian thực thi phía Postgres. Phần ghi đo bằng chèn 10.000 dòng trong transaction rồi ROLLBACK, cộng thêm 200 lần `create` tuần tự như `record` (dòng ghi thử bị xoá sau khi đo). Khi đã có bảng thống kê, script tự đo thêm truy vấn 5'.
- Migration được sinh bằng `prisma migrate diff --from-url <branch đo> --to-schema-datamodel` (chỉ đọc), **không dùng shadow DB**. Trước khi sửa schema, diff ra rỗng, tức branch đo không lệch so với schema. Áp bằng `migrate deploy` với `DATABASE_URL` tạm trỏ sang `PERF_DATABASE_URL`, sau khi chốt chặn kiểm xong. Sau khi áp, diff lại ra rỗng.
- Không chạy `prisma format`: lệnh này căn lại khoảng trắng của nhiều model không liên quan.

Ghi chú khi làm đợt 1 (2026-10-18):

- `PERF_DATABASE_URL` đặt ở `.env` gốc của repo (các script server đọc `../../.env`), không phải `apps/server/.env`. Chốt chặn dùng chung ở `apps/server/scripts/lib/perf-database.ts`.
- Script bổ sung `resubmit`: `npm run audit:backfill-resubmit --workspace server -- [--dry-run] [--perf]`. Có `--perf` thì chạy trên branch đo; không có thì chạy trên `DATABASE_URL` (chủ dự án tự chạy trên Neon chính). Chạy lại không đổi gì vì bỏ qua dòng đã có khoá.
- `AuditActivityItem.companyId` hiện luôn là `null`; phần tra công ty của dòng thanh toán (L34) làm ở B5a.
- `POST /auth/reset-password` nhận thêm `via: "reset" | "change"` (mặc định `reset`). Thẻ "Mật khẩu" ở trang Cài đặt phải gửi `via: "change"` thì câu nhật ký mới là "đổi mật khẩu" (việc của frontend, ghi ở FE-1).
- `AUTH_LOGIN_FAILED_REPEATED`: tối đa một dòng cho mỗi tài khoản trong 15 phút kể từ lần sai thứ 5 (khoá Redis `login-fail:alerted:{userId}`). `RateLimiter` chỉ trả đúng/sai nên phải dùng khoá thứ hai để lần 6, 7… không ghi thêm.

Lần sửa 3 (2026-10-18, chủ dự án đã đồng ý L27–L35 và chốt Q8, Q9): thêm L27–L35 để giao diện bản C chạy đủ chức năng. Bản C cần thêm: lọc theo hành động, lọc theo ô thứ × giờ, phân biệt "gửi lại", biểu đồ không tự thu theo chính nó, dòng chảy tin, hành trình người làm, link thanh toán, mở thẳng một dòng. Phần này **không thêm migration**: chỉ có cột `metadata` (JSON, đã có) và tham số API mới.

Lần sửa 2 (2026-10-18), theo trao đổi với chủ dự án:
- Thêm index ngay (L14).
- Thêm bảng thống kê theo giờ (L16–L19) và retention / lưu trữ (L20–L24).
- Đo hiệu năng trên một branch Neon riêng (L25).
- Thêm mục "Hướng mở rộng khi dữ liệu lớn".

Kèm theo đó: có migration, và cần một AD mới (AD-20).

## Phạm vi (đã thống nhất 2026-10-17)

Trang này là **audit log**: ai làm gì, với quyền gì, lúc nào. Nó không phải dòng hoạt động nghiệp vụ.

| Có | Không |
| --- | --- |
| Thao tác quản trị và kiểm duyệt (20 hành động hiện có) | Đổi trạng thái hồ sơ, đặt lịch phỏng vấn. Những việc này đã có ở `ApplicationStatusHistory`, `Interview` và thuộc trang của từng đối tượng |
| Nhà tuyển dụng gửi tin/công ty để duyệt (đã có) | Thao tác thường của ứng viên (nộp hồ sơ, sửa hồ sơ, lưu tin) |
| Thanh toán (đã có) | Sửa hoặc xoá dòng nhật ký: không có API sửa/xoá. Retention chỉ **chuyển** dòng sang bảng lưu trữ, không xoá (L20) |
| **Mới: nhóm Bảo mật** (đăng nhập, đăng nhập sai nhiều lần, đặt lại mật khẩu, liên kết Google) | Read replica, chia bảng theo tháng, kho log riêng: xem "Hướng mở rộng" |

Lịch sử trạng thái trên trang chi tiết hồ sơ của nhà tuyển dụng là một việc riêng, không thuộc plan này.

## Hiện trạng (kiểm tra 2026-10-17)

- Bảng `audit_logs`: `id, actorId?, actorRole?, action (String), entityType, entityId, summary, metadata?, createdAt`. Index: `createdAt` và `(entityType, entityId)`. Cột `action` kiểu String, nên thêm hành động mới không cần migration (AD-16).
- `AUDIT_ACTIONS` có 20 giá trị:
  - Tin tuyển dụng: 5
  - Công ty: 5
  - Danh mục: 4
  - Thanh toán: 1
  - Tài khoản: 5
- Ai đang ghi:
  - `ADMIN`: companies, education-catalog, job-posts, skills, users
  - `EMPLOYER`: gửi tin, gửi hồ sơ công ty
  - `null` (hệ thống): payments
  - Tự đăng tin (`JOB_POST_AUTO_PUBLISHED`) và tự xác minh công ty (`COMPANY_AUTO_VERIFIED`) ghi **người làm là nhà tuyển dụng** (`actorId` = người bấm gửi, `actorRole = EMPLOYER`), không phải `null` (kiểm lại 2026-10-18 ở `job-posts.service.ts` và `employers.service.ts`). Giữ như vậy: người bấm gửi là người khởi động thao tác. Vai trò "Hệ thống" trên giao diện vì vậy chỉ gồm thanh toán.
- `GET /admin/activity?cursor&limit≤50&actor=admin|all`:
  - Mới nhất trước, phân trang bằng cursor.
  - Trả kèm `actorEmail` và `reason`.
  - Đang dùng ở khối "Hoạt động gần đây" của dashboard Admin.
- Ai đang đọc `audit_logs` ngoài trang này:
  - `listByEntity`: lịch sử của một người dùng ở `/admin/users/[id]`.
  - `findLatestByEntities`: lý do và người khoá trên danh sách người dùng (AD-17).
- Cron chạy chung process với Express bằng `node-cron` (AD-6 mục 3), không có khoá phân tán (chỉ một process). Server dev **không chạy liên tục**, nên mọi cron mới phải tự bù phần đã lỡ.
- Chưa có:
  - Lọc theo nhóm, ngày, email hay đối tượng.
  - Tổng số dòng.
  - Số liệu thống kê.
  - Nhật ký đăng nhập hay bảo mật.
  - Xuất CSV.
  - Retention.

## Quyết định đề xuất

### Nhóm hành động và nhật ký bảo mật

| # | Đề xuất | Lý do |
| --- | --- | --- |
| L1 | **Nhóm hành động** (`AUDIT_ACTION_GROUPS` trong `audit-log.actions.ts`): `JOB_POST`, `COMPANY`, `CATALOG`, `PAYMENT`, `ACCOUNT`, `SECURITY`. Mỗi `action` thuộc đúng một nhóm. Unit test kiểm không hành động nào bị sót. | Bộ lọc và biểu đồ làm việc theo nhóm, không theo 24 mã riêng lẻ. |
| L2 | **4 hành động bảo mật mới**: `AUTH_LOGIN_SUCCEEDED`, `AUTH_LOGIN_FAILED_REPEATED`, `AUTH_PASSWORD_RESET`, `AUTH_GOOGLE_LINKED`. `entityType = "User"`; người làm là chính người dùng đó, **trừ `AUTH_LOGIN_FAILED_REPEATED`: người làm là hệ thống (`actorId`/`actorRole` null), tài khoản bị dò chỉ là đối tượng (Q10)**. | Đây là những sự kiện hội đồng hay hỏi tới. Không ghi đăng xuất hay làm mới token vì quá nhiều và không có ý nghĩa kiểm toán. |
| L3 | `AUTH_LOGIN_SUCCEEDED` **chỉ ghi khi vai trò là ADMIN** (Q1). | Ứng viên và nhà tuyển dụng đăng nhập rất thường xuyên, sẽ làm loãng nhật ký. |
| L4 | **Đăng nhập sai nhiều lần**: mỗi lần sai mật khẩu với **email có tài khoản**, tăng bộ đếm Redis `login-fail:{userId}` (TTL 15 phút, dùng `RateLimiter.consume`). **Chạm đúng ngưỡng 5** thì ghi một dòng `AUTH_LOGIN_FAILED_REPEATED` (metadata `{ attempts, windowMinutes, ip }`). Email không có tài khoản thì không ghi. | Dò mật khẩu cũng không làm phình bảng, và không lưu chuỗi email lạ do người khác gõ vào. Đợt này **chưa** khoá đăng nhập khi sai nhiều: đó là tính năng khác, đưa vào backlog. |
| L5 | `AUTH_PASSWORD_RESET` ghi **cùng transaction** với `resetPassword`. Áp luôn cho "Đổi mật khẩu" ở trang Cài đặt vì dùng chung luồng (E9 của AD-18). `AUTH_GOOGLE_LINKED` ghi khi liên kết Google vào tài khoản có sẵn (cả `linkGoogleId` lẫn `linkGoogleToUnverified`); metadata `{ activated: true }` nếu tài khoản được kích hoạt nhờ Google (G1). Tạo tài khoản mới bằng Google thì không ghi. | Đây là hai cách đổi "chìa khoá" vào tài khoản. Ghi cùng transaction để thao tác đã xong thì chắc chắn có dòng nhật ký. |
| L6 | Dòng bảo mật lưu `metadata.ip` (`req.ip`, đúng nhờ `trust proxy` ở AD-17 mục 7). Không lưu user-agent (Q3). | Không có IP thì "đăng nhập sai 5 lần" không giúp được gì. Chỉ Admin xem được. |

### API đọc

| # | Đề xuất | Lý do |
| --- | --- | --- |
| L7 | **Mở rộng `GET /admin/activity`** (giữ tương thích với dashboard). Thêm các tham số: `group`; `actorRole` (`ADMIN`, `EMPLOYER`, `CANDIDATE`, `SYSTEM`; `SYSTEM` nghĩa là `actorId IS NULL`); `from`, `to` (ngày `YYYY-MM-DD` theo giờ Việt Nam, `to` tính hết ngày, tối đa 366 ngày); `q` (email); `entityType` + `entityId` (phải đi cùng nhau); `archived` (L23). Tham số cũ `actor=admin` vẫn chạy, nghĩa là `actorRole=ADMIN`; gửi cả `actor` lẫn `actorRole` thì 400. | Một API cho cả danh sách lẫn hành trình của một đối tượng. Dashboard không phải sửa. |
| L8 | **`q` tìm theo email**: tìm tối đa 200 người dùng có email chứa `q` (không phân biệt hoa thường, 2–100 ký tự), rồi lấy các dòng mà người đó **là người làm** hoặc **là đối tượng** (`entityType = "User"`). Hơn 200 người khớp thì trả `searchTruncated: true`. | `audit_logs` không có quan hệ với `users`. Làm hai bước thì không cần raw SQL join. |
| L9 | Response thêm **`total`**: tổng số dòng khớp bộ lọc, chỉ tính ở trang đầu (không có `cursor`). Vẫn phân trang bằng cursor. | Nhật ký chỉ thêm và xếp mới nhất trước, nên cursor ổn định khi có dòng mới. `total` để hiện "N sự kiện". |
| L10 | Mỗi dòng trả thêm **`group`** và **`ip`** (chỉ có ở dòng bảo mật). Giao diện tự dựng link sang đối tượng từ `entityType` + `entityId`. | `summary` đã có tên đối tượng (snapshot lúc ghi), nên không phải truy vấn thêm. |
| L11 | **`GET /admin/activity/stats`**: cùng bộ lọc với L7, trừ `cursor`/`limit`/`archived`/đối tượng. Mặc định 30 ngày gần nhất. Trả về: (a) số dòng theo ngày × nhóm, đủ mọi ngày kể cả ngày 0; (b) tổng theo nhóm; (c) theo vai trò người làm; (d) top 5 người làm kèm email; (e) lưới thứ × giờ (7 × 24, giờ Việt Nam); (f) `securityAlerts`: số `AUTH_LOGIN_FAILED_REPEATED`. Nguồn dữ liệu xem L18. | Biểu đồ phải dùng để lọc được: bấm cột ngày thì đặt `from`/`to`, bấm nhóm thì đặt `group`. Vì vậy số liệu phải nhận đúng bộ lọc như danh sách. |
| L12 | **Hành trình của một đối tượng**: dùng L7 với `entityType` + `entityId` và `order=asc` (cũ nhất trước, chỉ dùng được khi có lọc đối tượng, tối đa 200 dòng). | Giao diện vẽ được "Gửi duyệt → Từ chối → Gửi lại → Duyệt" mà không cần API riêng. |
| L13 | **Xuất CSV** `GET /admin/activity/export`: cùng bộ lọc (kể cả `archived`), tối đa 5.000 dòng. Tên file `nhat-ky-YYYYMMDD.csv`, có BOM UTF-8. Chặn CSV injection: ô bắt đầu bằng `=`, `+`, `-`, `@` thì thêm dấu `'` ở đầu. Vượt 5.000 dòng thì 422 kèm lời nhắc thu hẹp khoảng ngày. Mỗi Admin tối đa 10 lần/giờ (`RateLimiter`). CSV tự viết, không dùng thư viện. | Tính năng thường có ở trang audit log. Giới hạn số dòng để một request không kéo cả bảng (Q4). |

### Index (thay đổi so với bản đầu)

| # | Đề xuất | Lý do |
| --- | --- | --- |
| L14 | **Thêm 2 index B-tree ngay**: `@@index([actorId, createdAt])` (lọc theo email, top người làm) và `@@index([action, createdAt])` (lọc theo nhóm, vì nhóm đổi thành `action IN (...)`; dòng bảo mật cũng dùng index này). **Giữ** index `createdAt` hiện có. | Chi phí ghi gần như không đo được: bảng chỉ có vài trăm dòng mỗi ngày. Dùng index thường thay cho partial index `WHERE action LIKE 'AUTH_%'` đã nói trước đó, vì Prisma 6 không khai báo được partial index trong `schema.prisma`; viết bằng SQL tay thì lần `migrate` sau sẽ thấy lệch và đòi xoá. Không thay B-tree `createdAt` bằng BRIN, vì truy vấn chính "50 dòng mới nhất" cần thứ tự mà BRIN không trả được. |

### Bảng thống kê theo giờ

| # | Đề xuất | Lý do |
| --- | --- | --- |
| L16 | **Bảng mới `audit_log_hourly_stats`**: `id`, `bucketStart` (đầu giờ, UTC), `actionGroup`, `actorKind` (`ADMIN`, `EMPLOYER`, `CANDIDATE`, `SYSTEM`; không null), `actorId?`, `count`. Có `@@index([bucketStart])`. Không có unique key: mỗi giờ được tính lại bằng "xoá rồi ghi lại" trong một transaction. | Biểu đồ đọc bảng nhỏ này thay vì đếm lại `audit_logs` mỗi lần mở trang. Lúc ghi nhật ký **không tốn thêm gì**. Giờ Việt Nam lệch UTC đúng 7 giờ chẵn, nên cụm theo giờ UTC vẫn ra đúng ngày và giờ Việt Nam khi đọc. Tránh unique key có cột null (Postgres coi hai giá trị null là khác nhau, upsert sẽ sai). |
| L17 | **Cron gộp số** chạy ở phút 5 mỗi giờ. Mỗi lần tính lại từ giờ mới nhất đã có trong bảng **lùi thêm 2 giờ**, tới hết giờ vừa qua. Lần đầu (bảng rỗng) thì tính lại toàn bộ lịch sử. Mỗi lần tối đa 24 × 31 giờ; còn thiếu thì lần sau làm tiếp. | Tính lại cho cùng một giờ thì ra cùng kết quả, nên chạy lại hay trùng không sao. Lùi 2 giờ để bắt dòng ghi muộn. Server dev hay tắt nên phải tự bù phần đã lỡ. Giới hạn mỗi lần để không giữ kết nối quá lâu. |
| L18 | **Nguồn số liệu của `/stats`**: các giờ đã gộp lấy từ `audit_log_hourly_stats`; phần từ giờ gộp gần nhất tới hiện tại thì đếm trực tiếp trên `audit_logs` (ít dòng, có index), rồi cộng hai phần lại. Riêng bộ lọc `q` dùng `actorId` của bảng thống kê, nên chỉ khớp **người làm**. Giao diện ghi rõ "Biểu đồ tính theo người làm". | Số liệu luôn mới tới từng phút mà vẫn nhẹ. |
| L19 | Bảng thống kê **không bị dọn** theo retention. | Dữ liệu thô cũ đã chuyển đi nhưng biểu đồ vẫn đủ lịch sử. Bảng này rất nhỏ (tối đa vài chục dòng mỗi giờ). |

### Retention và lưu trữ

| # | Đề xuất | Lý do |
| --- | --- | --- |
| L20 | **Bảng `audit_logs_archive`** có cùng cột với `audit_logs`, thêm `archivedAt`. Index: `createdAt`, `(entityType, entityId)`. Chuyển bằng **một câu lệnh** `WITH moved AS (DELETE … RETURNING *) INSERT INTO audit_logs_archive …`, mỗi lô 1.000 dòng cũ nhất. | Bảng chính luôn nhỏ. Một câu lệnh thì xoá và chép cùng thành công hoặc cùng thất bại, không mất dòng. |
| L21 | Thời hạn giữ: env **`AUDIT_RETENTION_DAYS`**, mặc định 365, **nhỏ nhất 30** (sai thì server không khởi động, cùng cách kiểm như `env.ts` của AD-18). Cron chạy 03:00 giờ Việt Nam mỗi ngày, mỗi lần tối đa 50 lô; còn thì đêm sau làm tiếp. | Giới hạn nhỏ nhất để một lỗi cấu hình không chuyển hết nhật ký mới. Giới hạn số lô để cron không chạy quá lâu. |
| L22 | **Script tay** `npm run audit:archive --workspace server -- --days=N [--dry-run]` dùng chung hàm với cron. `--dry-run` chỉ in số dòng sẽ chuyển. Cho phép `--days` nhỏ hơn 30 **chỉ khi** chạy trên branch đo (L25), để demo được trên dữ liệu mới. | Dữ liệu thật mới có từ tháng 9/2026, nên với 365 ngày thì cron sẽ không chuyển gì. Phải có cách demo. |
| L23 | Đọc bảng lưu trữ: `GET /admin/activity?archived=true` (và CSV) đọc `audit_logs_archive` với cùng bộ lọc. Giao diện có lựa chọn "Xem nhật ký đã lưu trữ". Không trộn hai bảng trong một danh sách. | Trộn hai bảng làm cursor và `total` rối, mà người xem nhật ký cũ hơn 1 năm rất ít. |
| L24 | Hai nơi đang đọc `audit_logs` cần dòng cũ: `findLatestByEntities` (lý do khoá trên danh sách người dùng) **tìm thêm trong bảng lưu trữ** khi bảng chính không có. `listByEntity` (trang người dùng) giữ nguyên, kèm ghi chú "Lịch sử cũ hơn N ngày nằm ở nhật ký đã lưu trữ". | Không có bước này thì người bị khoá hơn 1 năm sẽ mất dòng "lý do khoá" trên danh sách. |

### Đo hiệu năng

| # | Đề xuất | Lý do |
| --- | --- | --- |
| L25 | Đo trên **branch Neon riêng** `perf-audit-log`, tách từ branch chính. Chuỗi kết nối đặt trong env **`PERF_DATABASE_URL`**. Script đo và script sinh dữ liệu **dừng ngay** nếu thiếu biến này hoặc biến này trùng host + database với `DATABASE_URL`. Script không in email, tên hay id. Đo xong thì xoá branch. | Cùng phiên bản, cấu hình và độ trễ mạng với hệ thống thật, nên số đo thuyết phục khi trình bày. Không ghi dữ liệu giả vào DB đang dùng. |
| L26 | Kịch bản đo:<br>(1) Sinh khoảng **200.000 dòng giả** trải 18 tháng, đúng tỉ lệ các nhóm. Sinh qua `createMany` theo lô, chỉ trên branch.<br>(2) `EXPLAIN (ANALYZE, BUFFERS)` khoảng 6 truy vấn chính **trước** migration: 50 dòng mới nhất; lọc nhóm Bảo mật 30 ngày; lọc theo một người làm; hành trình một đối tượng; `/stats` 30 ngày đếm trực tiếp; `count` cho `total`.<br>(3) Ghi 10.000 dòng, đo thời gian.<br>(4) Áp migration lên branch.<br>(5) Chạy gộp số, rồi chạy lưu trữ với `--days=365`.<br>(6) Đo lại (2) và (3); `/stats` lúc này đọc bảng thống kê.<br>Ghi kết quả vào mục "Kết quả đo" của plan này: thời gian, kế hoạch truy vấn (Seq Scan hay Index Scan), số dòng bảng chính trước và sau lưu trữ. | Có số "trước / sau" cho cả đọc lẫn ghi. Phần ghi chứng minh index không làm chậm đáng kể. |

### Bổ sung cho giao diện bản C (lần sửa 3)

Mọi tham số mới đi qua `buildActivityWhere`, nên danh sách, `total`, CSV và phần đếm trực tiếp của `/stats` luôn khớp nhau. Không có migration.

| # | Đề xuất | Lý do |
| --- | --- | --- |
| L27 | **Tham số `action`** cho `GET /admin/activity`, `/export` và `/stats`: một hoặc nhiều mã, ngăn bằng dấu phẩy, tối đa 10. Mỗi mã phải có trong `AUDIT_ACTIONS`, nếu không thì 400. Đi cùng `group` thì lấy phần giao (AND). Dùng index `(action, createdAt)` của L14. | Bản C có hai chỗ lọc tới từng hành động. Một là thẻ cảnh báo "Xem cả N dòng" (`AUTH_LOGIN_FAILED_REPEATED`). Hai là các nhánh của sơ đồ dòng chảy tin (L32). Lọc theo nhóm thì không đủ hẹp. |
| L28 | **`JOB_POST_SUBMITTED` có `metadata.resubmit`**. Khi gửi duyệt, trong cùng transaction, đếm các dòng `SUBMITTED` sẵn có của tin trong `job_post_moderation_actions`. Có ít nhất 1 dòng thì ghi `{ resubmit: true }`, chưa có thì ghi `{ resubmit: false }`. Phải đếm trước khi thêm dòng `SUBMITTED` mới. `JOB_POST_AUTO_PUBLISHED` ghi giống vậy. Không cần migration: `metadata` đã là `Json?`, `action` vẫn giữ nguyên. Thêm vào repository một hàm `countModerationActions(jobPostId, action, tx)`.<br>**Đọc:** mỗi dòng trả thêm `resubmit: boolean \| null`. Hai hành động trên trả `true`/`false`; dòng cũ thiếu khoá thì trả `false`; mọi hành động khác trả `null`.<br>**Lọc:** tham số `resubmit=true\|false`, chỉ hợp lệ khi `action` gồm đúng `JOB_POST_SUBMITTED` và/hoặc `JOB_POST_AUTO_PUBLISHED` (ngược lại 400). Prisma lọc bằng `metadata: { path: ["resubmit"], equals: true }`. Không cần index riêng vì bộ lọc này luôn đi kèm `action` và khoảng ngày.<br>**Dữ liệu cũ:** script `audit-backfill-resubmit.ts [--dry-run]` (xem Q9). Dòng nào thiếu khoá thì đếm số `SUBMITTED` của tin đó trong `job_post_moderation_actions` có `createdAt` ≤ thời điểm của dòng; được từ 2 trở lên thì ghi `true`, còn lại ghi `false`. So `≤` được vì dòng moderation và dòng nhật ký ghi trong cùng transaction, nên có cùng `now()`. | Tin bị từ chối quay về `DRAFT` (`reject`), nên lúc gửi duyệt không nhìn vào trạng thái mà biết được là gửi lần đầu hay gửi lại. Giữ một hành động "gửi duyệt" thì số đếm theo nhóm và bộ lọc nhóm không bị tách đôi. Thêm một action mới `JOB_POST_RESUBMITTED` cũng không cần migration, nhưng sẽ làm lệch thống kê cũ. |
| L29 | **Lọc theo ô thứ × giờ**: tham số `dow` (1 = Thứ Hai … 7 = Chủ Nhật) và `hour` (0–23), tính theo giờ Việt Nam, phải đi cùng nhau. Cách làm: trong khoảng `from`–`to` (tối đa 366 ngày), sinh danh sách các khung 1 giờ ứng với ô đó (tối đa 53 khung), đổi ra UTC rồi ghép thành `OR` các điều kiện `createdAt` theo khoảng. Vẫn là Prisma thuần, đi được index `createdAt`, không cần `$queryRaw`. `/stats` nhận cùng hai tham số, áp lên `bucketStart` của bảng thống kê. | Bấm một ô của lưới giờ phải lọc được danh sách. Việt Nam không đổi giờ theo mùa, nên chuyển khung giờ sang UTC chỉ là trừ 7 giờ. |
| L30 | **Câu `summary` của 4 hành động bảo mật**, viết tại `auth.service` (B2):<br>`AUTH_LOGIN_SUCCEEDED`: `{email} đăng nhập`.<br>`AUTH_LOGIN_FAILED_REPEATED`: `Đăng nhập sai {attempts} lần trong {windowMinutes} phút vào tài khoản {email}`.<br>`AUTH_PASSWORD_RESET`: `{email} đặt lại mật khẩu`; nếu đổi mật khẩu từ trang Cài đặt thì `{email} đổi mật khẩu` (metadata `via: "reset" \| "change"`).<br>`AUTH_GOOGLE_LINKED`: `{email} liên kết tài khoản Google`; khi `activated` thì thêm cụm `và kích hoạt tài khoản` vào cuối câu. | Lần sửa 2 chưa định nghĩa các câu này. Câu có email đúng như các dòng `USER_*` hiện có. Chỉ Admin đọc được. |
| L31 | **`/stats` không thu biểu đồ theo bộ lọc của chính nó**:<br>`byGroup` bỏ qua `group` (vẫn áp `action`).<br>`byRole` bỏ qua `actorRole`.<br>`heatmap` bỏ qua `dow`/`hour`.<br>`byDay`, `topActors`, `securityAlerts` áp đủ mọi bộ lọc.<br>Cách làm: chạy thêm tối đa 3 truy vấn gộp trên bảng thống kê, mỗi truy vấn với một `where` đã bỏ chiều tương ứng. | Đang chọn nhóm "Bảo mật" mà biểu đồ nhóm chỉ còn một thanh thì Admin không bấm thêm nhóm khác được, và cũng không thấy tỉ lệ. Bảng thống kê rất nhỏ, nên vài truy vấn thêm gần như không tốn gì. |
| L32 | **`/stats` trả thêm `jobPostFlow`**: số lượt trong khoảng ngày của `submittedFirst`, `submittedResubmit`, `autoPublished`, `approved`, `rejected`, `retracted`. Đếm trực tiếp trên `audit_logs` bằng `groupBy action` với `action IN (5 hành động tin)`, cộng thêm một `count` có lọc `resubmit` (L28). Áp mọi bộ lọc trừ `group`/`action`/`resubmit`; `q` chỉ khớp người làm (giống L18). Số "Còn chờ duyệt lúc này" **không** lấy ở đây mà lấy từ `GET /admin/dashboard/tasks` có sẵn. | Bảng thống kê chỉ gộp theo nhóm, không theo từng hành động, và không có cờ gửi lại. Riêng 5 hành động này có index `(action, createdAt)`, nên đếm thẳng vẫn nhẹ. Không đổi L16 cho việc này. |
| L33 | **Hành trình người làm**: tham số `actorId` (id chính xác, lấy từ top người làm hoặc từ dòng đang xem). `order=asc` (L12) được dùng khi có lọc đối tượng **hoặc** `actorId`, vẫn tối đa 200 dòng. Thêm `since`/`until` (ISO datetime) để lọc đúng một phiên làm việc. Hai tham số này không đi cùng `from`/`to` (gửi cả hai thì 400), `since` < `until`, khoảng tối đa 366 ngày. Phiên làm việc (các dòng cách nhau ≤ 30 phút) do giao diện tự gom, backend không lưu. | Bản C gom các thao tác của một người thành phiên. Bấm một phiên thì lọc đúng phiên đó, cần lọc tới từng phút; tham số ngày thì chỉ lọc được tới cả ngày. `q` theo email khớp cả người làm lẫn đối tượng, nên không thay được `actorId`. |
| L34 | **Link cho dòng thanh toán**: dòng `entityType = "Subscription"` trả thêm `companyId`. Mỗi trang kết quả chạy một `findMany` trên `CompanySubscription` theo các `entityId` có trong trang. Dòng khác trả `companyId: null`. Giao diện mở `/admin/companies/[companyId]`. | Admin chưa có trang giao dịch. `metadata` thanh toán chỉ có `paymentId` và `amount`. Tra lúc đọc thì dùng được cho cả dòng cũ và dòng trong bảng lưu trữ, không phải ghi lại dữ liệu. |
| L35 | **`GET /admin/activity/:id`** (thêm `?archived=true` để đọc bảng lưu trữ): trả một `AuditActivityItem`, không có thì 404. | Link "sao chép liên kết tới dòng này" (`?row=<id>`) phải mở được chi tiết ngay, kể cả khi dòng không nằm trong 50 dòng đầu hoặc không khớp bộ lọc đang có trên link. |

## Câu hỏi đã chốt (2026-10-18)

| # | Câu hỏi | Đã chốt |
| --- | --- | --- |
| Q1 | ~~Ghi đăng nhập thành công cho vai trò nào?~~ | **Đã chốt 2026-10-18:** Chỉ ADMIN (L3). |
| Q2 | ~~Ngưỡng "đăng nhập sai nhiều lần"?~~ | **Đã chốt 2026-10-18:** 5 lần trong 15 phút (L4). |
| Q3 | ~~Có lưu user-agent không?~~ | **Đã chốt 2026-10-18:** Không, chỉ IP (L6). |
| Q4 | ~~Xuất CSV làm luôn hay để sau?~~ | **Đã chốt 2026-10-18:** Làm luôn (B9). |
| Q5 | ~~Thêm index ngay không?~~ | **Đã chốt 2026-10-18: thêm ngay** (L14). |
| Q6 | ~~Thời hạn giữ trong bảng chính?~~ | **Đã chốt 2026-10-18:** 365 ngày, nhỏ nhất 30 (L21). |
| Q7 | ~~Bảng lưu trữ có bao giờ bị xoá không?~~ | **Đã chốt 2026-10-18:** Không, giữ mãi. Đây là nhật ký kiểm toán; nếu sau này cần dọn thì ghi thành AD riêng. |
| Q8 | ~~Đánh dấu "gửi lại" bằng `metadata.resubmit` hay bằng action mới `JOB_POST_RESUBMITTED`?~~ | **Đã chốt 2026-10-18: dùng `metadata`** (L28). |
| Q9 | ~~Có chạy script bổ sung `resubmit` cho dòng cũ không?~~ | **Đã chốt 2026-10-18: có.** Dữ liệu thật mới có từ tháng 9/2026 nên số dòng ít. Chạy `--dry-run` trên branch đo trước. Trên Neon chính, **chủ dự án tự chạy**. Không chạy thì dòng cũ hiện là "gửi lần đầu". |
| Q10 | ~~Phát sinh khi làm B2.~~ Dòng `AUTH_LOGIN_FAILED_REPEATED` ghi ai là **người làm**? L2 đang ghi là chính chủ tài khoản. Nhưng người gõ sai mật khẩu có thể là người khác đang dò mật khẩu, còn chủ tài khoản là **nạn nhân**. Ghi như hiện tại thì nạn nhân hiện là người làm ở các chỗ sau:<br>- top người làm;<br>- lọc theo vai trò (dòng được tính cho Ứng viên hoặc Nhà tuyển dụng);<br>- hành trình người làm (L33).<br>Hai cách:<br>(A) **Khuyến nghị:** `actorId = null`, `actorRole = null`, tức "Hệ thống phát hiện" (`actorKind = SYSTEM` trong bảng thống kê). Đối tượng (`entityType = "User"`, `entityId`) vẫn là tài khoản bị dò. Tìm theo email vẫn ra dòng này, vì `q` khớp cả đối tượng (L8). Chỉ sửa một chỗ trong `trackFailedLogin` và test tương ứng.<br>(B) Giữ như hiện tại: đơn giản, nhưng số liệu "ai làm gì" bị lệch như đã nói. | **Đã chốt 2026-10-18: (A)** "Hệ thống phát hiện". Đã sửa `trackFailedLogin` và test. Dòng thật ghi trước khi sửa không có (tính năng chưa chạy trên server thật). Dữ liệu giả trên branch đo vẫn để người làm là chủ tài khoản; không ảnh hưởng số đo. |
| Q11 | ~~Phát sinh khi làm B8.~~ **Đã chốt 2026-10-18: chọn (a), đã làm.** Mỗi lần gọi `/stats` hỏi thêm `createdAt` mới nhất của bảng lưu trữ. Nếu khoảng của phần đếm thẳng bắt đầu không muộn hơn mốc đó thì đọc cả hai bảng với cùng `where` rồi cộng lại; hai bảng không trùng dòng nên cộng thẳng được. Câu hỏi gốc: Phần đếm thẳng của `/stats` chỉ đọc bảng chính, gồm cảnh báo bảo mật, dòng chảy tin và cả bốn biểu đồ khi lọc `action`/`resubmit`. Vì vậy khi khoảng ngày lấn qua mốc lưu trữ thì phần lấn qua bị thiếu. Với thời hạn 365 ngày, phần thiếu chỉ khoảng 1 ngày (trên branch đo là 4/5.371 cảnh báo), nhưng nếu đặt thời hạn 30 ngày thì thiếu nhiều. Xử lý thế nào? | **Khuyến nghị: đếm thêm trong bảng lưu trữ, chỉ khi khoảng ngày lấn qua mốc.** Dòng lưu trữ mới nhất cho biết mốc. Làm như vậy thêm 1–3 truy vấn trên `audit_logs_archive`, chỉ ở những lần gọi có lấn qua mốc, khoảng 1 giờ code và test. Phương án khác: (b) giữ nguyên, giao diện ghi "Cảnh báo và dòng chảy tin chỉ tính nhật ký trong N ngày gần nhất"; (c) giới hạn `from` của `/stats` không cũ hơn mốc khi có lọc `action`. |

## Phần 1 — Công nghệ / kiến trúc sử dụng

- **Không dependency mới.** Dùng lại:
  - `node-cron` (đã có).
  - `RateLimiter`: đếm đăng nhập sai, giới hạn xuất CSV.
  - `AuditLogService.record(entry, tx?)`.
  - `UserRepository.findEmailsByIds`.
  - Cách tính ngày theo giờ Việt Nam của `dashboard.repository.ts`: đọc lại khi làm B6 và dùng chung nếu được.
- **Một migration** (`add_audit_log_stats_and_archive`): 2 index trên `audit_logs`, bảng `audit_log_hourly_stats`, bảng `audit_logs_archive`.
  - Kiểm trước bằng `prisma migrate diff`. Nếu cần shadow DB thì dùng **branch Neon đo** (L25), **không bao giờ dùng `DATABASE_URL`** (AD-16 mục 8).
  - Áp lên branch đo trước. Áp lên Neon chính thì **chủ dự án tự chạy `db:deploy`**.
  - Cập nhật `docs/03-database/DATABASE_DESIGN.md`.
- **AD-20 mới** (viết ở B0, trước khi code), gồm: chính sách retention và bảng lưu trữ; bảng thống kê gộp theo giờ và cron tự bù; quy tắc "nhật ký kiểm toán không bao giờ bị xoá".
- `audit-log.actions.ts`: 4 action bảo mật, `AUDIT_ACTION_GROUPS`, `groupOfAction(action)`. Hành động không có trong danh sách (dữ liệu cũ, vd. `JOB_POST_TAKEN_DOWN`) thì xếp nhóm theo `entityType`; không xác định được thì thuộc nhóm `OTHER`.
- `@sip/shared-types` thêm:
  - `AuditActionGroup`
  - `AuditActorRoleFilter`
  - `AuditActivityQuery`
  - `AuditActivityPage`: `PaginatedResponse<AuditActivityItem>` kèm `total?` và `searchTruncated?`
  - `AuditActivityStats`

  `AuditActivityItem` thêm `group` và `ip: string | null`. Chỉ thêm trường, không đổi trường cũ.

  Lần sửa 3:
  - `AuditActivityItem` thêm `resubmit: boolean | null` (L28) và `companyId: string | null` (L34).
  - `AuditActivityQuery` thêm `action`, `resubmit`, `dow`, `hour`, `actorId`, `since`, `until` (L27–L29, L33).
  - `AuditActivityStats` thêm `jobPostFlow` (L32).
- File mới trong `modules/audit-log/`:
  - `audit-log-stats.job.ts`: hàm `runAuditLogStatsRollup` và `start…` (cùng mẫu `job-post-expiring-notice.job.ts`).
  - `audit-log-retention.job.ts`.
  - `audit-log.where.ts`: hàm `buildActivityWhere`.
  - `audit-log.csv.ts`.

  Script mới trong `apps/server/scripts/`: `audit-archive.ts`, `perf-audit-log-seed.ts`, `perf-audit-log-measure.ts`, `audit-backfill-resubmit.ts` (L28).

## Phần 2 — Liên kết giữa các phần

```text
auth.controller (req.ip) ──▶ auth.service.login / resetPassword / loginOrRegisterWithGoogle
                                   │  sai mật khẩu: rateLimiter.consume("login-fail:{id}") → chạm 5 ⇒ record(FAILED_REPEATED)
                                   │  Admin đăng nhập đúng ⇒ record(LOGIN_SUCCEEDED)
                                   │  reset / link Google ⇒ record(..., tx)
                                   ▼
                          AuditLogService.record ──▶ audit_logs
                                                        │
                    cron phút 5 mỗi giờ ────────────────┼──▶ audit_log_hourly_stats (gộp theo giờ, tính lại được)
                    cron 03:00 / script tay ────────────┴──▶ audit_logs_archive (chuyển dòng cũ hơn N ngày)

GET /admin/activity[?archived]  ─┐
GET /admin/activity/export      ─┼─▶ AuditLogController ──▶ AuditLogService ──▶ AuditLogRepository
GET /admin/activity/stats       ─┘                               │                 (buildActivityWhere)
                                                                 ├──▶ hourly stats + đếm trực tiếp phần chưa gộp
                                                                 └──▶ UserRepository (q ⇒ id; id ⇒ email)
```

- `AuthService` cần thêm `auditLogService` trong constructor. Nó được đăng ký ở `auditLogRouter` và resolve lười, nên chỉ cần đăng ký trước request đầu tiên. Kiểm lại ở B2.
- Hai cron khởi động trong `main.ts` cạnh các cron hiện có, sau khi `auditLogRouter` đã đăng ký repository.
- `buildActivityWhere` dùng chung cho danh sách, `count`, CSV và phần đếm trực tiếp của `/stats`, để các nơi luôn khớp nhau. Lọc theo nhóm chuyển thành `action IN (...)`. Phần cắt ngày/giờ theo giờ Việt Nam dùng `$queryRaw` có tham số (`AT TIME ZONE 'Asia/Ho_Chi_Minh'`).
- `findLatestByEntities` (AD-17) thêm bước tìm trong bảng lưu trữ cho các entity chưa thấy (L24).
- `JobPostService.submitForApproval` đếm `SUBMITTED` trong `job_post_moderation_actions` trước khi ghi, rồi truyền `metadata.resubmit` vào `record` (L28).
- `buildActivityWhere` nhận thêm `action`, `resubmit`, `dow`/`hour` (thành `OR` các khung giờ), `actorId`, `since`/`until` (L27–L29, L33). `/stats` gọi nó nhiều lần, mỗi lần bỏ một chiều (L31).

## Phần 3 — Các bước thực hiện

| Bước | Nội dung | Ước lượng |
| --- | --- | --- |
| B0 | Viết AD-20 vào `ARCHITECTURE_DECISIONS.md`. Chủ dự án tạo branch Neon `perf-audit-log` và đặt `PERF_DATABASE_URL` vào `apps/server/.env` (Claude không đọc hay in giá trị). | 0,5 giờ |
| B1 | `audit-log.actions.ts`: action mới, nhóm, `groupOfAction`. Thêm các type trong shared-types (kể cả phần lần sửa 3). Unit test: mọi action thuộc đúng một nhóm. | 0,5 giờ |
| B1a | `resubmit` khi gửi duyệt (L28): `countModerationActions`, ghi metadata ở `submitForApproval` cho cả hai nhánh. Unit test: gửi lần đầu ghi `false`; bị từ chối rồi gửi lại ghi `true`; tự đăng sau khi bị từ chối ghi `true`. Viết script `audit-backfill-resubmit.ts --dry-run`, chỉ chạy trên branch đo (B3 trở đi). | 1,5 giờ |
| B2 | Nhật ký bảo mật trong `auth.service` (L3–L6): truyền `ip` từ controller; câu `summary` tiếng Việt theo L30. Lỗi khi ghi nhật ký đăng nhập không được làm hỏng việc đăng nhập (record không có `tx` ⇒ chỉ log). Unit test với RateLimiter giả: lần thứ 5 ghi, lần thứ 4 và 6 không ghi; email lạ không ghi; Admin đăng nhập đúng thì ghi, ứng viên thì không. | 2 giờ |
| B3 | Script sinh dữ liệu và script đo (L25, L26) có chốt chặn về `PERF_DATABASE_URL`. Chạy **đo lần 1 (trước migration)** trên branch. | 1,5 giờ |
| B4 | `schema.prisma` + migration (L14, L16, L20). Kiểm bằng `migrate diff`, áp lên **branch đo**. Cập nhật `DATABASE_DESIGN.md`. | 1 giờ |
| B5 | Mở rộng `GET /admin/activity` (L7–L10, L12, L23): `buildActivityWhere`, `q` hai bước, `total`, `order=asc`, `archived`. Kiểm tương thích với dashboard. Unit test bộ lọc và các lỗi 400. | 3 giờ |
| B5a | Tham số lần sửa 3 cho danh sách (L27, L28 phần lọc, L29, L33, L34) và `GET /admin/activity/:id` (L35). Unit test:<br>- `action` sai mã thì 400;<br>- `resubmit` không kèm `action` hợp lệ thì 400;<br>- `dow`/`hour` sinh đúng số khung và đúng giờ UTC ở hai đầu khoảng;<br>- `since`/`until` đi cùng `from`/`to` thì 400;<br>- `order=asc` với `actorId` được nhận;<br>- dòng thanh toán có `companyId`;<br>- `:id` không có thì 404. | 2,5 giờ |
| B6 | Cron gộp số (L16–L17) và `GET /admin/activity/stats` (L11, L18). Unit test: tính lại cùng giờ ra cùng kết quả; bù đúng sau một khoảng server tắt; cộng đúng phần đã gộp với phần đếm trực tiếp. | 4 giờ |
| B6a | `/stats` lần sửa 3: bỏ chiều của chính biểu đồ (L31), `jobPostFlow` (L32), nhận `action`/`dow`/`hour`. Unit test: chọn nhóm Bảo mật thì `byGroup` vẫn đủ 6 nhóm còn `byDay` chỉ còn Bảo mật; `jobPostFlow` tách đúng lần đầu và gửi lại. | 1,5 giờ |
| B7 | Retention (L20–L22, L24): hàm chuyển theo lô, cron, script tay `--dry-run`, kiểm env, `findLatestByEntities` tìm thêm trong bảng lưu trữ. Unit test: không chuyển dòng mới hơn mốc; lô dừng đúng giới hạn. | 2 giờ |
| B8 | **Đo lần 2 (sau migration)** trên branch: gộp số, chuyển lưu trữ, đo lại. Ghi mục "Kết quả đo". Chủ dự án xoá branch. | 1 giờ |
| B9 | Xuất CSV (L13), kể cả `archived`. Unit test escape và CSV injection. | 1,5 giờ |
| B10 | Kiểm tích hợp trên server thật (chủ dự án bật server, gọi qua `:8080`, sau khi tự `db:deploy`): đăng nhập sai 5 lần bằng tài khoản thử do chủ dự án chỉ định; các bộ lọc; hành trình một tin; `/stats`; CSV. Script kiểm không in email, tên hay id. | 1 giờ |
| B11 | Cập nhật tài liệu: thêm dòng vào AD-16 trỏ tới AD-20; cập nhật backlog (đánh dấu mục 📌; thêm "khoá đăng nhập khi sai nhiều" và các mục ở "Hướng mở rộng"); `PROJECT_STATUS.md`. | 0,5 giờ |

Tổng: **khoảng 24 giờ** (22,5 giờ nếu bỏ B9). Lần sửa 3 thêm 5,5 giờ (B1a, B5a, B6a).

Ở B10, kiểm thêm: gửi lại một tin bị từ chối thì dòng mới có `resubmit: true`; bấm nhánh "Gửi lại" ra đúng các dòng đó.

Chạy sau mỗi bước: `tsc` của server, unit test liên quan (`node --import tsx --test tests/unit/<file>.test.ts` từ `apps/server`). Migration chỉ áp lên branch đo; Neon chính do chủ dự án tự `db:deploy`.

## Kết quả đo

Đo trên branch Neon `perf-audit-log` (tách từ branch chính, cùng vùng `ap-southeast-1`), ngày 2026-10-18. Bảng có 200.014 dòng: 200.000 dòng giả trải 18 tháng và 14 dòng thật. Tỉ lệ dòng giả theo nhóm: Tin tuyển dụng 50%, Bảo mật 20%, Công ty, Danh mục, Thanh toán và Tài khoản mỗi nhóm 7–8%. Thời gian là trung vị của 5 lần, tính phía Postgres, không gồm mạng. Kết quả thô nằm trong `.claude-workspace/perf/` (không commit).

### Đọc

| Truy vấn | Lần 1: trước migration (B3) | Chỉ thêm index, sau B4 | Lần 2: sau gộp số và lưu trữ (B8) |
| --- | --- | --- | --- |
| 1. 50 dòng mới nhất | 0,15 ms · Index Scan `createdAt` | 0,15 ms · như cũ | 0,15 ms · như cũ |
| 2. Nhóm Bảo mật, 30 ngày | 0,47 ms · Index Scan `createdAt` | 0,47 ms · như cũ | 0,48 ms · như cũ |
| 3a. Một người làm (Admin làm nhiều) | 0,39 ms · Index Scan `createdAt`, lọc dần | 0,16 ms · Index Scan `(actorId, createdAt)` | 0,15 ms · như cũ |
| 3b. Một người làm (nhà tuyển dụng làm ít) | **25,9 ms · Seq Scan cả bảng** (4.361 buffer) | **0,34 ms** · Bitmap `(actorId, createdAt)` (177 buffer) | 0,28 ms · như cũ (156 buffer) |
| 4. Hành trình một tin (cũ trước) | 0,10 ms · Index Scan `(entityType, entityId)` | 0,09 ms · như cũ | 0,09 ms · như cũ |
| 5. `/stats` 30 ngày, đếm trực tiếp | 23,0 ms · Bitmap Heap Scan (4.320 buffer) | 16,3 ms · Index Only Scan `(action, createdAt)` (256 buffer) | 16,7 ms · như cũ (264 buffer) |
| 5'. `/stats` 30 ngày, đọc bảng thống kê | (chưa có bảng) | (bảng rỗng) | 17,5 ms · Index Scan `bucketStart` (14.380 dòng thống kê; xem nhận xét) |
| 6a. `total`, không lọc | 38,9 ms · Seq Scan | 39,9 ms · Index Only Scan | 35,9 ms · Index Only Scan (178.931 dòng) |
| 6b. `total`, nhóm Tin tuyển dụng 90 ngày | 21,7 ms · Bitmap Heap Scan | 5,0 ms · Index Only Scan `(action, createdAt)` | 5,0 ms · như cũ |

### Ghi

| Phép đo | Lần 1 | Chỉ thêm index | Lần 2 |
| --- | --- | --- | --- |
| Chèn 10.000 dòng một lần (phía Postgres, ROLLBACK) | 94,5 ms | 165,6 ms | 176,4 ms |
| Ghi từng dòng như `record` (200 lần, có mạng): trung vị / p95 | 62,4 / 66,1 ms | 51,2 / 54,6 ms | 58,2 / 64,9 ms |

Nhận xét sau lần 1 và sau khi thêm index:

- Lọc theo người làm ít thao tác là chỗ chậm nhất trước migration. Không có index thì Postgres phải đọc cả bảng mới đủ 51 dòng. Index `(actorId, createdAt)` đưa thời gian từ 25,9 ms xuống 0,34 ms, nhanh hơn khoảng 75 lần.
- Hai index mới làm phần ghi chậm hơn đúng như dự kiến: chèn 10.000 dòng tăng thêm khoảng 71 ms, tức khoảng 7 µs mỗi dòng. Khi ứng dụng ghi từng dòng, thời gian gần như toàn bộ là đường mạng (khoảng 50–60 ms), nên phần tăng này không thấy được.
- `total` khi không lọc vẫn phải đếm cả bảng (khoảng 40 ms ở 200.000 dòng). Lưu trữ (L20) giữ bảng chính nhỏ lại, nên số này sẽ được đo lại ở lần 2.
- `/stats` đếm trực tiếp 30 ngày mất 16–23 ms; đọc bảng thống kê thì đo ở lần 2, khi bảng đã có dữ liệu.

Nhận xét sau lần 2 (2026-10-18, sau khi chuyển lưu trữ với `--days=365`, bảng thống kê đã gộp đủ 18 tháng):

- **Chuyển lưu trữ** 21.083 dòng (cũ hơn 11:00 ngày 18/10/2025 giờ Việt Nam) trong 22 lô, mất 2,4 giây tính cả mạng, khoảng 110 ms mỗi lô. Bảng chính còn 178.931 dòng. Đã kiểm sau khi chuyển:
  - Tổng hai bảng vẫn 200.014.
  - Không id nào nằm ở cả hai bảng.
  - Ranh giới đúng đầu giờ: dòng mới nhất trong lưu trữ lúc 03:59:58 UTC, dòng cũ nhất còn trong bảng chính lúc 04:00:25 UTC.
  - Tổng bảng thống kê vẫn 200.014, cả sau khi chuyển lẫn sau một lần gộp số.
  - `findLatestByEntities` tìm ra đủ 20/20 người chỉ còn dòng khoá trong bảng lưu trữ.
- Truy vấn danh sách (1–4, 6b) không đổi, vì chúng đi index và chỉ đọc vài chục dòng, nên kích thước bảng không ảnh hưởng. `total` không lọc giảm theo số dòng: 39,9 → 35,9 ms, khoảng −10% ứng với −11% dòng. Lợi ích của lưu trữ chỉ rõ khi bảng lớn hơn nhiều. Với dữ liệu thật (có từ tháng 9/2026) và thời hạn 365 ngày, tới tháng 9/2027 cron mới chuyển dòng đầu tiên.
- **Ở mức SQL, đọc bảng thống kê (5') không nhanh hơn đếm trực tiếp (5).** 30 ngày có 14.380 dòng thống kê, so với 21.540 dòng thô.
  - Lý do: dữ liệu giả có 3.379 người làm trải đều, nên gần như mỗi tổ hợp giờ × nhóm × người làm chỉ có 1 dòng. Bảng thống kê vì vậy chỉ gọn hơn bảng thô khoảng 1,4 lần. Bỏ chiều người làm thì còn 63.951 dòng, gọn hơn 3,1 lần.
  - 12.803 buffer là số lần chạm trang đã có trong bộ nhớ đệm, không phải đọc đĩa: Index Scan chạm lại cùng trang cho mỗi dòng, và correlation của `bucketStart` là 0,99. Còn 5 chỉ đọc index `(action, createdAt)` (Index Only Scan).
- **Cái lợi của bảng thống kê nằm ở đường đi của ứng dụng.** Đếm trực tiếp phải kéo từng dòng về Node để chia theo ngày, nhóm, vai trò và ô giờ. Đọc bảng thống kê thì Postgres cộng sẵn. Đo `AuditLogService.getStats` từ máy dev (gồm mạng):

  | Khoảng | Thời gian |
  | --- | --- |
  | 30 ngày | 0,45 giây |
  | 366 ngày | 1,1 giây (đợt 3, đếm trực tiếp: 4,0 giây) |
  | 366 ngày, lọc `action` (đếm thẳng qua index) | 0,58 giây |

- Khi cần bảng thống kê gọn hơn: xem mục "Hướng mở rộng".
- **Giới hạn phát hiện ở B8 (Q11):** phần đếm thẳng của `/stats` chỉ đọc bảng chính. Phần này gồm cảnh báo bảo mật, dòng chảy tin, và cả bốn biểu đồ khi lọc theo `action`/`resubmit`. Các biểu đồ đọc bảng thống kê thì vẫn đủ, vì bảng thống kê không bị dọn.
  - Với khoảng 366 ngày và thời hạn 365 ngày, phần thiếu là dòng của khoảng 1 ngày đầu khoảng. Trên branch đo, phần đó là 65 dòng, trong đó 4 cảnh báo bảo mật: `securityAlerts` ra 5.367, đúng ra là 5.371.
  - Nếu đặt `AUDIT_RETENTION_DAYS` nhỏ (ví dụ 30), phần thiếu lớn hơn nhiều.
  - **Đã sửa theo Q11 (a), cùng ngày.** Kiểm lại trên branch đo với khoảng 366 ngày, so `/stats` với số đếm trực tiếp trên cả hai bảng. Cả bốn phép so đều khớp:

    | Phép so | `/stats` | Đếm trên cả hai bảng |
    | --- | --- | --- |
    | `securityAlerts` | 5.371 | 5.371 |
    | Tin được duyệt | 24.970 | 24.970 |
    | Tổng không lọc | 178.996 | 178.996 |
    | Tổng khi lọc `action` | 35.819 | 35.819 |

    Thời gian đọc thêm bảng lưu trữ (đo xen kẽ có và không, trung vị 7 lần): không lọc 1,25 so với 1,12 giây; lọc `action` 1,09 so với 1,05 giây. Lượt hỏi mốc lưu trữ chạy song song với lượt hỏi giờ đã gộp, nên không thêm lượt chờ nào. Phần tăng có thể do 3–4 truy vấn trên bảng lưu trữ chạy cùng lúc với khoảng 8 truy vấn khác, nên phải chờ kết nối trống trong pool của Prisma; điều này chưa đo để xác nhận. Với khoảng mặc định 30 ngày, khoảng ngày không chạm tới phần đã lưu trữ, nên không có truy vấn nào thêm ngoài lượt hỏi mốc. Các số đo trong lần kiểm này đều cao hơn số đo `getStats` ở trên, do mạng trong phiên đo này chậm hơn.

## Hướng mở rộng khi dữ liệu lớn (chưa làm)

Đây là các bước tiếp theo nếu `audit_logs` lên hàng chục triệu dòng. Mỗi bước cần AD riêng.

- **Chia bảng theo tháng** (Postgres declarative partitioning): dòng mới chỉ ghi vào bảng của tháng hiện tại, nên index nhỏ và ghi nhanh. Lọc theo khoảng ngày chỉ đọc các tháng liên quan. Retention thành `DETACH PARTITION` thay cho chuyển từng lô. Cái giá: Prisma không tự quản lý partition, phải viết migration SQL tay và có cron tạo sẵn bảng cho tháng tới.
- **Read replica**: trang nhật ký và xuất CSV đọc từ bản sao, bảng chính chỉ lo ghi. Cần kiểm gói Neon có hỗ trợ không.
- **BRIN trên `createdAt`** cho bảng lưu trữ, hoặc cho từng partition: rất nhỏ, hợp với dữ liệu chỉ thêm và chỉ lọc theo khoảng.
- **Bảng thống kê gọn hơn** (phát hiện ở B8): tách thành hai bảng. Bảng thứ nhất gộp giờ × nhóm × loại người làm (không có người làm), dùng cho bốn biểu đồ. Bảng thứ hai gộp ngày × người làm, dùng cho top người làm. Trên dữ liệu đo, bảng thứ nhất gọn hơn bảng thô khoảng 3 lần, trong khi bảng hiện tại chỉ gọn hơn 1,4 lần. Cần migration.
- **Ghi bất đồng bộ qua outbox** (AD-8) cho các sự kiện nhiều mà ít quan trọng. **Không** áp cho dòng kiểm duyệt và bảo mật, vì những dòng đó phải ghi cùng transaction với thao tác.
- **Xuất CSV chạy nền** (job tạo file, xong thì báo) khi cần vượt 5.000 dòng.
- **Kho chuyên cho log** (ClickHouse, OpenSearch): chỉ khi lượng sự kiện vượt xa khả năng của Postgres.

## Phần 4 — Ghi chú của chủ dự án

(để trống)
