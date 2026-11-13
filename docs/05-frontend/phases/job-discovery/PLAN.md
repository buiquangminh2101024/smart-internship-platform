# Ứng viên thấy nhiều việc phù hợp, xếp theo ưu tiên (0.5) — Frontend

> **Trạng thái: ĐÃ LẬP KẾ HOẠCH (2026-11-12). Backend xong 2026-11-13. XONG F1 + F3 (lượt 1), F2 (lượt 2) và F4 + F5 (lượt 3), 2026-11-13, đã kiểm trên trình duyệt qua 8080. Còn F6.**

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

Thứ tự làm, chốt với chủ dự án 2026-11-13: lượt 1 là F1 + F3 (dùng chung thẻ độ hoàn thiện, hook và khoá cache), lượt 2 là F2, lượt 3 là F4 + F5, cuối cùng F6. Kiểm trên trình duyệt sau từng lượt; F6 chỉ còn FAQ, eval và một vòng kiểm tổng.

### Lượt 1 — F1 + F3 (2026-11-13)

**File mới:**
- `lib/profile-completeness.ts`:
  - nhãn, việc cần làm, nhãn nút, lợi ích và link của tám mục;
  - tên ba nhóm;
  - `describeNextStep`;
  - `PROFILE_SECTION_ID`, các neo trên `/profile`.
- `hooks/useProfileCompleteness.ts`:
  - `useProfileCompleteness` (`staleTime` 0, vì CV sửa ở `/cv`);
  - `useInvalidateProfileDerived`, làm mới độ hoàn thiện và "Việc làm phù hợp".
- `components/candidate/ProfileCompletenessCard.tsx`, dạng `compact` và `full`. `CompletenessBar` chuyển từ `ProfileInsightCard` sang đây.
- `components/jobs/MatchReasons.tsx`: lý do theo tiêu chí và "Còn thiếu" (tối đa 3, bắt buộc trước).

**F1 (`/recommended-jobs`):**
- `useJobRecommendations` chuyển sang `useInfiniteQuery`, giữ khoá `["candidate", "job-recommendations"]` (export `JOB_RECOMMENDATIONS_KEY` để F5 dùng).
- Có "N tin phù hợp với hồ sơ của bạn · đang xem M", "Xem thêm" và báo lỗi khi tải thêm thất bại.
- Đường LIVE có dòng giải thích, không có "Xem thêm".
- Thẻ độ hoàn thiện gọn ẩn khi 100%, và cả khi đang tải hoặc lỗi, để không chặn danh sách.
- Khối "Kỹ năng nên bổ sung" / "Có thể bạn muốn cân nhắc" lấy từ `suggestions` của trang đầu. Danh sách tin liên quan nằm trong `<details>`.

**Khác plan:**
- `MatchReasons` hiện thêm hai trường hợp plan không liệt kê, vì đây đúng là thứ "Nên làm trước" nhắc tới:
  - kinh nghiệm `UNKNOWN`: "Tin yêu cầu x năm kinh nghiệm, hồ sơ chưa có";
  - học vấn `UNKNOWN`: "Tin ghi ngành học, hồ sơ chưa chọn ngành".

  Học vấn `NONE` ghi "Khác ngành tin yêu cầu". Mỗi dòng có icon kèm chữ, màu không là kênh duy nhất.
- Ngưỡng mức tương đồng nội dung: cao ≥ 0,7, vừa ≥ 0,4. Với `ung-vien-0248`, `semantic.normalized` của 56 tin trải từ 0,11 tới 1, nên đủ cả ba mức.

