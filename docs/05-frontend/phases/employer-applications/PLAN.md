# Trang "Ứng viên" của Employer — Frontend

Song song: `docs/06-backend/employer-applications/PLAN.md` (H1–H10, D1–D10, Q1, API).
Theo skill `sip-ui`; bố cục và hàng hồ sơ theo dashboard bản C (`docs/05-frontend/phases/dashboard-employer-admin/PLAN.md`); phân trang và thanh chọn theo trang Lịch phỏng vấn (`docs/05-frontend/phases/employer-interviews/PLAN.md`, D12, D18).

**Trạng thái: BƯỚC 2 XONG (2026-10-17).** Q1 đã chốt: không sắp theo điểm phù hợp, thay bằng sắp theo kỹ năng khớp (D10 backend). Frontend đã code, `tsc` và lint sạch ở các file của bước này; xem "Ghi chú triển khai — Bước 2". Bước 3 (kiểm trên trình duyệt) chờ lệnh.

## Route và điều hướng

- Trang mới `app/employer/(portal)/applications/page.tsx` (client). Trang chi tiết `applications/[id]` đã có, không đổi. Trước khi viết, đọc hướng dẫn route / `useSearchParams` trong `node_modules/next/dist/docs/`; `useSearchParams` bọc `<Suspense>`.
- **Menu:** thêm mục "Ứng viên" (icon `users`, `matchNested`) ngay dưới "Tin tuyển dụng" trong `NAV_ITEMS` của `EmployerPortalShell`. Số hồ sơ chờ (`pendingCount`) **chuyển** từ mục "Tổng quan" sang mục này. Chấm trên nút ☰ (mobile-shell) tự theo vì đọc từ `badge`. `CRUMB_LABELS` đã có `applications: "Ứng viên"`.
- **Link vào:** "Xem tất cả N hồ sơ" ở khối Việc cần làm của dashboard đổi từ `/employer/jobs` sang `/employer/applications?status=PENDING`.
- **URL giữ bộ lọc:** `?status=&job=&q=&sort=&page=`. Bấm Back, tải lại hay chia sẻ link đều giữ đúng trang. Đổi bộ lọc thì về `page=1`. Giá trị lạ trên URL bị bỏ qua (dùng mặc định).

## Bố cục

Từ trên xuống, nội dung tối đa 1240px như các trang portal khác:

1. **Tiêu đề** "Ứng viên" và dòng phụ "N hồ sơ của M tin".
2. **Tab trạng thái** dạng gạch chân, cuộn ngang ở màn hẹp: Tất cả · Chờ duyệt · Đang xem xét · Vào danh sách rút gọn · Mời phỏng vấn · Được nhận · Bị từ chối · Đã huỷ. Số đếm lấy từ `statusCounts`. Nhãn dùng đúng `APPLICATION_STATUS_LABEL` của server, không viết lại. (Ở câu trả lời trước mình gọi tạm là "Chờ xử lý" / "Danh sách ngắn"; plan theo từ vựng cố định.)
3. **Thanh lọc:** ô tìm "Tìm theo tên hoặc email" (debounce 300ms bằng `useDebounce`, cần ≥ 2 ký tự); ô chọn tin (từ `jobCounts`, kèm số hồ sơ, tin không còn hiển thị ghi thêm trạng thái); ô sắp xếp "Nộp lâu nhất trước" / "Mới nhất trước" / "Khớp kỹ năng nhiều nhất" (`sort=skills`, D10). Khi đang lọc theo một tin: link "Xếp theo độ phù hợp" sang `/employer/jobs/[id]/applications` (Q1). Hai tên "khớp kỹ năng" và "độ phù hợp" giữ tách biệt, không dùng lẫn.
4. **Danh sách**, mỗi hàng:
   - ô chọn;
   - ô chữ cái đầu tên, tên ứng viên (link trang chi tiết), trường;
   - tên tin (link tin; ẩn khi đang lọc theo tin đó);
   - nhãn trạng thái (`Badge`);
   - "nộp N trước"; ở tab Chờ duyệt, chờ quá 2 ngày thì chữ `marigold-800` đậm (như dashboard);
   - lịch phỏng vấn sắp tới "DD/MM · HH:mm" nếu có;
   - **khớp kỹ năng** từ `skillMatch`, luôn hiện (không chỉ khi sắp theo kỹ năng), số dùng `tabular-nums`: "Khớp 3/4 kỹ năng bắt buộc", thêm "· 1/2 nên có" khi tin có kỹ năng không bắt buộc. Tin chưa có kỹ năng bắt buộc: "Tin chưa có kỹ năng yêu cầu" màu `text-muted`. Chỉ là chữ, không dùng thanh hay màu đánh giá tốt/xấu;
   - nút theo trạng thái (chỉ nút API cho phép): Chờ duyệt → **Xem xét** / **Từ chối**; Đang xem xét → **Vào danh sách rút gọn** / **Từ chối**; chờ đặt lịch (`awaitingSchedule`) → **Đặt lịch** / **Từ chối**; Mời phỏng vấn đã có lịch → **Được nhận** / **Từ chối**; trạng thái cuối → không nút. Luôn có nút icon mở chi tiết.
   - ≥ 768px: bảng. < 768px: mỗi hồ sơ là một thẻ, ô chọn ở góc, nút xuống dòng cuối thẻ.
