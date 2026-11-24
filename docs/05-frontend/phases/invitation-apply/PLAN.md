# Nhận lời mời = ứng tuyển vào tin (0.7) — Frontend

> **Trạng thái: XONG (2026-11-17).** F1–F4 code xong; F5 đã kiểm bước 1, 2, 3, 5b trên `localhost:8080` (xem Ghi chú triển khai ở cuối). Làm sau backend (`docs/06-backend/invitation-apply/PLAN.md`). Quyết định kiến trúc: AD-28. Mọi giao diện theo skill `sip-ui` (token, component có sẵn).

## Mục tiêu

- Ứng viên nhận lời mời bằng hộp thoại chọn CV, sau đó có đơn trong "Đơn ứng tuyển" và vẫn có hội thoại.
- Lời mời đã nhận theo kiểu cũ có nút "Ứng tuyển ngay".
- Nhà tuyển dụng thấy đơn từ lời mời có nhãn "Được mời".

## Các bước

### F1 — Hook và type

- `useRespondOutreachInvitation` (`apps/web/src/hooks/useCandidateOutreach.ts`): ACCEPT gửi thêm `cvId`, `coverLetter`. `onSettled` invalidate thêm key danh sách đơn của ứng viên.
- Hook mới `useApplyFromInvitation` gọi `POST /candidate/outreach-invitations/:id/apply`, invalidate cùng các key.
- Dùng lại `useCvList` (`apps/web/src/hooks/useCvs.ts`).

### F2 — Hộp thoại "Nhận lời & ứng tuyển"

Component mới `apps/web/src/components/candidate/AcceptInvitationDialog.tsx`, dùng cho cả nhận lời (`PENDING`) và ứng tuyển từ lời mời cũ (`ACCEPTED`):

- Tiêu đề: tên tin + công ty.
- Chọn CV đã lưu, chọn sẵn CV mặc định (cùng cách trang `/jobs/[id]/apply`: `isDefault`, không có thì CV đầu tiên).
- Ô thư giới thiệu, không bắt buộc.
- Dòng ghi chú ngay trên nút xác nhận (Q1, Q4): "Hồ sơ của bạn sẽ được gửi thẳng tới nhà tuyển dụng ở trạng thái **Đang xem xét** và không thể huỷ."
- Chưa có CV: không hiện form, hiện câu "Bạn cần có ít nhất một CV để nhận lời" + nút sang `/cv` (Q3).
- Không có lối tải CV từ máy (Q3).
- Lỗi 409 (lời mời hết hạn / tin đã đóng): toast lỗi, đóng hộp thoại, danh sách tải lại.

### F3 — Hộp lời mời (`OutreachInvitationInbox.tsx`)

- `PENDING`: hai nút **Từ chối** (giữ `ConfirmDialog` hiện có) và **Nhận lời & ứng tuyển** (mở F2 thay cho `ConfirmDialog`).
- `ACCEPTED`:
  - có `applicationId` ⇒ "Xem đơn ứng tuyển" (sang `/applications`; chưa có trang chi tiết đơn riêng) + "Xem hội thoại";
  - chưa có `applicationId` và tin còn `PUBLISHED` ⇒ nút **Ứng tuyển ngay** (mở F2) + "Xem hội thoại";
  - tin không còn tuyển ⇒ chỉ "Xem hội thoại".
- Toast thành công:
  - đơn mới: "Đã nhận lời. Hồ sơ của bạn đang được nhà tuyển dụng xem xét.";
  - `linkedExisting: true`: "Bạn đã có đơn cho tin này. Lời mời đã được gắn vào đơn."
- Sửa comment đầu file (đang ghi "Accept xong chỉ đổi trạng thái tại chỗ + hiện Xem hội thoại").

### F3b — Trang nộp đơn thường và "Đơn ứng tuyển" (Q4)

