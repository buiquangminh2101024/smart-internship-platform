# Dữ liệu demo cho dashboard Employer (E11)

Việc riêng của `docs/05-frontend/phases/employer-dashboard-v2/PLAN.md` (E11). Chỉ là một script trong `apps/server/scripts/`, không đổi schema, API hay giao diện.

**Trạng thái: XONG (2026-11-04).** Chủ dự án đã tải CV mẫu (`docs/temp/cv-mau-demo.pdf`) và chạy bản ghi; đã kiểm DB (outbox giữ 36, gói `ACTIVE` tới 02/02/2027) và trang: dashboard, Ứng viên, Lịch phỏng vấn (hai tab), Tin tuyển dụng `?attention=1`, Tin nhắn, Lời mời. Chưa thử chạy lại lần hai và `--reset` (mục Kiểm, bước 3). Các chỗ khác plan ban đầu ghi ở mục "Khác plan khi làm" cuối file.

## Mục tiêu

Đăng nhập `employer@match-demo.local` (Công ty Demo Job Matcher) thì mọi khối của `/employer/dashboard` có số thật, không toàn số 0: 4 thẻ, biểu đồ hồ sơ / lượt xem theo ngày, bảng "Hiệu quả tin đang hiển thị", trung tâm thông báo. Các trang mà thẻ dẫn tới (Ứng viên, Lịch phỏng vấn, Tin tuyển dụng, Tin nhắn, Lời mời) cũng có dữ liệu khớp với số trên thẻ.

## Hiện trạng (đọc DB ngày 2026-11-04, chỉ SELECT)

- Công ty demo do `scripts/seed-match-demo.ts` tạo, dùng chung với bộ đánh giá Job Matcher GĐ2: 21 ứng viên `@match-demo.local` và 10 tin của fixture `scripts/data/match-demo.json`.
- Gói "Tiêu chuẩn" hết hạn 28/10/2026; còn một đơn "Doanh nghiệp" `PENDING` (thanh toán dở). Công ty `BLOCKED` nên cron `job-post-expiry` đã chuyển cả 9 tin đang hiển thị sang `EXPIRED`, dù `expiresAt` của chúng là 21/03/2027. **Muốn tin hiển thị lại thì công ty phải có gói `ACTIVE` dài hơn hạn của mọi tin.**
- Dữ liệu thử tay của chủ dự án: 4 hồ sơ (3 `PENDING`, 1 `INTERVIEWING`), 1 lịch phỏng vấn, 1 hội thoại, 1 lời mời (đã hết hạn), 3 thông báo, tin nháp `[TEST B10] Tin thử gửi lại` (bị từ chối). **Giữ nguyên** (D1).
- Chỉ 3/21 ứng viên có CV (`Application.cvId` bắt buộc), 20/21 chưa có họ tên (giao diện ghi "Ứng viên chưa đặt tên").
- `.env` đang để `DEV_SKIP_EMAIL_SENDING=false`: server dev gửi email thật qua Resend.

## Quy tắc ngày tháng (chủ dự án yêu cầu 2026-11-04)

Mọi thứ có hạn **không hết hạn trước 01/12/2026** và hạn **trải dài**, không dồn một ngày:

| Thứ có hạn | Cách đặt |
|---|---|
| Tin đang hiển thị (8 tin) | `expiresAt` = mốc + 2, 9, 17, 24, 31, 38, 45, 55 ngày, với mốc = `max(01/12/2026, hôm chạy)`. Chạy ngày 04/11 thì ra 03/12, 10/12, 18/12, 25/12/2026, 01/01, 08/01, 15/01, 25/01/2027. Tin cuối luôn hết hạn trước gói: mốc cách hôm chạy tối đa 27 ngày, nên tin cuối ≤ hôm chạy + 82 ngày < hôm chạy + 90 ngày |
| Gói dịch vụ | Một gói "Doanh nghiệp" (90 ngày) `ACTIVE`, `startDate` = hôm chạy, `endDate` = + 90 ngày (chạy 04/11 thì hết 02/02/2027). Script **từ chối chạy** nếu có tin hết hạn sau `endDate` (để cron không đóng tin trước hạn) |
| Lời mời ứng viên | Không tạo lời mời đang chờ (D3), nên không có lời mời nào còn hạn |
| Lịch phỏng vấn | Không có "hạn"; buổi trong quá khứ và tương lai tính theo ngày chạy (mục dưới) |

Hệ quả cần biết:

