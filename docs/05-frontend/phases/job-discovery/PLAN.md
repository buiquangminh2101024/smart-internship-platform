# Ứng viên thấy nhiều việc phù hợp, xếp theo ưu tiên (0.5) — Frontend

> **Trạng thái: ĐÃ LẬP KẾ HOẠCH (2026-11-12), CHƯA TRIỂN KHAI.** Làm sau các bước backend tương ứng của `docs/06-backend/job-discovery/PLAN.md`.

Mục 0.5 của `docs/01-project/FEATURE_BACKLOG.md`. Quyết định kiến trúc: AD-26. Backend: `docs/06-backend/job-discovery/PLAN.md` (D1–D12, Q1–Q4). Nền: `docs/05-frontend/phases/candidate-insights/PLAN.md` ("Việc làm phù hợp", "Phân tích hồ sơ"), `docs/05-frontend/phases/phase-06-job-recruitment/PLAN.md` (`/jobs` bản tối giản).

## Mục tiêu

- "Việc làm phù hợp" có nhiều tin, "Xem thêm", lý do xếp hạng theo từng tiêu chí trên mỗi thẻ, gợi ý kỹ năng còn thiếu, thanh độ hoàn thiện.
- `/jobs` dùng được với vài trăm tin: "Xem thêm", tổng số, sắp xếp, điểm phù hợp và nhãn trên thẻ, bộ lọc mới, bộ lọc nằm trên URL, bộ lọc kỹ năng tìm được thay cho bức tường chip, khung chờ, ngăn kéo bộ lọc trên điện thoại.
- `/profile` luôn có thanh độ hoàn thiện kèm danh sách mục còn thiếu; thẻ phân tích thu hẹp thành "Nhận xét cách viết hồ sơ (AI)".
- Cài đặt có ba công tắc job alert; trung tâm thông báo có hai loại mới.

Thứ tự bước theo mức lộ ra khi demo: F1–F3 trước, F4–F5 (job alert) sau. Nếu thiếu thời gian, F4–F5 là phần cắt được.

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency. React Query (`useInfiniteQuery` cho "Xem thêm"), `next/navigation` (`useSearchParams`, `router.replace`) cho bộ lọc trên URL.
- **Bắt buộc đọc skill `sip-ui` trước khi viết giao diện**; dùng token và component sẵn có (`Card`, `Badge`, `Button`, `Select`, `Input`, `Dialog`, `JobCard`, `MatchScoreBadge`).
- Ô chọn kỹ năng: tìm component chọn kỹ năng đã có ở `JobPostForm` để dùng lại; không có thì viết một combobox nhỏ trong `components/jobs/` (không thêm thư viện).
- `/jobs` gọi API bằng token ứng viên khi đã đăng nhập (`apiFetch("candidate", …)`), khách vẫn dùng `publicFetch`. Khoá query gồm cả trạng thái đăng nhập để không lẫn cache giữa khách và ứng viên.

## Phần 2 — Liên kết giữa các phần

```
/recommended-jobs  JobRecommendationsClient
  ├─ useJobRecommendations (useInfiniteQuery, GET /candidate/job-recommendations?cursor=)
  ├─ ProfileCompletenessCard (gọn)  ← useProfileCompleteness (GET /candidate/profile-completeness)
  ├─ RecommendationItem → MatchReasons (từ MatchResult)
  └─ SkillGapSuggestions (suggestions của trang đầu)

/jobs  PublicJobsPage
  ├─ useJobSearchParams (đọc / ghi bộ lọc trên URL)
  ├─ usePublicJobPosts → useInfiniteQuery (GET /job-posts, token nếu là ứng viên)
  ├─ JobFilters (thanh lọc desktop / ngăn kéo điện thoại), SkillFilter (combobox)
  └─ JobCard + viewer {matchScore, saved, applied}

/profile  CandidateProfileClient
  ├─ ProfileCompletenessCard (đầy đủ, có danh sách mục)
  └─ ProfileInsightCard → "Nhận xét cách viết hồ sơ (AI)" (chỉ strengths + WRITING)

/settings  → JobAlertSettingsCard ← GET/PATCH /candidate/job-alert-settings
Trung tâm thông báo → JOB_ALERT, PROFILE_SKILLS_REMINDER; realtime JOB_ALERT → invalidate job-recommendations
```

