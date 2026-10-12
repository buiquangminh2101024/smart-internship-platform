# Lịch phỏng vấn của Employer (trang `/employer/interviews`) — Frontend

Song song: `docs/06-backend/employer-interviews/PLAN.md` (tham số API, phân trang, chi tiết hồ sơ kèm lịch).
Quy ước giao diện: `.claude/skills/sip-ui/SKILL.md`.
Quyết định đã chốt (2026-10-11 và 2026-10-12): `docs/temp/EMPLOYER_INTERVIEWS_DECISIONS.md` (D1–D19). Mock: `docs/temp/ui-compare/dashboard/employer-lich-da-dat.html`. Cả hai nằm trong `docs/temp` (gitignore, không commit), nên mọi điểm cần để code đều được chép lại trong file này.

**Trạng thái: ĐÃ LẬP KẾ HOẠCH (2026-10-11, cập nhật 2026-10-12: tab mặc định và tab "Chờ đặt lịch" theo D16–D19), CHỜ CHỦ DỰ ÁN DUYỆT. Chưa viết code. Còn 1 điểm cần chủ dự án xác nhận, xem mục cuối Phần 2.**

## Mục tiêu

- Trang mới `/employer/interviews` với hai tab: **Chờ đặt lịch** và **Lịch đã đặt** (D1). Tab "Lịch đã đặt" có hai chế độ **Theo tuần** và **Sắp tới** (D11–D13).
- Đổi / huỷ / đặt lịch ngay tại hồ sơ: `/employer/jobs/[id]/applications` và `/employer/applications/[id]` (D2).
- Thêm mục "Lịch phỏng vấn" vào menu Employer (D8). Link "Xem tất cả" ở hai nhóm lịch của dashboard trỏ về trang mới (D9).

## Phần 1 — Công nghệ và quy ước

- Không thêm dependency. Dùng sẵn: Next.js 16 (đọc `node_modules/next/dist/docs/` phần `useSearchParams`, `useRouter`, Suspense cho trang client trước khi viết route, theo `apps/web/AGENTS.md`), Tailwind v4, `@tanstack/react-query` v5 (`useInfiniteQuery` cho "Sắp tới", `useQuery` + `placeholderData: keepPreviousData` cho phân trang đánh số), `lucide-react` qua `Icon`.
- Chỉ dùng token màu. Lịch đã đặt dùng `brand-*` (Indigo); marigold chỉ cho "đang chờ con người xử lý" (tab Chờ đặt lịch, thời gian chờ). Không emoji.
- Giờ, ngày, số đếm dùng `font-num tabular-nums`. Chữ tối thiểu 13px. Motion 120–260ms, có `motion-reduce`.
- Giờ Việt Nam: dùng các hàm sẵn có trong `lib/dashboard-format.ts` (`vnTodayIso`, `formatVnTime`, `formatVnDayMonth`, `weekdayShort`, `initialsOf`) và `lib/interview-format.ts` (`vnIso`, `addDaysIso`, `vnDateAndMinutes`, `interviewEndMs`, `formatInterviewSpan`). Chỉ thêm hàm mới khi chưa có (vd. thứ Hai của tuần chứa một ngày).
- Dùng lại hộp thoại có sẵn trong `components/interviews/`: `InterviewDialog` (đặt / đổi lịch, có nút chuyển sang huỷ), `CancelInterviewDialog`, `BatchScheduleDialog`, `SelectionBar`, `useInterviewScheduling`.

## Phần 2 — Cấu trúc và liên kết

### Route

- `apps/web/src/app/employer/(portal)/interviews/page.tsx`: trang client, bọc phần đọc `useSearchParams` trong `Suspense` nếu tài liệu Next 16 yêu cầu.
- `EmployerPortalShell`: thêm `{ label: "Lịch phỏng vấn", icon: "calendar-days", href: "/employer/interviews" }` ngay sau "Tin tuyển dụng", và `interviews: "Lịch phỏng vấn"` vào `CRUMB_LABELS`. Chưa gắn số đếm lên mục menu (cần thêm dữ liệu cho shell; để sau nếu chủ dự án muốn).

