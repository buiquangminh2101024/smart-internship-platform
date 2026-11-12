# Hệ thống tự xử lý hồ sơ chờ lâu (0.4) — Frontend

> **Trạng thái: XONG (2026-11-12).** Lập kế hoạch 2026-11-11. Đợt A, đợt B và F6 (kiểm trên trình duyệt) đều xong; kết quả ở "Ghi chú triển khai". Phụ thuộc backend `docs/06-backend/application-automation/PLAN.md` (bước 1–6); Q1–Q3 ở đó đã chốt 2026-11-12.
>
> Làm theo 2 đợt, mỗi đợt một commit, rồi kiểm trên trình duyệt một lần. Các bước F1–F6 ở Phần 3 giữ nguyên nội dung; chỉ cách gom bước vào đợt thay đổi (chia lại 2026-11-12):
>
> | Đợt | Gồm | Lý do |
> |---|---|---|
> | A1 | F1 + phần kiểu của F5 (nhóm `APPLICATIONS`, nhãn nút "Xem hồ sơ" trong `lib/notifications.ts`) | Sau bước 7 backend, `tsc` của web còn 4 lỗi thiếu khoá: 2 lỗi `JOB_CLOSED` (F1), 2 lỗi `APPLICATIONS_NEED_ATTENTION` (F5). Gộp lại để `tsc` sạch trước khi làm tiếp. |
> | A2 | F2 + F3 | Cùng là danh sách hồ sơ, dùng chung `MatchScoreBadge`, nhãn trạng thái, kiểu sắp "Phù hợp nhất". Link "Xử lý hồ sơ của tin này" ở F3 dẫn sang trang F2, làm chung thì kiểm được luôn. |
> | B | F4 + phần còn lại của F5 (icon trong `NotificationCenter`, làm mới ở `SocketProvider`) | Phải sau F2: lưu cài đặt ở F4 làm mới danh sách cấp công ty; link `?focus=result` trong thông báo nhắc chỉ mở đúng khi trang F2 đã đọc `focus`. |
> | Cuối | F6, gồm cập nhật FAQ (mục 10) | Cần đủ giao diện. |
>
> Bản chia đầu (2026-11-11): đợt A = F1 + F2 + F3, đợt B = F4 + F5, F6 sau cả hai. Đợt A mới vẫn là một commit (A1 + A2).

Mục 0.4 của `docs/01-project/FEATURE_BACKLOG.md`. Quyết định kiến trúc: AD-25.

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency. Theo skill `sip-ui` (token, `Badge`, `DashButton`, `BlockSkeleton` / `BlockError`). Đọc skill trước khi viết giao diện.
- Trước khi sửa trang dùng `useSearchParams`, đọc hướng dẫn trong `node_modules/next/dist/docs/` (theo `apps/web/AGENTS.md`).
- TanStack Query: mở rộng `hooks/useApplications.ts`; hook mới `hooks/useApplicationAutomation.ts` cho cài đặt theo tin.
- Dùng lại: `MatchScoreBadge`, `SelectionBar`, `ApplicationBulkActions`, `ConfirmDialog`, `useApplicationsPageParams`, `AutoOutreachCard` (làm mẫu bố cục thẻ cài đặt).
- Không có API từ chối mới: nhóm đề xuất từ chối dùng `useBulkUpdateApplicationStatus` sẵn có.

## Phần 2 — Liên kết giữa các phần

| Trang | Thay đổi | API |
|---|---|---|
| `/employer/applications` | Cột điểm %, sắp "Phù hợp nhất" mặc định, dải gợi ý, nhóm "Cần kết quả", tab "Tin đã đóng", nhãn "Hệ thống tự chuyển" | `GET /employer/applications` (thêm trường, `sort=match`, `focus`) |
| `/employer/jobs/[id]/applications` | Mặc định "Phù hợp nhất", tên thay cho email, ô lọc tiếng Việt | Không đổi |
| `/employer/jobs/[id]` | Thẻ "Tự động xử lý hồ sơ" | `GET` / `PATCH …/application-automation` |
| `/employer/jobs/new` | Các ô cài đặt tương ứng | `PATCH …/application-automation` sau khi tạo tin |
| Trung tâm thông báo | Loại `APPLICATIONS_NEED_ATTENTION` | — |
| Phía ứng viên, Admin | Nhãn "Tin đã đóng" | — |

Làm mới dữ liệu: lưu cài đặt ⇒ làm mới danh sách cấp công ty (số đề xuất đổi theo Y). Thông báo realtime tới Employer đã làm mới nhóm `["employer", "dashboard"]`; thêm làm mới danh sách hồ sơ cấp công ty khi nhận `APPLICATIONS_NEED_ATTENTION`.