## Phần 3 — Các bước thực hiện

### Bước F1 — "Việc làm phù hợp" (`/recommended-jobs`)

- `useJobRecommendations` chuyển sang `useInfiniteQuery`; nút "Xem thêm" khi có `nextCursor`; dòng "N tin phù hợp với hồ sơ của bạn" từ `total`.
- Câu mô tả đầu trang bỏ chữ "gần đây"; thêm một dòng nhỏ: "Không hiện tin bạn đã ứng tuyển hoặc đã được mời."
- **`MatchReasons`** trên mỗi thẻ (component mới trong `components/jobs/`, dùng chung được với nơi khác sau này), từ `MatchResult`:
  - "Kỹ năng bắt buộc 3/4", "Kỹ năng ưu tiên 1/2" (chỉ hiện thành phần `applicable`);
  - kinh nghiệm: "Đạt yêu cầu" / "Gần đạt" / "Chưa đạt" / không hiện khi tin không yêu cầu;
  - học vấn: "Đúng ngành" / "Ngành liên quan" / không hiện khi không áp dụng;
  - nội dung: "Tương đồng cao / vừa / thấp" theo `semantic.normalized` (ngưỡng chia đặt trong code, ghi chú là số do thiết kế);
  - "Còn thiếu: Docker, Kafka" (tối đa 3 kỹ năng `MISSING`, bắt buộc trước).
  - Giữ dòng "độ tin cậy thấp" hiện có.
- **Thanh độ hoàn thiện gọn** ở đầu trang khi điểm < 100: "Hồ sơ hoàn thiện 65%" + dòng **"Nên làm trước"** từ `nextStep`, ví dụ "Nên làm trước: thêm kinh nghiệm — 7/10 tin phù hợp với bạn yêu cầu kinh nghiệm" + link tới đúng chỗ. `nextStep` không có bằng chứng thì chỉ ghi tên mục và lợi ích. Ẩn khi 100%.
- **`SkillGapSuggestions`**: khối "Kỹ năng nên bổ sung" từ `suggestions` (`SKILL_GAP`, `INDUSTRY_MISMATCH`), mỗi dòng có số tin làm bằng chứng. Ẩn khi rỗng.
- `source: "LIVE"`: không có "Xem thêm"; thêm dòng "Danh sách đầy đủ sẽ có sau khi hệ thống cập nhật hồ sơ của bạn (trong vòng một ngày)."
- Nhãn "Mới" giữ theo `isRecentlyPublished`.

### Bước F2 — `/jobs`

- **Bộ lọc trên URL:** `q`, `cityId`, `industryId`, `jobType`, `salaryMin`, `salaryKind`, `experience`, `skillIds` (danh sách), `skillMode`, `sort`, `minMatch`. Bấm vào tin rồi quay lại giữ nguyên bộ lọc và vị trí "Xem thêm" đã tải (React Query giữ cache trang).
- **Thanh lọc:** giữ ô từ khoá, Địa điểm, Ngành nghề, Loại hình, Lương. Thêm:
  - "Kinh nghiệm" (Không yêu cầu / Dưới 1 năm / 1–2 năm / Trên 2 năm — Q3/Q5 của plan backend; "Trên 2 năm" hiện ra 0 tin, hiện trạng thái trống như mọi bộ lọc khác);
  - "Lương" thêm hai lựa chọn "Có ghi mức lương" / "Thoả thuận" (tách khỏi "Từ x triệu" thành ô riêng nếu gộp gây rối — chọn khi làm, ghi vào ghi chú);
  - **kỹ năng:** combobox tìm và chọn nhiều thay cho danh sách chip toàn danh mục; công tắc "Có ít nhất một / Đủ tất cả";
  - ứng viên đăng nhập: công tắc "Chỉ tin phù hợp với tôi (≥ 70%)".
