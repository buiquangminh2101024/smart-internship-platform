# Dashboard Employer & Admin — Frontend (Employer bản C, Admin bản D)

Song song: `docs/06-backend/dashboard-employer-admin/PLAN.md` (API, schema, thông báo).
Quy ước giao diện: `.claude/skills/sip-ui/SKILL.md` (đã gộp các quy tắc điểm nhấn của bản C). Dashboard Admin theo **bản D**, có quy tắc riêng ở mục "Admin — bản D" bên dưới; chỗ nào bản D khác `sip-ui` thì theo tài liệu này.
Bản mock tham chiếu (cục bộ, không commit vì `docs/temp` bị gitignore): `docs/temp/ui-compare/employer-c-sip-ui-accent.html` (Employer), `admin-d-ban-duyet.html` (Admin; `admin-c-sip-ui-accent.html` là bản cũ, bỏ). Mọi mô tả bố cục cần thiết đều nằm trong tài liệu này, không phụ thuộc vào mock.

**Trạng thái: ĐÃ LẬP KẾ HOẠCH và ĐÃ ĐƯỢC CHỦ DỰ ÁN DUYỆT (2026-09-29), gồm các quyết định D7–D11 ở plan backend: bỏ "Gia hạn tin" (nút "Xem tin"); Admin có nhóm thông báo Danh mục và Thanh toán; có nhắc lịch phỏng vấn; nút 7/30/90 ngày chỉ áp dụng cho biểu đồ; doanh thu tính theo thời điểm hoàn tất thanh toán. Bổ sung 2026-09-29 (D12): lên lịch phỏng vấn hàng loạt, xem mục "Lịch phỏng vấn". FE-1 đến FE-4 đã có code (2026-09-30), xem ghi chú ở Phần 3; FE-5 chỉ bắt đầu khi chủ dự án ra lệnh. **Sửa 2026-09-30 (đã duyệt cùng ngày):** dashboard Admin chuyển từ bản C sang bản D "bàn duyệt" (D14 ở plan backend), kèm bước backend 6 (đã xong code).**

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
| `SummaryBanner` | (Chỉ Employer; Admin bản D không có khối tối.) Khối tóm tắt: dòng nhãn "Hôm nay, DD/MM/YYYY", tiêu đề nêu số cụ thể (vd. "Bạn có 19 hồ sơ cần xử lý"), một dòng phụ, một nút chính, và ba ô số bên phải. Dùng `Card tone="solid"`. Mỗi màn hình chỉ có một khối tối. |
| `KpiCard` (mở rộng `StatCard`) | Thêm prop `delta`, `hint`, `tone="attention"`, `footer`, `href`. Bố cục ngang hiện tại của `StatCard` giữ nguyên cho các trang cũ (`jobs`, `admin/jobs`); bố cục KPI mới bật khi có các prop trên. Số 36px, nhãn tăng giảm nền `success-100`, thẻ `attention` có viền trái 3px marigold. |
| `SegmentBar` | Thanh chia đoạn + chú giải (nhãn + số). Dùng cho thời gian chờ (Dưới 24 giờ / 1 – 2 ngày / Trên 2 ngày), loại danh mục, còn hạn/sắp hết hạn. Tông marigold đậm dần cho việc chờ; tông brand cho thông tin trung tính. |
| `CompareBars` | Hai thanh "kỳ này" và "kỳ trước", số ở cuối mỗi thanh. Dùng cho hồ sơ mới, người dùng mới, doanh thu. |
| `DayColumns` | Bảy cột nhỏ, số ở trên và nhãn ngày ở dưới, ngày hôm nay đậm. Dùng cho lịch phỏng vấn 7 ngày tới. |
| `QuotaBar` | Thanh "Đã dùng / Còn" kèm dòng phụ (vd. tỉ lệ chấp nhận lời mời 30 ngày). |
| `TrendChart` | Đường 30/7/90 ngày: lưới, trục Y có số, nhãn ngày trục X, đường trung bình nét đứt kèm nhãn "TB x,x", chấm và số ở đỉnh (marigold), chấm cuối. `role="img"` với `aria-label` nêu tổng và đỉnh. Chấm dữ liệu có `<title>` để xem giá trị. Có `min-width` và cuộn ngang ở màn hình hẹp. |
| `ColumnChart` | Cột theo tuần, tuần hiện tại đậm hơn, số ở trên mỗi cột (doanh thu Admin). |
| `BarList` | Thanh ngang có số và ghi chú. Dùng cho phễu (đậm dần theo bước, bước cuối màu `success`, ghi "x% từ bước trước") và người dùng theo vai trò. |
| `TaskGroup` / `TaskRow` | Nhóm "việc cần làm": viền trên marigold, tiêu đề, huy hiệu đếm bằng chữ mono; mỗi hàng có ô chữ cái đầu, tiêu đề, dòng phụ và các nút thao tác. |
| `RejectReason` | Ô nhập lý do từ chối mở ngay dưới hàng (Admin, bắt buộc với tin và công ty): nhãn "Lý do từ chối (bắt buộc)", các nút lý do hay dùng (bấm để điền), ô nhiều dòng, dòng phụ cho biết ai nhận lý do, lỗi tại ô khi để trống. Danh mục chỉ hỏi xác nhận, không cần lý do. Dựng từ `Field` + ô nhiều dòng. |
| `NotificationCenter` | Cột trái là nhóm (icon, tên, số chưa đọc), cột phải là danh sách. Ở màn hình hẹp cột trái thành hàng tab cuộn ngang. |
| `QueueCard` (Admin D) | Thẻ một hàng chờ: icon, tên, số lớn, ô "Chờ lâu nhất", thanh chia nhóm và chú giải kèm số. Là nút: bấm thì chọn tab tương ứng của `ModerationDesk` và cuộn tới đó; đang chọn thì viền `brand-300` + vòng `brand-50` (`aria-pressed`). |
| `ModerationDesk` / `ModerationRow` (Admin D) | Khối "Bàn duyệt": `role="tablist"` ba tab Tin tuyển dụng / Công ty / Danh mục (số đếm trên tab, phím mũi tên). Mỗi hàng: ô chữ cái đầu (danh mục dùng icon theo loại), tiêu đề, dòng phụ, ô thời gian chờ (nền đậm dần theo nhóm chờ), nút chính (Duyệt tin / Xác minh / Duyệt), "Từ chối" chữ đỏ, nút icon mở trang chi tiết. |
| `PlatformMetrics` (Admin D) | Khối "Nền tảng": ba chỉ số xếp dọc, ngăn bằng đường kẻ (người dùng mới 7 ngày, doanh thu tháng này, gói đang hoạt động), mỗi chỉ số có số, nhãn tăng giảm và `CompareBars` hoặc `SegmentBar`. |
| `ActivityTimeline` (Admin D, thay `ActivityList`) | Dòng thời gian "Hoạt động gần đây": icon theo loại thao tác (duyệt: `success`, từ chối: đỏ, gỡ tin: marigold, xác minh: brand, không phải Admin: xám), email người làm in đậm, câu `summary`, khung lý do (nếu có), thời gian. Nút lọc "Quản trị viên / Tất cả". |
| `RangeChips` | Nhóm nút 7/30/90 ngày với `aria-pressed`. Đặt ngay cạnh các biểu đồ nó điều khiển, không đặt ở đầu trang: Employer ở dòng tiêu đề của khối "Phân tích" (điều khiển cả biểu đồ đường lẫn phễu); Admin trong phần đầu của khối "Người dùng mới theo ngày" (chỉ khối đó đổi theo nút). |