**F3 (`/profile`):**
- Thẻ độ hoàn thiện đầy đủ đặt trên thẻ AI. Khối "Nên làm trước" dùng `Card tone="brand"`.
- Tám mục chia ba nhóm, lưới hai cột từ `sm`. Mục còn thiếu có lợi ích và link tới đúng phần.
- Đủ 100% thì danh sách gập vào "Xem tám mục".
- Các phần có `id` và `scroll-mt-24`. Hồ sơ tải bất đồng bộ, nên khi tải xong trang tự cuộn tới `#…` một lần.
- Sửa hồ sơ (học vấn, kỹ năng, kinh nghiệm, dự án, thông tin cá nhân, công tắc cho liên hệ) thì gọi `useInvalidateProfileDerived`. Lần tải đầu không gọi, để thẻ không tải hai lần.
- `ProfileInsightCard`: tiêu đề "Nhận xét cách viết hồ sơ (AI)"; bỏ thanh %, `SKILL_GAP` / `INDUSTRY_MISMATCH`, huy hiệu "AI" (tiêu đề đã ghi) và câu "dựa trên N tin" (LLM không đọc tin). Nút, hạn mức và câu chữ nút giữ như cũ.

**Kiểm trên `localhost:8080`:**
- `ung-vien-0248`:
  - thẻ gọn 85%, lý do trên thẻ khớp `MatchResult`;
  - "Xem thêm" 10 → 20 tin trên 56, không cuộn ngang;
  - "Thêm kinh nghiệm" mở `/profile#ho-so-kinh-nghiem` và cuộn đúng chỗ;
  - thẻ đầy đủ đúng ba nhóm, thẻ AI đổi tên.
- `uv-kiem-0-5` (đường LIVE):
  - 10 tin, có dòng LIVE, không có "Xem thêm";
  - "Nên làm trước: chọn ngành học — 8/10 tin…";
  - chọn thành phố rồi lưu ⇒ thẻ tự lên 35% và "Thành phố — đã có", không tải lại trang. API độ hoàn thiện của tài khoản LIVE mất khoảng 3 s.
- Ở 375px (iframe rộng 375px), cả hai trang không cuộn ngang. Không có lỗi console.
- `tsc` web sạch. ESLint các file đã sửa chỉ còn cảnh báo `_unused` có từ trước ở `CandidateProfileClient.tsx`.

**Lưu ý dữ liệu:** hai tin kiểm `[Kiểm 0.5 #1/#2]` của bước 8 backend đang nằm trong top 10 của `ung-vien-0248`. Chúng đẩy các tin cần kinh nghiệm xuống, nên "Nên làm trước" của tài khoản này không còn kèm "4/10 tin" (chỉ còn 2/10, dưới ngưỡng 3). Đóng hai tin kiểm thì số này trở lại như Q7.

### Lượt 2 — F2 (2026-11-13)

**File mới:**
- `lib/job-search-params.ts`: đọc / ghi bộ lọc trên URL (tên tham số trùng GET /job-posts, `skillIds` dạng `a,b`), chuyển sang query API, chip "Đang lọc", "Xoá tất cả" (giữ cách sắp xếp).
- `components/jobs/SkillFilter.tsx`: combobox kỹ năng (mẫu ARIA combobox + listbox, ↑/↓/Enter/Esc, tìm không phân biệt dấu, tối đa 8 gợi ý, tối đa 10 kỹ năng như server). Có từ hai kỹ năng thì hiện "Có ít nhất một / Có đủ tất cả". Không dùng lại `SkillMultiSelect` vì ô đó gắn với đề xuất kỹ năng mới và số năm.
- `components/jobs/JobFilters.tsx`: thanh lọc từ `md` (từ khoá + năm ô chọn + kỹ năng + công tắc ≥ 70%) và ngăn kéo `Dialog` dưới `md` (nút "Bộ lọc (n)", cuối ngăn kéo "Xoá bộ lọc" / "Xem N việc làm").

