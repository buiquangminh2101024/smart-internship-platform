# Dashboard Employer & Admin — Frontend (giao diện bản C)

Song song: `docs/06-backend/dashboard-employer-admin/PLAN.md` (API, schema, thông báo).
Quy ước giao diện: `.claude/skills/sip-ui/SKILL.md` (đã gộp các quy tắc điểm nhấn của bản C).
Bản mock tham chiếu (cục bộ, không commit vì `docs/temp` bị gitignore): `docs/temp/ui-compare/employer-c-sip-ui-accent.html`, `admin-c-sip-ui-accent.html`. Mọi mô tả bố cục cần thiết đều nằm trong tài liệu này, không phụ thuộc vào mock.

**Trạng thái: ĐÃ LẬP KẾ HOẠCH và ĐÃ ĐƯỢC CHỦ DỰ ÁN DUYỆT (2026-09-29), gồm các quyết định D7–D11 ở plan backend: bỏ "Gia hạn tin" (nút "Xem tin"); Admin có nhóm thông báo Danh mục và Thanh toán; có nhắc lịch phỏng vấn; nút 7/30/90 ngày chỉ áp dụng cho biểu đồ; doanh thu tính theo thời điểm hoàn tất thanh toán. Bổ sung 2026-09-29 (D12): lên lịch phỏng vấn hàng loạt, xem mục "Lịch phỏng vấn". Chưa có code, chỉ bắt đầu khi chủ dự án ra lệnh.**

## Phần 1 — Công nghệ và quy ước

- Không thêm dependency. Dùng sẵn: Next.js (đọc `node_modules/next/dist/docs/` trước khi viết route, theo `apps/web/AGENTS.md`), Tailwind v4, `@tanstack/react-query`, `lucide-react`, Socket.IO client (`hooks/useSocket.ts`).
- Biểu đồ vẽ bằng SVG/CSS thuần trong component riêng. Mọi biểu đồ **phải có nhãn và số cụ thể**: đường/cột có lưới và trục, thanh có số ở cuối, thanh chia đoạn có chú giải kèm số. Không dùng biểu đồ nhỏ không trục.
- Chỉ dùng token (`brand-*`, `success-*`, `marigold-*`, `surface-*`, `border-*`, `text-*`). `brand-*` tự đổi theo `data-role` (Indigo cho Employer, Plum cho Admin).
- Hai điểm cần chỉnh token/component, ảnh hưởng cả chỗ dùng cũ (kiểm tra lại các chỗ đó):
  - Chữ cảnh báo dùng `marigold-700` trên `marigold-100` chỉ đạt khoảng 2,8:1 (yêu cầu 4,5:1). Thêm token `marigold-800` (`#8a5a0c`) và dùng cho chữ; `Badge tone="warning"` hiện đang dùng `marigold-700` sẽ đổi sang token mới.
  - `Card tone="brand"` hiện là nền sáng (`surface-brand-soft`), **không** phải khối tối như banner bản C. Thêm `tone="solid"` (`bg-brand-800 text-white`) cho khối tóm tắt.
- Màu nguy hiểm (từ chối, lỗi) dùng đúng những gì `Button variant="danger"` và `Badge tone="danger"` đang dùng (`red-*`), không thêm màu mới.

## Phần 2 — Cấu trúc và liên kết

### Route

| Route | File | Ghi chú |
|---|---|---|
| `/employer/dashboard` | `app/employer/(portal)/dashboard/page.tsx` | Mục "Tổng quan" đặt đầu `NAV_ITEMS` của `EmployerPortalShell`, thêm nhãn cho `CRUMB_LABELS`. Sau khi đăng nhập Employer vào thẳng trang này (tìm nơi dùng `AREA_HOME.employer` để đổi điểm đến; `/employer` vẫn là trang giới thiệu). |
| `/admin/dashboard` | `app/admin/(console)/dashboard/page.tsx` | Mục "Tổng quan" đặt đầu `NAV_ITEMS` của `AdminConsoleShell`. `/admin` vẫn là trang đăng nhập bí mật (AD-1). Sau khi đăng nhập Admin vào thẳng dashboard. |