Thay đổi ở component có sẵn: `SideNavItem` thêm `badge?: number` (hiện số việc chờ ở nav; Admin dùng tông marigold), mục đang chọn có thanh trái 3px (`shadow-[inset_3px_0_0]` màu `brand-600`); `Card` thêm `tone="solid"`.

### Hook và dữ liệu

- `hooks/useEmployerDashboard.ts`, `hooks/useAdminDashboard.ts`: mỗi hook một `useQuery` cho `overview`, `tasks`, `analytics` (key `["employer","dashboard","overview"]`...). Ba truy vấn độc lập để mỗi khối có trạng thái đang tải / lỗi riêng.
- `hooks/useNotificationGroups.ts` và mở rộng `lib/notifications.ts` (`group`, `unread-count/by-group`).
- Admin bản D thêm `useAdminActivity(actor)` (key `["admin","dashboard","activity",actor]`, `GET /admin/activity?limit=5&actor=`) để bộ lọc "Quản trị viên / Tất cả" tải riêng; nằm dưới `["admin","dashboard"]` nên cùng được làm mới khi invalidate dashboard.
- Thao tác tại chỗ dùng lại mutation hiện có: `useUpdateApplicationStatus` (`hooks/useApplications.ts`), hook tin tuyển dụng (`hooks/useJobPosts.ts`), hook công ty/danh mục của các trang Admin. Sau mỗi mutation thành công: invalidate `["<area>","dashboard"]` và `["notifications"]`, hiện `Toast`.
- Làm mới theo thời gian thực: dùng `onNotification` của `useSocket` để invalidate khối dashboard liên quan khi có thông báo mới. Không thêm kênh socket mới.
- `range` (7/30/90, mặc định 30) là state của trang (nút nằm trong khối Phân tích, xem `RangeChips`), đưa vào `queryKey` của `analytics`. KPI có kỳ cố định ghi ngay trong nhãn ("trong 7 ngày"); nút 7/30/90 chỉ đổi biểu đồ xu hướng theo ngày và phễu (Employer), biểu đồ người dùng mới theo ngày (Admin). "Doanh thu theo tuần" và "Người dùng theo vai trò" không đổi theo nút, nên tiêu đề phụ của hai biểu đồ này ghi rõ kỳ ("Tháng 09/2026", "Tại thời điểm xem"). Biểu đồ chịu ảnh hưởng ghi kỳ ở tiêu đề phụ ("30 ngày qua") và đổi theo nút. Bỏ dòng chú thích chung dưới nhóm nút để khỏi gây hiểu nhầm.

