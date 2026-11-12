# Hệ thống tự xử lý hồ sơ chờ lâu (0.4) — Frontend

> **Trạng thái: ĐÃ LẬP KẾ HOẠCH (2026-11-11), CHƯA TRIỂN KHAI.** Chờ chủ dự án duyệt. Phụ thuộc backend `docs/06-backend/application-automation/PLAN.md` (bước 1–6); Q1–Q3 ở đó đã chốt 2026-11-12.
>
> Làm theo 2 đợt, mỗi đợt một commit, rồi kiểm trên trình duyệt một lần:
>
> - **Đợt A = F1 + F2 + F3**: nhãn trạng thái mới, trang "Ứng viên", trang hồ sơ theo tin. F1 đi trước vì thiếu nhãn `JOB_CLOSED` thì `tsc` của web không qua.
> - **Đợt B = F4 + F5**: cài đặt theo tin và thông báo nhắc.
> - **F6** sau cả hai đợt.

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

<!-- Điền khi triển khai. -->

## Phần 4 — Ghi chú của chủ dự án

<!-- Để trống — dành cho chủ dự án. -->