## Phần 3 — Các bước thực hiện

### Bước F1 — Nhãn `JOB_CLOSED` ở mọi nơi

- `lib/application-status.ts`: `JOB_CLOSED: { label: "Tin đã đóng", tone: "neutral" }`; thêm vào danh sách thứ tự tab; `isFinalApplicationStatus` trả `true`.
- Các chỗ tự viết nhãn hoặc tone, sửa cho đủ: `app/(candidate)/applications/page.tsx`, `app/employer/(portal)/applications/[id]/page.tsx`, `components/admin/UserDetailSections.tsx`.
- `app/jobs/[id]/page.tsx`: **không** thêm nút "Ứng tuyển lại" cho đơn `JOB_CLOSED` (chốt 2026-11-12): tin đã đóng không có lối hiển thị lại nên trường hợp này không xảy ra. Chỉ rà để trang không vỡ khi gặp trạng thái mới. Lối nộp lại sẽ thêm khi làm "gia hạn tin" (backlog mục 4).
- Phía ứng viên, dòng phụ dưới nhãn: "Tin đã ngừng nhận hồ sơ." Không dùng màu đỏ: đây không phải bị từ chối.
- Cách rà: `tsc` báo `Record<ApplicationStatus, …>` thiếu khoá; grep `"REJECTED"` và `"CANCELLED"` trong `apps/web/src` cho các phép so sánh.

### Bước F2 — Trang "Ứng viên" (`/employer/applications`)

```text
Ứng viên
214 hồ sơ của 32 tin

[ 9 hồ sơ dưới ngưỡng, hệ thống đề xuất từ chối → Xem ]  [ 3 ứng viên đã phỏng vấn, chưa có kết quả → Xem ]

Tất cả · Chờ duyệt 41 · Đang xem xét 27 · … · Bị từ chối · Đã huỷ · Tin đã đóng 18

Ứng viên            Tin                 Trạng thái                      Nộp        Phù hợp   Kỹ năng
Trần Minh Anh       Backend Node.js     Đang xem xét                    2 ngày     86%       Khớp 4/4 …
                                        ⚙ Hệ thống tự chuyển
Lê Hoàng Nam        Backend Node.js     Chờ duyệt                       9 ngày     62%       Khớp 2/4 …
Phạm Thu Hà         Kế toán (Hết hạn)   Chờ duyệt                       44 ngày    Chưa có điểm
```

- **Cột "Phù hợp":** `MatchScoreBadge` với `matchScore`. `null` thì chữ "Chưa có điểm" màu `text-muted`, `title` giải thích: "Điểm chỉ có ở tin đang hiển thị và ứng viên có kỹ năng chung với tin." Cột "Khớp kỹ năng" giữ nguyên bên cạnh; hai tên không dùng lẫn (D10 của plan employer-applications).
- **Sắp xếp:** thêm "Phù hợp nhất" (`sort=match`). Mặc định theo backend: `match` ở tab Chờ duyệt và Đang xem xét. `useApplicationsPageParams` nhận giá trị mới; `sort` bằng mặc định của tab thì không ghi lên URL (quy tắc cũ). Bỏ link "Xếp theo độ phù hợp" sang trang theo tin, vì trang này đã sắp được.
- **Dải gợi ý** phía trên tab, chỉ hiện khi số > 0, lấy từ `focusCounts`:
  - "N hồ sơ dưới ngưỡng, hệ thống đề xuất từ chối" → `?focus=reject`;
  - "N ứng viên đã phỏng vấn, chưa có kết quả" → `?focus=result`.
  - Là hai dòng chữ có nút, không phải thẻ số mới.
- **Chế độ `focus=reject`:**
  - Tiêu đề phụ: "Hồ sơ Chờ duyệt có điểm dưới ngưỡng đề xuất từ chối của tin. Hệ thống không tự từ chối: bạn xem lại rồi xác nhận." kèm nút "Thoát".
  - Mọi hồ sơ trên trang **được chọn sẵn**; bỏ chọn từng dòng được.
  - Thanh thao tác chỉ còn "Từ chối k" và "Xem xét k" (giữ lại người muốn xem thêm).
  - Xác nhận bằng `ConfirmDialog` sẵn có: "Từ chối k hồ sơ? Ứng viên sẽ nhận email thông báo. Bạn không thể hoàn tác."
  - Mỗi lần xử lý một trang (tối đa 50). Còn trang sau thì sau khi xong hiện "Còn N hồ sơ được đề xuất → Xem tiếp".