## Bố cục Employer (bản C)

Thứ tự từ trên xuống. Trước 2026-09-30 danh sách này dùng cho cả hai vai trò; nay **chỉ áp dụng cho Employer**, Admin theo mục "Admin — bản D". Các dòng nói về Admin bên dưới giữ lại để đối chiếu, không dùng nữa.

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

### Admin — bản D "bàn duyệt" (duyệt 2026-09-30)

Thay toàn bộ bố cục Admin bản C (banner tối, sáu KPI, ba nhóm việc). Mock: `docs/temp/ui-compare/admin-d-ban-duyet.html`. Dữ liệu cần backend bổ sung đánh số 1 – 6, khớp "Bước 6" của plan backend (nút "Chỗ cần bổ sung API" trong mock tô đúng các chỗ này).

**Quy tắc hình thức riêng của bản D** (khác `sip-ui` và Employer bản C):

- Không có khối tối. Thông tin tóm tắt nằm ở một dòng chữ và ba thẻ hàng chờ.
- Số dùng font chữ thường của app kèm `tabular-nums`, **không** dùng `--font-num` (mono) như Employer.
- Thẻ và khối: nền trắng, viền `border-subtle`, bo 14px, bóng rất nhẹ; không có viền trên marigold hay vạch brand ở tiêu đề.
- Marigold chỉ dùng cho thời gian chờ (thanh chia nhóm, ô "Chờ lâu nhất", ô thời gian chờ trong hàng, huy hiệu số ở menu). Brand (Plum) cho thao tác chính, tab đang chọn và biểu đồ.
- Tab dạng gạch chân; nút chọn kỳ và bộ lọc dạng nút gộp nền xám.

**Thứ tự từ trên xuống:**

1. **Đầu trang**: `h1` "Tổng quan"; dòng phụ "**N** mục chờ duyệt · cập nhật lúc HH:mm ngày DD/MM/YYYY" (giờ lấy từ lần tải `overview` mới nhất); bên phải "Làm mới" (viền, tải lại mọi khối của trang) và "Bắt đầu duyệt" (chính, chọn tab Tin tuyển dụng, cuộn tới bàn duyệt, focus nút duyệt đầu tiên).
2. **Hàng chờ**: tiêu đề "Hàng chờ" và câu tóm tắt "Tin cũ nhất đã chờ X, yêu cầu công ty cũ nhất đã chờ Y, đề xuất danh mục cũ nhất Z" (1; hàng chờ trống thì bỏ vế đó, cả ba trống thì ghi "Không có mục nào chờ duyệt"). Bên dưới là ba `QueueCard`, lưới 3 cột (1 cột khi vùng nội dung ≤ 900px):

   | Thẻ | Số | Chờ lâu nhất | Thanh chia nhóm |
   |---|---|---|---|
   | Tin chờ duyệt | `queues.jobPosts.total` "tin" | `jobPosts.oldestSince` (1) | Dưới 6 giờ / 6 – 24 giờ / Trên 24 giờ (2) |
   | Công ty chờ xác minh | `queues.companies.total` "công ty" | `companies.oldestSince` (1) | Dưới 24 giờ / 1 – 2 ngày / Trên 2 ngày |
   | Danh mục chờ duyệt | `queues.catalog.total` "mục" | `catalog.oldestSince` (1) | Kỹ năng / Trường / Ngành (tông brand) |

