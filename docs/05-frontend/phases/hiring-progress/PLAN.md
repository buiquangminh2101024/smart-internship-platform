# Số ứng viên phù hợp và tiến độ tuyển theo tin (0.3) — Frontend

> **Trạng thái: XONG (2026-11-11).** Đợt A (F1, F2, F4), đợt B (F3, F3b) và F5 (kiểm trên trình duyệt) đều xong. Kết quả F5 ở cuối mục Ghi chú triển khai. Backend (`docs/06-backend/hiring-progress/PLAN.md`) đã xong, có API ở bước 5 và 6 bên đó.
>
> Làm theo 2 đợt, mỗi đợt một commit, rồi kiểm trên trình duyệt một lần:
>
> - **Đợt A = F1 + F2 + F4** (trang tổng quan và danh sách tin). F2 bỏ lượt xem và tỉ lệ nộp khỏi trang tổng quan, F4 đưa hai số này sang `/employer/jobs`, nên làm cùng một commit để không có lúc hai số này biến mất khỏi giao diện.
> - **Đợt B = F3 + F3b** (thẻ tự mời ở trang tin và trang tìm ứng viên). Cả hai đọc `useJobAutoOutreach` với cùng các trường `matched`, `matchedApplied`, `matchScoresAt`.
> - **F5** sau cả hai đợt.

Mục 0.3 của `docs/01-project/FEATURE_BACKLOG.md`.

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency. Theo quy ước UI của skill `sip-ui` (token, `Panel`/`PanelHead`, `BlockSkeleton`/`BlockError` của dashboard).
- TanStack Query:
  - hook mới `useEmployerHiringProgress` trong `hooks/useEmployerDashboard.ts`;
  - thẻ tự mời dùng lại `hooks/useAutoOutreach.ts`; chỉ thêm trường hiển thị.
- **Không thêm khối mới ở trang tổng quan**: khối "Hiệu quả tin đang hiển thị" được thay bằng "Tiến độ tuyển theo tin" ở **đúng vị trí cũ**.

## Phần 2 — Liên kết giữa các phần

| Trang | Thay đổi | API |
|---|---|---|
| `/employer/dashboard` | `HiringProgressPanel` thay `JobPerformancePanel` | `GET /employer/dashboard/hiring-progress` |
| `/employer/jobs/[id]` | Thẻ "Tự động mời ứng viên" thêm dòng "Phù hợp" và "Phỏng vấn" | `GET …/auto-outreach` (thêm trường) |
| `/employer/jobs/[id]/candidate-search` | Dòng "N người điểm cao nhất trong M người phù hợp"; danh sách vẫn chấm trực tiếp | `GET …/auto-outreach` (đọc `status.matched`) |
| `/employer/jobs` | `JobMeta` thêm "Phù hợp N" (`matchedCount`, backend bước 6 đã có) và tỉ lệ nộp | `GET /employer/job-posts` |

Làm mới dữ liệu: khi có `AUTO_OUTREACH_SENT` hoặc ứng viên trả lời lời mời, `SocketProvider` đã làm mới key của thẻ 0.2. Thêm key `hiring-progress` vào cùng nhóm làm mới.

> Cập nhật 2026-11-11 (khi làm đợt A): key của hook mới là `["employer", "dashboard", "hiring-progress"]`, nằm dưới `EMPLOYER_DASHBOARD_KEY`. Mọi thông báo realtime tới Employer (gồm `AUTO_OUTREACH_SENT` và `CANDIDATE_OUTREACH_INVITATION_RESPONDED`) đã làm mới cả nhóm `["employer", "dashboard"]`, nên `SocketProvider` không cần sửa.

## Phần 3 — Các bước thực hiện

### Bước F1 — `HiringProgressPanel` (trang tổng quan)

```text
Tiến độ tuyển theo tin
Đã tuyển 3/20 người trên 8 tin đang hiển thị · 126 ứng viên phù hợp · cập nhật 03:30

Tin tuyển dụng          Phù hợp        Đã mời  Nhận lời  Phỏng vấn  Đã tuyển   Hạn nộp
Backend Node.js         32 (12 đã nộp)   12       3          2      0/2 ▓░░    còn 3 ngày
Frontend React          18 (4 đã nộp)     0       0          1      0/3        12/12/2026
                                                                     Bật tự mời →
...
Xem tất cả 8 tin đang hiển thị →
```

