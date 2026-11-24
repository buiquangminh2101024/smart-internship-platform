# Chấm điểm chất lượng tin và duyệt / từ chối hàng loạt — Frontend

> **Trạng thái: ĐÃ CHỐT CÂU HỎI, chờ duyệt để code (lập 2026-11-20).** Câu hỏi Q1–Q7 chốt ở plan backend. Chưa code. Làm sau backend (`docs/06-backend/job-quality-moderation/PLAN.md`). Quyết định kiến trúc: AD-29. Mọi giao diện theo skill `sip-ui` (token, component có sẵn: `Badge`, `Button`, `Card`, `StatCard`, `Dialog`, `ConfirmDialog`, `Select`, `Toast`). Đọc `sip-ui` trước khi code.

## Mục tiêu

- Hàng đợi kiểm duyệt chia theo ba vùng điểm, xem được hết tin (không còn kẹt ở trang đầu), sắp theo thời điểm gửi duyệt hoặc theo điểm.
- Admin chọn nhiều tin rồi duyệt hoặc từ chối một lần; tin trong vùng đề xuất được chọn sẵn.
- Trang chi tiết tin hiện bảng điểm theo từng tiêu chí, kèm lý do bị trừ, thay cho phần kiểm tự động đang tính trên client.

Ý nghĩa của các tiêu chí, mức trừ và ba vùng: xem mục "Thuật toán chấm điểm" trong plan backend. Frontend chỉ hiển thị kết quả server trả về, **không tự tính điểm**.

## Các bước

### Thực hiện theo đợt (chốt 2026-11-20)

Các bước F1–F6 bên dưới giữ nguyên nội dung, chỉ gộp lại khi code:

| Đợt | Gồm | Ghi chú |
| --- | --- | --- |
| 1 | F1 + F4b | Type, hook, nhãn vùng, loại thông báo mới; thêm luôn component huy hiệu điểm dùng chung cho F2 và F4. |
| 2 | F2 + F3 | Cùng trang `/admin/jobs`. Tách danh sách lý do từ chối chọn sẵn thành hằng số dùng chung ở đợt này (F3 và F4 cùng dùng). |
| 3 | F4 + F5 | Trang chi tiết và hộp "Cách tính điểm"; gắn thêm nút này vào trang hàng đợi. |
| 4 | F6 | Kiểm toàn bộ trên trình duyệt. Mỗi đợt trước vẫn chạy type check và kiểm nhanh phần vừa làm. |

**Đợt 1 — đã làm (2026-11-20):**

- Type đã có sẵn từ backend bước 9, không phải thêm.
- `useJobPosts.ts`:
  - `useAdminJobPosts({ status, band, sort })` dùng `useInfiniteQuery`; `total` nằm ở `pages[0].total`.
  - Thêm `useAdminJobPostIds` (mutation, gọi khi bấm nút), `useBulkModerateJobPosts`, `fetchBulkModerationResult` (hỏi lại lô còn `pending`) và `useRescoreJobQuality`.
  - Sau mỗi thao tác, invalidate `adminJobPosts`, `adminJobPostStats` và `adminJobPost`.
  - `useAdminJobPostStats` không phải sửa, vì type đã có `pendingByBand`.
- `job-post-display.ts`: thêm `JOB_QUALITY_BAND_LABEL`, `JOB_QUALITY_BAND_ORDER` và `topQualityIssues` (cờ chặn trước, rồi theo mức trừ).
- Component mới `components/admin/JobQualityBadge.tsx`: hiện số điểm và nhãn vùng; tin chưa chấm hiện "Chưa chấm".
- Trang `/admin/jobs` chỉ sửa tối thiểu cho khớp hook mới, giao diện giữ nguyên tới đợt 2.
- F4b:
  - Ánh xạ nhóm và nhãn nút "Kiểm tra tin" đã có từ backend; nội dung thông báo do server soạn.
  - Thêm `JOB_POST_QUALITY_DROPPED` vào `WARNING_NOTIFICATION_TYPES`, nên thông báo hiện icon tam giác cảnh báo, nền và viền marigold.
  - **Lệch so với F4b:** F4b ghi màu đỏ, nhưng sip-ui quy định mọi thông báo cảnh báo dùng marigold, kể cả tin bị hạ. Để đồng bộ, đợt này dùng marigold; nếu muốn đỏ thì `NotificationCenter` phải có thêm một tông màu mới.
