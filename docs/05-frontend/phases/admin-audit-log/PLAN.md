# Trang nhật ký hoạt động (audit log) cho Admin — Frontend (bản C "Bàn điều tra")

Song song: `docs/06-backend/admin-audit-log/PLAN.md` (gọi tắt "plan BE"; các mã L1–L35, B0–B11 nằm ở đó).
Quy ước giao diện: `.claude/skills/sip-ui/SKILL.md`, cùng mục "Admin — bản D" trong `docs/05-frontend/phases/dashboard-employer-admin/PLAN.md`.
Mẫu thử tham chiếu: `docs/temp/ui-compare/admin-nhat-ky-hoat-dong.html`, phương án C. File này chỉ có trên máy, không commit vì `docs/temp` bị gitignore. Mọi mô tả cần để code đều nằm trong tài liệu này, không phụ thuộc vào mẫu thử.

**Trạng thái: ĐÃ ĐƯỢC CHỦ DỰ ÁN DUYỆT (2026-10-18), gồm QF1–QF4 theo khuyến nghị; plan BE cũng đã duyệt.** Chưa code. Phải có API của plan BE trước, xem cột "Cần BE" ở Phần 3.

## Phạm vi

| Có | Không |
| --- | --- |
| Một trang mới `/admin/activity`, chỉ đọc | Nút sửa hoặc xoá dòng nhật ký: không có API |
| Bộ lọc nằm trên URL, danh sách tải thêm theo lô 50, ngăn kéo chi tiết, sao chép link tới một dòng | Phong cách "sổ giấy" của mẫu thử (nền ngà, font Fraunces, chế độ tối riêng). Trang theo token admin hiện có (Phần 1) |
| Bảy khối thống kê đều bấm được để lọc, sơ đồ dòng chảy tin | Trang giao dịch thanh toán (chưa có). Dòng thanh toán mở trang công ty (L34) |
| Hành trình của một đối tượng, hành trình của một người làm | Thông báo realtime khi có dòng mới. Bạn tự bấm "Tải lại" |
| Xuất CSV, xem nhật ký đã lưu trữ | |
| Link "Xem trong nhật ký" từ dashboard và các trang chi tiết | |

## Phần 1 — Công nghệ và quy ước

- **Không thêm dependency.** Dùng sẵn:
  - Next.js 16: đọc `node_modules/next/dist/docs/` trước khi viết route, theo `apps/web/AGENTS.md`.
  - Tailwind v4, `@tanstack/react-query`, `lucide-react`.
  - `hooks/useDebounce.ts`; định dạng số và ngày giờ ở `lib/dashboard-format.ts`.
  - Biểu đồ vẽ bằng SVG/CSS thuần, giống `components/dashboard/*`.
- **Phong cách theo Admin bản D:**
  - Khối dùng `AdminPanel`/`AdminPanelHead`. Chọn kỳ và các lựa chọn đơn dùng `SegmentedControl`. Tab trong ngăn kéo dạng gạch chân.
  - Số dùng font chữ thường kèm `tabular-nums` (đè `--font-num` ở thẻ bọc ngoài như dashboard Admin).
  - Giờ, IP và mã đối tượng dùng `font-num`.
  - Không có khối tối.
- **Màu:**
  - Marigold chỉ dùng cho "chờ duyệt" (trong sơ đồ dòng chảy: "Còn chờ duyệt").
  - Cảnh báo bảo mật dùng `red-*` như `Badge tone="danger"`.
  - Lưới thứ × giờ dùng thang `brand-50` → `brand-700` (một màu, nhạt sang đậm).
  - **6 màu cho 6 nhóm hành động (QF1, đã chốt):** thêm 6 token vào khối `@theme` của `globals.css`. Chỉ dùng trong `components/admin/activity/`, không dùng cho nút, trạng thái hay chữ.

    | Nhóm | Token | Màu |
    | --- | --- | --- |
    | Tin tuyển dụng | `--color-audit-job` | `#2a78d6` |
    | Công ty | `--color-audit-company` | `#eb6834` |
    | Danh mục | `--color-audit-catalog` | `#1baf7a` |
    | Thanh toán | `--color-audit-payment` | `#eda100` |
    | Tài khoản | `--color-audit-account` | `#e87ba4` |
    | Bảo mật | `--color-audit-security` | `#6250d6` |

    Giữ đúng thứ tự trên: thứ tự này đã qua `validate_palette.js` ở mẫu thử. Ở FE-0 chạy lại validator với nền trắng của `AdminPanel`; có mục FAIL thì đổi sang bậc gần nhất đạt rồi mới code. Màu không bao giờ là kênh duy nhất: mỗi nhóm luôn có icon và nhãn, mỗi biểu đồ có chú giải và có dạng bảng. Ghi ngoại lệ này vào sip-ui (mục "Dashboard, biểu đồ").