5. **Phân trang:** `components/ui/Pagination` có sẵn, 20 hồ sơ mỗi trang, ghi "Hồ sơ 21–40 trên 87".
6. **Thanh thao tác** dính đáy khi đã chọn (xem dưới).

## Chọn nhiều và thao tác hàng loạt

- Ô chọn ở đầu bảng chọn / bỏ mọi hồ sơ **trên trang đang xem** (ba trạng thái, `TriStateCheckbox` có sẵn). Hồ sơ ở trạng thái cuối không có ô chọn.
- Đổi trang, tab, bộ lọc hoặc sắp xếp ⇒ bỏ chọn (D2). Không có "chọn tất cả N hồ sơ" (D3).
- Thanh: "Đã chọn N hồ sơ · Bỏ chọn" và các nút, mỗi nút ghi **số hồ sơ sẽ bị tác động** (D5):
  - "Xem xét k" (k = số hồ sơ Chờ duyệt đã chọn);
  - "Vào danh sách rút gọn k" (Đang xem xét);
  - "Đặt lịch k" (chờ đặt lịch; quá 20 thì khoá kèm "Tối đa 20 ứng viên mỗi lần");
  - "Từ chối k" (mọi trạng thái chưa kết thúc), chữ đỏ.
  - k = 0 ⇒ nút khoá, `title` nêu lý do (vd. "Không có hồ sơ Chờ duyệt nào được chọn"). Màn hẹp: nút phụ gom vào hàng thứ hai, thanh không tràn.
- Mở rộng `components/interviews/SelectionBar.tsx` bằng prop `actions` (thay nút "Lên lịch phỏng vấn" mặc định khi được truyền) và nhãn đơn vị; chỗ dùng cũ không đổi. Không tạo bản sao.
- **Xác nhận:** chỉ hỏi khi từ chối (`ConfirmDialog`, như dashboard): "Từ chối k hồ sơ? Ứng viên sẽ nhận email thông báo. Bạn không thể hoàn tác." Xem xét và vào danh sách rút gọn làm ngay, báo bằng toast.
- **Đặt lịch** dùng `useInterviewScheduling` có sẵn (một hồ sơ ⇒ hộp thoại đơn, nhiều ⇒ hàng loạt). Hàng được chuyển sang dạng `AwaitingScheduleApplication` ở trang.
- **Kết quả** (D7): toast "Đã chuyển 7 hồ sơ sang Đang xem xét." Có hồ sơ bị bỏ qua thì thêm "1 hồ sơ không đổi được vì trạng thái vừa thay đổi." (theo `reason`). Thao tác từng hồ sơ dùng API đơn lẻ có sẵn, cùng cách báo.
- **Sau thao tác** (như D18): hàng ở lại tại chỗ với trạng thái mới và nhãn xanh ("Đã chuyển sang Đang xem xét", "Đã từ chối", "Đã đặt lịch DD/MM · HH:mm"), cho tới khi đổi trang hoặc bộ lọc. Đánh dấu dữ liệu cũ và tải lại `statusCounts`; invalidate tổng quan dashboard (để số trên menu đúng ngay) và danh sách hồ sơ theo tin.

## Trạng thái

- **Đang tải:** khung xương cho tab, thanh lọc và 5 hàng. Đổi trang giữ dữ liệu cũ mờ nhẹ cho tới khi có trang mới (không nháy trắng).
- **Rỗng**, theo ngữ cảnh: chưa có hồ sơ nào ("Chưa có hồ sơ nào. Hồ sơ mới sẽ hiện ở đây khi ứng viên nộp." + nút "Đăng tin mới"); tab rỗng ("Không có hồ sơ Chờ duyệt."); tìm không ra ("Không tìm thấy hồ sơ khớp "…". Thử tên khác hoặc bỏ lọc theo tin." + nút "Bỏ lọc").
- **Lỗi:** `BlockError` có nút thử lại. Thao tác lỗi: toast một câu kèm cách sửa, hàng giữ nguyên.
- **Công ty chưa xác minh:** portal hiện đã chặn các trang ngoài hồ sơ công ty, không xử lý thêm.