- **Chế độ `focus=result`:** danh sách hồ sơ `needsResult`, mỗi dòng có "Được nhận" / "Từ chối" như hàng Mời phỏng vấn hiện nay, kèm "phỏng vấn N ngày trước". Không chọn sẵn.
- **Nhãn "Hệ thống tự chuyển"** (`TaskBadge` trung tính, icon bánh răng) dưới nhãn trạng thái khi `changedBySystem`. Ở tab "Tin đã đóng" là "Hệ thống tự đóng".
- **Tab "Tin đã đóng"** ở cuối hàng tab, sau "Đã huỷ". Hồ sơ ở đây không có ô chọn và không có nút (trạng thái cuối).
- **Màn hẹp:** thẻ thêm điểm % cạnh dòng "Khớp kỹ năng". Dải gợi ý xếp dọc.
- `focus` ghi trên URL; đổi `focus` thì về trang 1 và bỏ chọn. Giá trị lạ thì bỏ qua.

### Bước F3 — Trang hồ sơ theo tin (`/employer/jobs/[id]/applications`)

- **Mặc định "Phù hợp nhất".** Trang này vẫn chấm trực tiếp (`GET …/application-matches`), nên có điểm cả với tin đã đóng. Sửa quyết định D4 của plan candidate-ranker: khi điểm chưa tải xong, danh sách hiện theo thứ tự API kèm dòng "Đang tải điểm phù hợp…"; điểm về thì xếp lại **một lần**. Tải điểm lỗi thì giữ "Mới nhất". Người dùng đã tự chọn kiểu sắp thì không tự đổi nữa.
- **Tên thay cho email:** cột "Ứng viên" hiện `candidate.fullName` (thiếu thì "Ứng viên chưa đặt tên"), cột "Email" giữ email. Hiện cả hai cột đang in email.
- **Ô lọc trạng thái:** dùng nhãn của `APPLICATION_STATUS_LABEL`, bỏ mã tiếng Anh trong ngoặc, thêm "Tin đã đóng".
- Ngày nộp dùng `formatVnDayMonth` thay cho `toLocaleDateString()` mặc định.
- Không thêm nút đổi trạng thái ở trang này (ngoài phạm vi); thêm link "Xử lý hồ sơ của tin này" sang `/employer/applications?job=<id>`.

### Bước F4 — Cài đặt theo tin

**Thẻ "Tự động xử lý hồ sơ"** ở `/employer/jobs/[id]`, ngay dưới thẻ "Tự động mời ứng viên", cùng quy tắc ai thấy thẻ:

```text
Tự động xử lý hồ sơ
[x] Tự chuyển hồ sơ đạt ngưỡng sang "Đang xem xét"
    Ngưỡng phù hợp: 80%  (dùng chung với tự mời, sửa ở thẻ trên)
Đề xuất từ chối khi điểm dưới [ 50 ] %
    Hệ thống chỉ đề xuất. Bạn xác nhận ở trang Ứng viên.
[ ] Tự đóng hồ sơ đã phỏng vấn nếu không có kết quả
    Sau khi tin đóng 30 ngày. Ứng viên nhận thông báo "tin đã ngừng tuyển".

Khi tin đóng: hồ sơ Chờ duyệt tự đóng ngay; hồ sơ Đang xem xét sau 14 ngày.
                                                                       [ Lưu ]
```

- Ô Y: số nguyên 0 đến X − 1. Nhập sai thì báo ngay dưới ô, không gửi.
- Lỗi 400 từ server (Y ≥ X) hiện nguyên câu tiếng Việt của server.
- Lưu xong: toast, làm mới thẻ và danh sách hồ sơ cấp công ty.
- Thẻ "Tự động mời ứng viên": đổi nhãn "Ngưỡng điểm" thành "Ngưỡng phù hợp", thêm dòng phụ "Dùng chung cho tự mời và tự xử lý hồ sơ." Hạ X xuống ≤ Y thì server trả 400; hiện câu của server.
- Ô đầu tiên (`autoReviewEnabled`) chỉ điều khiển bước tự chuyển sang "Đang xem xét". Tắt ô này thì đề xuất từ chối, nhắc tuần và tự đóng vẫn chạy; dòng cuối thẻ nói rõ điều đó.

**Form tạo tin** (`/employer/jobs/new`): thêm các ô trên vào khối cài đặt sẵn có (`AutoOutreachDraftFields`), gửi `PATCH …/application-automation` sau khi tạo tin, cùng cách với cài đặt tự mời. Giá trị mặc định lấy theo backend.

