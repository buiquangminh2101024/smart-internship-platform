# Việc làm tương tự (trang chi tiết tin) — Frontend

Song song với `docs/06-backend/similar-jobs/PLAN.md` (API, quyết định S1–S7; **không chép lại ở đây**).

**Trạng thái: SJ1–SJ2 XONG (2026-10-07).** Có 2 chỗ lệch so với plan, xem mục "Kết quả SJ1–SJ2".

## Quyết định

1. **Vị trí:** khối "Việc làm tương tự" đặt **dưới phần nội dung tin**, trong `<main>` của `app/jobs/[id]/page.tsx`, sau `JobPostContent`. Không đặt ở cột phụ, vì cột này đã có thẻ điểm phù hợp và thẻ công ty.
2. **Thẻ tin dùng lại `components/ui/JobCard.tsx`** (đang dùng ở `/jobs`, trang công ty, việc làm phù hợp), map `JobPostDto` sang props giống `JobRecommendationsClient.tsx`. Dòng "Cùng kỹ năng: React, SQL" đặt vào slot `footer` có sẵn của `JobCard`, chỉ hiện khi `sharedSkills` không rỗng (nhánh vector có thể trả tin không trùng kỹ năng nào). Không hiện con số cosine thô.
3. Lưới 1 cột trên điện thoại, 2 cột từ màn hình vừa trở lên (ban đầu định 4 cột trên màn hình rộng, xem "Kết quả SJ1–SJ2"). Có skeleton khi đang tải. Rỗng hoặc lỗi thì **ẩn cả khối** (S4), không hiện thông báo lỗi.
4. Hook tải riêng, không chặn phần nội dung tin; chỉ gọi khi đã có `job`.
5. Không thêm thư viện; giao diện theo skill `sip-ui`.
6. **Hai nhánh của backend (S6) hiển thị giống nhau.** Khối giữ cùng tiêu đề "Việc làm tương tự" dù kết quả đến từ vector hay từ kỹ năng trùng. Frontend không đọc `similarity` (kiểu `number | null`), nên không cần phân biệt nhánh.

## Hook mới

| Hook | Query key | Ghi chú |
|---|---|---|
| `useSimilarJobs(jobId)` (trong `hooks/useJobPosts.ts`) | `["job-posts", jobId, "similar"]` | `publicFetch`, `staleTime` ~5 phút, `retry: false` |

## Các bước thực hiện

| Bước | Nội dung | Ước lượng |
|---|---|---|
| SJ1 | `useSimilarJobs` + component `components/jobs/SimilarJobsSection.tsx` | ~40 phút |
| SJ2 | Gắn vào `app/jobs/[id]/page.tsx`, kiểm trên trình duyệt ở trạng thái khách và ứng viên, kiểm hiển thị điện thoại | ~20 phút |

## Kết quả SJ1–SJ2

- `useSimilarJobs(jobId)` trong `hooks/useJobPosts.ts`.
- `components/jobs/SimilarJobsSection.tsx`, gắn sau `JobPostContent` trong `app/jobs/[id]/page.tsx`.
- Mỗi thẻ là một link `<a>` bọc `JobCard`, nên dùng được bàn phím (Tab, Enter) và mở tab mới. Có viền focus `brand-500`. Các thẻ trong cùng một hàng cao bằng nhau.
- Kiểm trên trình duyệt (khách, dữ liệu thật, ngưỡng 0,6):
  - FE Web ra 3 tin: FE Product (trùng React, Git), Node (không trùng kỹ năng nên không có footer), Java (trùng Git).
  - Tin Kế toán: API trả `[]`, khối ẩn hẳn.
  - Ở 375px, lưới còn 1 cột và thẻ không tràn.
  - Focus bằng Tab hiện rõ.
- `tsc` sạch. `eslint` không báo lỗi mới ở 3 file đã sửa; cảnh báo `window.location.href` ở `page.tsx` có từ trước.
- Chưa kiểm ở trạng thái ứng viên đăng nhập, vì không dùng mật khẩu thật. Khối này chỉ gọi `publicFetch` và không đọc store auth, nên hiển thị không phụ thuộc trạng thái đăng nhập.

**Lệch so với plan:**

1. **Tối đa 2 cột thay vì 4.** `JobCard` đặt tiêu đề cạnh logo. Ở 4 cột (thẻ rộng khoảng 264px), tiêu đề chỉ còn "Thực tập sinh Fr…". Mọi tin đều bắt đầu bằng "Thực tập sinh", nên phần bị cắt lại chính là phần phân biệt các tin. 4 tin xếp thành 2×2.
2. **Không truyền `tags` cho `JobCard`.** Dòng "Cùng kỹ năng" ở footer đã nói về kỹ năng. Thêm 5 tag kỹ năng thì thẻ dài gấp đôi.

**Sửa thêm (theo yêu cầu chủ dự án):** ở 375px, mọi trang dùng `CandidateHomeHeader` bị cuộn ngang khoảng 57px khi chưa đăng nhập, do nhãn nút "Tạo hồ sơ miễn phí". Dưới `sm` nút chỉ ghi "Tạo hồ sơ" và khoảng cách giữa logo với nhóm nút giảm từ `gap-8` xuống `gap-4`; từ `sm` trở lên giữ nguyên. Đã đo hết tràn ở 375px trên `/jobs`, `/jobs/[id]`, `/companies`. Ở 320px vẫn tràn khoảng 30px, chưa xử lý.

`EmployerHomeHeader` (`/employer`) cũng được sửa luôn. Trước đây menu không ẩn trên điện thoại, nên ở 375px trang rộng khoảng 800px. Sau khi sửa:

- **Menu:** ẩn dưới `xl`, vì ở 1024px các link bị xuống dòng.
- **Dưới `md`:** ẩn badge "Doanh nghiệp"; nút khách rút gọn thành "Đăng nhập" / "Đăng tin".
- **Khi đã đăng nhập:**
  - Dưới `sm`, nút "Tin tuyển dụng" chỉ còn icon.
  - Nút tài khoản là icon, chỉ ghi email ở `lg` (cắt "…" khi dài). Từ `xl` menu hiện lại và email dài sẽ đẩy menu xuống nhiều dòng.
  - Nhãn bị ẩn vẫn còn cho trình đọc màn hình (`sr-only`).
- **Đã đo:** không tràn ở 375 / 640 / 768 / 1024 / 1280 / 1440px, cả khi là khách và khi đã đăng nhập. Trạng thái đăng nhập được giả lập bằng một user không có token trong `localStorage`, đo xong đã trả lại giá trị cũ. Ở 1280px trở lên, menu nằm trên một dòng.

## Phần ghi chú của chủ dự án

*(để trống)*

## Lịch sử thay đổi

- **2026-10-07** — Theo S6–S7 của backend:
  - `SimilarJobItem.similarity` đổi thành `number | null`;
  - footer "Cùng kỹ năng" chỉ hiện khi có kỹ năng trùng;
  - hai nhánh hiển thị như nhau.

  Không đổi bước hay ước lượng.
- **2026-10-07** — SJ1–SJ2 xong. Lưới đổi thành tối đa 2 cột, không truyền `tags` (lý do ở "Kết quả SJ1–SJ2").