- **Trạng thái bộ lọc nằm trên URL**, đọc bằng `useSearchParams` và ghi bằng `router.replace`, giống `admin/(console)/users/page.tsx` (kể cả Suspense boundary). Đọc URL qua một hàm parse duy nhất. Giá trị sai thì bỏ qua và hiện lỗi ngay tại ô, không ném lỗi.
- **Tải file CSV:** `apiFetch` chỉ đọc JSON. Thêm `apiDownload(area, path)` vào `lib/api-client.ts`: trả `Blob` và tên file lấy từ `Content-Disposition`, làm mới token khi 401 giống `apiFetch`. Server đã thêm BOM (L13), client không thêm lần nữa.
- **Giọng văn:** theo sip-ui (xưng "bạn", nút bắt đầu bằng động từ, ngày `DD/MM/YYYY`, chấm ngăn nghìn, chữ ≥ 13px).

## Phần 2 — Cấu trúc và liên kết

### Route và điều hướng

| Route | File | Ghi chú |
| --- | --- | --- |
| `/admin/activity` | `app/admin/(console)/activity/page.tsx` | Mục "Nhật ký hoạt động" (icon `scroll-text`) thêm vào `NAV_ITEMS` của `AdminConsoleShell`, đứng ngay trước "Cài đặt"; thêm nhãn vào `CRUMB_LABELS`. Trang là client component, bọc trong `Suspense` vì dùng `useSearchParams`. |

### Tham số URL

Tên tham số giống API (plan BE L7, L27–L29, L33) để chuyển thẳng sang query, trừ `ent` và `row`.

| Tham số | Ví dụ | Ghi chú |
| --- | --- | --- |
| `group` | `group=SECURITY,JOB_POST` | Nhiều giá trị |
| `actorRole` | `actorRole=ADMIN` | Nhiều giá trị, có `SYSTEM` |
| `from`, `to` | `from=2026-09-19&to=2026-10-18` | Mặc định 30 ngày gần nhất. Tối đa 366 ngày |
| `q` | `q=vy.le` | Từ 2 ký tự, debounce 300ms |
| `action`, `resubmit` | `action=JOB_POST_SUBMITTED&resubmit=true` | Đặt từ thẻ cảnh báo và sơ đồ dòng chảy |
| `dow`, `hour` | `dow=2&hour=9` | Đặt từ lưới thứ × giờ |
| `ent` | `ent=JobPost:clx…` | Gửi lên API thành `entityType` + `entityId` |
| `actorId`, `since`, `until` | | Đặt từ hành trình người làm |
| `archived` | `archived=1` | Xem nhật ký đã lưu trữ |
| `row` | `row=clx…` | Dòng đang mở trong ngăn kéo; không gửi lên API danh sách |

### Bố cục

Thứ tự từ trên xuống, ở màn hình rộng (≥ 1280px):

1. **Đầu trang:**
   - `h1` "Nhật ký hoạt động".
   - Dòng phụ: "**N** sự kiện · DD/MM/YYYY – DD/MM/YYYY". `total` lấy từ trang đầu (L9). Nếu `searchTruncated` thì thêm câu "Có hơn 200 tài khoản khớp, bạn gõ email cụ thể hơn".
   - Bên phải có hai nút: "Xuất CSV" (secondary) và "Xem nhật ký đã lưu trữ" (bật/tắt, `aria-pressed`).
2. **Thanh lọc** (một hàng, xuống dòng khi hẹp):
   - Nhóm: nút bật/tắt có icon và nhãn.
   - Vai trò.
   - Khoảng ngày: nút 7/30/90 ngày và hai ô ngày `DD/MM/YYYY`. Sai định dạng hoặc quá 366 ngày thì báo lỗi ngay tại ô (`aria-invalid`).
   - Ô tìm email.
   - Hàng chip của các bộ lọc đang bật: mỗi chip có nút ✕ có nhãn, cuối hàng có nút "Bỏ lọc". Chip hiện cả bộ lọc đặt từ biểu đồ, vd. "Thứ Ba, 9:00–10:00", "Gửi lại sau từ chối", "Phiên 09:12–09:47 của vy.le@…".