### Bước F5 — Thông báo nhắc hằng tuần

- `lib/notifications.ts`: `APPLICATIONS_NEED_ATTENTION` thuộc nhóm `APPLICATIONS`, nhãn nút "Xem hồ sơ".
- Link đích do backend dựng sẵn trong thông báo (bước 5 backend), theo ý đầu tiên khác 0: cần kết quả ⇒ `/employer/applications?focus=result`; chờ duyệt ⇒ `?status=PENDING`; đang xem xét ⇒ `?status=REVIEWING`; chờ đặt lịch ⇒ `?status=SHORTLISTED`; chỉ có "sắp tự đóng" ⇒ `/employer/applications`. Frontend chỉ cần trang đọc đúng `focus` và `status` từ URL. (Bản đầu ghi "không thì `status=PENDING`", đổi để công ty không có hồ sơ chờ duyệt không bị mở vào tab rỗng.)
- `NotificationCenter`: icon `clock` như các nhắc khác.
- `SocketProvider`: nhận loại này thì làm mới danh sách hồ sơ cấp công ty.

### Bước F6 — Kiểm trên trình duyệt

Với một công ty của bộ demo lớn do chủ dự án chỉ định (thao tác ghi sẽ gửi thông báo và email cho ứng viên demo):

1. Trang "Ứng viên": cột điểm khớp API; tab Chờ duyệt mặc định "Phù hợp nhất", thứ tự đúng qua các trang; hồ sơ không có điểm nằm cuối và ghi "Chưa có điểm".
2. `focus=reject`: số trên dải gợi ý khớp danh sách; hồ sơ được chọn sẵn; bỏ chọn một dòng rồi xác nhận ⇒ đúng số hồ sơ bị từ chối; dải gợi ý giảm.
3. Chạy `npm run process-applications -- --company <id>` (backend): hồ sơ đạt ngưỡng sang "Đang xem xét" kèm nhãn "Hệ thống tự chuyển"; hồ sơ của tin đã đóng sang tab "Tin đã đóng".
4. Đăng nhập ứng viên có đơn vừa bị đóng: thấy "Tin đã đóng", không có màu đỏ; thông báo đúng lời.
5. Thẻ cài đặt: đổi Y 50 → 60 ⇒ số đề xuất từ chối tăng sau khi lưu; nhập Y ≥ X bị chặn; hạ X xuống dưới Y ở thẻ tự mời bị chặn.
6. Thông báo nhắc: bấm vào thì mở đúng trang; số trong thông báo khớp trang.
7. Trang hồ sơ theo tin: mặc định "Phù hợp nhất", hiện tên, ô lọc tiếng Việt.
8. Màn hẹp 375 px: không cuộn ngang ở trang "Ứng viên", trang tin và form tạo tin.
9. `tsc --noEmit`, `npm run lint --workspace web` (không lỗi mới ở file đã sửa), `next build`.
10. FAQ trợ lý hỗ trợ (thêm 2026-11-12, bước 9 backend): mục `employer-application-automation` (`apps/server/content/support-faq/07-quan-ly-ung-vien.md`) hiện chỉ tả cách hệ thống chạy, chưa nói nút nằm ở đâu, vì giao diện chưa có. Khi xong F2 và F4, thêm vào mục này tên thẻ "Tự động xử lý hồ sơ" ở trang tin, dải gợi ý và tab "Tin đã đóng" ở trang "Ứng viên". Sau đó chạy lại `npm run support-chat:index -w apps/server` và `support-chat:eval`, rồi commit cùng `faq-index.json`.

## Ngoài phạm vi

- Thay đổi ở trang tổng quan của nhà tuyển dụng.
- Lý do từ chối; mẫu email từ chối.
- Chọn hồ sơ qua nhiều trang (D2, D3 của plan employer-applications giữ nguyên).
- Nút đổi trạng thái ở trang hồ sơ theo tin.
- Sửa các lỗi lint có từ trước ở file không liên quan.

## Ghi chú triển khai

### Đợt A (2026-11-12): A1 = F1 + kiểu của F5, A2 = F2 + F3

Kiểm: `tsc --noEmit` sạch (trước đợt A còn 4 lỗi), eslint các file đã sửa không có lỗi mới (còn 3 cảnh báo có từ trước ở `(candidate)/applications/page.tsx` và `jobs/[id]/page.tsx`), `next build` qua. Chưa xem trên trình duyệt: để ở F6 (không tự bật server vì khởi động sẽ ghi lên Neon).

**A1:**