### Trạng thái trên URL

| Tham số | Ý nghĩa |
|---|---|
| `tab=booked` | Tab "Lịch đã đặt". Không có thì là tab "Chờ đặt lịch" (D16). |
| `view=upcoming` | Chế độ "Sắp tới" (ngầm hiểu `tab=booked`). Không có thì là "Theo tuần" (D13). |
| `week=YYYY-MM-DD` | Thứ Hai của tuần đang xem. Bỏ khi là tuần hiện tại. Giá trị sai thì dùng tuần hiện tại. |
| `job=<jobPostId>` | Lọc theo tin, dùng chung cho cả hai tab. |
| `cancelled=1` | Hiện lịch đã huỷ (chỉ tab "Lịch đã đặt"). |
| `group=job` | Tab "Chờ đặt lịch": nhóm theo tin. Chỉ có hiệu lực khi không có `job`. |
| `sort=new` | Tab "Chờ đặt lịch": chờ ngắn nhất trước. Không có thì chờ lâu nhất trước. |
| `page=n` | Tab "Chờ đặt lịch": trang đang xem. Bỏ khi là trang 1. Giá trị sai thì dùng trang 1; vượt trang cuối thì backend trả trang cuối và URL được sửa theo. |

- Đổi tab, đổi chế độ và **đổi trang** dùng `router.push` để nút Back quay về đúng chỗ trước. Chuyển tuần, đổi bộ lọc, đổi cách hiển thị / sắp xếp, bật/tắt lịch đã huỷ dùng `router.replace`. Đổi bộ lọc tin, cách hiển thị hoặc sắp xếp thì về trang 1.
- Hook `useInterviewsPageParams()` đọc và ghi các tham số trên, là nguồn sự thật duy nhất cho tab, chế độ, tuần, trang và bộ lọc.

### Thành phần mới (`components/interviews/`)

| File | Vai trò |
|---|---|
| `useInterviewActions.tsx` | Tách từ `useInterviewTasks` trong `EmployerTaskBoard.tsx` (D2): hồ sơ đang chọn, hồ sơ vừa đặt lịch, buổi vừa đổi / huỷ, và các hộp thoại đặt / đổi / huỷ. Dashboard dùng lại, hành vi không đổi. Thêm tuỳ chọn `onChanged` để trang mới tải lại danh sách sau thao tác. |
| `AwaitingScheduleTab.tsx` | Tab "Chờ đặt lịch": hàng nút lọc theo tin, hai nút gạt Hiển thị / Sắp xếp, danh sách, phân trang, `SelectionBar`. |
| `AwaitingScheduleRow.tsx` | Một dòng hồ sơ chờ. Tách từ `AwaitingScheduleGroup` (`InterviewGroups.tsx`) để dashboard và tab dùng chung. Thêm prop `showJob` (ẩn tên tin khi nhóm theo tin). |
| `AwaitingJobDivider.tsx` | Dải phân cách của một tin khi nhóm theo tin (ô chọn, tên, số hồ sơ, "tiếp từ trang trước", "Chỉ xem tin này"). |
| `BookedInterviewsTab.tsx` | Tab "Lịch đã đặt": thanh công cụ, chọn chế độ, gọi `WeekView` hoặc `UpcomingView`. |
| `WeekView.tsx` | Chế độ Theo tuần: điều hướng tuần, `WeekStrip`, `DayGroupList`. |
| `UpcomingView.tsx` | Chế độ Sắp tới: dòng phân cách tháng, `DayGroupList`, "Tải thêm lịch". |
| `WeekStrip.tsx` | Dải 7 ô ngày. |
| `DayGroupList.tsx` | Danh sách nhóm ngày đóng/mở, dòng "Đang mở x/y ngày", nút "Về mặc định". Dùng chung cho hai chế độ. |
| `InterviewAgendaRow.tsx` | Một dòng buổi phỏng vấn (giờ, ô chữ cái đầu, tên + link hồ sơ, tên tin, hình thức + địa điểm, nút). |
| `ApplicationInterviewsCard.tsx` | Khối "Lịch phỏng vấn" ở trang chi tiết hồ sơ. |