3. **Thanh cảnh báo bảo mật** (chỉ hiện khi `securityAlerts > 0`): "Có N lần đăng nhập sai 5 lần trong 15 phút". Bên cạnh có 3 dòng gần nhất (email, giờ, IP), mỗi dòng có link "Mở trang người dùng", và nút "Xem cả N dòng" để đặt `action=AUTH_LOGIN_FAILED_REPEATED` (L27).
4. **Lưới thống kê:**

   | Hàng | Nội dung |
   | --- | --- |
   | 1 | Theo ngày (2/3) · Tỉ lệ theo nhóm (1/3) |
   | 2 | Vai trò người làm · Top 5 người làm · Thứ × giờ |
   | 3 | Dòng chảy tin tuyển dụng (cả hàng) |

   - Mỗi khối có tiêu đề, một dòng phụ nói khối này lọc gì khi bấm, và nút "Xem dạng bảng".
   - Dưới lưới có dòng "Biểu đồ tính theo người làm" khi đang lọc bằng email (L18).
5. **Danh sách** (dạng gọn, mới nhất trước). Mỗi dòng gồm:
   - giờ;
   - người làm (email + nhãn vai trò, hoặc "Hệ thống");
   - nhãn hành động có icon nhóm;
   - câu `summary`;
   - lý do (nếu có);
   - IP (chỉ dòng bảo mật);
   - link đối tượng.

   Cả dòng là một nút mở ngăn kéo chi tiết. Phím ↑/↓ di chuyển giữa các dòng. Cuối danh sách có "Tải thêm 50 dòng" và dòng "Đang xem X / N".
6. **Ngăn kéo chi tiết** (bên phải, rộng tối đa 480px, có lớp phủ):
   - Ba tab: "Chi tiết", "Hành trình đối tượng", "Hành trình người làm".
   - Có nút "Sao chép liên kết tới dòng này".
   - Bẫy focus trong ngăn kéo; `Esc` đóng và trả focus về dòng đã mở.

**Màn hình hẹp (< 1024px)** sửa điểm yếu của bản C (phải cuộn qua bảy biểu đồ mới tới danh sách):

- Thanh lọc thu thành nút "Bộ lọc (n)".
- Sau thanh cảnh báo là danh sách luôn.
- Lưới thống kê gom vào một mục "Thống kê", **đóng sẵn**, mở thì xếp một cột.
- Lưới thứ × giờ cuộn ngang trong khối (ô ≥ 32px, cột nhãn thứ dính bên trái).
- Ngăn kéo chiếm toàn màn hình.

Không được có cuộn ngang ở cấp trang khi rộng 375px.

### Thành phần mới

Đặt trong `apps/web/src/components/admin/activity/`. Component nhận dữ liệu qua props, không tự gọi API (trang và hook lo việc đó).