### Thành phần mới

Tất cả đặt trong `apps/web/src/components/dashboard/` trừ khi ghi khác. Mỗi component nhận dữ liệu qua props, không tự gọi API (trang hoặc hook lo việc đó).

| Component | Vai trò |
|---|---|
| `SummaryBanner` | Khối tóm tắt: dòng nhãn "Hôm nay, DD/MM/YYYY", tiêu đề nêu số cụ thể (vd. "Bạn có 19 hồ sơ cần xử lý"), một dòng phụ, một nút chính, và ba ô số bên phải. Dùng `Card tone="solid"`. Mỗi màn hình chỉ có một khối tối. |
| `KpiCard` (mở rộng `StatCard`) | Thêm prop `delta`, `hint`, `tone="attention"`, `footer`, `href`. Bố cục ngang hiện tại của `StatCard` giữ nguyên cho các trang cũ (`jobs`, `admin/jobs`); bố cục KPI mới bật khi có các prop trên. Số 36px, nhãn tăng giảm nền `success-100`, thẻ `attention` có viền trái 3px marigold. |
| `SegmentBar` | Thanh chia đoạn + chú giải (nhãn + số). Dùng cho thời gian chờ (Dưới 24 giờ / 1 – 2 ngày / Trên 2 ngày), loại danh mục, còn hạn/sắp hết hạn. Tông marigold đậm dần cho việc chờ; tông brand cho thông tin trung tính. |
| `CompareBars` | Hai thanh "kỳ này" và "kỳ trước", số ở cuối mỗi thanh. Dùng cho hồ sơ mới, người dùng mới, doanh thu. |
| `DayColumns` | Bảy cột nhỏ, số ở trên và nhãn ngày ở dưới, ngày hôm nay đậm. Dùng cho lịch phỏng vấn 7 ngày tới. |
| `QuotaBar` | Thanh "Đã dùng / Còn" kèm dòng phụ (vd. tỉ lệ chấp nhận lời mời 30 ngày). |
| `TrendChart` | Đường 30/7/90 ngày: lưới, trục Y có số, nhãn ngày trục X, đường trung bình nét đứt kèm nhãn "TB x,x", chấm và số ở đỉnh (marigold), chấm cuối. `role="img"` với `aria-label` nêu tổng và đỉnh. Chấm dữ liệu có `<title>` để xem giá trị. Có `min-width` và cuộn ngang ở màn hình hẹp. |
| `ColumnChart` | Cột theo tuần, tuần hiện tại đậm hơn, số ở trên mỗi cột (doanh thu Admin). |
| `BarList` | Thanh ngang có số và ghi chú. Dùng cho phễu (đậm dần theo bước, bước cuối màu `success`, ghi "x% từ bước trước") và người dùng theo vai trò. |
| `TaskGroup` / `TaskRow` | Nhóm "việc cần làm": viền trên marigold, tiêu đề, huy hiệu đếm bằng chữ mono; mỗi hàng có ô chữ cái đầu, tiêu đề, dòng phụ và các nút thao tác. |
| `RejectReason` | Ô nhập lý do từ chối đi kèm hàng (Admin, bắt buộc) — dựng từ `Field` + `Input`. |
| `NotificationCenter` | Cột trái là nhóm (icon, tên, số chưa đọc), cột phải là danh sách. Ở màn hình hẹp cột trái thành hàng tab cuộn ngang. |
| `ActivityList` | Danh sách "Hoạt động gần đây" của Admin từ `AuditLog`. |
| `RangeChips` | Nhóm nút 7/30/90 ngày với `aria-pressed`. Đặt ngay cạnh các biểu đồ nó điều khiển, không đặt ở đầu trang: Employer ở dòng tiêu đề của khối "Phân tích" (điều khiển cả biểu đồ đường lẫn phễu); Admin trong phần đầu của khối "Người dùng mới theo ngày" (chỉ khối đó đổi theo nút). |

