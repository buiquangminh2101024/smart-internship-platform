# Nhật ký hoạt động Admin bản 2 — từ "bàn điều tra" về đúng "nhật ký"

**Trạng thái: ĐÃ DUYỆT (2026-11-04). Xong A1–A3 (backend); A4–A8 chưa làm.**

Thay bố cục của `docs/05-frontend/phases/admin-audit-log/PLAN.md` (bản C "Bàn điều tra", xong 2026-10-18). Phần backend của nhật ký (`docs/06-backend/admin-audit-log/PLAN.md`: ghi nhật ký, index, lưu trữ, bảng thống kê theo giờ, xuất CSV) giữ nguyên, trừ một API mới ở N6.

## Lý do

Buổi báo cáo ngày 29/10/2026, giáo viên hướng dẫn nhận xét trang `/admin/activity`:

- Trang tên là nhật ký nhưng phần lớn là thống kê: "cô đi coi nhật ký hay cô đi coi thống kê?".
- Biểu đồ có hai cột cao vọt nhưng không giải thích được là bất thường gì. Thứ duy nhất demo được là cảnh báo đăng nhập sai 5 lần.
- Không rõ trang để làm gì, nhìn như AI sinh hoàn toàn, nghiệp vụ không chắc. Giáo viên muốn trang **ít đi**.
- Không có dữ liệu để hình dung một cuốn nhật ký.
- Sáu nút nhóm ở đầu (Tin tuyển dụng, Công ty, Danh mục, Thanh toán, Tài khoản…) không rõ để làm gì.
- Phải trả lời bằng số chính xác: nhật ký xem theo ngày, tuần hay tháng; tải bao nhiêu dòng; vì sao chọn 1 tháng; muốn xem tháng thứ hai thì làm sao.
- "Nhật ký thì em phải note được cái gì là điểm chính trong cái tuần qua."

Đối chiếu với trang hiện tại:

- Trước danh sách có 7 khối: thanh cảnh báo bảo mật, theo ngày, tỉ lệ theo nhóm, vai trò người làm, top 5 người làm, lưới thứ × giờ, dòng chảy tin tuyển dụng.
- Danh sách "Sự kiện" thì đã đúng dạng nhật ký (giờ, người làm, hành động, mô tả, lý do, IP, link). Nhưng mỗi dòng lặp lại ngày, và danh sách nằm dưới cùng.
- Dữ liệu thật trên Neon (đếm chỉ đọc, 2026-11-04): bảng `audit_logs` có **26 dòng**, từ 07/10 đến 29/10/2026; bảng lưu trữ rỗng. Mỗi tuần 1–13 dòng. Script demo dashboard Employer không ghi nhật ký. Vì vậy trang gần như trống khi demo.

Đánh giá từng khối biểu đồ (đã trao đổi với chủ dự án):

| Khối | Giữ? | Lý do |
| --- | --- | --- |
| Cảnh báo đăng nhập sai | Giữ, gộp vào Điểm chính | Quy tắc rõ, có ngưỡng, demo được |
| Theo ngày | Bỏ | Thay bằng số đếm ở tiêu đề ngày trong danh sách |
| Tỉ lệ theo nhóm | Bỏ | Thống kê nền tảng, trùng bộ lọc nhóm |
| Vai trò người làm | Bỏ | Không giúp tra cứu, không lộ bất thường |
| Top 5 người làm | Bỏ | Với lượng dữ liệu của đồ án luôn là Admin và Hệ thống. Thay bằng các quy tắc theo vai trò (N4) |
| Thứ × giờ | Bỏ | Gần như trống, khó bảo vệ |
| Dòng chảy tin tuyển dụng | Bỏ | Thống kê nghiệp vụ duyệt tin, không phải nhật ký |

## Quyết định