- Kiểm: `tsc` web sạch; eslint sạch trên các file đã sửa (28 lỗi còn lại đều có từ trước, ở file khác). Chưa kiểm trên trình duyệt: chuông thông báo kiểm ở đợt 4 (F6 bước 9), danh sách kiểm ở đợt 2.

**Đợt 2 — đã làm (2026-11-20):**

- **Trang `/admin/jobs`** viết lại:
  - Trạng thái, vùng và sắp xếp nằm trên URL (`router.replace`). Sắp xếp mặc định không ghi lên URL. Giá trị sai thì quay về mặc định.
  - Tab vùng gạch chân, có số đếm từ `pendingByBand`, phím ←/→/Home/End. Tab "Chưa chấm" chỉ hiện khi có tin.
  - Ô sắp xếp: khi lọc "Chờ duyệt" có Gửi trước / Điểm cao nhất / Điểm thấp nhất; khi lọc "Đang hiển thị" có Mới tạo trước / Điểm thấp nhất / Điểm cao nhất; trạng thái khác không có ô này.
  - Mỗi dòng tin có ô chọn (chỉ tin chờ duyệt), ngày gửi duyệt (`submittedAt`, không có thì dùng ngày tạo), `JobQualityBadge` và 1–2 lỗi nặng nhất (cờ chặn chữ đỏ).
  - Cuối danh sách có "Đang hiện X / N tin" và nút "Xem thêm". Mỗi tab có câu riêng khi rỗng, có trạng thái lỗi và nút "Thử lại".
- **Chọn và thao tác hàng loạt:**
  - Ô "Chọn N tin đang hiện" (ba trạng thái).
  - Nút "Chọn tất cả tin trong vùng" chỉ có ở tab Đề xuất duyệt và Đề xuất từ chối. Nút này tải thêm trang cho tới khi mọi tin được chọn đều có trên trang, để hộp thoại hiện đủ tên và lý do.
  - Đổi bộ lọc thì bỏ chọn.
  - Thanh chọn dùng lại `SelectionBar`. Chọn quá 50 tin thì hai nút mờ và có câu "Mỗi lần xử lý tối đa 50 tin".
- **Hộp thoại** (`components/admin/JobBulkDialogs.tsx`):
  - `BulkApproveDialog` dùng `Dialog` chứ không dùng `ConfirmDialog`, vì phải liệt kê tên tin. Tin ngoài vùng đề xuất duyệt được cảnh báo, kèm nút "Bỏ chọn K tin này".
  - `BulkRejectDialog` hiện lý do tự sinh của từng tin. Có tuỳ chọn "Dùng một lý do chung" và cảnh báo khi có tin sẽ bị bỏ qua. Nút ghi đúng số tin sẽ bị từ chối; khoá khi không có tin nào từ chối được.
  - `BulkResultDialog` liệt kê các tin bị bỏ qua kèm lý do.
  - Lô còn `pending` thì trang hỏi lại mỗi 2 giây, tối đa 30 giây. Xong thì hiện toast số tin đã xử lý; nếu vẫn chưa xong thì hiện toast nhắc tải lại trang sau.
- **Lý do chọn sẵn:** tách thành `JOB_REJECT_PRESET_REASONS` + `composeRejectReason` trong `job-post-display.ts`. `RejectJobModal` dùng lại, hành vi không đổi.
- **Kiểm:**
  - `tsc` và eslint của các file đã sửa đều sạch.
  - Trình duyệt, desktop, qua 8080 (Admin): tab có số đếm (18 / 0 / 0 / 18), URL đổi theo tab, chọn tất cả trong vùng chọn được 18 tin.
  - Đã mở hộp duyệt và hộp từ chối: hộp từ chối báo 11 tin chưa có lý do, nút ghi "Từ chối 7 tin". Không bấm xác nhận, vì đây là dữ liệu thật trên Neon.
  - Màn hình 375px chưa kiểm được, vì Chrome không thu nhỏ cửa sổ; để sang đợt 4.

