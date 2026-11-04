# Nhật ký hoạt động Admin bản 2 — từ "bàn điều tra" về đúng "nhật ký"

**Trạng thái: ĐÃ DUYỆT (2026-11-04). Xong A1–A8 (2026-11-04).** Bản 2.1 (thao tác nguy hiểm của Admin, báo cáo vi phạm; bước B0–B7): **ĐÃ DUYỆT (2026-11-04)**, xong B0–B3.

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
| Q3 | Báo cáo tin vi phạm (`JOB_REPORT_*`, phần của bạn cùng nhóm) | **Đã chốt 2026-11-04: chưa đưa vào bản 2.** Chốt lại cùng ngày: **làm ở bản 2.1** (mục dưới). |

## Các bước

| Bước | Việc | Kiểm |
| --- | --- | --- |
| A1 | Shared types: `AuditActivityHighlights`; thêm `dayCounts?` vào trang đầu của `AuditActivityPage` | `tsc`. **Xong 2026-11-04** |
| A2 | BE: `GET /admin/activity/highlights` (DTO `days` ∈ {7, 30}), service + repository, hằng số ngưỡng | `tsc`; gọi API trên server dev. **Xong 2026-11-04**: logic thuần ở `audit-log.highlights.ts`, test `audit-log-highlights.test.ts`; ngưỡng đăng nhập sai đọc lại từ `auth.service.ts` |
| A3 | BE: `dayCounts` ở trang đầu `GET /admin/activity` (cả `archived=1`) | So tổng `dayCounts` với `total`. **Xong 2026-11-04**: đếm bằng `buildActivityWhereSql` (bản SQL của bộ lọc, test kiểm hai bản dùng đủ mọi khoá); khớp `total` ở 13 bộ lọc trên Neon |
| A4 | FE: hook `useActivityHighlights`; component `ActivityHighlights` (khối Điểm chính, `SegmentedControl` 7/30, link lọc N7) | 375px và ≥ 1280px; trạng thái tải, lỗi, toàn số 0; mở/đóng bằng bàn phím; quy tắc có hơn 10 tài khoản hiện dòng "Xem cả N tài khoản". **Xong 2026-11-04**: kiểm trên trình duyệt bằng dữ liệu giả (phiên Admin hết hạn), gồm 12 tài khoản, quy tắc bằng 0, lỗi tải, 375px. Mỗi số ở "Hoạt động chính" là một nút lọc riêng (số 0 không bấm được). Khối ẩn khi xem nhật ký đã lưu trữ. Mở tài khoản (b) thì ngăn kéo có dòng IP mới và IP quen; đóng ngăn kéo thì focus về nút tài khoản |
| A5 | FE: `ActivityList` chia theo ngày + đổi tên khối; `ActivityFilters` đổi nút nhóm thành ô chọn | Bàn phím ↑/↓ vẫn chạy qua tiêu đề ngày; chip cũ vẫn bỏ được. **Xong 2026-11-04**: link cũ có nhiều nhóm hiện "N loại (từ link)" trong ô chọn, các chip nhóm vẫn bỏ được từng cái |
| A6 | FE: `page.tsx` bỏ lưới thống kê, thanh cảnh báo và ngăn kéo "Top 5 người làm"; xoá file theo Q1 | `tsc`, `npm run lint --workspace web`; link từ dashboard Admin và trang chi tiết vẫn mở đúng. **Xong 2026-11-04**: xoá 8 component, `useActivityStats`, `useRecentFailedLogins`, `toStatsSearch`; API `/stats` giữ nguyên |
| A7 | Script `seed-activity-demo.ts` + lệnh npm | `--dry-run` do mình chạy; chạy thật do chủ dự án. **Script xong 2026-11-04, `--dry-run` ra 401 dòng; chưa chạy thật.** Lệch so với mục "Dữ liệu demo": DB chỉ có 3 Employer nên Employer gửi 9 tin dưới ngưỡng là một trong ba tài khoản dồn dập (MB Bank, ở giờ khác). Tin rác của quy tắc (c) và vài đề xuất danh mục bị từ chối hoặc được gộp là đối tượng không có trong DB, nên "Mở tin" ở các dòng đó không tìm thấy tin. Phần lớn tin thật đăng trước khoảng 30 ngày, nên ngày trong nhật ký không khớp ngày đăng trên trang tin. Thao tác kiểm duyệt của `seed-dashboard-demo` được chép sang nhật ký đúng thời điểm. Dòng đăng nhập sai thật ngày 18/10 cũng được đếm, nên 30 ngày ra 4 lần · 3 tài khoản |
| A8 | Kiểm trên trang thật sau khi chủ dự án chạy seed; cập nhật plan cũ (ghi "đã thay bằng bản 2"), `sip-ui` mục Nhật ký hoạt động, `FEATURE_BACKLOG.md` (nếu chủ dự án đồng ý) | Ảnh chụp 375px và desktop. **Xong 2026-11-04** (sau khi chủ dự án chạy seed): 422 hoạt động trong 30 ngày; Điểm chính khớp `--dry-run` (7 ngày 1·1·1, 30 ngày 4·3, 1·1, 5·3); bấm tài khoản dồn dập lọc đúng 24 dòng giờ 03:00; ngăn kéo IP mới hiện IP quen, Esc trả focus về nút tài khoản; tiêu đề ngày "Hôm qua · 03/11/2026 · 13 hoạt động", ngày 02/11 ra 38 dù trang đầu chỉ tải một phần; 375px không cuộn ngang. Đã cập nhật plan cũ và `sip-ui`; `FEATURE_BACKLOG.md` chờ chủ dự án đồng ý |