- Thẻ "Tin cần chú ý" sẽ ghi **0 hết hạn trong 7 ngày** cho tới khoảng 26/11 (tin sớm nhất hết hạn 03/12). Thẻ vẫn có số nhờ 2 tin bị từ chối (`[TEST B10]` và tin mới của demo).
- Dòng nhắc gói dịch vụ **không hiện** (gói còn gần 3 tháng, còn lượt đăng tin). Muốn trình diễn dòng nhắc thì xem bằng tài khoản khác, hoặc hỏi lại để thêm tuỳ chọn.

## Dữ liệu tạo ra

Mọi mốc thời gian tính lùi / tới từ lúc chạy, nên chạy lại trước buổi báo cáo là số lại "mới".

**Ứng viên** (dùng lại 21 ứng viên của fixture, không tạo tài khoản mới)

- Đặt `fullName` tiếng Việt giả (danh sách cố định trong script) **chỉ cho ứng viên chưa có tên**; ứng viên đã có tên (vd. "Spring Boot God" do chủ dự án đặt) giữ nguyên. `avatarUrl` để trống (giao diện hiện chữ cái đầu). Job Matcher không đọc `fullName` (đã grep `modules/job-matching`), `seed-match-demo` chạy lại chỉ cập nhật `headline`/`bio`, nên không ảnh hưởng bộ đánh giá. `--reset` không xoá tên (vô hại, và không phân biệt được tên nào do script đặt).
- CV (D2): chủ dự án đăng nhập một ứng viên demo và tải lên một file PDF tên **`cv-mau-demo.pdf`**, nội dung ghi rõ "CV mẫu — dữ liệu demo". Script tìm CV có `fileName = "cv-mau-demo.pdf"` của ứng viên `@match-demo.local`; không thấy thì `--dry-run` báo thiếu và bản ghi dừng trước khi ghi gì. Ứng viên demo cần nộp hồ sơ mà chưa có CV được tạo một dòng `Cv` mới (`id` tiền tố `cdemodash`) dùng lại `fileUrl` đó, `extractionStatus = NOT_STARTED`. Trích xuất CV bằng AI chỉ chạy khi có người bấm (`cv-extraction-pipeline.service.ts`), không có cron, nên tạo dòng `Cv` không gọi AI. Ứng viên đã có CV thì dùng CV của họ.

**Tin tuyển dụng** (10 tin của fixture + 2 tin mới)

| Trạng thái | Số tin | Ghi chú |
|---|---|---|
| Đang hiển thị (`PUBLISHED`) | 8 tin của fixture | `publishedAt` rải 23/09–20/10/2026 (trong thời gian công ty có gói Tiêu chuẩn), `expiresAt` theo bảng trên |
| Đã đóng (`CLOSED`) | 1 tin của fixture | `closedAt` khoảng 10 ngày trước |
| Nháp (`DRAFT`) | 1 tin của fixture | |
| Nháp bị từ chối | 1 tin mới | Hai dòng `JobPostModerationAction`: `SUBMITTED` rồi `REJECTED` kèm lý do ("Thiếu mô tả quyền lợi và mức phụ cấp") |
| Chờ duyệt (`PENDING`) | 1 tin mới | Hiện ở bàn duyệt của Admin, nên dashboard Admin cũng có việc để trình diễn |

`viewCount` của mỗi tin = tổng `JobPostDailyStat.views` của tin đó. Lượt xem theo ngày từ `publishedAt` tới hôm qua, 3–30 lượt/ngày, ngày thường nhiều hơn cuối tuần, tin "hot" nhiều hơn. Biểu đồ 90 ngày sẽ trống đoạn trước 23/09, đúng với lúc công ty bắt đầu đăng tin.

**Hồ sơ ứng tuyển** (khoảng 26 hồ sơ demo, mỗi cặp tin–ứng viên tối đa một hồ sơ; script đọc các cặp đã có trong dữ liệu thử để không trùng)

| Trạng thái | Số | Thời điểm nộp |
|---|---|---|
| Chờ duyệt (`PENDING`) | 6 | 4 hồ sơ trong 7 ngày qua, 2 hồ sơ 8–14 ngày trước. Cộng 3 hồ sơ chờ của dữ liệu thử, thẻ ghi **9 hồ sơ**, "+N hồ sơ mới so với 7 ngày trước", "Cũ nhất: chờ ~43 ngày" (hồ sơ thử nộp 22/09) |
| Đang xem xét | 3 | 10–25 ngày trước |
| Vào danh sách rút gọn | 3 | Chưa có lịch, nên trang Lịch phỏng vấn có tab "Chờ đặt lịch" |
| Mời phỏng vấn | 6 | Có lịch (mục dưới) |
| Được nhận | 2 | 25–40 ngày trước |
| Bị từ chối | 4 | |
| Đã huỷ | 2 | Không tính vào biểu đồ / số hồ sơ của tin, đúng quy ước hiện có |