3. **Lưới 2fr / 1fr**:
   - Trái: `ModerationDesk` "Bàn duyệt", dòng phụ "Chờ lâu nhất ở trên. Từ chối tin và công ty cần nhập lý do." Mỗi tab tối đa 5 hàng (từ `tasks`), chân khối "Xem tất cả N …" tới trang quản lý tương ứng. Dòng phụ từng loại:
     - Tin: "{công ty} · gửi {thời gian} trước"; nút **Duyệt tin**, **Từ chối** (lý do bắt buộc; gợi ý: Thiếu mô tả quyền lợi, Mô tả công việc chưa rõ, Phụ cấp không hợp lệ, Sai ngành nghề), icon tới `/admin/jobs/:id`.
     - Công ty: "MST … · Giấy phép KD ↗ · yêu cầu … trước" (không có MST thì "Chưa có MST", không có giấy phép thì bỏ liên kết); nút **Xác minh**, **Từ chối** (lý do bắt buộc; gợi ý: MST không khớp giấy phép, Giấy phép không đọc được, Thông tin liên hệ không hợp lệ), icon tới `/admin/companies/:id`.
     - Danh mục: nhãn loại + "Đề xuất bởi {tên} ({vai trò})" (3) + thời gian; nút **Duyệt**, **Từ chối** (chỉ xác nhận), icon tới `/admin/skills` hoặc `/admin/education-catalog`.
   - Phải: `PlatformMetrics` "Nền tảng": Người dùng mới trong 7 ngày (`overview.users`), Doanh thu tháng MM/YYYY (`overview.revenue`), Gói đang hoạt động kèm "Doanh nghiệp 22 · Cơ bản 15" (`overview.subscriptions.byPlan`) và thanh còn hạn / hết hạn trong 7 ngày.
4. **Lưới 2fr / 1fr, hai khối cao bằng nhau**: "Người dùng mới theo ngày" (`TrendChart`, `RangeChips` ở đầu khối, chỉ khối này đổi theo nút); "Doanh thu theo tuần" (`ColumnChart`, tuần hiện tại đậm, cột giãn theo chiều cao khối).
5. **Lưới 3fr / 2fr**:
   - Trái: `NotificationCenter` Admin (8 mục mới nhất, "Đánh dấu tất cả đã đọc", "Xem tất cả thông báo").
   - Phải, xếp dọc: `ActivityTimeline` (5 mục, mặc định lọc "Quản trị viên", 4) rồi "Người dùng theo vai trò" (`BarList`, "Tại thời điểm xem · N người dùng").

**Hoạt động gần đây**: mỗi mục hai dòng: email người làm in đậm, rồi câu `summary` đã lưu (không ghép lại câu); thao tác có lý do (từ chối tin, gỡ tin, từ chối công ty) hiện khung "Lý do: …" (4). Người làm là email vì tài khoản Admin không có tên. Dòng phụ đổi theo bộ lọc: "Thao tác của quản trị viên." / "Mọi thao tác, gồm cả nhà tuyển dụng và hệ thống."

**Sau mỗi thao tác duyệt / từ chối**: hàng giữ nguyên chỗ, nút đổi thành `Badge` "Đã duyệt" / "Đã xác minh" / "Đã từ chối", `Toast`; tải lại `overview` (số trên thẻ, tab, dòng đầu trang) và danh sách hoạt động; `tasks` giữ nguyên như Employer. Số chờ ở menu trái (Tin tuyển dụng, Nhà tuyển dụng, Kỹ năng, Danh mục học vấn) lấy từ `overview` nên cũng giảm theo.

**Đáp ứng (≤ 580px vùng khối)**: hàng bàn duyệt xuống dòng (ô thời gian chờ dưới tiêu đề, nút chia đều một hàng); ô lý do tràn hết bề ngang; nhóm thông báo thành tab cuộn ngang; biểu đồ đường cuộn ngang trong khối.

### Trung tâm thông báo