## Bản 2.1 — thao tác nguy hiểm của Admin và báo cáo vi phạm

Làm hai mục 1 và 2 cũ của "Hướng phát triển". Chủ dự án đã đồng ý hướng làm (2026-11-04): danh sách thao tác nguy hiểm và ngưỡng 5 lần mỗi giờ; `JOB_REPORT_*` vào nhóm Tin tuyển dụng; quy tắc tin bị báo cáo với ngưỡng 3 báo cáo của 3 người trong 24 giờ.

### Hiện trạng (kiểm chỉ đọc, 2026-11-04)

- **Neon chưa có bảng `job_reports`.** `prisma migrate status` báo hai migration chưa chạy: `20261031120000_add_job_reports` và `20261031170000_refactor_job_report_resolution`. Server dev đang lỗi ở `JobReportRepository.countStats`. Quy tắc (e) đọc bảng này, nên phải chạy migration trước (B0).
- `job-reports.service.ts` chỉ ghi hai action: `JOB_REPORT_ACTION_EXECUTED` (xử lý "Gỡ tin") và `JOB_REPORT_RESOLVED` (xử lý "Bỏ qua", giữ tin). `JOB_REPORT_REJECTED` có trong `AUDIT_ACTIONS` nhưng không chỗ nào ghi.
- Khi gỡ tin đang hiển thị, service gọi `jobPostsService.retract`. Hàm này ghi thêm một dòng `JOB_POST_RETRACTED` (Admin). Vậy một lần gỡ tin theo báo cáo sinh **hai** dòng nhật ký.
- Ba action `JOB_REPORT_*` chưa thuộc nhóm nào, và `JobReport` chưa có trong `GROUP_BY_ENTITY_TYPE`, nên các dòng rơi vào nhóm `OTHER`. Phía web, `ACTION_META` chưa có nhãn cho ba action này, và `entityHref` chưa có link cho `JobReport`.
- **Tạo** báo cáo không ghi nhật ký (đó là việc của ứng viên, không phải thao tác quản trị).
- Mỗi người chỉ có một báo cáo đang chờ trên một tin: `findPendingByJobAndReporter` chặn báo cáo trùng. Bảng có index `[jobId]`, `[status]`, `[reporterId]`, `[resolution]`, nhưng không có ràng buộc unique.
- Trang `/admin/job-reports` (của bạn cùng nhóm) giữ bộ lọc và báo cáo đang mở bằng `useState`, không đọc URL. Chi tiết báo cáo mở trong modal `AdminJobReportDetailModal`, không có đường dẫn riêng. API `GET /admin/job-reports/:id` đã có.

### Quyết định bản 2.1