- `lib/application-status.ts`: `JOB_CLOSED` "Tin đã đóng", tone `neutral`, đứng cuối danh sách tab; `isFinalApplicationStatus` trả `true`. `UserDetailSections.tsx` thêm cùng nhãn.
- `lib/notifications.ts`: `APPLICATIONS_NEED_ATTENTION` thuộc nhóm `APPLICATIONS`, nút "Xem hồ sơ". Icon và làm mới ở `SocketProvider` để đợt B.
- Trang hồ sơ của ứng viên `(candidate)/applications`: nhãn lấy từ `APPLICATION_STATUS_LABEL` (trước đây in thẳng mã `PENDING`, `REJECTED`…). Vì vậy tone đổi theo bảng chung: Đang xem xét từ `info` sang `brand`, Đã huỷ từ đỏ sang xám. Đơn `JOB_CLOSED` có dòng phụ "Tin đã ngừng nhận hồ sơ.".
- Trang chi tiết hồ sơ của employer `applications/[id]`: nhãn tiếng Việt như trên; hồ sơ ở trạng thái cuối (gồm Tin đã đóng) thì khoá mọi nút chuyển trạng thái (server vốn đã chặn). Đơn `JOB_CLOSED` có dòng "Tin đã ngừng nhận hồ sơ. Hồ sơ này không đổi trạng thái được nữa.".
- `jobs/[id]`: nút ứng tuyển ghi "Tin đã đóng" (bị khoá như các đơn khác), không có lối nộp lại.

**A2 — F2:**

- `useApplicationsPageParams` đọc `focus` (`reject` | `result`, giá trị lạ bỏ qua). Có `focus` thì bỏ qua `status`, vì API trả 400 khi có cả hai. `defaultSortFor(status, focus)` khớp `defaultSort` của backend: có `focus` ⇒ `oldest`; Chờ duyệt, Đang xem xét ⇒ `match`; còn lại `newest`.
- Ô sắp xếp thêm "Phù hợp nhất" ở đầu. Đã bỏ link "Xếp theo độ phù hợp".
- Cột "Phù hợp" đứng trước "Khớp kỹ năng" (`MatchScoreText` trong `ApplicationRow.tsx`, dùng `MatchScoreBadge`; `null` ⇒ "Chưa có điểm" kèm `title`). Màn hẹp: điểm đứng đầu dòng "Khớp kỹ năng".
- Nhãn "Hệ thống tự chuyển" / "Hệ thống tự đóng" khi `changedBySystem`. `TaskBadge` thêm tone `neutral` (`surface-hover` + `text-muted`) cho nhãn này. Hồ sơ vừa được người dùng đổi trong phiên thì nhãn mất ngay (đặt `changedBySystem` về false ở hàng đã xử lý).
- Dải gợi ý: thẻ `ul` gồm các dòng viền trái marigold kèm nút "Xem", xếp dọc dưới 1024px. Chỉ hiện khi không ở chế độ `focus` và nhóm có số > 0.
- Khi ở chế độ `focus`, hàng tab được thay bằng tiêu đề nhóm (kèm số), câu giải thích và nút "Thoát". Vùng danh sách lúc đó là `region` gắn với tiêu đề, không còn là `tabpanel`. Lý do: không có tab nào ứng với nhóm gợi ý, để `tablist` mà không tab nào được chọn sẽ sai mẫu ARIA. Đổi `focus` (vào hay thoát) thì xoá `status`, `sort` và `page`, dùng `push` như đổi tab.
- `focus=reject`: chọn sẵn mọi hồ sơ của trang, một lần cho mỗi tổ hợp tab, lọc và trang. Việc chọn sẵn đặt state ngay trong lúc render, không qua effect. Thanh thao tác chỉ còn "Từ chối k" và "Xem xét k" (thêm prop `only` cho `ApplicationBulkActions`). `ConfirmDialog` giữ nguyên câu của bản cũ. Sau khi xử lý và danh sách đã tải lại, "Còn N hồ sơ được đề xuất → Xem tiếp", với N = `total` mới trừ số hồ sơ chưa xử lý còn trên trang đang giữ. "Xem tiếp" dựng lại trang 1 và chọn sẵn lại.
- `focus=result`: hồ sơ Mời phỏng vấn có `needsResult` thì nút chính là "Được nhận", kèm dòng "Phỏng vấn N ngày trước" (lấy từ `lastInterviewAt`). Không chọn sẵn.
- Tab "Tin đã đóng" có sẵn qua `APPLICATION_STATUSES`. Hồ sơ trong tab không có ô chọn và không có nút, vì là trạng thái cuối.

**A2 — F3:**