Component mới dùng chung (`components/ui/`):

- `Pagination.tsx`: phân trang đánh số. Props `page`, `pageCount`, `onChange`, `label` (`aria-label` của `nav`). Hiện trang 1, trang cuối, một trang mỗi bên trang đang xem (điện thoại: không có trang lân cận), "…" cho khoảng trống; khoảng trống đúng một trang thì hiện số trang đó. Nút "Trang trước / Trang sau" có chữ ở màn rộng, chỉ còn icon (có `aria-label`) ở ≤720px. Trang đang xem `aria-current="page"`, nền `brand-600`. Ẩn khi chỉ có một trang. Repo chưa có component phân trang nào.

Chỉnh component có sẵn:

- `SelectionBar`: thêm prop tuỳ chọn `jobCount` (ghi "Đã chọn n ứng viên của m tin") và `elsewhereCount` (thêm dòng "Có n ứng viên đã chọn nằm ở trang khác hoặc tin khác."). Không truyền thì giữ nguyên chữ cũ, dashboard và trang theo tin không đổi.
- `SegmentedControl` (`components/dashboard/admin/AdminPanel.tsx`) đang dùng chữ 12px (`text-xs`), dưới mức 13px. Thêm hai prop **tuỳ chọn** `size="md"` (cao 36px, chữ 13px) và `fullWidth`; mặc định giữ nguyên để dashboard Admin không đổi.
- `InterviewGroups.tsx` (dashboard): đổi footer của hai nhóm (bước 8).

### Hook dữ liệu (`hooks/useInterviews.ts`)

| Hook | Ghi chú |
|---|---|
| `useEmployerInterviews(range, { jobPostId, includeCancelled })` | Mở rộng hook cũ (chế độ `range`). Thêm hai tuỳ chọn vào `queryKey`. |
| `useUpcomingInterviews({ jobPostId, includeCancelled })` | Mới, `useInfiniteQuery`, `scope=upcoming`, `getNextPageParam` = `nextCursor`. |
| `useAwaitingSchedulePage({ jobPostId, sort, group, page })` | Mới, `useQuery` trên `/employer/interviews/awaiting` (`pageSize=50`), `placeholderData: keepPreviousData` để trang cũ còn hiện (mờ, `aria-busy`) trong lúc tải trang mới. Trả `AwaitingSchedulePage` (`items`, `total`, `page`, `pageSize`, `jobCounts`). |
| `useAwaitingSchedule(jobPostId)` | Giữ chữ ký cũ cho trang theo tin, nhưng `queryFn` tải lần lượt mọi trang (`pageSize=100`) tới khi đủ `total`. Trang theo tin cần đủ hồ sơ để biết dòng nào chọn được (backend F4). |
| `useEmployerApplication(id)` | Kiểu trả về đổi sang `EmployerApplicationView` (có `interviews`). |

Mọi key vẫn bắt đầu bằng `EMPLOYER_INTERVIEWS_KEY`, nên `markStale` sau thao tác vẫn đánh dấu đủ.

### Liên kết

```
/employer/interviews (page.tsx)
  useInterviewsPageParams ─┬─ AwaitingScheduleTab ─ useAwaitingSchedulePage
                           │                       ├ AwaitingJobDivider, AwaitingScheduleRow, Pagination
                           │                       └ useInterviewActions (chọn nhiều, đặt lịch)
                           └─ BookedInterviewsTab ─┬─ WeekView ─ useEmployerInterviews (7 ngày)
                                                   └─ UpcomingView ─ useUpcomingInterviews
                              cả hai: DayGroupList → InterviewAgendaRow → useInterviewActions (đổi / huỷ)
Dashboard (EmployerTaskBoard) ─ useInterviewActions (thay useInterviewTasks)
/employer/jobs/[id]/applications ─ useInterviewActions (thêm đổi / huỷ)
/employer/applications/[id] ─ ApplicationInterviewsCard ─ useInterviewActions
```