- Hồ sơ nhiều ở tin "hot", ít ở tin khác, để bảng hiệu quả tin có thứ tự rõ và tỉ lệ nộp khác nhau. Ít nhất một tin đang hiển thị có 0 hồ sơ (bảng ghi đúng "0").
- Ứng viên nộp tin hợp kỹ năng của mình (theo `skills` trong fixture), để cột "Khớp kỹ năng" ở trang Ứng viên trông hợp lý.
- Mỗi hồ sơ có `ApplicationStatusHistory` đúng đường đi (`null → PENDING → REVIEWING → …`) với mốc tăng dần. Trang Lịch phỏng vấn tính thời gian chờ đặt lịch từ bảng này.

**Lịch phỏng vấn** (cho 6 hồ sơ "Mời phỏng vấn", người tạo = employer demo)

- 2 buổi trong 7 ngày qua (đã diễn ra, `SCHEDULED`) → thẻ ghi "so với 7 ngày qua".
- 3 buổi trong 7 ngày tới, giờ hành chính (9:00, 14:00, 15:30), có cả trực tuyến lẫn tại văn phòng.
- 1 buổi ngày thứ 10 tới (ngoài 7 ngày): thẻ chỉ đếm 3 buổi, còn tab "Lịch đã đặt" có đủ 4 buổi sắp tới.
- 1 buổi đã huỷ kèm lý do, nằm trong hồ sơ "Bị từ chối".

**Tin nhắn**

- 4 hội thoại (gắn tin + ứng viên đã nộp hồ sơ), mỗi cái 3–6 tin nhắn qua lại, nội dung ngắn kiểu hỏi lịch, hỏi phụ cấp.
- 2 hội thoại chưa đọc (tin cuối của ứng viên, sau `employerLastReadAt`), từ 2 ứng viên khác nhau; tin mới nhất khoảng 2 giờ trước.

**Lời mời ứng viên** (D3): 3 lời mời trong 30 ngày qua, 1 đã chấp nhận, 2 đã từ chối; không có lời mời đang chờ. `expiresAt` = `createdAt` + 14 ngày như quy tắc thật, `respondedAt` trước hạn đó (lời mời đã trả lời thì không còn hết hạn). Không tạo lời mời nào **hôm nay**, để không ăn vào hạn mức lời mời trong ngày. Lời mời thử của chủ dự án vẫn còn, nên trang Lời mời đếm cả nó nếu nó nằm trong 30 ngày qua.

**Thông báo cho employer** (khoảng 8, chỉ trong app, nội dung render bằng `notification-templates.ts` để giống hệt thông báo thật)

- 3 "Có hồ sơ ứng tuyển mới" (chưa đọc), 1 "Tin tuyển dụng bị từ chối" (tin nháp bị từ chối ở trên), 1 "Tin tuyển dụng đã được duyệt", 1 "Ứng viên đã phản hồi lời mời", 1–2 thông báo cũ đã đọc.
- `createdAt` khớp với thời điểm của sự việc tương ứng. 3 thông báo thử của chủ dự án nằm lẫn theo thời gian.

## Không gửi email thật

Script ghi thẳng bằng Prisma, **không** gọi `NotificationsService.notify()` nên không tạo dòng outbox. Script đếm `outbox_events` trước và sau khi chạy; nếu số tăng thì rollback và báo lỗi.

Còn hai cron trên server đang chạy có thể **tự gửi email** cho dữ liệu demo:

| Cron | Khi nào | Cách xử lý |
|---|---|---|
| `interview-reminder` (08:00 mỗi ngày, nhắc lịch **ngày mai**, có email cho ứng viên) | Mỗi buổi phỏng vấn tương lai sẽ tới lượt | Script tạo sẵn thông báo nhắc lịch cho **ứng viên** với đúng `dedupeKey` mà cron dùng (`INTERVIEW_REMINDER:{interviewId}:{userId}:{scheduledAt ms}`), đánh dấu đã đọc. `notifyOnce` thấy key đã có thì bỏ qua, không xếp email. Phần nhắc cho employer (chỉ trong app) để cron tự tạo như thật |
| `subscription-expiring-notice` (7 ngày trước khi gói hết, có email cho employer) | Khoảng 26/01/2027 | Không chặn trước (nếu chặn thì trung tâm thông báo hiện "gói sắp hết hạn" ngay từ bây giờ). Ghi vào hướng dẫn chạy: trước ngày đó thì chạy lại script (gói được gia hạn từ ngày chạy) hoặc bật `DEV_SKIP_EMAIL_SENDING=true` |