**Sửa:**
- `app/jobs/page.tsx` viết lại: Suspense bọc phần dùng `useSearchParams`; đổi bộ lọc bằng `router.replace(…, { scroll: false })`; tổng số "N việc làm · đang xem M"; "Sắp xếp" chỉ cho ứng viên, khách thấy link "Đăng nhập để xếp theo mức phù hợp"; khung chờ thẻ; trạng thái trống có / không có bộ lọc; lỗi có nút "Thử lại"; ghi chú điểm cập nhật hằng đêm.
- `hooks/useJobPosts.ts`: thêm `useJobPostSearch` (`useInfiniteQuery`, khoá có `guest` / `candidate`, `keepPreviousData`, chờ đọc xong phiên đăng nhập mới gọi). `usePublicJobPosts` giữ nguyên cho trang chủ và trang công ty.
- `components/ui/JobCard.tsx`: thêm prop `href` — tiêu đề là link phủ cả thẻ (Tab tới được, Ctrl+bấm mở tab mới). Chỗ dùng cũ không đổi.

**Quyết định khi làm:**
- **Một ô "Lương"** gộp `salaryKind` và `salaryMin`: Mọi mức lương / Có ghi mức lương / Thoả thuận / Từ 3, 5, 8, 12 triệu. Hai tham số không đi cùng nhau ("từ x triệu" đã ngầm là có ghi lương), nên tách hai ô chỉ thêm tổ hợp vô nghĩa.
- Mọi thao tác lọc truyền hàm cập nhật và tính trên bộ lọc mới nhất đã gửi, vì `router.replace` chưa đổi URL ngay: chọn hai kỹ năng liền nhau trước đây làm mất kỹ năng đầu (gặp khi kiểm).
- Khách có `sort=match` / `minMatch` trên URL thì bị bỏ qua (không gửi, không hiện chip), cùng cách server xử lý.
- Thẻ tin giữ nhãn loại hình và ngành như cũ, chưa thêm kỹ năng.

**Kiểm trên `localhost:8080`:**
- Khách: 314 việc làm · đang xem 20, không có công tắc ≥ 70%, có link đăng nhập để xếp theo mức phù hợp.
- `uv-kiem-0-5`: chọn React rồi Node.js ⇒ 38 tin; "Có đủ tất cả" ⇒ 10 tin; thêm "Trên 2 năm" ⇒ 0 tin, thẻ trống có "Xoá tất cả bộ lọc"; bỏ chip React ⇒ chip "Có đủ tất cả" tự mất. Từ khoá "backend" + "Thoả thuận" ⇒ 7 tin. Mở tin rồi Back ⇒ giữ bộ lọc. "Xem thêm" lên 40 tin, mở tin thứ 31 rồi Back ⇒ vẫn 40 tin, đúng vị trí cuộn.
- `ung-vien-0248`: thẻ có "Phù hợp x%"; "Phù hợp nhất" sắp 88, 87, 82, … giảm dần; bật ≥ 70% ⇒ 16 tin, chip "Phù hợp từ 70%"; nhãn "Đã ứng tuyển" hiện trên tin đã nộp.
- 375 px (iframe): không cuộn ngang, "Bộ lọc (1)" mở ngăn kéo toàn màn hình, nút cuối "Xem 37 việc làm". Lỗi console duy nhất là thuộc tính `fdprocessedid` do tiện ích trình duyệt chèn vào nút, không do code.
- `tsc` web sạch; ESLint các file đã sửa không có cảnh báo.

### Lượt 3 — F4 + F5 (2026-11-13)

**File mới:**

- `hooks/useJobAlertSettings.ts`: `useJobAlertSettings` (khoá `["candidate", "job-alert-settings"]`, `staleTime: 0` vì thành phố đổi ở `/profile`) và `useUpdateJobAlertSettings` (mỗi công tắc một PATCH; đổi ngay khi bấm, lỗi thì trả lại như cũ).
- `components/settings/JobAlertSettingsCard.tsx`: thẻ "Báo tin việc làm phù hợp" có câu giải thích ngưỡng 70% và ba công tắc. Thẻ có neo `#bao-tin-viec-lam` để FAQ (F6) link thẳng tới. Có khung chờ, lỗi tải kèm "Thử lại", lỗi lưu hiện dưới thẻ.

**Sửa:**