**Đợt 3 — đã làm (2026-11-20):**

- **Thẻ "Điểm chất lượng"** (`components/admin/JobQualityCard.tsx`):
  - Hiện ở mọi trạng thái của tin, rộng hết trang, đặt ngay dưới thẻ tiêu đề tin. Không để ở cột phải vì cột này dính khi cuộn; sáu tiêu chí mở ra sẽ dài hơn màn hình.
  - Điểm tổng, nhãn vùng, cờ chặn nền đỏ ("… — không thể vào vùng đề xuất duyệt").
  - Sáu tiêu chí dùng `<details>`: tên, trọng số, thanh điểm (dưới 40 đỏ, dưới 80 marigold, còn lại xanh), điểm số. Mở ra thấy từng lỗi và "−N". Tiêu chí không có lỗi thì hiện dấu tích, không mở được.
  - Dòng cuối: "Chấm lúc HH:mm DD/MM/YYYY {lý do} · phiên bản thuật toán vN", kèm "Đã có phiên bản mới" khi `outdated`. Có nút "Chấm lại".
  - Tin chưa có điểm: "Tin chưa được chấm." kèm nút "Chấm lại".
- **Trang chi tiết** `/admin/jobs/[id]`:
  - Phần kiểm tự động của `ReviewChecklist` đã bỏ. Kinh nghiệm, ngành phù hợp và phần "Admin tự đánh giá" giữ nguyên.
  - Hiện "Ngày gửi duyệt" theo `submittedAt`.
  - Tin đang hiển thị bị đề xuất từ chối hoặc có cờ chặn: cảnh báo đỏ phía trên nút Thu hồi tin.
  - Gặp lỗi 409: đóng hộp thoại, báo "Tin đã được xử lý bởi quản trị viên khác" và tải lại tin.
  - Từ chối: `RejectJobModal` có thêm prop `initialReason`. `splitRejectReason` tách lý do tự sinh thành các ô chọn sẵn và phần chi tiết. Thu hồi tin không truyền prop này nên hành vi giữ nguyên.
- **F5:**
  - Nội dung chú giải ở `lib/job-quality-legend.ts`, kèm `QUALITY_LEGEND_VERSION` và nhãn lý do chấm.
  - `JobQualityLegendButton` mở `Dialog` gồm sáu tiêu chí và trọng số, ba vùng, cờ chặn và một câu nhắc Admin vẫn là người quyết định.
  - Nút đặt ở đầu trang hàng đợi và trên thẻ điểm.
- **Kiểm:**
  - `tsc` và eslint đều sạch.
  - Trình duyệt, desktop: hộp "Cách tính điểm" mở và đóng bằng Esc; trang chi tiết tin `clargedemojob0150` hiện 98/100, Đề xuất duyệt, tiêu chí 2 được 90 và mở ra thấy lỗi "−10", dòng "Chấm lúc … do hệ thống chấm bổ sung · phiên bản thuật toán v1".
  - `splitRejectReason` và `composeRejectReason` ghép ngược ra đúng chuỗi ban đầu với 3 mẫu.
  - Để sang đợt 4 (F6), vì phải ghi dữ liệu: điền sẵn lý do trên tin thật có cờ chặn, nút "Chấm lại", lỗi 409, cảnh báo ở nút Thu hồi.

#### Đợt 4 — đã làm (2026-11-21)

Kiểm F6 qua gateway 8080 trên Neon, chỉ dùng tin thử `[Kiểm AD-29]` của Mây Xanh, không đụng 18 tin demo đang chờ duyệt. Không sửa code.

- **Chuẩn bị:**
  - Chủ dự án bật "Yêu cầu duyệt tin" cho Mây Xanh; kiểm xong mình tắt lại.
  - Phần employer và ứng viên làm bằng API: gửi lại F và M, tạo #3 và #4 bằng cách chép nội dung G1. Phần Admin làm trên giao diện.