| # | Quyết định |
| --- | --- |
| M1 | **Nhóm:** `JOB_REPORT_RESOLVED`, `JOB_REPORT_REJECTED`, `JOB_REPORT_ACTION_EXECUTED` vào nhóm `JOB_POST`; `GROUP_BY_ENTITY_TYPE` thêm `JobReport: "JOB_POST"`. Không thêm nhóm thứ 7 hay token màu mới. Chọn "Tin tuyển dụng" ở ô "Loại hoạt động" sẽ thấy cả các dòng báo cáo. Test `audit-log-actions.test.ts` đã kiểm mọi phần tử của `AUDIT_ACTIONS` đều có nhóm và **đang đỏ** vì ba action này (kiểm lúc làm B1); thêm ca `groupOfAction` cho `JobReport`. |
| M2 | **Nhãn web** (`ACTION_META`): `JOB_REPORT_ACTION_EXECUTED` "Gỡ tin theo báo cáo", `JOB_REPORT_RESOLVED` "Bỏ qua báo cáo", `JOB_REPORT_REJECTED` "Bác báo cáo" (chỉ để đọc được dữ liệu cũ, nếu có). `entityHref` của `JobReport` là `/admin/job-reports?report=<id>`, nhãn "Mở báo cáo" (cần M8). |
| M3 | **Quy tắc (d): Admin thao tác nguy hiểm dồn dập.** Một Admin có từ **5** thao tác nguy hiểm trong cùng một giờ (giờ tròn, giờ Việt Nam). Thao tác nguy hiểm: `USER_SUSPENDED` (khoá tài khoản), `USER_SESSIONS_REVOKED` (đăng xuất mọi thiết bị), `COMPANY_REQUIRES_APPROVAL_CHANGED` **chỉ khi `metadata.requiresApproval = false`** (tắt kiểm duyệt tin), `COMPANY_REJECTED`, `JOB_POST_RETRACTED` (hạ tin, gồm cả gỡ tin theo báo cáo). Hằng số `DANGEROUS_ADMIN_ACTIONS`, `DANGEROUS_ACTIONS_PER_HOUR = 5` đặt ở `audit-log.highlights.ts`. Gom theo `(actorId, giờ)` và dùng lại `groupBurstHours` của quy tắc (c). |
| M4 | **Vì sao đếm `JOB_POST_RETRACTED`, không đếm `JOB_REPORT_ACTION_EXECUTED`:** gỡ một tin đang hiển thị sinh cả hai dòng, đếm cả hai thì một lần thành hai. Đếm `JOB_POST_RETRACTED` thì bắt được cả hạ tin trực tiếp lẫn gỡ theo báo cáo. Nếu tin đã không còn hiển thị lúc gỡ thì không có gì bị hạ, nên không tính. Duyệt tin, từ chối tin, duyệt danh mục, xác minh công ty **không** tính: Admin làm nhiều những việc này là bình thường. Dữ liệu demo có giờ Admin từ chối 11 tin rác và duyệt 15 mục danh mục, cả hai đều không bị báo. |
| M5 | **Quy tắc (e): tin bị nhiều người báo cáo chưa xử lý.** Đếm trên bảng `job_reports`, không qua nhật ký (vì tạo báo cáo không ghi nhật ký). Chỉ xét báo cáo `PENDING`. Với mỗi tin, mỗi người báo cáo chỉ lấy báo cáo sớm nhất. Một tin bị tính khi có **3 báo cáo của 3 người khác nhau trong vòng 24 giờ** (báo cáo thứ k và thứ k+2, xếp theo giờ tạo, cách nhau không quá 24 giờ). **Thời điểm vượt ngưỡng** là giờ tạo của báo cáo thứ ba trong lần đầu đạt ngưỡng. Hằng số: `REPORTED_JOB_MIN_REPORTS = 3`, `REPORTED_JOB_WINDOW_HOURS = 24`. |
| M6 | **(e) theo kỳ 7/30 ngày:** chỉ tính tin có thời điểm vượt ngưỡng nằm trong kỳ đang chọn. Như vậy (e) vẫn là "chuyện đã xảy ra trong kỳ", giống các quy tắc khác. Admin xử lý một báo cáo thì tin còn dưới 3 báo cáo chờ, nên tự ra khỏi danh sách. Đơn vị đếm là **tin**, không phải tài khoản: dòng tóm tắt "N tin bị nhiều người báo cáo chưa xử lý". Bằng 0: "Không có tin bị báo cáo dồn dập". Mở ra: tối đa 10 tin, mỗi tin gồm tên tin, công ty, số báo cáo đang chờ, thời điểm vượt ngưỡng, báo cáo cũ nhất chờ từ lúc nào. Tin vượt ngưỡng gần nhất đứng trước. |
| M7 | **Thứ tự "Cần xem"** (5 quy tắc, nhóm theo đối tượng): (a) đăng nhập sai liên tục, (b) Admin đăng nhập từ IP mới, (d) Admin thao tác nguy hiểm dồn dập, (c) Employer gửi duyệt dồn dập, (e) tin bị nhiều người báo cáo. Vẫn mặc định đóng, mỗi quy tắc một dòng, nên khối chỉ dài thêm 2 dòng. |
| M8 | **Bấm vào một mục:** (d) bấm một tài khoản thì đặt `actorId` + `since`/`until` của giờ dồn dập gần nhất + `action=` năm action nguy hiểm. Bộ lọc URL không lọc được theo `metadata`, nên nếu cùng giờ đó Admin cũng **bật** kiểm duyệt thì danh sách hiện thêm dòng đó. Dữ liệu demo không có trường hợp này. "Xem cả N tài khoản" lọc năm action + `actorRole=ADMIN`. (e) bấm một tin thì mở `/admin/job-reports?report=<id báo cáo cũ nhất đang chờ>`. Muốn vậy, trang Báo cáo vi phạm phải đọc tham số `report` (gọi `GET /admin/job-reports/:id` rồi mở modal); xem Q4. "Xem cả N tin" mở `/admin/job-reports` (mặc định đã lọc "Chờ xử lý"). (e) là quy tắc duy nhất dẫn ra khỏi nhật ký, vì bằng chứng (các báo cáo) nằm ở bảng báo cáo. |
| M9 | **Hoạt động chính, dòng thứ 5 "Báo cáo vi phạm":** "K tin bị gỡ theo báo cáo · M báo cáo bỏ qua (giữ tin)", đếm `JOB_REPORT_ACTION_EXECUTED` và `JOB_REPORT_RESOLVED` trong kỳ. Mỗi số là một nút lọc `action=…`. Không có số "đã xử lý" (chỉ là tổng hai số kia), và không có "bị bác" (không chỗ nào ghi `JOB_REPORT_REJECTED`). Số tổng từ trước đến nay đã có ở trang Báo cáo vi phạm; ở đây là số trong 7/30 ngày, nên không trùng. |
| M10 | **API:** `GET /admin/activity/highlights` thêm `attention.adminDangerBurst` (cùng kiểu với quy tắc (c)), `attention.reportedJobs` (`{ count, items }`, phần tử kiểu mới `AuditHighlightReportedJob`), `activity.jobReports: { takenDown, dismissed }`, và `thresholds` thêm `dangerousActionsPerHour`, `reportedJobMinReports`, `reportedJobWindowHours`. Logic thuần (cửa sổ 24 giờ của (e)) đặt ở `audit-log.highlights.ts` và có test. Truy vấn (e) đọc báo cáo `PENDING` theo index `[status]`. |
| M11 | **Không đổi:** trang Tổng quan, API `/stats`, cách tạo và xử lý báo cáo. Không thêm dependency, không thêm migration mới (hai migration của bạn cùng nhóm chỉ cần chạy). Dòng nhắc "Nhật ký có N mục cần xem" ở Tổng quan **không** làm ở bản này, chỉ làm nếu giáo viên yêu cầu. |