- Mặc định "Phù hợp nhất". `sortMode` là `null` cho tới khi người dùng tự chọn. Điểm chưa về hoặc tải lỗi thì danh sách theo thứ tự API ("Mới nhất").
- Cột "Ứng viên" hiện `candidate.fullName` (thiếu thì "Ứng viên chưa đặt tên"). Ô chọn hồ sơ cũng dùng tên này.
- Ô lọc trạng thái lấy danh sách từ `APPLICATION_STATUSES` và nhãn tiếng Việt, đã có "Tin đã đóng". Ngày nộp dùng `formatVnDayMonth`.
- Nút "Xử lý hồ sơ của tin này" dẫn sang `/employer/applications?job=<id>`. Hồ sơ Tin đã đóng không chọn được, lý do ghi "Tin đã ngừng nhận hồ sơ".

### Đợt B (2026-11-12): F4 + phần còn lại của F5

Kiểm: `tsc --noEmit` sạch, eslint các file đã sửa không lỗi, không cảnh báo, `next build` qua. Chưa xem trên trình duyệt (F6).

**F4:**

- `hooks/useApplicationAutomation.ts`: `useJobApplicationAutomation` (GET, `retry: false`) và `useUpdateJobApplicationAutomation` (PATCH). Key `["employer", "job-posts", jobId, "application-automation"]` nằm dưới key của tin, nên lưu cài đặt tự mời (đổi X) đã làm mới thẻ này mà không cần thêm dòng. Lưu xong: làm mới danh sách cấp công ty (`COMPANY_APPLICATIONS_KEY`) và đánh dấu cũ `["employer", "dashboard"]`. Giá trị mặc định (`true` / 50 / `false`) và số ngày 14 / 30 chép từ backend kèm chú thích nguồn.
- `components/employer/ApplicationAutomationFields.tsx`: ba ô dùng chung cho thẻ và form tạo tin. Hai công tắc là ô chọn gốc (`accent-brand-600`), lời giải thích gắn qua `aria-describedby`. Y kiểm 0 đến X − 1 ngay dưới ô (`parseRejectBelow`, `rejectBelowError`). Khối cuối nói hai mốc tự đóng khi tin đóng và câu "tắt ô đầu thì đề xuất từ chối, nhắc tuần, tự đóng vẫn chạy".
- `components/employer/ApplicationAutomationCard.tsx`: thẻ ở trang tin, ngay dưới thẻ tự mời; 404 thì ẩn, như thẻ tự mời. Chỉ gửi trường đã đổi; lỗi 400 hiện nguyên câu của server.
- `AutoOutreachCard`: nhãn "Ngưỡng phù hợp (%)", gợi ý mở đầu bằng "Dùng chung cho tự mời và tự xử lý hồ sơ.". Lưu có đổi X thì làm mới danh sách cấp công ty (server quét lại hồ sơ Chờ duyệt).
- Form tạo tin: `AutoOutreachDraftFields` nhận `children`, hiện dưới đường kẻ với tiêu đề "Tự động xử lý hồ sơ". Sau khi lưu nháp và lưu cài đặt tự mời, gửi `PATCH …/application-automation` với các trường khác bản đã lưu (lần đầu so với mặc định của backend). Lỗi thì giữ nháp, báo lỗi và dừng, cùng cách với tự mời. X ở form là `DEFAULT_MIN_SCORE` (80), vì form không đổi X.

Khác chữ của plan:

- Thẻ hiện ở **mọi** trạng thái của tin, không theo quy tắc trạng thái của thẻ tự mời (chỉ Nháp, Chờ duyệt, Đang hiển thị). Lý do: công tắc tự đóng hồ sơ đã phỏng vấn chỉ có tác dụng sau khi tin đóng, và API đọc, sửa được ở mọi trạng thái. "Cùng quy tắc ai thấy thẻ" giữ ở nghĩa chỉ người đăng tin. Khi thẻ tự mời không hiện, dòng ngưỡng ghi "không đổi được khi tin đã kết thúc" thay cho "sửa ở thẻ trên".
- Dòng cuối ghi "hồ sơ chưa phỏng vấn tự đóng sau 14 ngày" thay cho "hồ sơ Đang xem xét sau 14 ngày": nhóm G2 của backend gồm mọi hồ sơ chưa phỏng vấn (Đang xem xét, Danh sách rút gọn, Mời phỏng vấn chưa có buổi nào). Mốc 30 ngày ghi thêm "hoặc sau buổi phỏng vấn gần nhất nếu muộn hơn", khớp `closeDecision`.
- Lưu xong hiện "Đã lưu." ngay cạnh nút, không dùng toast: thẻ tự mời bên trên làm vậy, và trang tin chưa có `ToastViewport`.