### Điểm cần chủ dự án xác nhận

Tab mặc định (D16) và tab "Chờ đặt lịch" (D17–D19) đã chốt ngày 2026-10-12, xem Phần 2b. Còn một điểm:

1. **Sau khi đổi / huỷ ở tab "Lịch đã đặt".** Đề xuất: tải lại danh sách đang xem để buổi vừa đổi chuyển đúng sang ngày mới, buổi vừa huỷ biến mất (hoặc hiện nhãn "Đã huỷ" nếu đang bật "Hiện lịch đã huỷ"). Toast ghi giờ mới. Cách này khác dashboard (dashboard giữ dòng tại chỗ kèm nhãn), vì trang lịch phải đúng ngày giờ.

## Phần 2b — Đặc tả giao diện

### Đầu trang và tab

- Tiêu đề "Lịch phỏng vấn". Hai tab dạng gạch chân (`role="tablist"`, phím mũi tên trái/phải chuyển tab): "Chờ đặt lịch" kèm tổng số hồ sơ chờ (tổng `jobCounts`, marigold khi > 0), "Lịch đã đặt". Mặc định mở tab "Chờ đặt lịch" (D16).

### Tab "Chờ đặt lịch" (D16–D19)

Tab mặc định khi mở `/employer/interviews`. Không có khối riêng nào của tab này trùng với dashboard: dashboard chỉ hiện vài hồ sơ để báo có việc (link "Xem tất cả" dẫn về đây), tab là nơi xử lý hết theo từng tin.

- **Hàng nút lọc theo tin:** "Tất cả n" rồi mỗi tin còn hồ sơ chờ một nút kèm số (`aria-pressed`, nhóm có `aria-label="Lọc theo tin tuyển dụng"`). Số lấy từ `jobCounts`, không phụ thuộc trang hay bộ lọc. Tin hết hồ sơ chờ thì ẩn nút, trừ khi đang lọc đúng tin đó (nút hiện số 0). Nút đang chọn nền `brand-50`, viền `brand-300`, chữ `brand-700`. Các nút xuống dòng khi hẹp, không cuộn ngang.
- **Hai nút gạt** (`SegmentedControl size="md"`) dưới hàng nút lọc, mỗi nút có nhãn chữ nhỏ bên trái ("Hiển thị", "Sắp xếp"; điện thoại: nhãn ở trên, nút giãn hết ngang):
  - **Hiển thị:** "Theo thời gian | Nhóm theo tin". Chỉ hiện khi xem Tất cả.
  - **Sắp xếp:** "Chờ lâu nhất trước | Chờ ngắn nhất trước". Hiện với mọi bộ lọc.
- **Dòng tóm tắt** trên danh sách: bên trái ô "Chọn tất cả n hồ sơ trên trang này" (ba trạng thái), bên phải "Hồ sơ 31–40 trên 143" (`tabIndex={-1}`, đích focus khi đổi trang).
- **Dòng hồ sơ** (`AwaitingScheduleRow`, như dashboard): ô chọn, ô chữ cái đầu, tên (link hồ sơ), tên tin (ẩn khi nhóm theo tin), "vào vòng trong … trước" hoặc nhãn "Cần đặt lại lịch" + "chờ …" cho hồ sơ `INTERVIEWING` không còn lịch, thời gian chờ quá 2 ngày chữ `marigold-800` đậm, nút "Đặt lịch". Đặt lịch xong: dòng ở lại với nhãn xanh "Đã đặt lịch DD/MM · HH:mm", không còn ô chọn, cho tới khi đổi trang hoặc bộ lọc (D18).
- **Nhóm theo tin** (`AwaitingJobDivider`, không đóng/mở, D19). Trên một trang, các hồ sơ liền nhau của cùng tin nằm dưới một dải phân cách:
  - Dạng `──( ☐ Tên tin · n hồ sơ )──────── Chỉ xem tin này`: vạch ngắn 16px `brand-300`; nhãn bo tròn nền `brand-50`, viền `brand-200` chứa ô chọn (ba trạng thái, chọn các hồ sơ của tin đó trên trang này), tên tin là `h3` chữ `brand-800` (cắt "…" nếu dài), "n hồ sơ" lấy từ `jobCounts`; vạch dài 1px `brand-200`; link chữ "Chỉ xem tin này" (đặt bộ lọc tin, focus chuyển sang nút lọc tương ứng).
  - Tin bắt đầu từ trang trước thì nhãn thêm "· tiếp từ trang trước" (`text-muted`).
  - Mỗi nhóm là một `section` có `aria-labelledby` trỏ vào `h3`.
  - Điện thoại: bỏ vạch ngắn, link "Chỉ xem tin này" và chữ "tiếp từ trang trước"; nhãn và vạch dài vẫn giữ.