### Câu hỏi cần chủ dự án chốt (bản 2.1)

| # | Câu hỏi | Khuyến nghị |
| --- | --- | --- |
| Q4 | Sửa trang `/admin/job-reports` của bạn cùng nhóm để đọc `?report=<id>` (mở modal báo cáo đó)? | **Đã chốt 2026-11-04: có.** Chỉ sửa `page.tsx`, dùng hook `useAdminJobReportDetail` có sẵn. Chỉ thêm việc đọc một tham số URL và một lần gọi API có sẵn, không đổi cách xử lý báo cáo. Nên báo bạn cùng nhóm trước khi làm. Nếu không đồng ý: link "Mở báo cáo" và quy tắc (e) chỉ mở `/admin/job-reports` chung, Admin tự tìm tin. |

### Dữ liệu demo bổ sung (mở rộng `seed-activity-demo.ts`)

- **(d) bị báo:** ngày -4, 21:00–22:00. Admin đăng nhập từ IP văn phòng quen (nên (b) không bắt, đúng lý do có (d)), rồi trong giờ đó khoá 3 tài khoản, tắt kiểm duyệt 2 công ty, hạ 1 tin: 6 thao tác. Đối tượng là id giả `cdemolog…`, để trang người dùng và trang công ty thật không hiện lần khoá giả.
- **(d) dưới ngưỡng:** ngày -12, một giờ có 4 thao tác nguy hiểm, không bị báo.
- **(e) bị báo:** một tin thật đang hiển thị, ngày -2, nhận 4 báo cáo `PENDING` của 4 ứng viên demo (`seed-dashboard-demo`) trong khoảng 5 giờ.
- **(e) không bị báo, để chứng minh:** tin thứ hai có 3 báo cáo chờ rải trong 5 ngày (quá 24 giờ). Tin thứ ba có 3 báo cáo trong 24 giờ nhưng Admin đã bỏ qua 1 báo cáo, nên chỉ còn 2 chờ.
- **Hoạt động chính:** 2 lần gỡ tin theo báo cáo (mỗi lần một dòng `JOB_REPORT_ACTION_EXECUTED` và một dòng `JOB_POST_RETRACTED`, đối tượng giả) và 3 lần bỏ qua báo cáo.
- **Quy ước:**
  - Báo cáo demo có id bắt đầu bằng `cdemolog`. `--reset` xoá cả báo cáo demo.
  - Script không đổi trạng thái tin thật, không tạo thông báo, vẫn kiểm số dòng outbox.
  - Bảng `job_reports` chưa có (chưa làm B0) thì script dừng và báo rõ lý do.
  - Báo cáo `PENDING` demo sẽ hiện ở trang Báo cáo vi phạm, đây là điều cố ý cho demo.