**F5 (phần còn lại):**

- `APPLICATIONS_NEED_ATTENTION` vào `WARNING_NOTIFICATION_TYPES`, nên có màu marigold (đúng nghĩa "đang chờ con người xử lý" của `sip-ui`) và icon `clock` như hai loại "sắp hết hạn".
- `SocketProvider`: Employer nhận loại này thì làm mới `COMPANY_APPLICATIONS_KEY`.

### F6 (2026-11-12): kiểm trên trình duyệt

Server, web và gateway do chủ dự án bật, vào qua cổng 8080. Công ty demo Mây Xanh, tài khoản `tuyendung-mayxanh@large-demo.local`. Chủ dự án duyệt trước các thao tác ghi: đăng nhập, từ chối thật 2 hồ sơ, đổi Y rồi trả lại, chạy `process-applications`. Số liệu đối chiếu bằng cách đọc phản hồi API ngay trong trang.

| # | Kết quả |
|---|---|
| 1 | Đạt. Tab Chờ duyệt: mặc định "Phù hợp nhất", URL không ghi `sort`; 106 hồ sơ qua 6 trang, không trùng, điểm giảm dần, cột "Phù hợp" khớp API từng dòng. Tab Đang xem xét: 94 hồ sơ, 2 hồ sơ "Chưa có điểm" nằm cuối. |
| 2 | Đạt. Dải gợi ý 54 = `total` của `focus=reject`; 20 hồ sơ trang đầu chọn sẵn; thanh thao tác chỉ còn "Từ chối 20", "Xem xét 20"; bỏ chọn một dòng thì còn 19. Bỏ chọn còn 2 rồi xác nhận: `bulk-status` đổi đúng 2 (`clargedemoapp374`, `clargedemoapp2957`), không bỏ qua hồ sơ nào; dải gợi ý 54 → 52; "Còn 34 hồ sơ được đề xuất → Xem tiếp" (52 − 18 hồ sơ chưa xử lý trên trang); "Xem tiếp" chọn sẵn lại 20; "Thoát" về tab Tất cả. `focus=result`: 8 hồ sơ, không chọn sẵn, nút chính "Được nhận", có "Phỏng vấn N ngày trước". |
| 3 | `--dry-run --company` ra 0 (lượt thật đã chạy ở bước 8 backend) nên không chạy thật. Kiểm giao diện trên kết quả của bước 8: đúng 22 hồ sơ có nhãn "Hệ thống tự chuyển"; tab Tin đã đóng có 8 hồ sơ, nhãn "Hệ thống tự đóng", không ô chọn, không nút. |
| 4 | Đạt. Ứng viên `ung-vien-0307`: đơn ghi "Tin đã đóng" (xám) kèm "Tin đã ngừng nhận hồ sơ.", không màu đỏ; thông báo "Hồ sơ ứng tuyển đã được đóng" đúng lời. Trang chi tiết hồ sơ phía employer có dòng "Tin đã ngừng nhận hồ sơ. Hồ sơ này không đổi trạng thái được nữa.". |
| 5 | Đạt, tin "Thực tập sinh Frontend React" (`clargedemojobscmxfrontendintern`). Y = 80 bị chặn dưới ô ("Nhập số nguyên từ 0 đến 79."), nút Lưu khoá. Y 50 → 60: số đề xuất của tin 4 → 7 (đúng 3 hồ sơ điểm 50–59). Hạ X xuống 60 ở thẻ tự mời: server trả 400, thẻ hiện "Ngưỡng phù hợp phải lớn hơn ngưỡng đề xuất từ chối (60%).", không ghi. Đã trả Y về 50. Tin của người khác cùng công ty (`clargedemojob0025`): cả hai thẻ ẩn. |
| 6 | Link đạt: icon đồng hồ nền marigold, nhóm "Hồ sơ", "Xem hồ sơ" mở `?focus=result`. Số: xem "Còn lại" bên dưới. |
| 7 | Đạt. Mặc định "Phù hợp nhất"; cột Ứng viên hiện tên, cột Email giữ email; ô lọc tiếng Việt có "Tin đã đóng"; ngày nộp DD/MM; link "Xử lý hồ sơ của tin này" đúng `?job=`. |
| 8 | Đạt. Cửa sổ trình duyệt không thu được về 375 px nên đo trong iframe 375 px cùng origin: 7 trang (Ứng viên ở Tất cả / `focus=reject` / `focus=result` / Tin đã đóng, trang tin, form tạo tin, hồ sơ theo tin) đều có `scrollWidth` = `clientWidth`, không phần tử nào tràn ngoài vùng cuộn. |
| 9 | Đạt. `tsc --noEmit` sạch, eslint các file sửa trong F6 sạch, `next build` qua. |
| 10 | Đã thêm vào FAQ `employer-application-automation`: hai câu hỏi mẫu ("Cài đặt tự xử lý hồ sơ ở đâu?", "Xem các hồ sơ được đề xuất từ chối ở đâu?") và đoạn "Ở đâu" (thẻ cài đặt, dòng gợi ý, nhóm đề xuất từ chối, nhãn, tab Tin đã đóng); câu "ngưỡng điểm" đổi thành "Ngưỡng phù hợp". Mục `employer-applications`: "Phù hợp nhất" có ở cả trang Ứng viên. Đã chạy lại `support-chat:index` và `support-chat:eval`. |