## Sửa kèm

- Trang hồ sơ theo tin (`jobs/[id]/applications/page.tsx:224`) đang hiện mã trạng thái tiếng Anh (`PENDING`…). Thêm `lib/application-status.ts` (nhãn theo `APPLICATION_STATUS_LABEL` + tone `Badge`), dùng cho trang mới và sửa dòng này. Trang Candidate cũng có chỗ tương tự nhưng ngoài phạm vi.

## File

| File | Việc |
|---|---|
| `app/employer/(portal)/applications/page.tsx` | Trang mới. |
| `components/applications/*` | `ApplicationsToolbar`, `ApplicationRow` (bảng / thẻ), `ApplicationBulkActions`. |
| `hooks/useApplications.ts` | `useCompanyApplications(query)`, `useBulkUpdateApplicationStatus()`. |
| `lib/application-status.ts` | Nhãn + tone trạng thái hồ sơ. |
| `components/interviews/SelectionBar.tsx` | Prop `actions`, nhãn đơn vị. |
| `components/layout/EmployerPortalShell.tsx` | Mục "Ứng viên", chuyển badge. |
| `components/dashboard/employer/EmployerTaskBoard.tsx` | Đổi link "Xem tất cả". |
| `jobs/[id]/applications/page.tsx` | Nhãn trạng thái tiếng Việt. |
| `.claude/skills/sip-ui/SKILL.md` | Thêm "Ứng viên" vào dòng Layout nếu cần. |

## Các bước

| Bước | Nội dung | Điều kiện xong |
|---|---|---|
| 1 | Backend (plan backend). | Xem plan backend. |
| **2** | Toàn bộ frontend ở trên. | `tsc` và `npm run lint --workspace web` sạch ở các file của bước này. |
| **3** | Kiểm trên trình duyệt qua `:8080`, ở 375px, 768px, 1280px: không cuộn ngang; tab, lọc, tìm, sắp xếp (cả "Khớp kỹ năng nhiều nhất": thứ tự khớp với số trên hàng, giữ đúng qua các trang), phân trang và URL; chọn trên trang, đổi trang bỏ chọn; bàn phím và focus; menu "Ứng viên" và số chờ; link từ dashboard; đủ trạng thái tải / rỗng / lỗi. **Thao tác thật** (xem xét, rút gọn, từ chối, đặt lịch, hàng loạt) ghi vào DB và gửi email cho ứng viên ⇒ chỉ làm khi chủ dự án chỉ định dữ liệu test được phép đổi. | Ghi kết quả vào plan này. |

## Ngoài phạm vi

Sắp theo điểm phù hợp (Q1 backend); khớp kỹ năng gần nghĩa, xét số năm kinh nghiệm; lý do từ chối; "Được nhận" hàng loạt; lọc theo ngày; xuất file; giữ lựa chọn qua nhiều trang.

## Ghi chú triển khai — Bước 2 (2026-10-17)

**File:** trang mới `app/employer/(portal)/applications/page.tsx`; `components/applications/` gồm `ApplicationRow.tsx` (hàng bảng + thẻ, nút theo trạng thái, chữ khớp kỹ năng), `ApplicationsToolbar.tsx`, `ApplicationBulkActions.tsx`, `useApplicationsPageParams.ts`; `lib/application-status.ts`; sửa `hooks/useApplications.ts`, `components/interviews/SelectionBar.tsx`, `components/layout/EmployerPortalShell.tsx`, `components/dashboard/employer/EmployerTaskBoard.tsx`, `EmployerKpiGrid.tsx`, `dashboard/page.tsx`, `jobs/[id]/applications/page.tsx`. Không thêm dependency, không đổi backend.