- Nhóm Employer: Tất cả · Hồ sơ · Tin tuyển dụng · Công ty · Lời mời · Lịch phỏng vấn · Gói dịch vụ. Nhóm Admin: Tất cả · Tin tuyển dụng · Công ty · Danh mục · Thanh toán. Số chưa đọc lấy từ `unread-count/by-group`.
- Mỗi thông báo: icon, tiêu đề, nội dung, nhóm, thời gian tương đối, một nút hành động dẫn tới `link` của thông báo. Chưa đọc: nền `brand-50` và viền trái 3px; loại cảnh báo (tin bị từ chối, sắp hết hạn) dùng marigold. Bấm hành động đồng thời đánh dấu đã đọc.
- "Đánh dấu tất cả đã đọc" dùng `PATCH /notifications/read-all` (toàn bộ, không theo nhóm).
- Nhãn nút hành động đặt ở giao diện theo `type` (API không trả nhãn). Admin: `JOB_POST_SUBMITTED` "Duyệt tin", `COMPANY_LINK_REQUESTED` "Xác minh", `CATALOG_ENTRY_SUGGESTED` "Duyệt", `PAYMENT_COMPLETED` "Xem công ty" (5; chưa có trang giao dịch). Câu chữ thông báo dùng nguyên văn từ server, không sửa cho giống mock bản C; riêng thông báo danh mục mới sẽ nêu người đề xuất (6).
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
| FE-3 ✅ | **Trung tâm thông báo** dùng chung hai vai trò: `NotificationCenter`, `group`, đếm theo nhóm, làm mới qua socket. | Backend bước 3 | Nhóm và số chưa đọc đúng; đánh dấu đã đọc cập nhật cả chuông. |
| FE-4 ✅ | **Dashboard Admin bản D**: `useAdminDashboard`, `useAdminActivity`, `QueueCard`, `ModerationDesk`/`ModerationRow` + `RejectReason` (gợi ý lý do), `PlatformMetrics`, phân tích (`TrendChart`, `ColumnChart`, `BarList`), `ActivityTimeline`, `NotificationCenter` Admin; mục "Tổng quan" đầu nav, số chờ trên bốn mục kiểm duyệt; sau đăng nhập Admin vào `/admin/dashboard`. Bổ sung mục "Admin — bản D" vào `sip-ui`. | Backend bước 2–4 và **bước 6** | Duyệt / từ chối tin, công ty, danh mục ngay trên dashboard; số trên thẻ, tab, menu, dòng đầu trang giảm đúng; hoạt động mới xuất hiện sau thao tác; lọc "Quản trị viên / Tất cả" đúng; đủ 4 trạng thái; kiểm ở 375px và desktop. |
| FE-5 ✅ | **Interview**: hộp thoại đặt / đổi / huỷ lịch (dùng `Field`, `Input`, `Select`), nhóm "Hồ sơ chờ đặt lịch" và "Lịch phỏng vấn sắp tới", KPI 4, phía ứng viên xem lịch trong `/applications`; sau đó chọn nhiều + hộp thoại hai bước lên lịch hàng loạt (D12, cắt được). Tách được. | Backend bước 5 | Đặt lịch từ hồ sơ `SHORTLISTED` chuyển sang `INTERVIEWING`; ứng viên thấy lịch và nhận thông báo; lô có hồ sơ lỗi hiện đúng dòng lỗi và thử lại được. |

**Ghi chú triển khai FE-1, FE-2 (2026-09-30):**

- FE-1 ✅: token `marigold-800` (`Badge` `warning` và `accent` đổi sang token này vì cùng cặp nền/chữ), `Card tone="solid"`, `SideNavItem.badge`/`badgeTone`/`badgeLabel` + thanh trái 3px, `StatCard` thêm bố cục KPI (`delta`, `hint`, `tone="attention"`, `footer`, `href`; không có các prop này thì giữ bố cục cũ). Biểu đồ trong `components/dashboard/`, bảng màu chung ở `chart-tones.ts`, định dạng số/ngày giờ Việt Nam ở `lib/dashboard-format.ts`. Đã kiểm bằng trang tạm ở 375px và 1366px rồi xoá trang tạm.
- FE-2 ✅ phần code: `/employer/dashboard`, `hooks/useEmployerDashboard.ts`, `SummaryBanner`, `TaskGroup`/`TaskRow`, `RangeChips`/`ChipGroup`, `BlockSkeleton`/`BlockError`. Sau đăng nhập (và khi onboarding xong) Employer vào `/employer/dashboard`; mục "Tổng quan" đứng đầu nav, hiện số hồ sơ chờ xử lý. KPI 4 (lịch phỏng vấn) hiển thị luôn vì backend bước 5 đã có dữ liệu; hai nhóm việc "Hồ sơ chờ đặt lịch" và "Lịch phỏng vấn sắp tới" để lại FE-5 vì cần hộp thoại đặt/đổi lịch.
- Bố cục bên trong trang dùng container query (`@container`) thay cho breakpoint theo màn hình, vì sidebar 240px của shell hiện chưa thu gọn ở màn hình hẹp. Lưới dùng `grid-cols-1` (`minmax(0,1fr)`) để biểu đồ rộng không đẩy tràn trang.
- Sau khi "Xem xét"/"Từ chối": `useUpdateApplicationStatus` đánh dấu cả dashboard là cũ (không tải lại); trang tải lại ngay `overview` và `analytics`, riêng `tasks` giữ nguyên để hàng vừa xử lý còn hiện với nhãn trạng thái mới. `SocketProvider` invalidate `[area, "dashboard"]` khi có thông báo mới và `overview` khi có tin nhắn mới.
- Chỉnh lại cho khớp mẫu bản C (2026-09-30, sau khi so ảnh chụp trang thật với `employer-c-sip-ui-accent.html`): thẻ KPI padding 16px, ô icon 32px nền `brand-50` (thẻ chờ xử lý nền `marigold-100`, viền `marigold-300` + vạch trong 3px), nhãn đậm màu muted, số 36px đậm; icon theo mẫu (`briefcase`, `inbox`, `clock`, `calendar`, `message-square`, `send`). Thanh 10px, chú giải ô vuông, cột ngày cao 24px, phễu 12px với màu `brand-500 → 800` rồi `success-600`. Banner, nhóm việc (hàng nền xám, nút 32px, "Từ chối" chữ đỏ) và tiêu đề thẻ có vạch brand theo đúng số đo của mẫu. Số dùng token `--font-num` (mono hệ thống) thay Geist Mono. `TrendChart` vẽ theo viewBox 640×230 của mẫu (chữ trục không nhỏ hơn 13px thật), thêm ô thông tin khi rê chuột hoặc chạm vào ngày. Thêm `DashButton`, `Panel`/`PanelHead`, `TaskBadge`, `BannerNumber`. Banner không còn dùng `Card tone="solid"` (tone đó vẫn giữ trong `Card`).
- Bổ sung dữ liệu cho 3 dòng của mẫu (2026-09-30, đổi hợp đồng API, không cần migration): `DashboardPendingApplication.universityName` (trường của học vấn đại diện, cùng thứ tự với thẻ tìm ứng viên: đang học → năm kết thúc gần nhất → mới tạo nhất), `DashboardAttentionJob.applicationCount` (không tính hồ sơ đã huỷ), `EmployerDashboardOverview.messages.unreadCandidates` (số ứng viên khác nhau có tin chưa đọc; một ứng viên có thể có nhiều hội thoại vì hội thoại gắn với từng tin). Trang hiện "Tin · Trường · X trước", "Còn N ngày · M hồ sơ" và "Từ N ứng viên". Test: `apps/server/tests/unit/employer-dashboard-service.test.ts`.
- Chưa kiểm: xem trang thật với dữ liệu thật và thao tác xem xét / từ chối (cần backend + tài khoản Employer). `npm run lint --workspace web` toàn dự án còn lỗi có sẵn ở các file không thuộc bước này (vd. `ConfirmDialog`, `useEmployerCandidateProfile`); các file của FE-1/FE-2 sạch.