- **Phân trang** (`Pagination`) dưới danh sách, 50 hồ sơ mỗi trang. Đổi trang: cuộn về dòng tóm tắt, chuyển focus vào "Hồ sơ a–b trên n", vùng `aria-live` báo "Trang n". Trong lúc tải, trang cũ vẫn hiện nhưng mờ (`aria-busy`).
- **Chọn nhiều:** lựa chọn (Map theo `applicationId`) giữ qua trang, bộ lọc, cách hiển thị và sắp xếp. `SelectionBar` ghi "Đã chọn n ứng viên của m tin · Bỏ chọn · Lên lịch phỏng vấn"; quá 20 thì nút mờ kèm "Tối đa 20 ứng viên mỗi lần" (như hiện có); có hồ sơ đã chọn không nằm trên trang đang xem thì thêm dòng "Có n ứng viên đã chọn nằm ở trang khác hoặc tin khác."
- **Giảm rủi ro dồn trang (D18):** dòng vừa đặt lịch giữ tại chỗ kèm nhãn, không tải lại trang ngay. Khi đổi trang / bộ lọc / cách hiển thị / sắp xếp thì tải dữ liệu mới, nên hồ sơ đã đặt lịch biến mất và số trang tính lại. Sau thao tác chỉ đánh dấu dữ liệu cũ (`markStale`) và tải lại `jobCounts` để số trên tab và nút lọc đúng ngay.
- **Trạng thái:** đang tải lần đầu (khung xám), lỗi ("Chưa tải được hồ sơ chờ đặt lịch" + "Thử lại"), rỗng ("Chưa có hồ sơ nào chờ đặt lịch" / khi lọc tin "Tin này chưa có hồ sơ nào chờ đặt lịch", kèm câu "Hồ sơ bạn chuyển sang Lọt vào vòng trong sẽ hiện ở đây để đặt lịch phỏng vấn.").

### Tab "Lịch đã đặt" — chung hai chế độ

- **Thanh công cụ:** đầu thanh là nút gạt "Theo tuần | Sắp tới" (`SegmentedControl size="md"`, `aria-pressed`), sau đó là các nút của chế độ Theo tuần, rồi lọc theo tin (`Select`) và ô "Hiện lịch đã huỷ". Điện thoại: nút gạt giãn hết ngang, các phần xếp dọc.
- **Nhóm ngày (`DayGroupList`):**
  - Tiêu đề nhóm là nút (`aria-expanded`, `aria-controls`): mũi tên, thứ + ngày, nhãn "Hôm nay", số buổi. Khi đóng hiện tối đa 4 giờ phỏng vấn (+n); khi mở hiện tổng thời lượng.
  - Mặc định chỉ mở **ngày gần nhất còn lịch**: hôm nay nếu có lịch, nếu không thì ngày đầu tiên sau hôm nay có lịch. Tuần đã qua hết thì không mở sẵn ngày nào. Ở chế độ Sắp tới là nhóm đầu tiên.
  - Mở một ngày không tự đóng ngày khác. Nút "Về mặc định" kèm "Đang mở x/y ngày", mờ khi đang ở mặc định.
  - Trạng thái đóng/mở lưu trong state của trang theo khoá ngày (`YYYY-MM-DD`), nên chuyển tuần rồi quay lại vẫn giữ. Tải lại trang thì về mặc định. Không dùng `localStorage`.
  - Trượt 200ms bằng `grid-template-rows`, phần đang đóng đặt `inert`.