Thay đổi ở component có sẵn: `SideNavItem` thêm `badge?: number` (hiện số việc chờ ở nav; Admin dùng tông marigold), mục đang chọn có thanh trái 3px (`shadow-[inset_3px_0_0]` màu `brand-600`); `Card` thêm `tone="solid"`.

### Hook và dữ liệu

- `hooks/useEmployerDashboard.ts`, `hooks/useAdminDashboard.ts`: mỗi hook một `useQuery` cho `overview`, `tasks`, `analytics` (key `["employer","dashboard","overview"]`...). Ba truy vấn độc lập để mỗi khối có trạng thái đang tải / lỗi riêng.
- `hooks/useNotificationGroups.ts` và mở rộng `lib/notifications.ts` (`group`, `unread-count/by-group`).
- Thao tác tại chỗ dùng lại mutation hiện có: `useUpdateApplicationStatus` (`hooks/useApplications.ts`), hook tin tuyển dụng (`hooks/useJobPosts.ts`), hook công ty/danh mục của các trang Admin. Sau mỗi mutation thành công: invalidate `["<area>","dashboard"]` và `["notifications"]`, hiện `Toast`.
- Làm mới theo thời gian thực: dùng `onNotification` của `useSocket` để invalidate khối dashboard liên quan khi có thông báo mới. Không thêm kênh socket mới.
- `range` (7/30/90, mặc định 30) là state của trang (nút nằm trong khối Phân tích, xem `RangeChips`), đưa vào `queryKey` của `analytics`. KPI có kỳ cố định ghi ngay trong nhãn ("trong 7 ngày"); nút 7/30/90 chỉ đổi biểu đồ xu hướng theo ngày và phễu (Employer), biểu đồ người dùng mới theo ngày (Admin). "Doanh thu theo tuần" và "Người dùng theo vai trò" không đổi theo nút, nên tiêu đề phụ của hai biểu đồ này ghi rõ kỳ ("Tháng 09/2026", "Tại thời điểm xem"). Biểu đồ chịu ảnh hưởng ghi kỳ ở tiêu đề phụ ("30 ngày qua") và đổi theo nút. Bỏ dòng chú thích chung dưới nhóm nút để khỏi gây hiểu nhầm.

## Bố cục theo bản C

Thứ tự từ trên xuống, dùng cho cả hai vai trò (nội dung khác nhau).

1. **Đầu trang**: `h1` "Tổng quan", dòng phụ (tên công ty hoặc số mục chờ duyệt, "cập nhật lúc HH:mm ngày DD/MM/YYYY"), nút chính (Employer: "Đăng tin mới"; Admin không có nút). Không đặt `RangeChips` ở đây.
2. **`SummaryBanner`**.
3. **Hàng KPI**: lưới 3 cột (2 cột ≤ 720px, 1 cột ≤ 480px), sáu thẻ.
4. **Việc cần làm** (Employer) / **Hàng chờ xử lý** (Admin): lưới 3fr/2fr. Admin: cột trái một nhóm lớn (Tin chờ duyệt), cột phải hai nhóm. Employer: cột trái "Hồ sơ chờ xử lý" rồi "Hồ sơ chờ đặt lịch", cột phải "Tin cần chú ý" rồi "Lịch phỏng vấn sắp tới".
5. **Phân tích**: Employer có dòng tiêu đề "Phân tích" với `RangeChips` ở bên phải, bên dưới là lưới 2fr/1fr (xu hướng + phễu), cả hai đổi theo nút. Admin không có dòng tiêu đề chung; lưới 3fr/2fr (xu hướng người dùng + cột doanh thu và phân bố vai trò), `RangeChips` nằm trong phần đầu của khối xu hướng vì chỉ khối đó đổi theo nút. Ở màn hình hẹp, `RangeChips` xuống dòng dưới tiêu đề.
6. **Trung tâm thông báo**.
7. **Hoạt động gần đây** (chỉ Admin).

### Employer

