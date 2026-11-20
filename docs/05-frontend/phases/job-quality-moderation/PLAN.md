# Chấm điểm chất lượng tin và duyệt / từ chối hàng loạt — Frontend

> **Trạng thái: ĐÃ CHỐT CÂU HỎI, chờ duyệt để code (lập 2026-11-20).** Câu hỏi Q1–Q7 chốt ở plan backend. Chưa code. Làm sau backend (`docs/06-backend/job-quality-moderation/PLAN.md`). Quyết định kiến trúc: AD-29. Mọi giao diện theo skill `sip-ui` (token, component có sẵn: `Badge`, `Button`, `Card`, `StatCard`, `Dialog`, `ConfirmDialog`, `Select`, `Toast`). Đọc `sip-ui` trước khi code.

## Mục tiêu

- Hàng đợi kiểm duyệt chia theo ba vùng điểm, xem được hết tin (không còn kẹt ở trang đầu), sắp theo thời điểm gửi duyệt hoặc theo điểm.
- Admin chọn nhiều tin rồi duyệt hoặc từ chối một lần; tin trong vùng đề xuất được chọn sẵn.
- Trang chi tiết tin hiện bảng điểm theo từng tiêu chí, kèm lý do bị trừ, thay cho phần kiểm tự động đang tính trên client.

Ý nghĩa của các tiêu chí, mức trừ và ba vùng: xem mục "Thuật toán chấm điểm" trong plan backend. Frontend chỉ hiển thị kết quả server trả về, **không tự tính điểm**.

## Các bước

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
