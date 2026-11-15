# Chấm lại theo ứng viên gần thời gian thực (0.6) — Frontend

> **Trạng thái: ĐANG TRIỂN KHAI. Đợt 2 (F3 + F4) và đợt 3 (F5) xong 2026-11-15; F1, F2, F6 chưa làm.** Lập kế hoạch 2026-11-14, các câu hỏi của plan backend đã chốt. Thứ tự đợt: 2 (F3 + F4) → 3 (F5) → 1 (F1 + F2 + câu chữ FAQ của F6) → kiểm tổng. Làm sau khi backend xong bước tương ứng (ghi ở từng bước dưới đây).

Mục 0.6 của `docs/01-project/FEATURE_BACKLOG.md`. Quyết định kiến trúc: AD-27. Backend: `docs/06-backend/live-rescore/PLAN.md` (D1–D12, Q1–Q6). Phạm vi do chủ dự án chọn ngày 2026-11-14: **7a–7d, 7g, 7h**. 7e (trạng thái "Đang cập nhật việc làm phù hợp…" ở `/profile`) và 7f ("Xem thêm" ở trang tìm ứng viên) để sau.

## Mục tiêu

- Câu chữ khớp hành vi mới: điểm cập nhật trong vài phút, không còn "hằng đêm".
- Khi demo bằng script mô phỏng, giáo viên **thấy** hệ thống tự xử lý:
  - số "Phù hợp" của nhà tuyển dụng tự tăng;
  - Admin thấy hàng chờ chấm lại tăng rồi giảm, kèm số lời mời tự động và số báo tin trong ngày.

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency. React Query (`invalidateQueries`, `refetchInterval`), `SocketProvider` / `useSocketConnection` sẵn có.
- **Bắt buộc đọc skill `sip-ui` trước khi viết giao diện** (thẻ Admin ở F5). Dùng token và component sẵn có (`Card`, `Badge`, các khối dashboard Admin như `PlatformMetrics`, `AdminQueues`).

## Phần 2 — Liên kết giữa các phần

```
/jobs                          dòng chú thích điểm (F1)
Trung tâm thông báo            JOB_ALERT lần đầu cho ứng viên mới (F2, theo Q3 của backend)
AutoOutreachCard               trạng thái mới khi tỉ lệ tự động 0% (F3)
SocketProvider (employer)      event match-scores:updated → invalidate hiring-progress,
                               danh sách tin, thẻ tự mời, trang tìm ứng viên (F4)
/admin/dashboard               thẻ "Hệ thống tự động" ← GET /admin/automation-status, làm mới 15 s (F5)
FAQ chatbot                    apps/server/content/support-faq/*.md + faq-index.json (F6)
```

## Phần 3 — Các bước thực hiện

### F1 — Dòng chú thích ở `/jobs` (7a)

- `app/jobs/page.tsx:286`: "Điểm phù hợp cập nhật hằng đêm theo hồ sơ của bạn…" đổi thành câu theo hành vi mới, ví dụ "Điểm phù hợp cập nhật trong vài phút sau khi bạn sửa hồ sơ, chỉ mang tính tham khảo."
- Rà các chuỗi khác còn nói "hằng đêm" / "qua đêm" về điểm (grep trong `apps/web/src`).
- Phụ thuộc: backend bước 3 (chấm theo ứng viên chạy thật).

### F2 — Thông báo cho ứng viên mới (7b)

- Theo Q3 của backend (đã chốt): dùng lại `JOB_ALERT`, nên không thêm loại thông báo. Chỉ kiểm câu chữ và link của thông báo gộp khi nó đến từ lần chấm đầu (không phải từ tin mới), và kiểm `SocketProvider` vẫn làm mới "Việc làm phù hợp".
- Nếu Q3 chốt một loại thông báo mới: thêm nhãn, icon và nhóm ở chỗ khai báo loại thông báo của web (như `PROFILE_SKILLS_REMINDER` ở 0.5).
- Phụ thuộc: backend bước 4.

### F3 — Thẻ tự mời khi tỉ lệ tự động 0% (7c)

- `components/employer/AutoOutreachCard.tsx`: trạng thái mới (backend bước 8) hiện câu kiểu "Công ty đang để tỉ lệ tự động 0%, hệ thống không tự mời. Mời tay vẫn dùng được." kèm link tới chỗ chỉnh tỉ lệ ở trang "Lời mời" (chỉ hiện link với quản trị viên công ty nếu dữ liệu có sẵn; không thì chỉ hiện câu).
- Phụ thuộc: backend bước 8.
- *Đã làm 2026-11-15:* `AutoOutreachCard` thêm nhánh `PAUSED_BY_COMPANY_SHARE`: câu "Tỉ lệ tự động mời của công ty hiện cho 0 lời mời/ngày…", vẫn có link "Xem lời mời". Quản trị viên công ty (`useEmployerMe().employer.isCompanyAdmin`) thấy link "Chỉnh tỉ lệ ở trang Lời mời" (`/employer/outreach`); người khác thấy câu "Quản trị viên công ty chỉnh được…". Không dùng `#anchor` vì khối tỉ lệ tải sau nên trình duyệt không cuộn tới. Đổi tỉ lệ ở trang "Lời mời" thì làm mới thẻ tự mời của mọi tin (`[...OUTREACH_KEY, "job-auto"]`).

### F4 — Số "Phù hợp" tự làm mới theo realtime (7g)