- Kết quả mong đợi (7 ngày): (d) 1 lần · 1 tài khoản, (e) 1 tin. Script in số chính xác ở `--dry-run`.

### Các bước (bản 2.1)

| Bước | Việc | Kiểm |
| --- | --- | --- |
| B0 | **Chủ dự án** chạy `npm run db:deploy --workspace server` (`prisma migrate deploy`, không dùng shadow DB). Không dùng `db:migrate`. | Mình chạy `prisma migrate status` (chỉ đọc): không còn migration chờ; trang `/admin/job-reports` tải được. **Xong 2026-11-04**: 33 migration đã chạy, `job_reports` có 0 dòng, trang tải được với phiên Admin |
| B1 | BE: M1 (nhóm, test). Web: M2 (nhãn, link "Mở báo cáo"). | `tsc`, test đơn vị. Đếm chỉ đọc số dòng `JOB_REPORT_*` hiện có trên Neon. Nếu khác 0 thì bảng `audit_log_hourly_stats` đang xếp chúng vào `OTHER`: ghi lại và chạy tính lại cho các giờ đó (cùng cách với script demo, do chủ dự án chạy). **Xong 2026-11-04**: Neon có 0 dòng `JOB_REPORT_*` nên không cần tính lại |
| B2 | Shared types + BE: quy tắc (d) và dòng Hoạt động chính thứ 5 (M3, M4, M9, M10). | Test logic thuần, kể cả trường hợp tắt và bật kiểm duyệt. Gọi API trên server dev. Đếm chỉ đọc số thao tác nguy hiểm cao nhất mỗi giờ trên dữ liệu thật rồi ghi vào bảng trình bày. **Xong 2026-11-04**: truy vấn ở `findAdminDangerBurstHours` (`metadata->>'requiresApproval' = 'false'`); gọi `getHighlights` chỉ đọc trên Neon: ba quy tắc cũ không đổi (7 ngày 1·1·1, 30 ngày 4·1·5), (d) bằng 0, cao nhất hiện có 2 thao tác nguy hiểm/giờ |
| B3 | BE: quy tắc (e) (M5, M6, M10). | Test cửa sổ 24 giờ: đúng 3 báo cáo trong 24 giờ; 3 báo cáo cách 24 giờ 1 phút; người trùng; vượt ngưỡng trước kỳ thì không tính; còn 2 chờ thì không tính. **Xong 2026-11-04**: `findReportedJobs` (thêm ca cửa sổ trượt: báo cáo 1–3 rải quá 24 giờ, báo cáo 2–4 trong 24 giờ); `findPendingJobReports`, `findJobTitles` đặt ở `AuditLogRepository` để không phải sửa module báo cáo; trên Neon (e) bằng 0 vì chưa có báo cáo |
| B4 | Web: `ActivityHighlights` thêm (d), (e) và dòng thứ 5; link theo M8. Đọc tài liệu Next liên quan trước khi viết code. | 375px và ≥ 1280px; mở/đóng bằng bàn phím; trạng thái tải, lỗi, toàn số 0; `npm run lint --workspace web`. |
| B5 | Web: trang `/admin/job-reports` đọc `?report=` (chỉ làm khi Q4 được đồng ý). | Mở link từ nhật ký thì modal hiện đúng báo cáo; đóng modal thì xoá tham số; id sai hiện lỗi một câu và trang vẫn dùng được. |
| B6 | Script demo theo mục "Dữ liệu demo bổ sung". | `--dry-run` do mình chạy, chạy thật do chủ dự án; số in ra khớp kết quả mong đợi. |
| B7 | Kiểm trên trang thật, cập nhật plan này, `sip-ui`, dòng L1 ở `docs/06-backend/admin-audit-log/PLAN.md` (nhóm `JOB_POST` có thêm `JOB_REPORT_*`). | Ảnh chụp 375px và desktop. |