- **Bước 1:** sau khi gửi duyệt, các tab hiện 19 / 0 / 2 / 21. Tin M được 73 điểm, đề xuất từ chối, có hai lỗi nặng nhất.
- **Bước 2:**
  - Tin F: 78 điểm, có cờ chặn.
  - Hộp Từ chối tick sẵn "Vi phạm chính sách", ô chi tiết điền sẵn câu về "phí đào tạo".
  - Bấm "Chấm lại": nút hiện đang chạy, dòng cuối đổi thành "00:10 … do Admin chấm lại".
- **Bước 3:**
  - Duyệt #3 ở trang chi tiết.
  - Duyệt hàng loạt #4 cùng M và F: hộp cảnh báo "2 tin không nằm trong vùng đề xuất duyệt" kèm tên và điểm. "Bỏ chọn 2 tin này" làm hộp còn "Duyệt 1 tin".
  - Sau khi duyệt: số đếm còn 18 / 0 / 2 / 20; #4 hiện ở trang công khai; Mây Xanh nhận thông báo "đã được duyệt".
  - Không bấm "Chọn tất cả tin trong vùng" thật, để giữ nguyên 18 tin demo.
- **Bước 4:**
  - Từ chối hàng loạt M và F, không dùng lý do chung. Hộp hiện lý do tự sinh của từng tin.
  - Toast "Đã từ chối 2 tin". Mây Xanh nhận đúng lý do riêng của từng tin.
- **Bước 5:**
  - Tab 2 đang mở F (vẫn là "Chờ duyệt") khi F bị từ chối ở tab 1. Bấm Duyệt ở tab 2 thì hiện "Tin đã được xử lý bởi quản trị viên khác…", trang tải lại và F thành Nháp.
  - Nếu tab 2 được focus trước khi bấm, React Query tự tải lại và nút Duyệt biến mất. Đây cũng là hành vi đúng.
- **Bước 6:**
  - Ở bộ lọc Đang hiển thị, "Xem thêm" đưa danh sách từ 20 / 291 lên 40 / 291 tin.
  - Tab, sắp xếp và trạng thái nằm trên URL; tải lại trang vẫn giữ.
  - Hàng đợi chờ duyệt có 21 tin ⇒ "Xem thêm" tải được tin thứ 21.
- **Bước 7:** cửa sổ không đổi cỡ được, nên đo bằng iframe rộng 375px.
  - Trang hàng đợi, thanh chọn và trang chi tiết (mở hết sáu tiêu chí) đều không cuộn ngang.
  - Hộp duyệt rộng 342px; hộp từ chối hàng loạt chiếm cả màn hình.
  - Hàng tab vùng tự cuộn trong khung của nó.
- **Bước 8 (Q4):**
  - Ứng viên demo báo cáo #3 ⇒ M được chấm lại: uy tín công ty 100 → 90, tổng 73 → 72, dòng "Chấm lúc … khi công ty có báo cáo vi phạm…".
  - Sau đó Admin bỏ qua báo cáo ở trang Báo cáo vi phạm.
- **Bước 9 (Q7):**
  - Sửa #4 đang hiển thị, thêm "đóng phí đào tạo" ⇒ chuông và trung tâm thông báo có "Tin đang hiển thị bị tụt điểm" (84 điểm, marigold).
  - Bấm thông báo ⇒ mở trang chi tiết #4, thấy cờ chặn, dòng "khi tin đang hiển thị được sửa", và cảnh báo đỏ trên nút Thu hồi tin.
  - Sửa lần hai mà vẫn còn phí ⇒ không có thông báo thứ hai.
- **Dọn dữ liệu:**
  - Quyền lợi của #4 về như cũ; #3 và #4 đã đóng; F và M ở Nháp.
  - Báo cáo thử đã bỏ qua; "Yêu cầu duyệt tin" của Mây Xanh đã tắt.