| # | Quyết định |
| --- | --- |
| N1 | Trang còn **ba phần**: khối "Điểm chính", thanh lọc, danh sách theo ngày. Ngăn kéo chi tiết, "Xuất CSV", "Xem nhật ký đã lưu trữ" giữ nguyên. |
| N2 | **Bỏ 6 khối biểu đồ và thanh cảnh báo riêng.** Trang không gọi `GET /admin/activity/stats` nữa. Có xoá file component và thu gọn `/stats` hay không: xem câu hỏi Q1. |
| N3 | **Khối Điểm chính** có nút chuyển **7 ngày / 30 ngày**, mặc định 7 ngày, lưu trên URL `?hl=30` (không có thì là 7). Nút này chỉ đổi số trong khối Điểm chính, không đổi bộ lọc danh sách. |
| N4 | Phần **"Cần xem"** có đúng **ba quy tắc**, mỗi quy tắc áp cho một loại tài khoản cụ thể (không dùng một ngưỡng chung cho mọi vai trò, xem Q2). Luôn đứng đầu khối, có tông marigold khi khác 0. Bằng 0 thì vẫn hiện một dòng xám (vd. "Không có lần đăng nhập sai bất thường") để Admin biết đã kiểm tra. (a) **Đăng nhập sai liên tục** (mọi tài khoản): 5 lần trong 15 phút, đã có (`AUTH_LOGIN_FAILED_REPEATED`). (b) **Admin đăng nhập từ IP mới**: dòng `AUTH_LOGIN_SUCCEEDED` có `metadata.ip` chưa xuất hiện ở lần đăng nhập nào của chính Admin đó trong 30 ngày trước lần đăng nhập này. Admin không có lần đăng nhập nào trong 30 ngày trước cũng tính là IP mới. (c) **Employer gửi duyệt tin dồn dập**: một tài khoản Employer có từ **10** dòng `JOB_POST_SUBMITTED` hoặc `JOB_POST_AUTO_PUBLISHED` trong cùng một giờ (giờ tròn, giờ Việt Nam). Ngưỡng và độ dài cửa sổ so sánh là hằng số ở server. **Cách hiện:** mỗi quy tắc là một dòng tóm tắt "N lần … · M tài khoản", **mặc định đóng**. Bấm thì mở xuống tại chỗ (nút có `aria-expanded`) một danh sách **gộp theo tài khoản**: email, số lần, mức nặng nhất (số tin/giờ với (c), IP với (b)), thời điểm gần nhất. Lần gần nhất đứng trước. Hiện tối đa **10 tài khoản**; nhiều hơn thì dòng cuối "Xem cả N tài khoản trong danh sách" lọc danh sách bên dưới. Quy tắc bằng 0 không mở được. |
| N5 | Phần **"Hoạt động chính"** cố định 4 dòng, theo 4 việc Admin phụ trách. Mỗi dòng là một link lọc danh sách. (1) Tin tuyển dụng: được duyệt (gồm tự duyệt), bị từ chối, gửi lại sau từ chối. (2) Công ty: được xác minh (gồm tự xác minh), bị từ chối. (3) Thanh toán gói dịch vụ. (4) Danh mục: đề xuất được duyệt (gồm đổi tên), bị từ chối, gộp. Số 0 vẫn hiện. |
| N6 | **API mới `GET /admin/activity/highlights?days=7\|30`** (Admin). Trả số đếm của N4 và N5 trong `days` ngày gần nhất tới hiện tại, giờ Việt Nam. Mỗi quy tắc "Cần xem" trả: tổng số lần, tổng số tài khoản, và `accounts` tối đa 10 phần tử (gộp theo tài khoản, lần gần nhất trước). Mỗi phần tử gồm `userId`, email, số lần, thời điểm và id dòng nhật ký của lần gần nhất; (b) thêm IP mới và tối đa 3 IP quen trước đó; (c) thêm số tin nhiều nhất trong một giờ và khoảng giờ của lần gần nhất. Với (a), tài khoản là tài khoản **bị dò** (`entityId`), không phải người làm (người làm là Hệ thống, Q10 của plan BE). Đếm thẳng trên `audit_logs` theo index `(action, createdAt)`. (b) chỉ đọc dòng `AUTH_LOGIN_SUCCEEDED` (mỗi Admin vài lần mỗi ngày); phần so sánh 30 ngày trước có thể lùi quá thời hạn giữ nên đọc cả bảng lưu trữ. (c) gom theo `(actorId, giờ)`. |
| N7 | Bấm một dòng Điểm chính: đặt bộ lọc danh sách `action=…` (và `resubmit=true` với "gửi lại"), `from`/`to` theo 7 hoặc 30 ngày đang chọn, rồi cuộn tới danh sách. Bấm **một tài khoản** trong phần "Cần xem" đã mở: (a) lọc `action=AUTH_LOGIN_FAILED_REPEATED` + `ent=User:<id>` của tài khoản bị dò, trong 7/30 ngày đang chọn (dòng có IP). (b) mở ngăn kéo chi tiết ở lần đăng nhập IP mới đó (`row=`); ngăn kéo hiện IP mới và các IP quen để so. (c) đặt `actorId` + `since`/`until` của giờ dồn dập gần nhất (tham số đã có ở hành trình người làm) và `action=JOB_POST_SUBMITTED,JOB_POST_AUTO_PUBLISHED`, thấy từng tin đã gửi. Dòng "Xem cả N tài khoản trong danh sách": (a) lọc `action=AUTH_LOGIN_FAILED_REPEATED`; (b) lọc `action=AUTH_LOGIN_SUCCEEDED`; (c) lọc `action=JOB_POST_SUBMITTED,JOB_POST_AUTO_PUBLISHED` + `actorRole=EMPLOYER`, cùng khoảng ngày. Dùng lại tham số URL hiện có, không thêm tham số lọc mới. |
| N8 | **Thanh lọc gọn**: 6 nút nhóm đổi thành một ô chọn "Loại hoạt động" (Tất cả + 6 nhóm, chọn một). Giữ vai trò, khoảng ngày (7/30/90 ngày + hai ô ngày), tìm email, hàng chip đang lọc. Ở màn hình hẹp vẫn thu vào nút "Bộ lọc (n)". |
| N9 | **Khoảng mặc định của danh sách giữ 30 ngày** (không đổi API). Lý do để trình bày: Admin xem điểm chính tuần qua ở khối trên. Danh sách 30 ngày đủ để tra lại một việc trong tháng, và luôn tải 50 dòng mỗi lần nên khoảng dài cũng không nặng. |
| N10 | **Danh sách chia theo ngày.** Tiêu đề ngày: "Hôm nay · 04/11/2026", "Hôm qua · 03/11/2026", rồi "02/11/2026", kèm "N hoạt động" bên phải. Mỗi dòng chỉ còn giờ, bỏ dòng ngày lặp lại. Đổi tên khối "Sự kiện" thành "Danh sách hoạt động". Nội dung dòng, phím ↑/↓, "Tải thêm 50 dòng", "Đang xem X / N" giữ nguyên. |
| N11 | Số "N hoạt động" của tiêu đề ngày lấy từ server, vì một ngày có thể bị cắt giữa hai lần tải 50 dòng. Thêm `dayCounts` vào **trang đầu** của `GET /admin/activity` (cùng bộ lọc, chỉ những ngày có dòng). Đếm thẳng trên `audit_logs` (hoặc bảng lưu trữ khi `archived=1`) gom theo ngày giờ Việt Nam. Trang sau không trả lại. Dashboard Admin gọi API này với `actor=`: không ảnh hưởng vì chỉ thêm trường. |
| N12 | **Script dữ liệu demo** `apps/server/scripts/seed-activity-demo.ts` (`npm run seed-activity-demo --workspace server`), cách làm giống `seed-dashboard-demo.ts`: `--dry-run` chỉ đọc; mặc định xoá dòng demo cũ rồi tạo lại trong một transaction; `--reset` chỉ xoá. Id dòng demo bắt đầu bằng `cdemolog`. **Chỉ chủ dự án chạy.** Chi tiết ở mục "Dữ liệu demo". |
| N13 | Link cũ vào trang (`?ent=`, `?actorRole=ADMIN`, `?action=`, `?dow=&hour=`, `?row=`) vẫn chạy: bộ phân tích URL giữ nguyên, chỉ bỏ những chỗ đặt tham số từ biểu đồ. Tham số `dow`/`hour` vẫn hiện chip để bỏ được. |