- **Dòng (`InterviewAgendaRow`):** giờ bắt đầu và "đến HH:mm"; ô chữ cái đầu tên; tên ứng viên (link `/employer/applications/[id]`); tên tin; icon `video` hoặc `map-pin` kèm địa điểm; nút "Đổi lịch" và "Huỷ".
  - Buổi đã qua giờ, tính theo **giờ bắt đầu** vì API chặn đổi/huỷ từ lúc đó (backend F1): dòng mờ, nhãn "Đã qua giờ", không có nút.
  - Buổi đã huỷ: nhãn "Đã huỷ", hiện lý do huỷ, không có nút.
  - "Huỷ" mở `CancelInterviewDialog`; "Đổi lịch" mở `InterviewDialog` kiểu `reschedule`.
- **Lỗi khi thao tác:** dùng thông báo có sẵn trong hộp thoại; xong thì toast.

### Chế độ Theo tuần (D11)

- Nút tuần trước / tuần sau (icon-only, có `aria-label`), nhãn khoảng tuần (`12/10 – 18/10/2026`), nút "Tuần này" (mờ khi đang ở tuần hiện tại).
- Dữ liệu: `useEmployerInterviews` với `from` = thứ Hai 00:00, `to` = thứ Hai tuần sau 00:00 (giờ Việt Nam).
- **Dải tuần:** 7 ô. Hôm nay nền `brand-50`, viền `brand-200`, chữ "Hôm nay". Mỗi ô: thứ, ngày, số buổi, tối đa 3 buổi (giờ + tên rút gọn), dòng "+n buổi". Ngày trống ghi "Trống". Buổi đã qua giờ chữ nhạt; buổi đã huỷ gạch ngang (chỉ khi bật "Hiện lịch đã huỷ").
- Bấm ngày hoặc "+n buổi": mở nhóm ngày đó và cuộn tới. Bấm tên: mở nhóm, cuộn tới dòng, làm nổi khoảng 2 giây (nền `brand-50`, viền `brand-300`), chuyển focus vào link tên.
- Điện thoại (≤720px): 7 ô vừa một hàng, mỗi ô chỉ còn thứ, số ngày và số buổi; tiêu đề nhóm bỏ phần năm; dòng xếp dọc, hai nút giãn hết ngang.
- Rỗng: "Tuần này chưa có buổi phỏng vấn nào" (tuần khác: "Tuần 19/10 – 25/10 chưa có buổi phỏng vấn nào") + nút "Mở Chờ đặt lịch".

### Chế độ Sắp tới (D12–D14)

- Ẩn điều hướng tuần và dải tuần; giữ lọc tin và "Hiện lịch đã huỷ". Đổi chế độ hoặc bộ lọc thì tải lại từ trang đầu.
- Danh sách bắt đầu từ **đầu ngày hôm nay** (backend lo), nên nhóm "Hôm nay" có cả buổi đã qua giờ.
- Sang tháng mới có dòng phân cách `h2` "Tháng 10/2026" (chữ `text-muted` 13px, kẻ ngang `border-default`); tiêu đề nhóm ngày khi đó là `h3`.
- Dòng tóm tắt: "Đã tải N buổi từ hôm nay · Đang mở x/y ngày". Không ghi tổng (API không trả).
- Gộp các trang thành một danh sách, **bỏ trùng theo `id`**, rồi nhóm theo ngày. Nhờ vậy nếu backend phải chia một ngày quá đông qua hai trang (chạm trần 100), nhóm vẫn gộp đúng.
- **Tải thêm:** nút "Tải thêm lịch" (secondary, giữa; điện thoại giãn hết ngang), không tự tải khi cuộn. Đang tải: nút `disabled`, ghi "Đang tải…". Tải xong: focus ở lại nút, vùng `aria-live="polite"` báo "Đã tải thêm n buổi". Hết dữ liệu: thay nút bằng dòng "Đã hiện hết lịch sắp tới." (`tabIndex={-1}`) và chuyển focus vào đó.
- **Lỗi khi tải thêm:** giữ nguyên danh sách đã có; dưới nút hiện một dòng chữ đỏ "Chưa tải thêm được. Kiểm tra kết nối rồi bấm lại." và báo qua `aria-live`; nút trở lại "Tải thêm lịch" để thử lại.
- Rỗng: "Chưa có buổi phỏng vấn nào từ hôm nay trở đi"; khi lọc tin: "Tin này chưa có buổi phỏng vấn nào từ hôm nay trở đi". Kèm nút "Mở Chờ đặt lịch".
- Lỗi trang đầu: "Chưa tải được lịch sắp tới" + "Thử lại".