- **Ghi nhận, chưa sửa:**
  - ~~Ở bộ lọc Đang hiển thị, "Điểm thấp nhất" xếp tin "Chưa chấm" lên đầu.~~ Nhận định sai, đã kiểm lại (2026-11-21):
    - `moderationOrderBy` đã dùng `nulls: "last"` cho cả `score_asc` lẫn `score_desc`, nên tin chưa chấm vốn đã xếp cuối.
    - Hai cách sắp xếp cho cùng danh sách toàn tin "Chưa chấm", vì hiện **không tin đang hiển thị nào có điểm**. Script `score-job-quality` mới ghi tin PENDING; tin thử từng được chấm đều đã đóng.
    - Muốn "Điểm thấp nhất" có ích ở bộ lọc Đang hiển thị thì chủ dự án chạy `score-job-quality -- --status PUBLISHED` (chạy `--dry-run` trước). Lệnh này ghi lên Neon.
  - `Toast` dùng chung không nằm trong vùng `aria-live`, nên trình đọc màn hình không đọc kết quả duyệt / từ chối. Đây là lỗi có sẵn của component, ngoài phạm vi đợt này.

### F1 — Type và hook

- Type mới trong `packages/shared-types` (backend bước 9): `JobQualityDto`, `JobQualityBand`, `BulkModerationResult`, `JobPost.submittedAt`, `JobPost.quality`, `JobPostStats.pendingByBand`.
- `apps/web/src/hooks/useJobPosts.ts`:
  - `useAdminJobPosts({ status, band, sort })` chuyển sang `useInfiniteQuery` (dùng `nextCursor`, điểm 1); trả thêm `total`.
  - `useAdminJobPostStats` đọc thêm `pendingByBand`.
  - Hook mới: `useBulkModerateJobPosts` (`bulk-approve` / `bulk-reject`), `useRescoreJobQuality`, `useAdminJobPostIds` (lấy ≤ 50 id theo bộ lọc cho nút "Chọn tất cả").
  - Sau mỗi thao tác: invalidate `adminJobPosts`, `adminJobPostStats`, `adminJobPost`.
- Nhãn và màu vùng đặt ở `apps/web/src/lib/job-post-display.ts`: *Đề xuất duyệt* (success), *Cần xem kỹ* (marigold), *Đề xuất từ chối* (đỏ), *Chưa chấm* (trung tính).

### F2 — Trang hàng đợi `/admin/jobs`

- Thẻ thống kê giữ nguyên (Chờ duyệt / Đang hiển thị / Đã kết thúc).
- Khi lọc "Chờ duyệt": hàng tab con theo vùng, có số đếm từ `pendingByBand`: **Đề xuất duyệt · Cần xem kỹ · Đề xuất từ chối · Tất cả**. Tab "Chưa chấm" chỉ hiện khi số đếm > 0.
- Ô sắp xếp: "Gửi trước" (mặc định), "Điểm cao nhất", "Điểm thấp nhất".
- Bộ lọc, tab và sắp xếp ghi lên URL (`?status=PENDING&band=SUGGEST_APPROVE&sort=score_desc`), để reload hoặc gửi link vẫn giữ.
- Mỗi dòng tin: ô chọn (chỉ khi tin `PENDING`), tiêu đề, công ty, **ngày gửi duyệt** (`submittedAt`, thay cho `createdAt`; điểm 2), huy hiệu điểm (số + màu vùng), 1–2 lỗi nặng nhất (ví dụ "Có yêu cầu nộp tiền", "Thiếu yêu cầu ứng viên"), nút "Kiểm tra".
- Cuối danh sách: nút **Xem thêm** (điểm 1) và dòng "Đang hiện X / N tin". Bỏ câu "xử lý bớt hàng đợi để xem các tin còn lại".
- Danh sách rỗng ở từng tab có câu riêng (ví dụ tab Đề xuất từ chối: "Không có tin nào bị đề xuất từ chối.").
- Khi lọc "Đang hiển thị": mỗi dòng cũng có huy hiệu điểm, và ô sắp xếp có "Điểm thấp nhất", để Admin rà tin bị sửa tụt điểm (Q7). Không có ô chọn, vì tin đang hiển thị không duyệt / từ chối hàng loạt.