## Bố cục

Màn hình rộng (≥ 1280px):

```text
┌─ Nhật ký hoạt động ───────────────────────────────────────────────────────────┐
│ 1.284 hoạt động · 06/10/2026 – 04/11/2026      [Xuất CSV] [Xem nhật ký đã lưu trữ] │
└───────────────────────────────────────────────────────────────────────────────┘
┌─ Điểm chính ────────────────────────────────────────── [ 7 ngày | 30 ngày ] ─┐
│  CẦN XEM                                                                     │
│  ▌ 3  lần đăng nhập sai liên tục · 2 tài khoản                           ▾ │
│  ▌ 1  lần Admin đăng nhập từ IP mới · 1 tài khoản                        ▾ │
│  ▌ 5  lần Employer gửi duyệt dồn dập · 3 tài khoản                       ▴ │
│     ┌────────────────────────────────────────────────────────────────────┐ │
│     │ hr@techviet.vn     3 lần · nhiều nhất 24 tin/giờ · 02/11 03:00   › │ │
│     │ tuyendung@abc.vn   1 lần · 12 tin/giờ            · 31/10 14:00   › │ │
│     │ jobs@xyz.com       1 lần · 10 tin/giờ            · 29/10 09:00   › │ │
│     └────────────────────────────────────────────────────────────────────┘ │
│  HOẠT ĐỘNG CHÍNH                                                             │
│    14 tin được duyệt · 3 tin bị từ chối · 2 tin gửi lại sau từ chối        › │
│     4 công ty được xác minh · 1 công ty bị từ chối                         › │
│     5 lần thanh toán gói dịch vụ                                           › │
│     4 mục danh mục được duyệt · 1 bị từ chối · 1 được gộp                  › │
└──────────────────────────────────────────────────────────────────────────────┘
┌─ Bộ lọc ─────────────────────────────────────────────────────────────────────┐
│ Loại hoạt động [Tất cả ▾]  Người làm [Tất cả vai trò ▾]                        │
│ Từ [06/10/2026] đến [04/11/2026]  [7 ngày][30 ngày][90 ngày]  [Tìm email…]     │
│ Đang lọc:  (Tin tuyển dụng ✕)                                    [Bỏ lọc]     │
└──────────────────────────────────────────────────────────────────────────────┘
┌─ Danh sách hoạt động ────────────────────────────────────────────────────────┐
│ HÔM NAY · 04/11/2026 ─────────────────────────────────────────── 18 hoạt động │
│  14:32  admin@sip.vn      Quản trị   Duyệt tin       "Thực tập sinh Java"   › │
│  10:47  Hệ thống                     Tin hết hạn     "Thực tập sinh QA"     › │
│ HÔM QUA · 03/11/2026 ─────────────────────────────────────────── 42 hoạt động │
│  16:20  admin@sip.vn      Quản trị   Từ chối tin     "Thực tập sinh CSKH"   › │
│                                      Lý do: Thiếu mô tả quyền lợi…            │
│                 Đang xem 50 / 1.284   [Tải thêm 50 dòng]                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

Màn hình hẹp (375px): Điểm chính xếp một cột, nút 7/30 ngày nằm cùng hàng tiêu đề; sau đó là hàng nút "Bộ lọc (n)" và "Xuất CSV"; rồi danh sách. Không có cuộn ngang cấp trang.

Kiểu: theo Admin bản D (`AdminPanel`, `SegmentedControl` cho 7/30 ngày, số dùng `tabular-nums`). Marigold chỉ cho phần "Cần xem" khi khác 0. Không biểu đồ.

## Dữ liệu demo (N12)

Mục tiêu: mở trang là thấy một cuốn nhật ký 30 ngày hợp lý, và có đúng hai chỗ "Cần xem" để demo.

- Khoảng 30 ngày tới hôm qua, mỗi ngày 6–20 dòng (ngày thường nhiều hơn cuối tuần), giờ làm việc 8:00–18:00 là chính. Tổng khoảng 350–400 dòng. Số chính xác do script in ra ở `--dry-run`.
- Người làm và đối tượng là dữ liệu có thật trong DB: các tài khoản Admin, Employer và tin, công ty, mục danh mục hiện có (gồm tin của dữ liệu demo dashboard Employer). Không tạo user mới. `summary` viết theo đúng mẫu câu của từng action trong code.
- Các tình huống cài sẵn:
  - 3 lần "đăng nhập sai 5 lần trong 15 phút" vào 2 tài khoản: một tài khoản bị 2 lần (một trong 7 ngày gần nhất lúc 22:14, một cũ hơn), tài khoản kia 1 lần cũ hơn 7 ngày. Chuyển 7 ↔ 30 ngày thấy số tài khoản đổi.
  - 3 tài khoản Employer gửi duyệt dồn dập, tổng 5 lần (quy tắc c): một tài khoản 3 lần, nặng nhất 24 tin lúc 03:00; hai tài khoản 1 lần (12 và 10 tin/giờ). Có thêm một Employer gửi 9 tin trong một giờ để chứng minh dưới ngưỡng thì không bị báo.
  - Các lần đăng nhập Admin thường dùng 2 IP quen; 1 lần trong 7 ngày gần nhất từ IP lạ (quy tắc b). Trên máy dev mọi lần đăng nhập thật đều ghi IP cổng Docker `172.19.0.1`, nên chỉ dữ liệu demo mới thể hiện được quy tắc này.
  - Admin có một giờ duyệt 15 mục danh mục liền: để chứng minh Admin làm nhiều **không** bị báo.
  - Một tin bị từ chối có lý do, rồi được gửi lại, rồi được duyệt: hành trình đối tượng có đủ ba bước.
  - Một công ty bị từ chối rồi được xác minh; 5 lần thanh toán gói.
- Đăng nhập thành công chỉ ghi cho Admin (L3), nên dữ liệu demo cũng chỉ có đăng nhập của Admin.
- Dòng demo có `createdAt` trong quá khứ. Cron gộp số theo giờ chỉ tính lại 2 giờ gần nhất (L17), nên script **tính lại bảng `audit_log_hourly_stats` cho đúng những giờ có dòng demo**, dùng hàm `toStatBuckets` có sẵn, trong cùng transaction. Như vậy CSV, lưu trữ và mọi chỗ còn đọc bảng thống kê vẫn khớp.
- Không gửi email, không tạo thông báo. Kiểm số dòng outbox trước và sau như script trước.

## Cách trình bày với giáo viên

Mỗi phần trả lời được bằng một câu:

| Câu hỏi | Trả lời |
| --- | --- |
| Trang này để làm gì? | Admin tra ai đã làm gì, lúc nào, với đối tượng nào, và xem nhanh điểm chính 7 hoặc 30 ngày qua. |
| Nhật ký ghi gì? | Những hành động đã xảy ra trong 6 nhóm: tin tuyển dụng, công ty, danh mục, thanh toán, tài khoản, bảo mật. Không ghi từng request. Đăng nhập thành công chỉ ghi của Admin. |
| Nhiều tài khoản cùng vi phạm thì sao? | Mỗi quy tắc gộp theo tài khoản, bấm mở ra thấy từng tài khoản kèm số lần và lần nặng nhất; tối đa 10, nhiều hơn thì lọc ở danh sách. Hàng chục tài khoản bị dò cùng lúc là tấn công diện rộng, xem đủ ở danh sách. |
| Bất thường là gì? | Ba quy tắc, mỗi quy tắc nhắm một cách tấn công: đăng nhập sai 5 lần trong 15 phút (dò mật khẩu); Admin đăng nhập từ IP chưa thấy trong 30 ngày (tài khoản Admin bị chiếm); Employer gửi duyệt từ 10 tin trong 1 giờ (tài khoản Employer bị chiếm để đăng tin rác). |
| Sao không đặt một ngưỡng số thao tác cho mọi người? | Admin làm nhiều là bình thường: đặt thấp thì báo nhầm, đặt cao thì Employer bị hack lách qua. Nên Admin xét IP đăng nhập, Employer xét đúng hành động gửi tin. |
| Vì sao 10 tin/giờ? | Người thật phải điền form, mỗi tin vài phút; 10 tin/giờ là một tin mỗi 6 phút suốt cả giờ. Dữ liệu thật đến 04/11/2026 cao nhất 2 tin/giờ. |
| IP mới trên máy dev? | Server chạy sau Nginx trong Docker nên mọi lần ghi IP `172.19.0.1`. Khi triển khai thật, server phải đọc IP thật của người dùng thì quy tắc mới có ý nghĩa. |
| Xem theo ngày, tuần hay tháng? | Danh sách chia theo ngày. Mặc định 30 ngày gần nhất, đổi được 7/30/90 ngày hoặc tự chọn ngày, tối đa 366 ngày mỗi lần. Điểm chính chọn 7 hoặc 30 ngày. |
| Tải bao nhiêu? | 50 dòng mỗi lần, bấm "Tải thêm 50 dòng". Trang không bao giờ tải hết. |
| Muốn xem tháng thứ hai? | Chọn lại ngày bắt đầu và kết thúc. |
| Dữ liệu lớn thì sao? | Dòng cũ hơn 365 ngày tự chuyển sang bảng lưu trữ mỗi đêm (không xoá), xem bằng nút "Xem nhật ký đã lưu trữ". Đã đo trên 178.931 dòng: đếm tổng khoảng 36 ms, lọc theo một người dùng 0,34 ms nhờ index. |
| Chưa làm được gì? | Chưa bắt được dò mật khẩu rải trên nhiều tài khoản cùng một IP, dò email không tồn tại, request ồ ạt: nhật ký không ghi các request này. Đăng nhập thành công của Employer/Candidate cũng không ghi. Xem mục "Hướng phát triển". |

## Câu hỏi cần chủ dự án chốt

| # | Câu hỏi | Khuyến nghị |
| --- | --- | --- |
| Q1 | 8 file component không còn dùng (`ActivityStatsGrid`, `ActivityDayChart`, `ActivityBarList`, `TopActorsList`, `WeekHourHeatmap`, `JobPostFlow`, `ChartTable`, `SecurityAlertBar`), hook `useActivityStats`/`useRecentFailedLogins` và API `/stats`: xoá hay giữ? | **Xoá các file FE** (code chết dễ bị hỏi). **Giữ API `/stats` và bảng thống kê** ở bản này; xoá phía server là một bước riêng sau, vì đụng cron, AD-20 và bài đo hiệu năng trong tài liệu. |
| Q2 | Quy tắc phát hiện tài khoản bất thường | **Đã chốt 2026-11-04: ba quy tắc theo vai trò (N4).** Phương án cũ "một tài khoản từ 20 thao tác/giờ" bị bỏ vì một ngưỡng chung cho mọi vai trò luôn kẹt giữa hai đầu: Admin làm năng suất (dữ liệu thật đã có giờ 8 thao tác) bị báo nhầm, còn nâng ngưỡng thì Employer bị hack lách qua. |
| Q3 | Báo cáo tin vi phạm (`JOB_REPORT_*`, phần của bạn cùng nhóm) | **Đã chốt 2026-11-04: chưa đưa vào bản này**, ghi ở "Hướng phát triển" mục 2. |

## Các bước

| Bước | Việc | Kiểm |
| --- | --- | --- |
| A1 | Shared types: `AuditActivityHighlights`; thêm `dayCounts?` vào trang đầu của `AuditActivityPage` | `tsc`. **Xong 2026-11-04** |
| A2 | BE: `GET /admin/activity/highlights` (DTO `days` ∈ {7, 30}), service + repository, hằng số ngưỡng | `tsc`; gọi API trên server dev. **Xong 2026-11-04**: logic thuần ở `audit-log.highlights.ts`, test `audit-log-highlights.test.ts`; ngưỡng đăng nhập sai đọc lại từ `auth.service.ts` |
| A3 | BE: `dayCounts` ở trang đầu `GET /admin/activity` (cả `archived=1`) | So tổng `dayCounts` với `total`. **Xong 2026-11-04**: đếm bằng `buildActivityWhereSql` (bản SQL của bộ lọc, test kiểm hai bản dùng đủ mọi khoá); khớp `total` ở 13 bộ lọc trên Neon |
| A4 | FE: hook `useActivityHighlights`; component `ActivityHighlights` (khối Điểm chính, `SegmentedControl` 7/30, link lọc N7) | 375px và ≥ 1280px; trạng thái tải, lỗi, toàn số 0; mở/đóng bằng bàn phím; quy tắc có hơn 10 tài khoản hiện dòng "Xem cả N tài khoản" |
| A5 | FE: `ActivityList` chia theo ngày + đổi tên khối; `ActivityFilters` đổi nút nhóm thành ô chọn | Bàn phím ↑/↓ vẫn chạy qua tiêu đề ngày; chip cũ vẫn bỏ được |
| A6 | FE: `page.tsx` bỏ lưới thống kê, thanh cảnh báo và ngăn kéo "Top 5 người làm"; xoá file theo Q1 | `tsc`, `npm run lint --workspace web`; link từ dashboard Admin và trang chi tiết vẫn mở đúng |
| A7 | Script `seed-activity-demo.ts` + lệnh npm | `--dry-run` do mình chạy; chạy thật do chủ dự án |
| A8 | Kiểm trên trang thật sau khi chủ dự án chạy seed; cập nhật plan cũ (ghi "đã thay bằng bản 2"), `sip-ui` mục Nhật ký hoạt động, `FEATURE_BACKLOG.md` (nếu chủ dự án đồng ý) | Ảnh chụp 375px và desktop |

## Hướng phát triển (chưa làm ở bản này)

### 1. Admin: thao tác nguy hiểm dồn dập

Quy tắc (b) bắt tài khoản Admin bị chiếm **lúc đăng nhập**. Nếu kẻ xấu đăng nhập từ IP quen (vd. dùng máy của Admin), cần thêm một lớp theo **hành động gây hại**, không theo số thao tác chung:

- Quy tắc dự kiến: một Admin có từ **5** thao tác nguy hiểm trong cùng một giờ.
- Thao tác nguy hiểm (cần chốt danh sách): `USER_SUSPENDED` (khoá tài khoản), `USER_SESSIONS_REVOKED` (thu hồi phiên đăng nhập), `COMPANY_REQUIRES_APPROVAL_CHANGED` khi tắt duyệt tin (công ty được tự đăng tin không qua Admin), `COMPANY_REJECTED`, `JOB_REPORT_ACTION_EXECUTED` (gỡ tin theo báo cáo, sau khi mục 2 xong).
- Duyệt tin, duyệt danh mục, xác minh công ty **không** tính: Admin làm nhiều những việc này là bình thường.
- Cách làm: thêm một dòng vào "Cần xem", thêm một đếm vào API `highlights`, gom theo `(actorId, giờ)` như quy tắc (c).
- Để sau vì: cần chốt danh sách hành động và ngưỡng, và giáo viên muốn trang ít đi ở bản này.

### 2. Báo cáo tin vi phạm (phần của bạn cùng nhóm)

Hiện trạng (kiểm 2026-11-04): `job-reports.service.ts` đã ghi `JOB_REPORT_RESOLVED` và `JOB_REPORT_ACTION_EXECUTED`; `JOB_REPORT_REJECTED` có trong `AUDIT_ACTIONS`. Nhưng ba action này **chưa thuộc nhóm nào** trong `AUDIT_ACTION_GROUPS`, và `JobReport` không có trong bảng nhóm theo đối tượng, nên các dòng này rơi vào nhóm `OTHER`: không có icon, màu và nhãn nhóm, không lọc được bằng ô "Loại hoạt động". Cần kiểm lại `tests/unit/audit-log-actions.test.ts` (test này kiểm mọi action thuộc đúng một nhóm).

Khi phần báo cáo xong:

- **Xếp nhóm:** đưa `JOB_REPORT_*` vào nhóm Tin tuyển dụng (khuyến nghị: không cần thêm màu thứ 7 ngoài 6 token `audit-*`), hoặc tạo nhóm "Báo cáo vi phạm" riêng (phải thêm token màu và kiểm tương phản lại theo `sip-ui`). Thêm `JobReport` vào bảng nhóm theo đối tượng.
- **Hoạt động chính:** thêm dòng thứ 5: "N báo cáo đã xử lý · M báo cáo bị bác · K tin bị gỡ theo báo cáo".
- **Cần xem (tuỳ chọn):** một tin bị nhiều người báo cáo trong thời gian ngắn (vd. từ 3 báo cáo trong 24 giờ) mà chưa ai xử lý. Hiện việc **tạo** báo cáo không ghi nhật ký, nên quy tắc này đếm thẳng trên bảng báo cáo, không qua nhật ký.
- **Liên kết:** dòng nhật ký báo cáo có link "Mở báo cáo" tới trang xử lý báo cáo của Admin.
- Thao tác gỡ tin theo báo cáo nên tính là thao tác nguy hiểm ở mục 1.

### 3. Bảo mật đăng nhập

Những kiểu tấn công nhật ký hiện chưa thấy được: dò mật khẩu rải trên nhiều tài khoản từ cùng một IP, dò email không tồn tại, request ồ ạt, đăng nhập thành công của Employer/Candidate (L3 chỉ ghi Admin). Muốn bắt phải sửa cách ghi ở module đăng nhập (đếm theo IP, ghi thêm loại sự kiện). Liên quan mục "khoá đăng nhập tạm thời" đang mở trong `FEATURE_BACKLOG.md`.

## Ghi chú của chủ dự án

(để trống)