- **Dòng "Đang lọc":** chip cho mỗi bộ lọc đang bật, bấm x để bỏ, nút "Xoá tất cả".
- **Đầu danh sách:** "N việc làm" + ô "Sắp xếp: Mới nhất / Phù hợp nhất" (lựa chọn thứ hai chỉ hiện khi là ứng viên; khách thấy link nhỏ "Đăng nhập để xếp theo mức phù hợp").
- **Thẻ tin:** `MatchScoreBadge` + "Phù hợp x%" khi có `viewer.matchScore`; nhãn "Đã lưu", "Đã ứng tuyển", "Mới". Ghi chú nhỏ cuối danh sách: "Điểm phù hợp cập nhật hằng đêm theo hồ sơ của bạn."
- **"Xem thêm"** bằng `useInfiniteQuery`; khung chờ thẻ thay cho chữ "Đang tải...".
- **Điện thoại (< md):** chỉ hiện ô từ khoá + nút "Bộ lọc (n)" mở `Dialog` dạng ngăn kéo chứa các bộ lọc còn lại; kiểm không có cuộn ngang ở 375 px.
- Không đổi `CandidateHomeHeader`, `SiteFooter`, trang chi tiết tin.

### Bước F3 — `/profile`: độ hoàn thiện và thẻ phân tích

- **`ProfileCompletenessCard`** (đầy đủ) ở đầu cột phải hoặc trên `ProfileInsightCard`:
  - thanh %;
  - khối **"Nên làm trước"** nổi bật ở trên cùng (từ `nextStep`, kèm số tin làm bằng chứng nếu có);
  - tám mục chia ba nhóm theo `group`: **"Cần có để dùng các tính năng"** (kỹ năng, CV, bật cho liên hệ), **"Giúp điểm phù hợp chính xác hơn"** (kinh nghiệm, dự án, tiêu đề/giới thiệu, học vấn có chọn ngành), **"Giúp lọc việc"** (thành phố);
  - mỗi mục chưa xong có lợi ích một dòng và link/nút tới đúng phần (cuộn tới mục trong trang `/profile`, hoặc `/cv`, hoặc công tắc liên hệ).
- Nhãn và lợi ích theo `key` đặt trong một file hằng ở web, ví dụ:
  - kỹ năng: "Cần có để hệ thống gợi ý việc làm, báo tin mới và để nhà tuyển dụng tìm thấy bạn";
  - CV: "Cần có để ứng tuyển";
  - bật cho liên hệ: "Để nhà tuyển dụng và hệ thống tự gửi lời mời cho bạn";
  - kinh nghiệm: "Nhiều tin yêu cầu kinh nghiệm; có thông tin này thì điểm phù hợp chính xác hơn";
  - dự án: "Chưa đi làm thì dự án là thứ thể hiện bạn làm được gì";
  - học vấn: "Chọn ngành trong danh sách thì hệ thống mới so được với ngành tin yêu cầu";
  - thành phố: "Cần để lọc việc gần bạn và nhận báo tin cùng thành phố".
- **Không** ghi kiểu "tăng x% điểm" hay "điểm sẽ cao hơn": điền thêm có thể làm điểm giảm nếu không khớp yêu cầu của tin (AD-26 mục 8).
- Sau khi ứng viên sửa hồ sơ ở `/profile`, invalidate `profile-completeness` và `job-recommendations`.
- **`ProfileInsightCard`:** đổi tiêu đề thành "Nhận xét cách viết hồ sơ (AI)"; bỏ `CompletenessBar` và hai nhóm `SKILL_GAP` / `INDUSTRY_MISMATCH` khỏi phần hiển thị; giữ điểm mạnh và `WRITING`, nút, hạn mức như cũ. Không xoá component `CompletenessBar` nếu `ProfileCompletenessCard` dùng lại được.

### Bước F4 — Cài đặt job alert (`/settings`)