### F3 — Chọn và thao tác hàng loạt

- Thanh chọn dính dưới cùng (theo mẫu `ApplicationBulkActions`) hiện khi có tin được chọn: "Đã chọn N tin", **Duyệt N tin**, **Từ chối N tin**, **Bỏ chọn**.
- Ở tab *Đề xuất duyệt* và *Đề xuất từ chối*: nút **Chọn tất cả tin trong vùng** (tối đa 50, qua `useAdminJobPostIds`). Ở tab *Cần xem kỹ* không có nút này, để khuyến khích mở từng tin.
- Trần 50 tin mỗi lần (Q2 backend): chọn quá thì nút thao tác mờ và có câu "Mỗi lần xử lý tối đa 50 tin".
- **Hộp xác nhận duyệt** (`ConfirmDialog`):
  - "Duyệt N tin? Tin sẽ hiển thị công khai và hệ thống sẽ tự gửi lời mời tới ứng viên phù hợp ngay sau khi duyệt."
  - Nếu trong lô có tin không thuộc vùng *Đề xuất duyệt*: cảnh báo "K tin không nằm trong vùng đề xuất duyệt" kèm danh sách tên tin, để Admin có thể bỏ chọn.
- **Hộp từ chối hàng loạt** (mới, `BulkRejectDialog`):
  - Danh sách các tin đã chọn, mỗi tin kèm **lý do tự sinh** (`quality.suggestedRejectReason`); tin không có lý do tự sinh hiện "Chưa có lý do".
  - Tuỳ chọn "Dùng một lý do chung cho tất cả", mở ra phần chọn lý do giống `RejectJobModal` (dùng lại danh sách lý do chọn sẵn; tách thành hằng số dùng chung nếu cần).
  - Không dùng lý do chung và có tin chưa có lý do ⇒ cảnh báo trước: "K tin sẽ bị bỏ qua vì chưa có lý do".
- **Kết quả**: toast "Đã duyệt X tin" / "Đã từ chối X tin". Có tin bị bỏ qua thì hiện hộp nhỏ liệt kê tin và lý do (`NOT_PENDING` → "Đã được người khác xử lý", `REASON_REQUIRED` → "Chưa có lý do từ chối", `NOT_FOUND` → "Không còn tồn tại"). Sau đó bỏ chọn và tải lại danh sách.

### F4 — Trang chi tiết `/admin/jobs/[id]`

- Thẻ **"Điểm chất lượng"** hiện ở **mọi trạng thái** của tin (không chỉ `PENDING`), thay cho phần kiểm tự động của `ReviewChecklist`:
  - Điểm tổng, huy hiệu vùng; cờ chặn hiện nổi bật (ví dụ "Có yêu cầu nộp tiền — không thể vào vùng đề xuất duyệt").
  - Sáu tiêu chí, mỗi dòng: tên, trọng số, điểm, thanh nhỏ; mở ra thấy từng lỗi (câu giải thích + "−N").
  - Dòng cuối: "Chấm lúc … · phiên bản thuật toán v1"; `outdated` thì thêm "Đã có phiên bản mới". Nút **Chấm lại** (`useRescoreJobQuality`).
  - Tin chưa có điểm: "Tin chưa được chấm" + nút Chấm lại.
  - "Chấm lúc …" ghi rõ lý do lần chấm gần nhất nếu backend trả (gửi duyệt / công ty có báo cáo hoặc bị thu hồi tin / tin được sửa / Admin chấm lại), để Admin hiểu vì sao điểm đổi (Q4, Q7).
  - Tin `PUBLISHED` có vùng *Đề xuất từ chối* hoặc cờ chặn: dòng cảnh báo phía trên nút **Thu hồi tin**, "Tin được sửa sau khi duyệt và hiện bị đề xuất từ chối".