### Trạng thái chung

Đang tải: khung xám (`BlockSkeleton`). Lỗi: `BlockError` hoặc một câu + "Thử lại". Kiểm tra thêm trạng thái nhiều dữ liệu (một tuần 40 buổi, một ngày 15 buổi).

### Trang theo tin `/employer/jobs/[id]/applications`

- Badge "Đã có lịch DD/MM" giữ nguyên; cột "Thao tác" thêm nút "Đổi lịch" (mở `InterviewDialog` kiểu `reschedule`, trong hộp có lối sang huỷ) cho hồ sơ có lịch sắp tới.
- `useEmployerInterviews` gọi kèm `jobPostId` của tin để không tải lịch của mọi tin.
- `useAwaitingSchedule(jobPostId)` tải đủ mọi trang (xem Hook).
- Sau thao tác: dùng `useInterviewActions` với `onChanged` tải lại hai truy vấn trên của trang.

### Trang chi tiết hồ sơ `/employer/applications/[id]`

- Thêm `ApplicationInterviewsCard` ở cột phải, trên khối "Chuyển trạng thái":
  - Có lịch sắp tới: ngày giờ, thời lượng, hình thức, địa điểm (link nếu là URL họp, theo `isMeetingUrl`), ghi chú; nút "Đổi lịch" và "Huỷ lịch".
  - Hồ sơ `SHORTLISTED`, hoặc `INTERVIEWING` không còn lịch sắp tới: nút "Đặt lịch phỏng vấn" (mở `InterviewDialog` kiểu `schedule`). Trạng thái khác: không có nút, chỉ ghi "Chỉ đặt lịch được khi hồ sơ ở bước Lọt vào vòng trong."
  - "Lịch sử" (buổi đã qua giờ và buổi đã huỷ kèm lý do), mới nhất trước, mặc định hiện 3 buổi, có nút "Xem thêm".
- Hộp thoại cần `EmployerInterview` / `AwaitingScheduleApplication` đầy đủ: dựng từ `ApplicationInterview` + các trường của hồ sơ (`candidateName` từ `candidate.fullName`, `jobPostId`, `jobPostTitle`, `applicationId`) bằng một hàm nhỏ trong `ApplicationInterviewsCard`. Kiểm tra lại các hộp thoại có dùng `waitingSince` không; nếu có thì lấy `updatedAt` của hồ sơ.
- Sau thao tác: ghi ngay kết quả API vào cache `["employer", "applications", id]` (`setQueryData`, D3), rồi `markStale` vẫn tải lại chi tiết ở nền vì đặt lịch có thể đổi trạng thái hồ sơ (`SHORTLISTED` → `INTERVIEWING`).
- Không sửa khối "Chuyển trạng thái" hay các phần khác của trang (ngoài phạm vi).

## Phần 3 — Các bước thực hiện

Làm sau khi backend bước 1–5 xong (kiểu dùng chung và API mới phải có trước).