Sửa trong F6:

- Bảng ở trang Ứng viên: thêm cột "Phù hợp" làm cột Trạng thái hẹp lại, nhãn "Đang xem xét" gãy 3 dòng ở 1536 px. Nhãn trạng thái giờ không xuống dòng (`whitespace-nowrap` ở `Status`), tiêu đề "Phù hợp" cũng vậy.
- Mở trang ở tab cuối (`?status=JOB_CLOSED`) thì tab đang chọn bị khuất bên phải hàng tab cuộn ngang. Thêm effect cuộn hàng tab (chỉ hàng tab, không cuộn trang) cho thấy tab đang chọn.

Sau F6, chủ dự án duyệt sửa thêm (2026-11-12):

- **Số trong thông báo nhắc tuần khác số trên trang.** Thông báo chỉ đếm hồ sơ đứng yên quá 7 ngày (thiết kế backend bước 5), còn trang hiện mọi hồ sơ của nhóm: "1 ứng viên đã phỏng vấn chưa có kết quả" mà trang `focus=result` có 8. Các nhóm khác có ghi "quá 7 ngày", riêng nhóm này thiếu. Đã sửa lời trong `notification-templates.ts` thành "N ứng viên đã phỏng vấn quá 7 ngày chưa có kết quả", test đơn vị cập nhật theo (29/29 qua). Thông báo đã tạo là bản chụp nên không đổi.
- **Eval chatbot.** Sau khi sửa FAQ, số câu trả thẳng không đổi; top-3 đoạn đưa vào prompt (`server`) 75 → 73/94, câu gõ không dấu 33 → 31/79 (q006 "khong nhan duoc ma otp", q112 "xep lich phong van cho may ung vien"). Thử trả câu "Phù hợp nhất" ở mục `employer-applications` về như cũ: `server` lên 74/94, q112 lấy lại top-3, q006 vẫn mất, nên q006 do phần khác (hai câu hỏi mẫu mới của mục `employer-application-automation`). Câu cuối cùng giữ thông tin trang Ứng viên nhưng ngắn: "Danh sách đơn của từng tin và trang **Ứng viên** có cách sắp xếp **Phù hợp nhất** …", cho `server` 74/94, `content` 65/94 (bản commit 63). Bỏ ý "tab Chờ duyệt và Đang xem xét mặc định sắp theo cách này" vì ý đó kéo q112 khỏi top-3.
- **Ngày "Nộp lúc" ở trang ứng tuyển của ứng viên** dạng `11/1/2026` (`toLocaleDateString()` mặc định). Đổi sang `formatVnDate` (DD/MM/YYYY giờ Việt Nam), số dùng `font-num tabular-nums`.
- **Tên công ty dài tràn khỏi sidebar 240 px.** Khung grid của `CompanyHeader` thiếu `min-w-0` nên ô giãn theo chữ, `truncate` không cắt được và huy hiệu "Đã xác minh" bị kéo dài theo. Thêm `min-w-0`, `justify-items-start`, tên xuống tối đa 2 dòng (`line-clamp-2`) kèm `title` tên đầy đủ, dùng chung cho sidebar và ngăn kéo (bỏ prop `wrap`). Kiểm ở 1536 px: tên Mây Xanh 2 dòng, tên giả dài 100 ký tự vẫn 2 dòng, nằm trong cột, huy hiệu rộng 87 px.

Còn lại:

- Form tạo tin chưa bấm lưu thật (sẽ tạo tin nháp trên Neon, ngoài các thao tác đã duyệt); đã xem các ô hiển thị đúng ở desktop và 375 px.

## Phần 4 — Ghi chú của chủ dự án

<!-- Để trống — dành cho chủ dự án. -->