- `components/settings/SettingsPage.tsx`: ứng viên thấy thẻ báo tin ở đầu trang Cài đặt. Sửa luôn nền công tắc khi tắt: `bg-border-strong` không có trong token nên trước đây nền trong suốt, nay dùng `bg-text-subtle` như các công tắc khác.
- `lib/notifications.ts`: thêm `notificationIcon(type)`, có icon riêng cho `JOB_ALERT` (`briefcase`) và `PROFILE_SKILLS_REMINDER` (`user-round-pen`), các loại khác dùng icon nhóm. `NotificationCenter` dùng hàm này. Nhãn nút giữ như bước 7 backend ("Xem việc làm phù hợp", "Cập nhật hồ sơ"), khớp link server trả về (`/recommended-jobs`, `/profile`).
- `components/realtime/SocketProvider.tsx`: nhận `JOB_ALERT` thì làm mới `JOB_RECOMMENDATIONS_KEY`. Danh sách thông báo vốn đã được làm mới với mọi sự kiện. Thông báo gộp được sửa tại chỗ (cùng id), nên làm mới là đủ, không chèn thêm vào cache. Thông báo trình duyệt dùng tag theo id nên trình duyệt cũng thay bản cũ.

**Quyết định khi làm:**

- Hai công tắc sau ("Gửi email tổng hợp mỗi ngày", "Chỉ tin ở thành phố của tôi") đều mờ khi tắt công tắc đầu, vì cả hai chỉ có tác dụng khi đang bật báo tin. Plan chỉ ghi công tắc email. Hai công tắc này vẫn bấm được để chuẩn bị sẵn trước khi bật lại.
- Chưa có thành phố thì công tắc "Chỉ tin ở thành phố của tôi" vẫn bấm được. Server trả 400 `JOB_ALERT_CITY_REQUIRED` thì hiện câu nhắc kèm link "Chọn thành phố" (`/profile#ho-so-thong-tin`). Dòng mô tả cũng nói trước điều này. Đã bật rồi bỏ thành phố khỏi hồ sơ thì dòng mô tả báo hiện không có tin nào được báo.
- Trong lúc đang lưu, cả ba công tắc tạm khoá để các PATCH không về lệch thứ tự.
- Phía ứng viên, chuông và trang `/notifications` không hiện icon theo loại (chỉ có chấm chưa đọc), còn `NotificationCenter` chỉ dùng ở Employer / Admin. Vì vậy icon mới chưa hiện ở đâu với ứng viên. Muốn hiện thì phải thêm icon vào chuông và trang thông báo dùng chung cho cả ba khu vực, chưa làm vì ngoài plan.

**Kiểm trên `localhost:8080` (`ung-vien-0248`, có thành phố Đà Nẵng):**

- Thẻ hiện đúng ba công tắc theo dữ liệu server (bật, bật, tắt) và dòng "Thành phố trên hồ sơ: Đà Nẵng".
- Tắt "Báo khi có tin mới phù hợp" ⇒ hai công tắc sau mờ, dòng email đổi thành câu nhắc bật công tắc đầu. Tải lại trang vẫn tắt (đã lưu). Bật lại ⇒ trở về như cũ.
- Giả lập server trả 400 `JOB_ALERT_CITY_REQUIRED` (chặn XHR trong trang, không ghi dữ liệu) ⇒ công tắc trả về tắt, hiện "Hồ sơ của bạn chưa có thành phố. Chọn thành phố trước rồi bật lại." với link `/profile#ho-so-thong-tin`. Lỗi khác ⇒ "Không lưu được cài đặt. Kiểm tra kết nối rồi thử lại."
- Mở `/settings#bao-tin-viec-lam` cuộn tới đúng thẻ. Ở 375 px (iframe) không cuộn ngang.
- Chưa kiểm realtime `JOB_ALERT` đầu cuối vì cần Admin duyệt tin thật trên Neon. Để vào vòng kiểm tổng F6 (mục 4).
- `tsc` web sạch; ESLint các file đã sửa không có cảnh báo.

## Phần 4 — Ghi chú của chủ dự án