- Phần "Admin tự đánh giá" (checklist thủ công) và phần kinh nghiệm / ngành phù hợp giữ nguyên.
- Nút Từ chối mở `RejectJobModal` với lý do **điền sẵn** từ `suggestedRejectReason`: tick sẵn các lý do chọn sẵn và đặt phần chi tiết vào ô nhập. Admin sửa được. Cần thêm prop giá trị ban đầu cho `RejectJobModal`; trang thu hồi tin không truyền prop này, nên hành vi cũ không đổi.
- Trang chi tiết hiện "Ngày gửi duyệt: …" bằng `submittedAt`.
- Lỗi 409 do admin khác đã xử lý (backend bước 5): hiện "Tin đã được xử lý bởi quản trị viên khác" và tải lại tin.

### F4b — Thông báo `JOB_POST_QUALITY_DROPPED` (Q7)

- `apps/web/src/lib/notifications.ts`: thêm loại mới. Icon cảnh báo, màu đỏ; nội dung "Tin **X** của **Công ty** vừa được sửa và tụt xuống vùng đề xuất từ chối (N điểm)"; bấm vào thì mở `/admin/jobs/:id`.
- Kiểm thông báo hiện đúng trong chuông thông báo và trung tâm thông báo của console Admin.

### F5 — Chú giải tiêu chí

- Nút "Cách tính điểm" ở trang hàng đợi và trên thẻ điểm, mở `Dialog` tóm tắt sáu tiêu chí, trọng số, ba vùng và cờ chặn. Nội dung lấy từ plan backend, viết gọn cho Admin đọc.
- Nội dung đặt ở một file hằng số, để sau này đổi version thì sửa một chỗ.

### F6 — Kiểm trên trình duyệt

Qua `localhost:8080` (chủ dự án chạy server), Admin demo + tài khoản Mây Xanh:

1. Mây Xanh gửi duyệt 3 tin: một tin đầy đủ, một tin thiếu yêu cầu / quyền lợi, một tin có "phí đào tạo" ⇒ Admin thấy đúng vùng và số đếm của tab.
2. Mở tin có "phí đào tạo": thấy cờ chặn, lý do điền sẵn trong hộp từ chối.
3. Chọn tất cả ở tab *Đề xuất duyệt* rồi duyệt ⇒ toast đúng số; tin hiện ở trang công khai; Mây Xanh nhận thông báo duyệt.
4. Từ chối hàng loạt không dùng lý do chung ⇒ mỗi tin nhận đúng lý do riêng (xem ở phía employer).
5. Mở cùng một tin ở hai tab admin, duyệt ở tab 1 rồi duyệt ở tab 2 ⇒ tab 2 báo đã được xử lý.
6. Hàng đợi > 20 tin ⇒ "Xem thêm" tải tiếp; đổi sắp xếp và tab, reload vẫn giữ trên URL.
7. Màn hình điện thoại: thanh chọn và hộp thoại không tràn ngang.
8. Q4: khi Mây Xanh còn tin chờ duyệt, báo cáo một tin khác của Mây Xanh bằng tài khoản ứng viên ⇒ tải lại trang chi tiết tin chờ, tiêu chí 6 giảm, "chấm lúc" đổi.
9. Q7: Mây Xanh sửa tin đang hiển thị, thêm "đóng phí đào tạo" vào quyền lợi ⇒ Admin nhận thông báo, bấm vào thấy cờ chặn và cảnh báo ở nút Thu hồi tin. Sửa thêm lần nữa mà vẫn xấu ⇒ không nhận thông báo lần hai.

## Không làm trong đợt này

- Tìm theo tên tin / công ty, bộ lọc DRAFT / CLOSED / EXPIRED (điểm 3).
- Nhãn "Gửi lại" riêng (điểm 4). Lỗi `RESUBMITTED_UNCHANGED` vẫn hiện trong bảng điểm.
- Lịch sử kiểm duyệt đầy đủ, nhãn tiếng Việt cho "Hành động gần nhất" (điểm 5).
- Hiện điểm cho nhà tuyển dụng (Q1 backend).

## Phần 4 — Ghi chú của chủ dự án

<!-- Dành cho chủ dự án. -->