- `JobAlertSettingsCard`: ba công tắc "Báo khi có tin mới phù hợp", "Gửi email tổng hợp mỗi ngày" (mờ khi tắt công tắc đầu), "Chỉ tin ở thành phố của tôi". Lỗi 400 vì chưa có thành phố → hiện câu nhắc kèm link `/profile`.
- Một dòng giải thích: "Hệ thống tự báo khi có tin mới phù hợp từ 70% trở lên với hồ sơ của bạn."

### Bước F5 — Thông báo

- Thêm `JOB_ALERT` (icon tìm việc, link `/recommended-jobs`) và `PROFILE_SKILLS_REMINDER` (icon hồ sơ, link `/profile`) vào bảng icon/nhóm của trung tâm thông báo và chuông. Nhóm (`NOTIFICATION_GROUP_BY_TYPE`) và nhãn nút (`NOTIFICATION_ACTION_LABEL`) trong `lib/notifications.ts` đã thêm ở bước 7 backend để web biên dịch được; F5 xem lại nhãn và thêm icon.
- Realtime `JOB_ALERT` → invalidate `job-recommendations` và danh sách thông báo (thông báo gộp cập nhật tại chỗ, không nhân đôi trong danh sách đã cache).

### Bước F6 — FAQ và kiểm trên trình duyệt

- FAQ chatbot hỗ trợ: thêm câu hỏi về job alert (ở đâu tắt, vì sao nhận), "Việc làm phù hợp" xếp thế nào, độ hoàn thiện hồ sơ; sinh lại `faq-index` và chạy eval như 0.4.
- Kiểm trên `localhost:8080` (chủ dự án chạy server). Tài khoản dùng để kiểm:
  - ứng viên trưng bày của bộ `large-demo` (`uv-backend-1@…` và các tài khoản khác). Lưu ý cả sáu người đều đủ 100% nên thẻ độ hoàn thiện ẩn;
  - **`ung-vien-0248@large-demo.local`** cho thẻ độ hoàn thiện (Q7 của plan backend): thiếu kinh nghiệm, nên 85%, và "Nên làm trước: thêm kinh nghiệm — 4/10 tin…". Dự phòng `ung-vien-0599@large-demo.local`;
  - một ứng viên mới tạo (chưa có kỹ năng).
  1. "Việc làm phù hợp": > 10 tin, "Xem thêm", lý do trên thẻ khớp trang chi tiết tin, khối kỹ năng nên bổ sung, thanh gọn.
  2. `/jobs` khi là khách và khi là ứng viên: tổng số, "Xem thêm", sắp "Phù hợp nhất", từng bộ lọc, chip "Đang lọc", quay lại giữ bộ lọc, nhãn trên thẻ; 375 px không cuộn ngang, ngăn kéo bộ lọc dùng được.
  3. `/profile`: thanh luôn hiện, tám mục đúng ba nhóm, link tới đúng chỗ, điền thêm mục thì % tăng; "Nên làm trước" đổi theo hồ sơ (ứng viên thiếu kinh nghiệm mà nhiều tin hợp nhất yêu cầu kinh nghiệm thấy "thêm kinh nghiệm" kèm số tin); học vấn không chọn ngành vẫn tính là thiếu; thẻ AI đổi tên, không còn thanh và gợi ý code.
  4. Job alert: Admin duyệt một tin của Mây Xanh → ứng viên đạt ngưỡng thấy thông báo realtime; duyệt tin thứ hai → cùng thông báo thành "2 tin"; tắt alert trong Cài đặt thì không nhận.
  5. Ứng viên mới chưa có kỹ năng: nhận thông báo nhắc (chạy script `--reminders`), bấm vào tới `/profile`.
  - `tsc` sạch ở web.

## Ngoài phạm vi

- Lưu bộ lọc làm job alert, trang quản lý job alert.
- Thiết kế lại trang chủ, trang chi tiết tin, trang công ty, trang "Đã lưu".
- Bộ lọc ngày đăng, sắp hết hạn (chủ dự án bỏ 2026-11-12); hình thức làm việc, cấp bậc; tìm không dấu; gợi ý khi gõ.

## Ghi chú triển khai

*(Ghi trong quá trình làm, theo từng bước.)*

## Phần 4 — Ghi chú của chủ dự án