- Hiện 5 tin theo thứ tự backend trả về ("cần chú ý"), không sắp lại ở client.
- **Cột Đã tuyển:**
  - "a/b" với `b = hiringTarget`, kèm thanh nhỏ (dùng lại `Bar` đang có trong `JobPerformancePanel`);
  - đủ chỉ tiêu thì tô màu thành công;
  - tin chưa bật tự mời: thêm link nhỏ "Bật tự mời" tới `/employer/jobs/[id]`, **chỉ khi `ownedByViewer`**, vì thẻ cài đặt chỉ người đăng tin thấy. Người khác thấy chữ "Chưa bật tự mời", không có link.
- **Cột Phù hợp:**
  - `matchScoresAt = null` thì hiện "Đang chấm…", không hiện 0;
  - số là link tới trang tìm ứng viên của tin (`/employer/jobs/[id]/candidate-search`).
- **Hạn nộp:** còn ≤ 7 ngày thì tô marigold, giống bảng cũ.
- **Dòng phụ dưới tiêu đề:** tổng đã tuyển / tổng chỉ tiêu, tổng phù hợp, giờ cập nhật (`scoredAt`). Đây là dòng chữ, không phải thẻ số mới.
- **Màn hẹp:** danh sách dạng thẻ như `NarrowList` hiện có. Mỗi tin 2 dòng: tiêu đề + "Đã tuyển a/b"; "Phù hợp · Đã mời · Nhận lời · Phỏng vấn".
- **Trạng thái rỗng:** "Chưa có tin nào đang hiển thị…" như cũ.
- **Tải và lỗi:** `BlockSkeleton` / `BlockError` riêng của khối.

### Bước F2 — Gỡ `JobPerformancePanel`

- `dashboard/page.tsx` dùng `HiringProgressPanel` thay `JobPerformancePanel`, sửa chú thích đầu file cho đúng thứ tự khối.
- **Xoá** `components/dashboard/employer/JobPerformancePanel.tsx` (chủ dự án đồng ý 2026-11-10). Lượt xem và tỉ lệ nộp chuyển sang `/employer/jobs` (F4). Chuyển `Bar` sang `HiringProgressPanel` trước khi xoá.

### Bước F3 — Thẻ "Tự động mời ứng viên" (`jobs/[id]`)

Thêm một dòng trên dòng trạng thái hiện có:

```text
Phù hợp 32 (12 đã nộp) · Phỏng vấn 2
Đang giữ 12/12 lời mời · 3 đã nhận lời · Đã tuyển 0/2
```

- "Phù hợp" là link tới trang tìm ứng viên của tin.
- `matchScoresAt = null` thì hiện "Đang chấm…".
- Lưu cài đặt đổi ngưỡng ⇒ làm mới thẻ (đã có), số Phù hợp đổi theo ngưỡng mới mà không cần chấm lại.

### Bước F3b — Trang tìm ứng viên (`jobs/[id]/candidate-search`)

- Danh sách "Gợi ý" **giữ chấm trực tiếp** như hiện tại. Chuyển sang đọc bảng điểm cùng lúc với tự mời của 0.2, sau 0.6.
- Thêm một dòng trên danh sách: "10 người điểm cao nhất trong 32 người phù hợp (12 đã nộp đơn)". Lý do: từ trang tổng quan bấm vào số "Phù hợp 32" sang đây mà chỉ thấy 10 người thì dễ thắc mắc.
- Số lấy từ `status.matched` / `status.matchedApplied` của `GET …/auto-outreach` (backend bước 5b), dùng lại hook `useAutoOutreach`. Khi làm, kiểm hai API có cùng quyền xem không (cả hai hiện đều chỉ cho người đăng tin). Nếu khác quyền thì báo lại, không tự thêm endpoint.
- `matchScoresAt = null` thì không hiện dòng này.
- Số người thật sự hiện ra có thể ít hơn 10 (pool nhỏ, hoặc đã mời hết), nên câu chữ dùng số thực tế: "N người điểm cao nhất…".

### Bước F4 — Danh sách tin (`/employer/jobs`)

