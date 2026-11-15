# Chấm lại theo ứng viên gần thời gian thực (0.6) — Frontend

> **Trạng thái: ĐANG TRIỂN KHAI. Đợt 2 (F3 + F4), đợt 3 (F5) và đợt 1 (F1, F2, câu chữ FAQ của F6) xong 2026-11-15; kiểm tổng trên trình duyệt cùng ngày, đạt (xem cuối F6). Còn mở: khoảng trống ở cột trái dashboard Admin, lượt đêm chưa ghi nhận.** Lập kế hoạch 2026-11-14, các câu hỏi của plan backend đã chốt. Thứ tự đợt: 2 (F3 + F4) → 3 (F5) → 1 (F1 + F2 + câu chữ FAQ của F6) → kiểm tổng. Làm sau khi backend xong bước tương ứng (ghi ở từng bước dưới đây).

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
- *Đã làm 2026-11-15:* `/jobs` ghi "Điểm phù hợp cập nhật trong vài phút sau khi bạn sửa hồ sơ, chỉ mang tính tham khảo." Grep thêm thấy ghi chú của "Việc làm phù hợp" khi danh sách còn tính tạm (`source = "LIVE"`, ứng viên chưa có dòng điểm) vẫn ghi "trong vòng một ngày"; đổi thành "Danh sách đầy đủ sẽ có sau vài phút, khi hệ thống chấm xong hồ sơ của bạn." (`JobRecommendationsClient.tsx`). Không còn chuỗi nào trong `apps/web/src` nói điểm cập nhật hằng đêm.

### F2 — Thông báo cho ứng viên mới (7b)

- Theo Q3 của backend (đã chốt): dùng lại `JOB_ALERT`, nên không thêm loại thông báo. Chỉ kiểm câu chữ và link của thông báo gộp khi nó đến từ lần chấm đầu (không phải từ tin mới), và kiểm `SocketProvider` vẫn làm mới "Việc làm phù hợp".
- Nếu Q3 chốt một loại thông báo mới: thêm nhãn, icon và nhóm ở chỗ khai báo loại thông báo của web (như `PROFILE_SKILLS_REMINDER` ở 0.5).
- Phụ thuộc: backend bước 4.
- *Đã làm 2026-11-15:* link `/recommended-jobs` đúng; `SocketProvider` vẫn làm mới "Việc làm phù hợp" khi nhận `JOB_ALERT` (cả khi thông báo được sửa tại chỗ). **Sửa câu chữ ở backend:** khi có từ 2 tin, thân thông báo ghi "Mới nhất: …", nhưng ở lần chấm đầu cả loạt tin được báo cùng lúc và tin kèm theo là tin **điểm cao nhất**. Thêm `firstScored?: boolean` vào dữ liệu `JOB_ALERT` (`notification.types.ts`); `onCandidatesFirstScored` truyền `true`; template ghi "Phù hợp nhất: …" thay cho "Mới nhất: …". Tiêu đề "N tin mới phù hợp với bạn" giữ nguyên (tin mới với ứng viên đó). Báo tin theo tin mới trong cùng ngày sau đó vẫn sửa thông báo thành "Mới nhất: …". Test template thêm trường hợp này; unit test server 652/652. Cần khởi động lại server mới có hiệu lực.

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
- *Đã làm 2026-11-15 (câu chữ FAQ):*
  - `03` mục `match-score`: điểm ở `/jobs` và "Việc làm phù hợp" cập nhật trong vài phút sau khi sửa hồ sơ (bỏ "mỗi đêm"), thêm câu mẫu "Sửa hồ sơ bao lâu thì điểm phù hợp cập nhật?". Mục `job-alert`: ứng viên mới được báo **một lần** các tin đạt ngưỡng; sửa hồ sơ không báo lại.
  - `02` mục `recommended-jobs`: danh sách đầy đủ có sau vài phút (bỏ "trong vòng một ngày"), sửa hồ sơ thì danh sách cập nhật trong vài phút.
  - `07`: FAQ chưa có mục nào về tự động mời, nên thêm mục `auto-outreach` (5 câu mẫu): thẻ "Tự động mời ứng viên", không cần mời tay khi bật, ứng viên mới / vừa sửa hồ sơ đạt ngưỡng cũng được mời trong vài phút, số "Phù hợp" tự cập nhật, tỉ lệ hạn mức ở trang "Lời mời" (0% thì không tự mời).
  - Eval (`faq-index.json` sinh lại, phiên bản `971e53eba49a`): trả thẳng 8/110, đúng 8/8, chặn nhầm 0/95, không đổi. Chọn đoạn cho prompt (`server`): top-1 55/94, top-3 74/94, không đổi. Bộ bỏ dấu nhân tạo (93 câu): top-3 27 → 23/79. Tách thử: mục `auto-outreach` lấy 1, phần còn lại do nội dung mới của `02` / `03` (bỏ câu mẫu mới của `match-score` không đổi số). Câu gõ không dấu thật (17 câu) không đổi. Bản đầu có câu mẫu "Bật tự động mời ứng viên ở đâu?" kéo q070 "Có cách nào chủ động tìm sinh viên phù hợp để mời không?" sang `auto-outreach` (top-1 55 → 54); đổi thành "Cài đặt tự động mời cho tin ở đâu?" thì q070 về đúng mục.