**Khác với plan / chi tiết thêm:**
- **Thêm file `useApplicationsPageParams.ts`** (đọc/ghi URL, như `useInterviewsPageParams` của trang Lịch phỏng vấn). `status`, `sort` lạ ⇒ mặc định; `page` không phải số nguyên dương ⇒ 1; `q` dưới 2 ký tự ⇒ không tìm. `job` không phải tin của công ty (API trả 404) ⇒ tự bỏ khỏi URL. `sort` bằng mặc định của tab thì không ghi lên URL.
- **Ô tìm không dùng `useDebounce`** mà hẹn giờ 300ms ngay trong `onChange`. Với `useDebounce`, bấm Back đổi URL nhưng giá trị debounce cũ vẫn còn, effect có thể gửi lại từ khoá cũ. Gõ 1 ký tự thì hiện gợi ý "Nhập ít nhất 2 ký tự để tìm." (đặt ngoài `Input`, vì truyền `hint` làm ô nhập bị dựng lại và mất focus).
- **Hàng ở lại sau thao tác:** lần thao tác đầu tiên chụp lại danh sách của trang đang xem; danh sách được tải lại ngay để số trên tab và "trên N" đúng, nhưng các hàng vẫn hiện theo bản đã chụp, kèm trạng thái mới và nhãn xanh, cho tới khi đổi tab, bộ lọc, sắp xếp hay trang. Lựa chọn cũng gắn với tổ hợp đó nên đổi là bỏ chọn (D2). Thao tác xong sau khi đã đổi tổ hợp thì không ghi nhãn vào tổ hợp mới.
- **Hàng vừa xử lý vẫn có nút của trạng thái mới** (vd. vừa "Vào danh sách rút gọn" thì hiện "Đặt lịch"), để làm tiếp không phải đổi tab.
- **Làm mới dữ liệu khác:** `useUpdateApplicationStatus` (dùng chung với dashboard, chi tiết hồ sơ) nay tải lại cả danh sách cấp công ty và đánh dấu cũ lịch phỏng vấn. Hook hàng loạt đánh dấu cũ chi tiết các hồ sơ đã đổi, mọi danh sách hồ sơ theo tin, dashboard và lịch phỏng vấn. Trang tải lại ngay số tổng quan của dashboard để số trên menu "Ứng viên" đúng.
- **Nút của thanh thao tác** viết trong `ApplicationBulkActions`, không dùng `DashButton`: nền thanh tối nên "Từ chối" dùng chữ `red-200` có viền, ba nút còn lại nền trắng. Nút khoá dùng `aria-disabled` (không phải `disabled`) để vẫn nhận focus và hiện `title` nêu lý do. `SelectionBar` thêm `actions` và `unit` ("hồ sơ"); khi có `actions` thì không tự hiện "Tối đa 20", mà khối nút tự hiện "Tối đa 20 ứng viên mỗi lần đặt lịch" khi quá.
- **Bảng ≥ 768px** nằm trong vùng cuộn ngang `relative` để phòng khi cột không đủ chỗ (768–1023px không có sidebar nhưng nội dung chỉ ~736px). Cần xem ở bước 3.
- **Menu:** mục "Ứng viên" có `matchNested`, nên trang chi tiết `/employer/applications/[id]` cũng sáng mục này. Nhãn đọc của số chờ: "N hồ sơ chờ duyệt".
- **Link dashboard:** đổi chữ thành "Xem tất cả N hồ sơ" (bỏ "theo từng tin"), và hiện mỗi khi còn hồ sơ chờ (trước chỉ hiện khi nhiều hơn số hàng trên dashboard). Thêm theo chủ dự án: thẻ KPI "Hồ sơ mới trong 7 ngày" trước chỉ báo toast "đang cập nhật", nay dẫn sang `/employer/applications` (tab Tất cả, mới nhất trước; chưa lọc theo ngày). Bỏ prop `notify` của `EmployerKpiGrid` vì không còn chỗ dùng.
- **Trang hồ sơ theo tin:** chỉ sửa nhãn `Badge` như plan. Ô lọc trạng thái ở trang đó vẫn ghi kèm mã tiếng Anh, chưa sửa (ngoài phạm vi).
- Thông báo lỗi khi đổi từng hồ sơ: 409 hiện nguyên câu tiếng Việt của server; 400 / 404 ⇒ "Hồ sơ của … đã đổi trạng thái hoặc không còn. Tải lại trang để xem trạng thái mới."; lỗi khác ⇒ "Không cập nhật được hồ sơ. Kiểm tra kết nối rồi thử lại."

**Kiểm:** `tsc --noEmit` của `apps/web` sạch. `npm run lint --workspace web` không có lỗi hay cảnh báo nào ở các file trên; 15 lỗi, 23 cảnh báo còn lại là ở các file có sẵn, không liên quan. **Chưa kiểm trên trình duyệt** (bước 3).

## Ghi chú của chủ dự án

<!-- Để trống — dành cho chủ dự án. -->