- `JobMeta` đã có lượt xem và số ứng viên. Thêm:
  - "Tỉ lệ nộp x%" (hồ sơ / lượt xem, ẩn khi chưa có lượt xem; cùng cách tính với bảng cũ);
  - "Phù hợp N" cho tin đang hiển thị (backend bước 6 đã có `matchedCount`).
- `matchedCount` chỉ có ở tin `PUBLISHED` chưa quá hạn. Thiếu trường thì không hiện "Phù hợp". Danh sách tin không có `matchScoresAt`, nên tin vừa duyệt và chưa chấm xong (khoảng vài giây) hiện "Phù hợp 0".

### Bước F5 — Kiểm trên trình duyệt

Với tài khoản Mây Xanh của bộ demo lớn:

1. Trang tổng quan có đúng 5 tin, đúng thứ tự "cần chú ý". Số khớp API. Không có khối mới so với trước.
2. Đăng nhập một employer khác cùng công ty (không phải người đăng tin): thấy bảng, không thấy link "Bật tự mời".
3. Đổi ngưỡng ở thẻ tin 80 → 70 ⇒ số Phù hợp ở thẻ và ở trang tổng quan (sau khi làm mới) tăng.
4. Ứng viên nhận lời mời ⇒ cột "Nhận lời" tăng mà không cần tải lại trang (socket).
5. Màn hẹp 375 px: không cuộn ngang.
6. `npm run build` / `typecheck` cho web.

## Ngoài phạm vi

- Trang riêng liệt kê tiến độ của mọi tin: dùng "Xem tất cả" sang `/employer/jobs`.
- Biểu đồ phễu: giáo viên đã nhắc không nhồi biểu đồ không cần thiết.

## Ghi chú triển khai

### Đợt A — F1 + F2 + F4 (xong 2026-11-11)

- **File:**
  - mới: `components/dashboard/employer/HiringProgressPanel.tsx`, `components/employer/MatchedCount.tsx`;
  - sửa: `hooks/useEmployerDashboard.ts` (`useEmployerHiringProgress`, `HIRING_PROGRESS_KEY`), `app/employer/(portal)/dashboard/page.tsx`, `app/employer/(portal)/jobs/page.tsx`;
  - xoá: `components/dashboard/employer/JobPerformancePanel.tsx`.
- **`MatchedCount`:** dùng chung cho số "Phù hợp" ở F1, F4, và sẽ dùng ở F3. Số là link tới trang tìm ứng viên. `pending` thì hiện "Đang chấm…". Ghi "(x đã nộp)" khi x > 0.
- **Lệch so với mô tả F1, đã cân nhắc:**
  - Bảng 7 cột chỉ hiện từ `@4xl` (896 px vùng nội dung), không phải `@2xl` như bảng cũ, vì 7 cột không vừa. Màn 1280 px thì thấy bảng; màn 1024 px dùng dạng thẻ.
  - Thẻ ở màn hẹp có 3 dòng, không phải 2: dòng 3 là hạn nộp và "Bật tự mời". Gộp vào 2 dòng thì dòng 2 xuống hàng lộn xộn ở 375 px.
  - "Bật tự mời" / "Chưa bật tự mời" không hiện ở tin đã đủ chỉ tiêu, vì lúc đó không cần mời thêm.
  - `Bar` không chuyển nguyên mà viết lại: thanh so đã tuyển với chỉ tiêu (không còn so với tin nhiều hồ sơ nhất), đủ chỉ tiêu thì màu `success-600`, số kèm chữ ẩn "(đã đủ chỉ tiêu)".
  - Dòng phụ ghi "điểm phù hợp cập nhật lúc HH:mm ngày DD/MM" từ `scoredAt`; không có `scoredAt` thì bỏ phần này.
- **F4:** "Tỉ lệ nộp x%" hiện ở mọi trạng thái tin khi có lượt xem (cách tính như bảng cũ). "Phù hợp N" chỉ khi có `matchedCount`.
- **`SocketProvider` không sửa** (xem Phần 2).
- **Việc để lại cho đợt B (đã làm ở đợt B):** sau khi lưu cài đặt, `useUpdateJobAutoOutreach` phải làm mới khối tiến độ tuyển và danh sách tin.
- **Đã kiểm:** `tsc --noEmit`, `eslint` (các file sửa không có cảnh báo), `next build` của web đều qua. Chưa xem trên trình duyệt, để tới F5.