| Khối | Nội dung | Nguồn | Trực quan |
|---|---|---|---|
| Banner | "Bạn có N hồ sơ cần xử lý"; ba ô: hồ sơ chờ, tin sắp hết hạn, phỏng vấn sắp tới; nút "Xử lý hồ sơ chờ" | `overview` | — |
| KPI 1 | Tin đang hiển thị (+ tin nhiều hồ sơ nhất) | `overview.jobs` | `SegmentBar` còn hạn > 7 ngày / hết hạn trong 7 ngày |
| KPI 2 | Hồ sơ mới trong 7 ngày | `overview.applications` | Nhãn `+17 (+29%)` + `CompareBars` |
| KPI 3 (attention) | Hồ sơ chờ xử lý (+ hồ sơ cũ nhất đã chờ) | `overview.applications` | `SegmentBar` thời gian chờ |
| KPI 4 | Lịch phỏng vấn sắp tới (+ buổi gần nhất) | `overview.interviews` (giai đoạn Interview) | `DayColumns` 7 ngày |
| KPI 5 | Tin nhắn chưa đọc | `overview.messages` | Danh sách 3 người + thời gian |
| KPI 6 | Lời mời còn lại hôm nay | `overview.outreach` | `QuotaBar` + tỉ lệ chấp nhận 30 ngày |
| Việc cần làm | Nhóm **Hồ sơ chờ xử lý** (5 hàng; nút **Xem xét**, **Từ chối** có xác nhận); nhóm **Tin cần chú ý** (sắp hết hạn: **Xem tin**; bị từ chối: **Sửa tin**); nhóm **Hồ sơ chờ đặt lịch** (SHORTLISTED: **Đặt lịch phỏng vấn**, giai đoạn Interview); nhóm **Lịch phỏng vấn sắp tới** (**Đổi lịch**, giai đoạn Interview) | `tasks` | `TaskGroup` |
| Phân tích | "Hồ sơ ứng tuyển theo ngày" (`TrendChart`, có nút chuyển sang "Lượt xem"), "Phễu tuyển dụng" (`BarList`, chú thích dữ liệu trước ngày bắt đầu ghi lịch sử là ước lượng) | `analytics` | — |

### Admin

| Khối | Nội dung | Nguồn | Trực quan |
|---|---|---|---|
| Banner | "N mục đang chờ duyệt"; ba ô: tin tuyển dụng, công ty, danh mục; nút "Bắt đầu duyệt" | `overview` | — |
| KPI 1–3 (attention) | Công ty chờ xác minh, Tin chờ duyệt, Danh mục chờ duyệt | `overview.queues` | `SegmentBar` thời gian chờ / loại danh mục |
| KPI 4 | Người dùng mới trong 7 ngày | `overview.users` | Nhãn `+14 (+28%)` + `CompareBars` |
| KPI 5 | Doanh thu tháng này | `overview.revenue` | Nhãn `+3.100.000 ₫ (+8%)` + `CompareBars` (tháng này / tháng trước) |
| KPI 6 | Gói đang hoạt động | `overview.subscriptions` | `SegmentBar` còn hạn / hết hạn trong 7 ngày |
| Hàng chờ | **Tin chờ duyệt** (**Duyệt tin**, **Từ chối** kèm lý do bắt buộc); **Công ty chờ xác minh** (**Xác minh**, **Từ chối** kèm lý do); **Danh mục chờ duyệt** (**Duyệt**, **Từ chối**) | `tasks` | `TaskGroup` + `RejectReason` |
| Phân tích | "Người dùng mới theo ngày" (`TrendChart`), "Doanh thu theo tuần" (`ColumnChart`), "Người dùng theo vai trò" (`BarList`) | `analytics` | — |
| Hoạt động gần đây | Năm mục mới nhất, nút "Xem thêm" | `/admin/activity` | `ActivityList` |

### Trung tâm thông báo