Địa chỉ `@match-demo.local` không nhận được thư; mục trên là để không có lời gọi Resend nào xuất phát từ dữ liệu demo.

## Script

File `apps/server/scripts/seed-dashboard-demo.ts`, thêm lệnh `seed-dashboard-demo` vào `apps/server/package.json` theo mẫu `seed-match-demo` (`dotenv -e ../../.env -- tsx …`). Không thêm dependency.

```text
npm run seed-dashboard-demo -- --dry-run   in ra sẽ tạo / xoá gì, không ghi
npm run seed-dashboard-demo                xoá phần demo cũ rồi tạo lại (chạy lại bao nhiêu lần cũng được)
npm run seed-dashboard-demo -- --reset     chỉ xoá phần demo
```

- **Điều kiện chạy:** phải có `employer@match-demo.local` và công ty tên đúng `DEMO_COMPANY_NAME` (đã có trong `scripts/lib/match-demo-fixture.ts`); thiếu thì dừng, nhắc chạy `seed-match-demo` trước. Không bao giờ đụng công ty, tin hay người dùng khác.
- **Đánh dấu dữ liệu demo (D1):** mọi dòng script tạo có `id` bắt đầu bằng **`cdemodash`** (chữ thường + số, xem mục "Khác plan khi làm"). Schema dùng `String @id @default(cuid())`, nên tự đặt `id` được, không sửa schema. Chạy lại và `--reset` **chỉ xoá dòng có tiền tố này**; dữ liệu thử của chủ dự án không bị đụng. Áp dụng cho `CompanySubscription`, `JobPost` (2 tin mới), `JobPostModerationAction`, `JobPostDailyStat`, `Cv`, `Application`, `ApplicationStatusHistory`, `Interview`, `Conversation`, `Message`, `CandidateOutreachInvitation`, `Notification`. Xoá con trước cha.
- **`JobPostDailyStat`** có unique `(jobPostId, date)` và hiện đã có 8 dòng lượt xem thật lúc thử. Ngày nào đã có dòng thì script bỏ qua ngày đó, giữ số thật. `viewCount` của tin = tổng mọi dòng của tin.
- **Không tạo `Payment`** cho gói demo, để doanh thu trên dashboard Admin không bị cộng tiền giả. Lịch sử mua gói sẽ hiện gói này như các gói khác.
- **Tin của fixture:** script chỉ đổi `status`, `publishedAt`, `expiresAt`, `closedAt`, `viewCount`; không đổi nội dung hay kỹ năng. Đây là cập nhật, không phải dòng mới, nên không có tiền tố; `--reset` trả 8 tin đang hiển thị về `EXPIRED` (như trước khi chạy) và tính lại `viewCount` từ các dòng lượt xem còn lại. Chạy `seed-match-demo` sau script này sẽ đặt lại cả 10 tin thành `PUBLISHED` hạn +180 ngày, nên thứ tự chạy là `seed-match-demo` trước, `seed-dashboard-demo` sau.
- **Một transaction** cho toàn bộ phần ghi (kể cả đặt `fullName`), lỗi giữa chừng thì không để lại nửa dữ liệu.
- **Chỉ chủ dự án chạy**, trên Neon, sau khi đọc script. Lúc làm, mình chỉ chạy `--dry-run` và `tsc`; không chạy bản ghi.
- In cuối cùng: số đã tạo theo từng bảng, và các số mà dashboard sẽ hiện **tính cả dữ liệu thử** (hồ sơ chờ, phỏng vấn 7 ngày tới / qua, tin cần chú ý, tin nhắn chưa đọc) để đối chiếu với trang.

## Kiểm

1. `tsc` server; `--dry-run` trên DB thật in đúng kế hoạch, không ghi (đếm số dòng trước/sau).
2. Chủ dự án chạy bản ghi. Sau đó mình kiểm (chỉ đọc + trình duyệt): 4 thẻ khớp số script in ra; biểu đồ 7/30/90 ngày và nút Hồ sơ/Lượt xem; bảng hiệu quả tin (thứ tự, tỉ lệ, hạn nộp); trung tâm thông báo; các trang Ứng viên, Lịch phỏng vấn (hai tab), Tin tuyển dụng (`?attention=1`), Tin nhắn, Lời mời; `outbox_events` không tăng.
3. Chạy lại lần hai: số không nhân đôi. `--reset`: phần demo biến mất; 21 ứng viên, 10 tin của fixture và toàn bộ dữ liệu thử (4 hồ sơ, 1 lịch, 1 hội thoại, 1 lời mời, 3 thông báo, tin `[TEST B10]`) còn nguyên. Sau đó `npm run seed-match-demo -- --check` vẫn hợp lệ.