| Component | Vai trò |
| --- | --- |
| `ActivityFilters` | Thanh lọc, bản thu gọn trên màn hình hẹp, hàng chip, "Bỏ lọc". |
| `DateRangeField` | Nút 7/30/90 ngày và hai ô ngày, kiểm định dạng và giới hạn 366 ngày. |
| `SecurityAlertBar` | Thanh cảnh báo (mục 3 ở trên). |
| `ActivityDayChart` | Cột chồng theo ngày × nhóm (khoảng trống 2px giữa các đoạn), trục Y có số.<br>Kéo chuột hoặc chạm trên vùng biểu đồ để chọn khoảng ngày (đặt `from`/`to`).<br>Bàn phím: ←/→ chọn ngày, Shift + ←/→ mở rộng khoảng, Enter để lọc.<br>Tooltip theo ngày có số từng nhóm. Biểu đồ vẽ đúng chiều rộng thật (đo bằng `ResizeObserver`), không co giãn bằng `viewBox`. |
| `ActivityBarList` | Thanh ngang có số và phần trăm, có thể bấm (`aria-pressed`). Dùng cho "Tỉ lệ theo nhóm" và "Vai trò người làm". Dựng trên ý tưởng `BarList` của dashboard: nếu thêm prop `selected`/`onSelect` vào `BarList` mà không làm vỡ chỗ dùng cũ thì mở rộng `BarList`, còn không thì viết component riêng. |
| `TopActorsList` | Top 5 người làm: email, vai trò, số lượt, thanh. Bấm thì đặt `q` = email. Nút phụ "Xem hành trình" mở tab "Hành trình người làm" với `actorId`. |
| `WeekHourHeatmap` | Lưới 7 × 24 ô dạng nút. Roving tabindex, phím mũi tên đi giữa các ô, Enter để đặt `dow`/`hour`. Có chú giải thang màu kèm số. |
| `JobPostFlow` | Ba cột "Vào hàng chờ → Admin quyết định → Sau khi đăng":<br>- Cột 1: Gửi duyệt lần đầu / Gửi lại sau từ chối / Tự đăng.<br>- Cột 2: Duyệt / Từ chối / Còn chờ duyệt lúc này.<br>- Cột 3: Đã hạ (gỡ tin).<br>Mỗi nhánh là nút có số và thanh, bấm thì đặt `action` (+ `resubmit`). "Còn chờ duyệt" không bấm được, lấy số từ `useAdminDashboardTasks`. Dưới cùng có câu "Từ chối → gửi lại: X lượt gửi lại trên Y lượt bị từ chối". |
| `ChartTable` | Bảng thay thế cho một biểu đồ, bật bằng nút "Xem dạng bảng". |
| `ActivityList` / `ActivityRow` | Danh sách và một dòng. Có trạng thái đang tải (skeleton 8 dòng), rỗng, lỗi. |
| `ActivityDetailDrawer` | Ngăn kéo và ba tab. |
| `ActivityDetail` | Tab "Chi tiết": thời gian đầy đủ, người làm, vai trò, hành động, nhóm, đối tượng + link, lý do, IP, "Gửi lại" (khi `resubmit`). |
| `EntityJourney` | Tab "Hành trình đối tượng":<br>- Sơ đồ trạng thái SVG: các nút là trạng thái, các cạnh là chuyển trạng thái. Cạnh đã đi qua thì đậm và có số lần.<br>- Bên dưới là danh sách các bước theo thời gian. Mỗi bước là nút; bấm một bước hoặc một bước trên sơ đồ thì nhảy tới dòng đó trong danh sách. Nếu dòng không có trong danh sách thì đặt `ent` rồi mới nhảy. Dòng đó được tô nổi trong 1,5 giây.<br>- Hết 200 dòng (L12) thì ghi "Chỉ hiện 200 bước đầu". |
| `ActorSessions` | Tab "Hành trình người làm": các phiên của một người (dòng cách nhau ≤ 30 phút). Mỗi phiên có giờ bắt đầu–kết thúc, số thao tác và chuỗi nhãn hành động rút gọn. Bấm một phiên thì đặt `actorId` + `since`/`until` (L33). |
| `ExportCsvButton` | Gọi `/export` với bộ lọc hiện tại, lưu `Blob`. Lỗi 422 (quá 5.000 dòng) và 429 (quá 10 lần mỗi giờ) hiện bằng `Toast` kèm câu hướng dẫn. Nút có trạng thái đang tải. |

**Chỗ phải sửa ở code có sẵn:**

- `AdminConsoleShell`: thêm mục menu.
- `components/dashboard/admin/ActivityTimeline.tsx`: thêm link "Xem tất cả" tới `/admin/activity`.
- Trang `admin/(console)/users/[id]`, `jobs/[id]`, `companies/[id]`: thêm link "Xem trong nhật ký" tới `/admin/activity?ent=<Type>:<id>`. Lịch sử đang có trên trang người dùng (`HistoryPanel`) giữ nguyên.
- `lib/api-client.ts`: thêm `apiDownload`.

### Thư viện dùng chung của trang

`lib/audit-activity.ts`:

- Nhãn và icon cho 6 nhóm và 24 hành động. Nhóm `OTHER` cho hành động lạ (plan BE, Phần 1).
- `parseActivityParams` / `toActivityParams`: chuyển qua lại giữa URL và bộ lọc.
- `entityHref(item)`, dựng link theo bảng sau:

  | Đối tượng | Link |
  | --- | --- |
  | `JobPost` | `/admin/jobs/[id]` ("Mở tin") |
  | `Company` | `/admin/companies/[id]` ("Mở công ty") |
  | `User` | `/admin/users/[id]` ("Mở người dùng") |
  | `Subscription` | `/admin/companies/[companyId]` ("Mở công ty"; `companyId` có từ L34) |
  | `Skill` | `/admin/skills` ("Mở kỹ năng") |
  | `University`, `Major` | `/admin/education-catalog` ("Mở danh mục") |

  Trang kỹ năng và danh mục chưa có trang chi tiết, nên chỉ mở tới danh sách (xem QF4).