**Ghi chú triển khai FE-3, FE-4 (2026-09-30):**

- FE-3 ✅ phần code: `components/dashboard/NotificationCenter.tsx` dùng chung hai vai trò, kiểu hình theo `area` (Employer bản C: thông báo là thẻ viền riêng, cột nhóm 220px; Admin bản D: hàng ngăn bằng đường kẻ, cột nhóm 190px). `hooks/useNotificationGroups.ts` (số chưa đọc theo nhóm, danh sách theo nhóm, đánh dấu đã đọc); `lib/notifications.ts` thêm `group`, `fetchUnreadCountByGroup`, ánh xạ loại → nhóm (giống `notification-groups.ts` phía server, vì API không trả nhóm trong từng thông báo), nhãn nút hành động theo loại, tập loại cảnh báo (tô marigold). Mọi key nằm dưới `["notifications", area]`, cùng gốc với chuông, nên đánh dấu đã đọc ở đâu cũng cập nhật cả chuông lẫn trung tâm, và `SocketProvider` hiện có làm mới cả hai khi có thông báo mới. Tab "Tất cả" dùng `total` của `unread-count/by-group` (khớp chuông). Trang Employer đặt khối này cuối trang (hiện cả khi công ty chưa xác minh).
- FE-4 ✅ phần code: `/admin/dashboard` (`app/admin/(console)/dashboard/page.tsx`), `hooks/useAdminDashboard.ts` (overview, tasks, analytics, activity, `useModerate`), khối trong `components/dashboard/admin/`. "Tổng quan" đứng đầu menu; bốn mục kiểm duyệt có số chờ tông marigold lấy từ `overview` (shell gọi cùng key với trang); sau đăng nhập Admin vào `/admin/dashboard` (trang `/admin` khi đã đăng nhập cũng có nút "Tổng quan").
- Thao tác trên bàn duyệt gọi đúng API của các trang quản lý (`/admin/job-posts/:id/approve|reject`, `/companies/:id/verify|reject`, `/admin/{skills,universities,majors}/:id/approve|reject`). Xong thì tải lại `overview` và hoạt động, `tasks` chỉ đánh dấu cũ; đồng thời invalidate key danh sách của các trang quản lý. Lỗi 400/404/409 báo "đã được xử lý hoặc không còn".
- Thêm token `brand-300`, `brand-400` (trỏ tới bậc 300/400 của Pine / Indigo / Plum) cho viền thẻ hàng chờ đang chọn, thanh loại danh mục, thanh vai trò. `DashButton` thêm `ghost` và `danger-solid`. `ColumnChart` (trước đây chưa nơi nào dùng) vẽ lại theo mẫu D: vùng cột giãn theo chiều cao khối, trục X hai dòng ("Tuần 1" / "01 – 07/09"). `lib/dashboard-format.ts` thêm `formatVndShort` ("42,5 tr").
- Lệch so với bảng component: "Người dùng theo vai trò" và khối "Nền tảng" không dùng `BarList`/`CompareBars`/`SegmentBar` bản C mà dùng khối riêng của bản D (thanh 8–10px, số không mono), để khớp mẫu. Ô lý do từ chối tự dựng thay vì `Field` vì hàng nút lý do nằm giữa nhãn và ô nhập. Khối "Hoạt động gần đây" chưa có "Xem thêm" (chưa có trang nhật ký). Chân tab Danh mục có hai liên kết: kỹ năng và trường/ngành (hai trang quản lý khác nhau).
- Đã kiểm bằng trang tạm với dữ liệu giả ở 1366px và 375px (sau đó xoá): bố cục khớp mẫu, ô lý do báo lỗi khi để trống, tab thông báo thành hàng cuộn ngang. Đã sửa một lỗi tràn ngang ở 375px (chữ `sr-only` trong tab thông báo thoát khỏi vùng cuộn). `tsc` và eslint các file của FE-3/FE-4 sạch.
- Chưa kiểm: trang thật với backend và tài khoản Admin/Employer thật, thao tác duyệt / từ chối thật (sẽ ghi vào DB), trạng thái đang tải / lỗi trên trang thật.