## Ước lượng

| Phần | Thời gian |
|---|---|
| Script + dữ liệu cố định (tên, nội dung tin nhắn, lý do từ chối) | 2,5–3 giờ |
| `--dry-run`, `--reset`, kiểm sau khi chạy | 1 giờ |

## Đã chốt (2026-11-04)

| # | Câu hỏi | Đã chốt |
|---|---|---|
| D1 | Dữ liệu thử tay hiện có (4 hồ sơ, 1 lịch, 1 hội thoại, 1 lời mời, 3 thông báo, tin `[TEST B10]`) | **Giữ nguyên.** Dữ liệu demo đánh dấu bằng tiền tố `id` `cdemodash`; chạy lại / `--reset` chỉ xoá phần có tiền tố. Vẫn tạo thêm tin nháp bị từ chối của demo (thẻ "Tin cần chú ý" ghi 2 bị từ chối); bỏ tin này nếu chủ dự án thấy `[TEST B10]` là đủ |
| D2 | CV cho hồ sơ demo | **Chủ dự án tải lên một CV mẫu `cv-mau-demo.pdf` bằng tài khoản ứng viên demo; script dùng lại `fileUrl` của nó.** Script không tự tải file lên dịch vụ ngoài, không dùng lại `MyCV3.pdf` |
| D3 | Lời mời đang chờ | **Không tạo**; chỉ tạo lời mời đã chấp nhận / đã từ chối, hạn theo đúng quy tắc 14 ngày |

## Khác plan khi làm (2026-11-04)

- **Tiền tố `id` là `cdemodash`, không phải `demo-dash-`.** API nộp hồ sơ kiểm `cvId` bằng `z.string().cuid()` (regex `^[cC][0-9a-z]{6,}$`), nên CV demo có `id` chứa gạch nối sẽ làm ứng viên demo không nộp hồ sơ mới được bằng CV đó. `cdemodash` không trùng cuid thật (cuid thật bắt đầu bằng `c` + mốc thời gian, hiện là `cm…`/`cn…`).
- **`id` CV demo theo ứng viên** (`cdemodashcv<candidateId>`). CV demo đã bị một hồ sơ thật dùng (vd. lúc demo bấm nộp hồ sơ) thì không xoá được; script giữ lại và dùng tiếp, không tạo trùng.
- **`--dry-run` chỉ đọc**, không mở transaction ghi rồi rollback. Số "dự kiến" tính bằng JS từ dữ liệu thật hiện có + phần sẽ tạo.
- **Chạy lại / `--reset` xoá thêm** thông báo nhắc lịch do cron tạo cho lịch demo (`dedupeKey` bắt đầu `INTERVIEW_REMINDER:cdemodash`), vì lịch demo được tạo lại với giờ mới.
- **Thêm** 2 buổi phỏng vấn đã diễn ra (`SCHEDULED`, khoảng 23 và 31 ngày trước) cho 2 hồ sơ "Được nhận", và 2 thao tác kiểm duyệt `SUBMITTED`/`APPROVED` cho tin QA (khớp thông báo "Tin tuyển dụng đã được duyệt"). Không ảnh hưởng số trên thẻ.
- **Ngày đăng tin tự lùi** nếu tin đã có hồ sơ hoặc lượt xem thật sớm hơn ngày định đăng, và không sớm hơn lúc công ty được xác minh: Java Backend và Kế toán đăng 21/09, Frontend Product đăng 06/10 thay vì 14/10 (có 5 lượt xem thật ngày 07/10).
- Tin mới và tin nháp của fixture có hạn = mốc + 50 ngày (gửi duyệt bắt buộc có hạn). Tin đã đóng có hạn = mốc + 20 ngày.

Kết quả `--dry-run` ngày 04/11/2026 (chưa có CV mẫu nên bản ghi sẽ dừng): 26 hồ sơ demo, 17 CV mới, 20 ứng viên được đặt tên, 9 lịch phỏng vấn, 4 hội thoại / 15 tin nhắn, 3 lời mời, 8 thông báo cho employer (4 chưa đọc) + 4 nhắc lịch đặt sẵn, 303 ngày lượt xem. Số dashboard dự kiến (tính cả dữ liệu thử): 9 hồ sơ chờ (cũ nhất 22/09), 3 buổi phỏng vấn 7 ngày tới, 2 buổi 7 ngày qua, 8 tin đang hiển thị, 2 tin cần chú ý (2 bị từ chối), 2 hội thoại chưa đọc từ 2 ứng viên.