### Trình bày với giáo viên (bổ sung)

| Câu hỏi | Trả lời |
| --- | --- |
| Vì sao 5 thao tác nguy hiểm mỗi giờ? | Khoá tài khoản, đăng xuất mọi thiết bị, tắt kiểm duyệt, từ chối công ty, hạ tin là những việc gây hại nếu làm sai. Bình thường Admin chỉ làm vài lần một lúc: dữ liệu đến 04/11/2026 cao nhất 2 lần trong một giờ. Từ 5 lần trong một giờ là dấu hiệu tài khoản Admin bị chiếm, kể cả khi kẻ xấu đăng nhập từ IP quen (quy tắc (b) không bắt được trường hợp này). Ngưỡng là hằng số ở server. |
| Sao duyệt tin nhiều lại không bị báo? | Duyệt là việc chính của Admin, làm nhiều là bình thường. Chỉ đếm việc gây hại. |
| Vì sao 3 báo cáo trong 24 giờ? | Một báo cáo có thể do hiểu nhầm hoặc ghét công ty, hai có thể trùng hợp. Ba người khác nhau báo trong một ngày là dấu hiệu rõ. Một người không đẩy số lên được, vì mỗi người chỉ có một báo cáo đang chờ trên một tin. |
| Sao quy tắc tin bị báo cáo lại mở sang trang Báo cáo vi phạm? | Tạo báo cáo là việc của ứng viên, không phải thao tác quản trị, nên không ghi nhật ký. Bằng chứng nằm ở bảng báo cáo. |
| Sao không đưa Điểm chính sang trang Tổng quan? | Tổng quan cho biết **bây giờ** có việc gì cần làm (hàng chờ, người dùng, gói). Điểm chính tóm tắt **những gì đã xảy ra** trong 7/30 ngày. Mỗi số bấm vào lọc ra đúng các dòng nhật ký làm bằng chứng ngay bên dưới, nên phải nằm cạnh danh sách. Mỗi con số chỉ ở một chỗ, không lặp giữa hai trang. |

## Hướng phát triển (chưa làm ở bản này)

### 1. Admin: thao tác nguy hiểm dồn dập

Chuyển sang bản 2.1 (quy tắc (d), M3–M4).

### 2. Báo cáo tin vi phạm (phần của bạn cùng nhóm)

Chuyển sang bản 2.1 (M1, M2, M5–M9).

### 3. Bảo mật đăng nhập

Những kiểu tấn công nhật ký hiện chưa thấy được: dò mật khẩu rải trên nhiều tài khoản từ cùng một IP, dò email không tồn tại, request ồ ạt, đăng nhập thành công của Employer/Candidate (L3 chỉ ghi Admin). Muốn bắt phải sửa cách ghi ở module đăng nhập (đếm theo IP, ghi thêm loại sự kiện). Liên quan mục "khoá đăng nhập tạm thời" đang mở trong `FEATURE_BACKLOG.md`.

## Ghi chú của chủ dự án

(để trống)