### Đợt B — F3 + F3b (xong 2026-11-11)

- **File sửa:** `components/employer/AutoOutreachCard.tsx`, `app/employer/(portal)/jobs/[id]/candidate-search/page.tsx`, `hooks/useAutoOutreach.ts`.
- **Quyền xem (F3b):** `GET …/candidate-search` và `GET …/auto-outreach` cùng kiểm `employerId` của tin, người khác nhận 404 (`requireOwnedJobPost` / `requireOwnedJob`). Hai API cùng quyền, nên dùng lại `useJobAutoOutreach`, không thêm endpoint.
- **F3:**
  - Dòng "Phù hợp 32 (12 đã nộp) · Phỏng vấn 2" (dùng `MatchedCount`) nằm ngay trên khung trạng thái.
  - Dòng này hiện ở mọi trạng thái của tin `PUBLISHED`, kể cả khi chưa bật tự mời, vì đó là lúc số này giúp quyết định có bật hay không.
  - Tin nháp hoặc chờ duyệt thì không hiện, vì chưa có điểm.
  - Còn thiếu một trường hợp: tin đã quá hạn nhưng chưa bị đóng vẫn hiện dòng này.
- **Làm mới sau khi lưu cài đặt:** `useUpdateJobAutoOutreach` làm mới thêm `HIRING_PROGRESS_KEY` và `["employerJobPosts"]` (key của danh sách tin). Ghi chú đợt A nói "hiện chỉ làm mới chi tiết tin" là chưa chính xác: trước đây hook làm mới "Gợi ý" / "Đã mời" của tin (`["employer", "job-posts", jobId]`) và số liệu trang "Lời mời", chưa làm mới hai chỗ này.
- **F3b, câu chữ lệch so với mô tả:**
  - "Gợi ý" vẫn chấm trực tiếp và không lọc theo ngưỡng. Bước 8 (b) của backend có tin mà 3 trong 10 người hiện ra ở dưới ngưỡng. Vì vậy câu "N người điểm cao nhất trong M người phù hợp" chỉ dùng khi mọi người đang hiện đều đạt ngưỡng và N ≤ M.
  - Nếu không, câu là: "M người phù hợp với ngưỡng X% (K đã nộp đơn). Dưới đây là N người điểm cao nhất chưa ứng tuyển, P người dưới ngưỡng". Khi M = 0: "Chưa có ứng viên đạt ngưỡng X%. …".
  - Dòng chỉ hiện khi danh sách có người, `matchScoresAt` khác null và API tự mời đọc được.
- **Đã kiểm:** `tsc --noEmit`, `eslint` các file sửa, `next build` của web đều qua. Kết quả trên trình duyệt ở F5.

### F5 — Kiểm trên trình duyệt (2026-11-11)

Chạy với server, web và gateway của chủ dự án. Đăng nhập `tuyendung-mayxanh@large-demo.local`; công ty có 32 tin đang hiển thị, 3 người đăng tin.

1. **Đạt.**
   - Trang tổng quan có 5 tin. Thứ tự đúng "cần chú ý": cả 5 tin chưa tuyển ai, không tin nào còn ≤ 7 ngày, nên xếp theo hạn nộp gần (9, 10, 11, 18, 20 ngày).
   - Mọi ô Phù hợp, Đã mời, Nhận lời, Phỏng vấn khớp `GET /employer/dashboard/hiring-progress`.
   - Dòng phụ: "Đã tuyển 7/82 người trên 32 tin đang hiển thị · 497 ứng viên phù hợp · điểm phù hợp cập nhật lúc 16:30 ngày 11/11".
   - Không có khối mới.
2. **Đạt, sau khi sửa một lỗi.**
   - Không đăng nhập bằng tài khoản thứ hai, vì 5 tin trong bảng đã gồm cả tin của người xem lẫn tin của tech-2 và tech-3.
   - Tin của người khác hiện chữ "Chưa bật tự mời", không có link.
   - **Lỗi tìm thấy:** số Phù hợp vẫn là link sang trang tìm ứng viên, trong khi trang đó trả "Job post not found" cho người không đăng tin (đã mở thử `clargedemojob0242`).
   - **Đã sửa:** `MatchedCount` thêm prop `linked`.
     - Trang tổng quan chỉ link khi `ownedByViewer`.
     - `/employer/jobs` không link, vì danh sách gồm tin cả công ty và DTO không cho biết người đăng tin.
   - **Có từ trước, ngoài phạm vi 0.3:** nút "Tìm ứng viên phù hợp" ở trang chi tiết tin cũng hiện cho mọi employer trong công ty, nên dẫn tới cùng lỗi này. Đã sửa ở mục "Sửa kèm sau F5" bên dưới.