- `groupSessions(items, gapMinutes = 30)`: gom thao tác thành phiên.

`lib/audit-journey.ts`: sơ đồ trạng thái cho từng loại đối tượng (vị trí nút, các cạnh, hành động nào chuyển sang trạng thái nào):

- `JobPost`: Nháp → Chờ duyệt → Đang hiển thị → Đã hạ. Từ chối thì về Nháp; tự đăng thì đi thẳng Nháp → Đang hiển thị.
- `Company`: Chưa gửi → Chờ xác minh → Đã xác minh / Bị từ chối → gửi lại.
- `User`: Chưa kích hoạt → Hoạt động ⇄ Bị khoá.
- `Skill` / `University` / `Major`: Chờ duyệt → Đã duyệt / Đã gộp / Bị từ chối.
- `Subscription`: không vẽ sơ đồ, chỉ có danh sách bước.

Nhãn trạng thái tin dùng đúng từ vựng của sip-ui.

### Hook và dữ liệu

`hooks/useAdminActivityLog.ts`. Mọi key nằm dưới `["admin","activity"]`. Hook `useAdminActivity` của dashboard giữ nguyên.

| Hook | Gọi | Ghi chú |
| --- | --- | --- |
| `useActivityList(filters)` | `GET /admin/activity` | `useInfiniteQuery`, `limit=50`, `getNextPageParam` theo cursor. `total` và `searchTruncated` lấy từ trang đầu. `placeholderData` giữ trang cũ khi đổi bộ lọc để không bị nháy. |
| `useActivityStats(filters)` | `GET /admin/activity/stats` | Bỏ `ent`, `actorId`, `since`, `until`, `archived` trước khi gửi (L11). Khi xem lưu trữ thì không gọi, và lưới thống kê ghi "Thống kê không áp dụng cho nhật ký đã lưu trữ" (L19, L23). |
| `useActivityItem(id, archived)` | `GET /admin/activity/:id` | Chỉ gọi khi `row` không có trong các trang đã tải (L35). |
| `useEntityJourney(type, id)` | `GET /admin/activity?entityType&entityId&order=asc&limit=200` | Bật khi mở tab "Hành trình đối tượng". |
| `useActorJourney(actorId, from, to)` | `GET /admin/activity?actorId&order=asc&limit=200` | Bật khi mở tab "Hành trình người làm". |

- Đổi bộ lọc thì danh sách và thống kê tải lại song song. Mỗi khối có trạng thái đang tải và lỗi riêng (`BlockSkeleton`/`BlockError` có nút "Thử lại").
- Nút "Tải lại" ở đầu trang: invalidate `["admin","activity"]`.

### Trạng thái giao diện

| Trạng thái | Hiển thị |
| --- | --- |
| Đang tải | Skeleton đúng khung từng khối, không nhảy bố cục |
| Rỗng | "Không có sự kiện nào khớp bộ lọc. Bạn thử bỏ bớt bộ lọc hoặc mở rộng khoảng ngày." kèm nút "Bỏ lọc" |
| Lỗi | Một câu kèm "Thử lại", riêng từng khối |
| `q` 1 ký tự | Gợi ý "Gõ ít nhất 2 ký tự", chưa gọi API |
| `searchTruncated` | Câu nhắc ở dòng phụ đầu trang |
| `total` > 5.000 | "Xuất CSV" vẫn bấm được nhưng có ghi chú "Quá 5.000 dòng, bạn thu hẹp khoảng ngày để xuất". Server vẫn chặn bằng 422 |
| Link `row` không còn | Ngăn kéo báo "Không tìm thấy dòng này, có thể đã được chuyển sang lưu trữ" kèm nút "Xem trong lưu trữ" |

## Câu hỏi đã chốt (2026-10-18)

Chủ dự án đồng ý cả bốn khuyến nghị.