- Nhóm Employer: Tất cả · Hồ sơ · Tin tuyển dụng · Công ty · Lời mời · Lịch phỏng vấn · Gói dịch vụ. Nhóm Admin: Tất cả · Tin tuyển dụng · Công ty · Danh mục · Thanh toán. Số chưa đọc lấy từ `unread-count/by-group`.
- Mỗi thông báo: icon, tiêu đề, nội dung, nhóm, thời gian tương đối, một nút hành động dẫn tới `link` của thông báo. Chưa đọc: nền `brand-50` và viền trái 3px; loại cảnh báo (tin bị từ chối, sắp hết hạn) dùng marigold. Bấm hành động đồng thời đánh dấu đã đọc.
- "Đánh dấu tất cả đã đọc" dùng `PATCH /notifications/read-all` (toàn bộ, không theo nhóm).
- Chuông trên thanh đầu trang giữ nguyên; trang `/employer/notifications`, `/admin/notifications` giữ nguyên làm danh sách đầy đủ, dashboard chỉ hiển thị 8 mục mới nhất theo nhóm kèm liên kết "Xem tất cả".

### Lịch phỏng vấn (FE-5)

API: mục "Giai đoạn 5 — Interview" của plan backend.

**Đặt, đổi, huỷ từng lịch.** Một hộp thoại dùng chung cho đặt và đổi lịch: ngày, giờ bắt đầu (bước 15 phút), thời lượng, hình thức (Online / Tại văn phòng), liên kết họp hoặc địa chỉ (chọn "Tại văn phòng" thì điền sẵn địa chỉ công ty), ghi chú gửi ứng viên. Huỷ dùng `ConfirmDialog` kèm ô lý do bắt buộc. Giờ luôn ghi kèm "(GMT+7)".

**Lên lịch hàng loạt (D12).**

1. *Chọn ứng viên* ở nhóm "Hồ sơ chờ đặt lịch" của dashboard và ở danh sách hồ sơ của một tin (dữ liệu từ `GET /employer/interviews/awaiting`).
   - Ô chọn chỉ bật cho hồ sơ chờ đặt lịch; hồ sơ đã có lịch hiện `Badge` "Đã có lịch DD/MM" và không chọn được.
   - Có "Chọn tất cả" trong phạm vi danh sách đang xem.
   - Khi đã chọn ít nhất một hồ sơ, hiện thanh thao tác dính đáy: "Đã chọn N ứng viên · Bỏ chọn · [Lên lịch phỏng vấn]". Số đếm đặt trong vùng `aria-live="polite"`.
   - Chọn đúng một hồ sơ thì mở hộp thoại đặt lịch đơn. Quá 20 hồ sơ thì nút bị khoá kèm dòng "Tối đa 20 ứng viên mỗi lần".
2. *Hộp thoại bước 1 — Thiết lập* (rộng khoảng 720px; toàn màn hình ở ≤ 480px):
   - Kiểu xếp lịch là nhóm nút hai lựa chọn "Chia khung giờ liên tiếp" / "Cùng một giờ".
   - Ngày, giờ bắt đầu, thời lượng mỗi buổi (15/30/45/60/90 phút), nghỉ giữa buổi (0/5/10/15 phút, chỉ hiện với kiểu liên tiếp).
   - Hình thức, liên kết hoặc địa chỉ, ghi chú: giống hộp thoại đơn.
3. *Bước 2 — Xem trước*: bảng `#`, Ứng viên, Tin tuyển dụng, Giờ.
   - Nút ↑/↓ đổi thứ tự và tính lại giờ ngay; không dùng kéo thả làm cách duy nhất.
   - Nút ✕ bỏ một hồ sơ khỏi đợt (vẫn nằm trong danh sách chờ).
   - Cảnh báo `marigold` (không chặn) khi trùng giờ với lịch khác do chính người dùng đặt (tính từ `GET /employer/interviews` của ngày đó) hoặc buổi cuối kết thúc sau 18:00. Cảnh báo có icon và chữ, không chỉ màu.
   - Kiểu "Cùng một giờ": thay cột giờ bằng dòng "Phỏng vấn nhóm: N ứng viên, HH:mm – HH:mm".
   - Chân hộp thoại: "N buổi · HH:mm – HH:mm · N email sẽ được gửi tới ứng viên", nút "Quay lại" và "Xác nhận lên lịch".