1. **Đọc tài liệu Next 16** về `useSearchParams`, `useRouter().push/replace`, Suspense cho trang client.
2. **Hook dữ liệu** trong `hooks/useInterviews.ts` và kiểu trả về của `useEmployerApplication` (Phần 2).
3. **Tách `useInterviewActions`** khỏi `EmployerTaskBoard.tsx`; dashboard dùng lại. Kiểm tra dashboard: chọn nhiều, đặt lịch đơn và hàng loạt, đổi, huỷ, nhãn sau thao tác như trước.
4. **Component dùng chung**: `SegmentedControl` thêm `size`, `fullWidth` (kiểm tra dashboard Admin không đổi); `SelectionBar` thêm `jobCount`, `elsewhereCount` (kiểm tra dashboard và trang theo tin không đổi); `Pagination` mới; tách `AwaitingScheduleRow` khỏi `InterviewGroups.tsx`.
5. **Khung trang** `/employer/interviews`: `useInterviewsPageParams`, tab, menu và breadcrumb trong `EmployerPortalShell`.
6. **Tab "Lịch đã đặt"**: `DayGroupList`, `InterviewAgendaRow`, `WeekView` + `WeekStrip`, rồi `UpcomingView`.
7. **Tab "Chờ đặt lịch"**: hàng nút lọc, hai nút gạt, danh sách theo thời gian, rồi nhóm theo tin (`AwaitingJobDivider`), phân trang, thanh chọn.
8. **Dashboard** (`InterviewGroups.tsx`): nhóm "Hồ sơ chờ đặt lịch" thay nút mở rộng tại chỗ bằng link "Xem tất cả n hồ sơ" → `/employer/interviews`; nhóm "Lịch phỏng vấn sắp tới" thêm link "Xem tất cả" → `/employer/interviews?view=upcoming` cạnh dòng "Còn n buổi khác trong 7 ngày tới".
9. **Trang theo tin** và **trang chi tiết hồ sơ** (Phần 2b).
10. **Kiểm chứng** (mục dưới).
11. Cập nhật `FEATURE_BACKLOG.md`: bỏ 📌 và đánh dấu xong ba mục lịch phỏng vấn; ghi trạng thái vào đầu file này.

### Kiểm chứng

- `tsc` và `npm run lint --workspace web`.
- Xem trên trình duyệt (skill `run` hoặc `claude-in-chrome`) ở 375px và ≥1280px, không có cuộn ngang:
  - Theo tuần: tuần hiện tại, tuần trước, tuần trống; bấm ngày / tên trên dải tuần; nhóm đóng/mở, "Về mặc định", giữ trạng thái khi chuyển tuần.
  - Sắp tới: tải thêm tới hết, phân cách tháng, lỗi khi tải thêm (chặn mạng trong DevTools), lọc tin, bật lịch đã huỷ.
  - URL: mở thẳng `?view=upcoming&job=…`, `?week=…`, `?tab=booked`; nút Back sau khi đổi tab / chế độ.
  - Đổi / huỷ từ cả bốn nơi (trang mới, dashboard, trang theo tin, chi tiết hồ sơ); buổi đã qua giờ không có nút.
  - Chờ đặt lịch: khoảng 140 hồ sơ để thấy dải số trang có "…"; đủ 4 tổ hợp Hiển thị × Sắp xếp; nhóm kéo sang trang sau có "tiếp từ trang trước"; "Chỉ xem tin này"; chọn nhiều qua hai trang và hai tin rồi đặt hàng loạt (tối đa 20); đặt lịch rồi sang trang sau, số trang và số trên nút lọc cập nhật; URL `?group=job&sort=new&page=3` mở đúng trạng thái, Back quay lại trang trước.
- Bàn phím: chuyển tab bằng mũi tên, mở/đóng nhóm bằng Enter/Space, focus sau "Tải thêm" và sau khi đóng hộp thoại; icon-only button có nhãn; tương phản chữ marigold dùng `marigold-800`.

## Phần 4 — Ghi chú của chủ dự án

<!-- Dành cho chủ dự án. Claude Code không tự ghi vào đây. -->