**Ghi chú triển khai FE-5 (2026-09-30):**

- Làm theo mock `docs/temp/ui-compare/employer-fe5-lich-phong-van.html` (chủ dự án đã duyệt, cục bộ).
- FE-5 ✅ phần code:
  - `hooks/useInterviews.ts`: danh sách chờ đặt lịch, lịch của công ty, lịch của ứng viên, cùng các thao tác đặt / đổi / huỷ / lên lịch hàng loạt.
  - `lib/interview-format.ts`: giờ Việt Nam, gửi lên server dạng `…+07:00`.
  - `components/interviews/`:
    - `InterviewFields`: trường chung;
    - `InterviewDialog`: đặt và đổi lịch;
    - `CancelInterviewDialog`;
    - `BatchScheduleDialog`: hai bước;
    - `SelectionBar`, `TriStateCheckbox`, `RowCheckbox`;
    - `CandidateInterviewBlock`;
    - `useInterviewScheduling`: một hồ sơ thì mở hộp thoại đơn, nhiều hồ sơ thì mở hộp thoại hàng loạt.
- Hộp thoại dùng khung mới `components/ui/Dialog.tsx`, dựng trên thẻ `<dialog>` gốc với `showModal`:
  - trình duyệt lo bẫy focus, phím Esc và trả focus khi đóng;
  - render tại chỗ, không portal, nên giữ màu `brand-*` theo `data-role`;
  - không đóng khi bấm ra ngoài, để không mất dữ liệu đang nhập;
  - toàn màn hình ở ≤ 480px.
- Huỷ lịch dùng hộp riêng có ô lý do, không mở rộng `ConfirmDialog`. Lý do: `ConfirmDialog` portal ra `body` nên mất màu khu vực, và không nhận nội dung con.
- Lỗi của server hiện ngay trong hộp thoại, vì `Toast` nằm dưới lớp phủ của hộp thoại. Toast chỉ báo khi thành công.
- Dashboard: nhóm "Hồ sơ chờ đặt lịch" nằm dưới "Hồ sơ chờ xử lý", nhóm "Lịch phỏng vấn sắp tới" nằm dưới "Tin cần chú ý".
  - "Hiện thêm N hồ sơ" tải `GET /employer/interviews/awaiting` (tối đa 100) ngay trong nhóm, vì chưa có trang danh sách chờ.
  - Huỷ lịch mở từ hộp thoại đổi lịch.
  - Sau thao tác chỉ tải lại `overview`. Hàng vừa xử lý giữ nhãn ("Đã đặt lịch DD/MM · HH:mm", "Đã huỷ", giờ mới), giống FE-2.
  - `TaskGroup` thêm `toolbar`; `TaskRow` thêm `select`, `selected`; `TaskBadge` thêm tông `success`.
- Danh sách hồ sơ của một tin (`/employer/jobs/[id]/applications`):
  - thêm cột chọn, dữ liệu từ `awaiting?jobPostId=`;
  - thêm nhãn "Đã có lịch DD/MM", lấy từ `GET /employer/interviews` trong 92 ngày tới;
  - thêm nhãn "Cần đặt lại lịch";
  - thêm thanh chọn và toast.
  - Bảng, bộ lọc và nhãn trạng thái cũ giữ nguyên.
- Ứng viên (`/applications`):
  - Mỗi thẻ hồ sơ có khối "Lịch phỏng vấn". Buổi chính là buổi sắp tới hoặc đang diễn ra; nếu không có thì là buổi gần nhất (đã diễn ra, hoặc đã huỷ kèm lý do).
  - Các buổi đã huỷ khác nằm trong "Lịch đã huỷ (N)".
  - `SocketProvider` tải lại lịch và danh sách hồ sơ của ứng viên khi có thông báo `INTERVIEW_*`.