- `/jobs/[id]/apply` (`apps/web/src/app/jobs/[id]/apply/page.tsx`): đọc `useOutreachInvitations`, có lời mời `PENDING` cho `jobId` ⇒ khung thông tin phía trên form: "Bạn đang có lời mời từ **<công ty>** cho tin này. Nộp đơn sẽ được tính là **nhận lời mời**, hồ sơ chuyển thẳng sang **Đang xem xét** và không thể huỷ." Không có lời mời thì trang như cũ.
- Sau khi nộp: đơn trả về ở `REVIEWING` có `invitationId` ⇒ thông báo thành công ghi "Đã nhận lời mời, hồ sơ đang được xem xét" thay cho câu nộp đơn thường.
- Trang "Đơn ứng tuyển" (`/applications`): đơn có `invitationId` ⇒ nhãn `Badge` "Được mời", để ứng viên hiểu vì sao đơn không qua "Chờ duyệt".

### F4 — Phía nhà tuyển dụng

- `ApplicationRow.tsx` (dùng ở `/employer/applications` và trang hồ sơ theo tin): `invitation` khác null ⇒ nhãn `Badge` "Được mời"; lời mời `AUTO` ghi "Được mời · Tự động".
- Trang chi tiết hồ sơ: cùng nhãn ở phần đầu.
- Thông báo: template mới đã có link sang hồ sơ (backend), frontend chỉ kiểm hiển thị đúng chữ và icon nhóm `INVITATIONS`.

### F5 — Kiểm trên trình duyệt

Qua gateway `localhost:8080`, tài khoản demo Mây Xanh:

1. Gửi lời mời cho một ứng viên demo.
2. Ứng viên nhận lời với CV ⇒ hộp lời mời hiện "Xem đơn ứng tuyển"; "Đơn ứng tuyển" có đơn "Đang xem xét".
3. Nhà tuyển dụng thấy thông báo gộp, đơn ở tab "Đang xem xét" có nhãn "Được mời".
4. Một lời mời `ACCEPTED` cũ trong dữ liệu demo ⇒ "Ứng tuyển ngay" hoạt động.
5. Ứng viên không có CV ⇒ hộp thoại dẫn sang trang CV.
5b. Ứng viên có lời mời đang chờ mở `/jobs/[id]/apply` ⇒ thấy khung báo; nộp xong lời mời thành "Đã chấp nhận", đơn "Đang xem xét".
5c. Thông báo gộp: mời thủ công bởi người khác người đăng tin ⇒ cả hai nhận; lời mời tự động ⇒ một người nhận.
6. Kiểm bề rộng điện thoại.

## Ghi chú triển khai (2026-11-17)

- `AcceptInvitationDialog` dựa trên `components/ui/Dialog` (`<dialog>` gốc, toàn màn hình ≤ 480px). Không dùng effect để chọn CV: CV đang chọn suy ra từ lựa chọn của người dùng, nếu chưa chọn thì lấy CV mặc định. Hộp lời mời đặt `key` theo lời mời nên mỗi lần mở là một form mới.
- Trang "Đơn ứng tuyển": nút "Hủy đơn" chỉ hiện với đơn `PENDING`, khớp với server (server chỉ cho huỷ đơn Chờ duyệt). Trước đây nút hiện cả ở `REVIEWING` và bấm thì lỗi.
- `InvitedBadge` nằm trong `ApplicationRow.tsx` và dùng lại ở trang chi tiết hồ sơ.
- Kiểm F5 trên `localhost:8080` (Mây Xanh mời ứng viên `vaicamuahe@gmail.com`, hai tin "[Kiểm 0.5 #1/#2]"):
  - Bước 1–3 đạt: hộp thoại chọn sẵn CV mặc định; nhận lời xong hiện toast và hai nút "Xem đơn ứng tuyển", "Xem hội thoại"; "Đơn ứng tuyển" có nhãn "Được mời" và trạng thái "Đang xem xét", không có nút huỷ; nhà tuyển dụng nhận thông báo gộp có link sang hồ sơ; danh sách và trang chi tiết đều có nhãn "Được mời".
  - Bước 5b đạt: trang nộp đơn hiện khung báo lời mời; nộp xong hiện câu "Đã nhận lời mời…".
  - Chưa kiểm bằng trình duyệt: bước 4 (dữ liệu demo của ứng viên này không có lời mời đã nhận mà chưa có đơn), bước 5 (ứng viên chưa có CV), bước 5c (hai người nhận khác nhau) và bề rộng 375px (cửa sổ trình duyệt không thu nhỏ được). Các trường hợp này đã có unit test backend.