4. *Kết quả*:
   - Thành công: `Toast` "Đã lên lịch N buổi phỏng vấn"; invalidate dashboard, danh sách chờ và lịch.
   - Lỗi 409: giữ ở bước 2, tô đỏ các dòng lỗi kèm lý do (`NOT_FOUND` "Không còn tìm thấy hồ sơ", `INVALID_STATUS` "Hồ sơ đã đổi trạng thái", `ALREADY_SCHEDULED` "Đã có lịch"), nút "Bỏ các hồ sơ lỗi và thử lại".
   - Nút xác nhận có `loading` và bị khoá trong lúc gửi.
5. Ở ≤ 480px, bảng xem trước thành danh sách thẻ, mỗi ứng viên một thẻ.

Sau khi tạo, mỗi buổi là một lịch riêng: đổi hoặc huỷ từng người như bình thường.

**Phía ứng viên:** trong `/applications`, hồ sơ có lịch hiện khối "Lịch phỏng vấn" (giờ, thời lượng, hình thức, liên kết/địa chỉ, ghi chú); lịch đã huỷ hiện lý do. Dữ liệu từ `GET /candidate/interviews`.

## Hành vi và trạng thái

- **Thao tác**: chờ server phản hồi rồi mới đổi giao diện (không lạc quan), nút có `loading`, xong thì hàng chuyển sang trạng thái đã xử lý bằng `Badge` ("Đang xem xét", "Đã duyệt", "Đã từ chối"), giảm số đếm, hiện `Toast`. Lỗi: giữ nguyên hàng, `Toast` một câu ngắn kèm cách sửa.
- **Từ chối**: Employer dùng `ConfirmDialog`; Admin mở ô lý do ngay trong hàng, để trống thì báo lỗi tại ô (`aria-invalid`) và không gửi.
- **Đang tải**: khung xám giữ đúng chiều cao từng khối (tránh nhảy bố cục); mỗi khối tải độc lập.
- **Rỗng**: nêu sự thật rồi gợi ý bước tiếp (vd. "Chưa có hồ sơ chờ xử lý. Hồ sơ mới sẽ hiện ở đây khi ứng viên nộp."). Biểu đồ không có dữ liệu hiện trục 0 kèm câu giải thích, không để trống.
- **Lỗi**: từng khối có thông báo ngắn và nút "Tải lại", không làm hỏng cả trang.
- **Quá nhiều**: mỗi nhóm việc chỉ hiện 5 hàng, còn lại là liên kết "Xem tất cả N …" dẫn tới trang chi tiết hiện có.
- **Không có quyền / gói hết hạn**: KPI lời mời hiển thị "Cần gói còn hiệu lực" thay cho thanh đo; Employer chưa xác minh công ty thấy khối hướng dẫn thay banner.
- **Chuyển động** 120–260 ms, không nảy; `prefers-reduced-motion` tắt mọi transition.
- **Đáp ứng**: kiểm ở 375px và ≥ 1280px. Banner xếp dọc, ba ô số chia đều; KPI 1 cột; hàng việc xuống dòng, nút dưới tiêu đề; nhóm thông báo thành tab cuộn ngang; biểu đồ đường cuộn ngang.
- **Trợ năng**: tab thông báo dùng `role="tablist"` và phím mũi tên; nút chỉ có icon có `aria-label`; chữ ≥ 13px; không dùng màu làm kênh duy nhất (chú giải luôn có nhãn và số).

## Phần 3 — Các bước thực hiện

Mỗi bước dựa vào bước backend tương ứng (`docs/06-backend/dashboard-employer-admin/PLAN.md`).