- Theo Q5 của backend (realtime, server gửi tối đa một sự kiện mỗi công ty mỗi 15 giây): `useSocketConnection` nghe thêm event `match-scores:updated`. `SocketProvider` (area `employer`) invalidate:
  - tiến độ tuyển ở trang tổng quan (`HiringProgressPanel`);
  - danh sách tin `/employer/jobs` (`matchedCount`);
  - thẻ tự mời của các tin trong `jobPostIds`;
  - trang tìm ứng viên của các tin đó.

  Không hiện thông báo trình duyệt cho event này.
- Dự phòng khi mất socket: `refetchOnWindowFocus` mặc định của TanStack Query (đã bật sẵn). Không thêm `refetchInterval`.
- Kiểm: chạy `simulate-inflow` với một tin của Mây Xanh, số "Phù hợp" trên tổng quan đổi mà không cần tải lại trang.
- Phụ thuộc: backend bước 4.
- *Đã làm 2026-11-15:* `useSocketConnection` thêm handler `onMatchScoresUpdated` (type `MatchScoresUpdatedPayload`). `SocketProvider`, chỉ area `employer`, invalidate:
  - `HIRING_PROGRESS_KEY`;
  - `["employerJobPosts"]`;
  - `jobAutoKey(id)` của từng tin trong `jobPostIds`.

  **Khác plan:** "Gợi ý" của trang tìm ứng viên (`searchKey(id)`) chỉ đánh dấu cũ (`refetchType: "none"`), không tìm lại ngay. Lý do: hook này cố ý chỉ tìm lại khi bấm "Tìm lại" hoặc mở lại trang, để danh sách không đổi thứ tự khi nhà tuyển dụng đang chọn người mời. Chưa kiểm trên trình duyệt; để lượt kiểm tổng.

### F5 — Thẻ "Hệ thống tự động" cho Admin (7h)

- Đặt ở `/admin/dashboard`, cạnh các khối hàng chờ kiểm duyệt. Nội dung:
  - "Đang chờ chấm lại: N ứng viên" (kèm "lâu nhất X phút" khi N > 0);
  - "Lượt gần nhất: HH:mm, chấm M người trong S giây" (và "còn K người" nếu hết giờ);
  - "Hôm nay: A lời mời tự động · B tin đã báo cho ứng viên · C hồ sơ tự chuyển Đang xem xét";
  - "Chấm đêm gần nhất: HH:mm dd/MM".
- `useAutomationStatus`: `GET /admin/automation-status`, `refetchInterval` 15 giây khi tab đang hiển thị. Trạng thái tải, lỗi, và "Không có ứng viên nào đang chờ" khi N = 0.
- Không có thao tác tại chỗ (dashboard là điểm xem, như dashboard Employer bản 2).
- Phụ thuộc: backend bước 8.
- *Đã làm 2026-11-15:*
  - `useAutomationStatus` (`hooks/useAdminDashboard.ts`): key `[...ADMIN_DASHBOARD_KEY, "automation-status"]`, nên nút "Làm mới" của trang cũng làm mới thẻ; `refetchInterval` 15 giây, không chạy khi tab ẩn.
  - `components/dashboard/admin/AutomationStatusPanel.tsx`: `AdminPanel` của bản D, bốn mục "Đang chờ chấm lại", "Lượt chấm gần nhất", "Hôm nay", "Chấm đêm gần nhất". Tự tải và tự báo lỗi (`BlockSkeleton` / `BlockError`).
  - Marigold chỉ cho "lâu nhất X phút" (thời gian chờ, theo quy tắc bản D). N = 0 thì ghi "Không có ứng viên nào đang chờ." kèm dấu tích. `lastRun` / `nightly` null thì ghi "Chưa có lượt nào trong 7 ngày qua".
  - Vị trí: cột phải cạnh bàn duyệt, dưới "Nền tảng".
  - Chưa xem trên trình duyệt (375px / desktop); để lượt kiểm tổng.

### F6 — FAQ chatbot và kiểm tổng (7d)

- Sửa các mục FAQ nói điểm cập nhật hằng đêm hoặc ứng viên mới phải chờ (`apps/server/content/support-faq/02-ung-vien-ho-so-cv.md`, `03-tim-viec-ung-tuyen.md` và mục phía nhà tuyển dụng nói về "Phù hợp", tự mời). Ý chính:
  - sửa hồ sơ thì điểm, "Việc làm phù hợp" và số "Phù hợp" cập nhật trong vài phút;
  - ứng viên mới được báo các tin phù hợp một lần;
  - nhà tuyển dụng không cần mời tay khi bật tự mời, ứng viên mới đạt ngưỡng cũng được mời.
- Sinh lại `faq-index.json` và chạy eval như 0.4 / 0.5; ghi kết quả top-3 vào `docs/06-backend/support-chatbot/eval/eval-results.md`.
- Kiểm tổng trên trình duyệt qua gateway 8080 (tài khoản Mây Xanh, một ứng viên do `simulate-inflow` tạo, tài khoản Admin): F1–F5 theo kịch bản demo ở bước 10 của plan backend.

## Kịch bản demo đề xuất (để chuẩn bị buổi demo sau)

1. Mở song song ba cửa sổ: tổng quan Mây Xanh, `/admin/dashboard`, một ứng viên mới.
2. Chạy `simulate-inflow --waves 3 --every 60 --candidates 30 --jobs 2`.
3. Admin thấy "Đang chờ chấm lại" tăng rồi về 0. Mây Xanh thấy số "Phù hợp" tăng, nhận thông báo "Hệ thống đã tự mời N ứng viên".
4. Ứng viên thêm một kỹ năng; khoảng 1 phút sau, "Việc làm phù hợp" có thêm tin, có thể nhận lời mời tự động.

## Ước lượng

~0,5–1 ngày (F5 là phần lớn nhất).

## Phần 4 — Ghi chú của chủ dự án