- Kiểm tổng trên trình duyệt qua gateway 8080 (tài khoản Mây Xanh, một ứng viên do `simulate-inflow` tạo, tài khoản Admin): F1–F5 theo kịch bản demo ở bước 10 của plan backend.
- *Kiểm tổng 2026-11-15 (gateway 8080, server `tsx watch` đã nạp sửa F2):* `simulate-inflow --waves 2 --every 60 --candidates 15 --jobs 1 --wait`; mỗi đợt 15/15 ứng viên, 1/1 tin (hai tin rơi vào Mây Xanh), hết người chờ chấm 41 giây sau đợt cuối, lượt cuối 15 người trong 3,3 giây.
  - **F4:** trang tổng quan Mây Xanh mở sẵn, không tải lại: "ứng viên phù hợp" 528 → 563 (08:51:44) → 581 (08:52:42), đếm bằng MutationObserver.
  - **F5:** thẻ Admin hiện "12 ứng viên · lâu nhất 1 phút", rồi "Không có ứng viên nào đang chờ", lượt "08:52, chấm 15 người trong 3,3 giây", "Tin đã báo cho ứng viên 199" (gồm báo tin cho ứng viên demo có sẵn khi hai tin mô phỏng được đăng). Có một quãng ~1,5 phút thẻ không đổi, nhiều khả năng do cửa sổ Chrome bị che nên tab bị coi là ẩn (`refetchIntervalInBackground: false`); sau đó "cập nhật lúc" nhảy đúng nhịp. Ở 375px (iframe 375px vì cửa sổ không thu nhỏ được) thẻ gọn, trang không tràn ngang.
  - **F1:** ứng viên mô phỏng đăng nhập, `/jobs` hiện câu mới.
  - **F2:** chuông của ứng viên 0001: "1 tin mới phù hợp với bạn", link `/recommended-jobs`. Đọc DB (chỉ đọc): 22/30 ứng viên mô phỏng có `JOB_ALERT`; người có ≥ 2 tin ghi "Phù hợp nhất: …"; 0008 và 0012 ghi "Mới nhất: [Mô phỏng] UI/UX Design Intern…" vì tin đợt 2 đăng sau đã sửa thông báo, đúng thiết kế.
  - **F3:** tạm hạ tỉ lệ Mây Xanh về 0% rồi bật tự mời cho tin "[Kiểm 0.5 #2] Thực tập sinh Backend Node.js": thẻ hiện câu mới và link "Chỉnh tỉ lệ ở trang Lời mời" (tài khoản là quản trị viên công ty). Đã tắt tự mời của tin và trả tỉ lệ về 80% (68/86). Thẻ tự mời của tin mô phỏng không hiện với tài khoản này vì tin do employer khác của Mây Xanh đăng (đúng quyền).
  - **Còn mở:**
    - Desktop: thêm thẻ vào cột phải làm cột phải dài hơn bàn duyệt, cột trái có khoảng trống lớn trước hàng biểu đồ. Hướng sửa: bỏ bàn duyệt (Admin bản D2), plan ở `docs/05-frontend/phases/dashboard-v2/PLAN.md`, chờ duyệt.
    - "Chấm đêm gần nhất" ghi "Chưa ghi nhận lượt nào trong 7 ngày qua": chưa có lượt 03:30 nào chạy khi server bật kể từ bước 8. Cần kiểm lại sau một đêm server chạy.
    - Dữ liệu mô phỏng (30 tài khoản `@inflow-demo.local`, 2 tin `[Mô phỏng] `) còn trên Neon; xoá bằng `simulate-inflow --reset` khi chủ dự án đồng ý.

## Kịch bản demo đề xuất (để chuẩn bị buổi demo sau)

1. Mở song song ba cửa sổ: tổng quan Mây Xanh, `/admin/dashboard`, một ứng viên mới.
2. Chạy `simulate-inflow --waves 3 --every 60 --candidates 30 --jobs 2`.
3. Admin thấy "Đang chờ chấm lại" tăng rồi về 0. Mây Xanh thấy số "Phù hợp" tăng, nhận thông báo "Hệ thống đã tự mời N ứng viên".
4. Ứng viên thêm một kỹ năng; khoảng 1 phút sau, "Việc làm phù hợp" có thêm tin, có thể nhận lời mời tự động.

## Ước lượng

~0,5–1 ngày (F5 là phần lớn nhất).

## Phần 4 — Ghi chú của chủ dự án