| # | Câu hỏi | Đã chốt |
| --- | --- | --- |
| QF1 | Bản C cần 6 màu phân biệt nhóm, trong khi sip-ui chỉ cho brand/success/marigold. | Thêm 6 token `--color-audit-*`, chỉ dùng trong trang này (bảng ở Phần 1, mục Màu). Ghi ngoại lệ vào sip-ui. |
| QF2 | Chi tiết mở bằng ngăn kéo ở mọi cỡ màn hình, hay cố định bên phải khi ≥ 1280px như bản A? | Ngăn kéo ở mọi cỡ màn hình. Bản C dành chiều rộng cho biểu đồ, và một kiểu thì dễ làm, dễ kiểm. |
| QF3 | Trên màn hình hẹp, khối "Thống kê" đóng sẵn? | Đóng sẵn, danh sách lên trước. |
| QF4 | Link tới kỹ năng và danh mục học vấn chỉ mở trang danh sách. Có thêm `?q=<tên>` cho hai trang đó để mở sẵn kết quả tìm không? | Để sau. Đây là sửa trang khác, không cần cho bản đầu. Ghi vào backlog ở FE-9. |

## Phần 3 — Các bước thực hiện

| Bước | Nội dung | Cần BE | Ước lượng |
| --- | --- | --- | --- |
| FE-0 | Đọc hướng dẫn route và `useSearchParams` trong `node_modules/next/dist/docs/`. Thêm 6 token `--color-audit-*` (QF1), chạy `validate_palette.js` với nền trắng, cập nhật sip-ui. | — | 0,5 giờ |
| FE-1 | `lib/audit-activity.ts` (nhãn, parse/serialize URL, `entityHref`, `groupSessions`), `hooks/useAdminActivityLog.ts`, `apiDownload`. Kiểm parse URL với các giá trị sai. Thẻ "Mật khẩu" ở Cài đặt gửi thêm `via: "change"` khi gọi `/auth/reset-password` (B2). | B1 (type) | 2,5 giờ |
| FE-2 | Route, mục menu, `ActivityFilters` + `DateRangeField`, `ActivityList` có "Tải thêm", `total`, chip, "Bỏ lọc", đủ trạng thái. | B5 | 3,5 giờ |
| FE-3 | `ActivityDetailDrawer` + `ActivityDetail`, sao chép link, mở thẳng bằng `row` (`useActivityItem`), bẫy focus, `Esc`, ↑/↓ trong danh sách. | B5a (L35) | 2 giờ |
| FE-4 | `lib/audit-journey.ts`, `EntityJourney` (sơ đồ + bước, nhảy tới dòng), `ActorSessions` (lọc theo phiên). | B5, B5a (L33) | 3,5 giờ |
| FE-5 | `ActivityDayChart` (cột chồng, kéo chọn, bàn phím, tooltip), `ActivityBarList` cho nhóm và vai trò, `TopActorsList`, `ChartTable`. | B6, B6a (L31) | 4 giờ |
| FE-6 | `WeekHourHeatmap`, `SecurityAlertBar`, `JobPostFlow`. | B5a (L27, L29), B6a (L32), B1a (L28) | 3 giờ |
| FE-7 | `ExportCsvButton` (422, 429), nút "Xem nhật ký đã lưu trữ". | B9, B7 | 1,5 giờ |
| FE-8 | Điểm vào trang: link "Xem tất cả" ở `ActivityTimeline`, "Xem trong nhật ký" ở trang người dùng, tin, công ty. | — | 0,5 giờ |
| FE-9 | Kiểm toàn trang:<br>- 375px và 1280px, không cuộn ngang;<br>- đủ trạng thái ở bảng trên;<br>- chỉ dùng bàn phím (bộ lọc, biểu đồ, lưới giờ, ngăn kéo);<br>- tương phản;<br>- typecheck và `npm run lint --workspace web`.<br>Kiểm tích hợp trên server thật cùng B10 của plan BE. Cập nhật sip-ui (component mới) và backlog (thêm mục QF4: `?q=` cho trang kỹ năng và danh mục). | B10 | 2 giờ |

Tổng: **khoảng 23 giờ**.

Thứ tự gợi ý: làm FE-1 → FE-3 ngay sau B5/B5a để có trang chạy được sớm, chỉ cần danh sách và chi tiết. Biểu đồ (FE-5, FE-6) làm sau B6/B6a. Bước nào chưa có API thì ẩn khối đó, không dựng dữ liệu giả trong code.

## Phần 4 — Ghi chú của chủ dự án

(để trống)