3. **Đạt.**
   - Tin `clargedemojob0292`, chưa bật tự mời nên không gửi lời mời nào. Đổi ngưỡng 80 → 70 rồi lưu.
   - Thẻ đổi ngay từ "Phù hợp 23 (1 đã nộp)" thành "Phù hợp 39 (3 đã nộp)".
   - Bấm "Tổng quan" trên menu (không tải lại trang): dòng của tin là 39, tổng là 513 (497 + 16).
   - `/employer/jobs` hiện "Phù hợp 39". Trang tìm ứng viên hiện "10 người điểm cao nhất trong 39 người phù hợp (3 đã nộp đơn)."
   - Sau đó đã đặt lại ngưỡng 80, số Phù hợp về 23.
4. **Đạt.**
   - Ứng viên `ung-vien-1173@large-demo.local` nhận lời mời `clargedemoinv250` của tin `clargedemojob0292`, gọi API bằng curl.
   - Trang tổng quan đang mở và không tải lại: cột Nhận lời từ 0 lên 1 sau vài giây, chuông thông báo từ 6 lên 7.
   - Thao tác này ghi lên Neon:
     - lời mời chuyển `ACCEPTED`;
     - có thêm 1 thông báo cho Employer và 1 email trong outbox, gửi tới địa chỉ `.local`;
     - có thêm 1 hội thoại.
5. **Đạt.**
   - Cửa sổ trình duyệt không thu được, nên đo trong iframe rộng 375 px (cùng origin, giữ phiên đăng nhập).
   - `/employer/dashboard`, `/employer/jobs`, trang tin và trang tìm ứng viên đều có `scrollWidth = clientWidth`, không cuộn ngang.
   - Khối tiến độ hiện dạng thẻ, đọc được.
6. **Đạt.** `tsc --noEmit`, `npm run lint --workspace web` (0 lỗi; 23 cảnh báo có từ trước, không thuộc file của 0.3), `next build` đều qua.

### Sửa kèm sau F5: nút "Tìm ứng viên phù hợp" cho người không đăng tin (2026-11-11, chủ dự án đồng ý)

Lỗi có từ B3 (tìm và mời ứng viên), không do 0.3 gây ra. F5 mới phát hiện, nên sửa kèm ở đây. Cách sửa giống trang "Lời mời" (`OutreachJobProgressDto.isOwner`).

- **Backend:**
  - `JobPost.isOwner?` trong shared-types;
  - `JobPostsService.getOwn` và `listOwn` gán `isOwner` bằng cách so `employerId` của tin với người xem. Không thêm truy vấn, vì `employerId` đã có trong dòng tin.
  - Các API khác trả `JobPostDto` (sửa, gửi duyệt, đóng tin…) không có trường này.
  - Thêm 2 test vào `tests/unit/hiring-progress.test.ts`. Cả bộ 466 test unit đều qua.
- **Trang chi tiết tin:** khi `isOwner === false`, nút bị khoá kèm icon ổ khoá và dòng chữ "Chỉ người đăng tin mới tìm và mời được." Thiếu trường (`undefined`) thì giữ nút như cũ.
- **`/employer/jobs`:** số "Phù hợp N" lại có link khi `isOwner`. Lúc kiểm F5, link này đã bị tắt.
- **Đã kiểm trên trình duyệt:**
  - `clargedemojob0242` (của tech-2) hiện nút khoá;
  - API trả `isOwner` false cho `0242` và true cho `0292`;
  - trang đầu `/employer/jobs` có 20 tin, trong đó 9 tin của người xem; cả 9 có link, các tin khác không có.
- **Kiểm thêm:** `tsc` của web và server, `eslint`, `next build` đều qua. Typecheck gộp cả `scripts` và `tests` chỉ báo lỗi ở `scripts/seed-education-catalog.ts`, file có từ trước và không liên quan.

## Phần 4 — Ghi chú của chủ dự án