- Thay đổi nhỏ ở phần dùng chung:
  - `ApiError` thêm `data`, để đọc `failures` của phản hồi 409 khi lên lịch hàng loạt.
  - `Field`/`Input`/`Select`/`Textarea` nối `aria-describedby` tới dòng lỗi / gợi ý (id `${id}-msg`).
  - `DashButton` thêm `type`/`form`; nút bị khoá (không phải đang tải) dùng con trỏ `not-allowed`.
- Đã kiểm bằng trang tạm với dữ liệu giả ở desktop và 375px, sau đó xoá trang tạm:
  - chọn nhiều, "Chọn tất cả" ba trạng thái, thanh chọn;
  - bước 1 → bước 2, giờ tính đúng, cảnh báo "Sau 18:00";
  - ↑/↓ đổi thứ tự (focus giữ trên nút, vùng `aria-live` báo giờ mới);
  - phản hồi 409 giả lập: dòng lỗi, focus vào khung lỗi, "Bỏ các hồ sơ lỗi và thử lại" gửi lại đúng phần còn lại theo thứ tự;
  - đổi lịch: khoá nút khi chưa đổi, điền sẵn địa chỉ công ty, giữ liên kết khi đổi qua lại hình thức;
  - lỗi tại ô (liên kết sai, lý do huỷ trống);
  - khối lịch của ứng viên ba trạng thái;
  - ở 375px bảng xem trước thành thẻ, không tràn ngang.
  - `tsc` và eslint các file của FE-5 sạch.
- Chưa kiểm: trang thật với backend và tài khoản thật (đặt lịch thật ghi vào DB và gửi email tới ứng viên), cảnh báo trùng giờ với lịch của chính mình (cần dữ liệu thật), trạng thái đang tải / lỗi trên trang thật.

Trước khi báo xong mỗi bước: `tsc`, `npm run lint --workspace web`, xem trang thật ở 375px và desktop (đủ trạng thái đang tải / rỗng / lỗi / quá nhiều), kiểm tra phím Tab và focus, tương phản, nhãn cho nút chỉ có icon.

## Khác biệt giữa mock bản C và bản triển khai

Mock (cục bộ) đã được chỉnh khớp plan này ngày 2026-09-29: sidebar 240px, "Xem xét" / "Từ chối" cho hồ sơ chờ, "Xem tin" và "Sửa tin", "Lời mời còn lại hôm nay", nhóm "Hồ sơ chờ đặt lịch", nút 7/30/90 đổi đúng các biểu đồ theo D10, xác nhận trước khi từ chối hồ sơ, lý do bắt buộc khi Admin từ chối, toast, hộp thoại đặt / đổi / huỷ lịch. Những điểm còn khác:

| Mock | Triển khai | Lý do |
|---|---|---|
| Banner dùng lớp `.banner` tự viết | `SummaryBanner` (thẻ `section` riêng, cùng số đo với `.banner`) | `tone="brand"` của `Card` là nền sáng. |
| Hộp thoại là thẻ `<dialog>` HTML; ô ngày giờ theo định dạng của trình duyệt | `Dialog` (cũng dựng trên `<dialog>` gốc), `Field`, `Input`, `Select`; ô ngày vẫn theo định dạng của trình duyệt | Hộp thoại lịch cần ô nhập bên trong, `ConfirmDialog` không nhận nội dung con. |
| Dữ liệu giả cố định, thao tác chờ 0,65 giây rồi đổi giao diện | Chờ phản hồi server thật; đủ trạng thái đang tải / rỗng / lỗi / quá nhiều | Mock tĩnh, không có API. |
| Nhãn điều hướng do mock đặt (vd. "Duyệt tin tuyển dụng") | Nhãn của `NAV_ITEMS` hiện có | Không đổi tên mục điều hướng đang chạy. |
| Font Arial | Font đang dùng của `apps/web` | Mock chỉ mô phỏng `body { font-family: Arial }`. |
| (Admin D) Nút "Chỗ cần bổ sung API" và viền nét đứt | Không có | Chỉ để so sánh khi duyệt plan. |
| (Admin D) Hoạt động ghi liền một câu "email đã duyệt tin …" | Email một dòng, `summary` đã lưu một dòng | `summary` là bản chụp dạng "Duyệt tin … của …", không ghép lại câu. |
| (Admin D) Dữ liệu giả, thao tác chờ 0,65 giây | Dữ liệu và thao tác thật qua API | Như Employer. |

## Phần 4 — Ghi chú của chủ dự án

<!-- Để trống — dành cho chủ dự án ghi thêm trong lúc triển khai. -->