| Bước | Nội dung | Phụ thuộc | Điều kiện xong |
|---|---|---|---|
| FE-0 | Chủ dự án duyệt plan (xong 2026-09-29). Gộp quy tắc bản C vào `sip-ui` (xong). | — | — |
| FE-1 | Nền tảng giao diện: token `marigold-800`, `Card tone="solid"`, `SideNavItem.badge` + thanh trái, `KpiCard` (mở rộng `StatCard`), các biểu đồ SVG (`TrendChart`, `ColumnChart`, `BarList`, `SegmentBar`, `CompareBars`, `DayColumns`, `QuotaBar`). Kiểm bằng dữ liệu giả trong một trang tạm, sau đó xoá. | — | Trang tạm ở 375px và desktop; `tsc` và `npm run lint --workspace web` sạch. |
| FE-2 | **Dashboard Employer**: hook, `SummaryBanner`, KPI, `TaskGroup` (hồ sơ chờ, tin cần chú ý), phân tích; thay điểm đến sau đăng nhập; mục nav. | Backend bước 1–4 | Xem trang thật với dữ liệu thật; thao tác xem xét / từ chối chạy; đủ 4 trạng thái. |
| FE-3 | **Trung tâm thông báo** dùng chung hai vai trò: `NotificationCenter`, `group`, đếm theo nhóm, làm mới qua socket. | Backend bước 3 | Nhóm và số chưa đọc đúng; đánh dấu đã đọc cập nhật cả chuông. |
| FE-4 | **Dashboard Admin**: hàng chờ (duyệt / từ chối kèm lý do), phân tích, `ActivityList`, nav, `NotificationCenter` Admin. | Backend bước 2–4 | Duyệt / từ chối tin, công ty, danh mục ngay trên dashboard; hoạt động mới xuất hiện sau thao tác. |
| FE-5 | **Interview**: hộp thoại đặt / đổi / huỷ lịch (dùng `Field`, `Input`, `Select`), nhóm "Hồ sơ chờ đặt lịch" và "Lịch phỏng vấn sắp tới", KPI 4, phía ứng viên xem lịch trong `/applications`; sau đó chọn nhiều + hộp thoại hai bước lên lịch hàng loạt (D12, cắt được). Tách được. | Backend bước 5 | Đặt lịch từ hồ sơ `SHORTLISTED` chuyển sang `INTERVIEWING`; ứng viên thấy lịch và nhận thông báo; lô có hồ sơ lỗi hiện đúng dòng lỗi và thử lại được. |

Trước khi báo xong mỗi bước: `tsc`, `npm run lint --workspace web`, xem trang thật ở 375px và desktop (đủ trạng thái đang tải / rỗng / lỗi / quá nhiều), kiểm tra phím Tab và focus, tương phản, nhãn cho nút chỉ có icon.

## Khác biệt giữa mock bản C và bản triển khai

Mock (cục bộ) đã được chỉnh khớp plan này ngày 2026-09-29: sidebar 240px, "Xem xét" / "Từ chối" cho hồ sơ chờ, "Xem tin" và "Sửa tin", "Lời mời còn lại hôm nay", nhóm "Hồ sơ chờ đặt lịch", nút 7/30/90 đổi đúng các biểu đồ theo D10, xác nhận trước khi từ chối hồ sơ, lý do bắt buộc khi Admin từ chối, toast, hộp thoại đặt / đổi / huỷ lịch. Những điểm còn khác:

| Mock | Triển khai | Lý do |
|---|---|---|
| Banner dùng lớp `.banner` tự viết | `Card tone="solid"` mới | `tone="brand"` hiện là nền sáng. |
| Hộp thoại là thẻ `<dialog>` HTML; ô ngày giờ theo định dạng của trình duyệt | `ConfirmDialog`, `Field`, `Input`, `Select` | Mock chỉ mô phỏng. |
| Dữ liệu giả cố định, thao tác chờ 0,65 giây rồi đổi giao diện | Chờ phản hồi server thật; đủ trạng thái đang tải / rỗng / lỗi / quá nhiều | Mock tĩnh, không có API. |
| Nhãn điều hướng do mock đặt (vd. "Duyệt tin tuyển dụng") | Nhãn của `NAV_ITEMS` hiện có | Không đổi tên mục điều hướng đang chạy. |
| Font Arial | Font đang dùng của `apps/web` | Mock chỉ mô phỏng `body { font-family: Arial }`. |

## Phần 4 — Ghi chú của chủ dự án

<!-- Để trống — dành cho chủ dự án ghi thêm trong lúc triển khai. -->
