# Tăng hiển thị tin (nổi bật, tuyển gấp, làm mới) — Frontend

> **Trạng thái: HOÃN — hướng phát triển sau khoá luận (lập 2026-11-22).** Chưa code. Làm sau backend (`docs/06-backend/job-promotions/PLAN.md`). Quyết định kiến trúc: AD-30. Q1–Q5 đã chốt ở plan backend (Q2: khối nổi bật ở `/jobs` chỉ theo ngành / thành phố; Q3: mọi thành viên dùng lượt, chỉ quản trị viên công ty mua; Q5: trang Admin làm đầy đủ như F6). Mọi giao diện theo skill `sip-ui` (token, component có sẵn: `Badge`, `Button`, `Card`, `StatCard`, `Dialog`, `ConfirmDialog`, `Select`, `Toast`, `Panel`). Đọc `sip-ui` trước khi code.

## Mục tiêu

1. **Ứng viên / khách:** thấy khối "Việc làm nổi bật" ở trang chủ và đầu `/jobs`, huy hiệu "Nổi bật" / "Tuyển gấp" trên thẻ tin, lọc được tin tuyển gấp. Tin làm mới lên đầu danh sách mà không bị gắn "Mới".
2. **Nhà tuyển dụng:** dùng lượt tăng hiển thị ngay ở trang tin, thấy số dư lượt, mua thêm lượt lẻ, xem hiệu quả từng lần.
3. **Admin:** cấu hình hạn mức theo gói và giá lẻ, xem số liệu tổng.

## Hiện trạng (đọc code 2026-11-22)

- Trang chủ `app/page.tsx` có `LatestJobsSection` (4 tin đầu của `usePublicJobPosts({})`).
- `/jobs` (`app/jobs/page.tsx`): bộ lọc trên URL (`parseJobSearchParams` / `toJobSearchQuery`), `useJobPostSearch` tải từng trang, `JobFilters`, `JobCard`, `MatchScoreBadge`.
- `JobCard` (`components/ui/JobCard.tsx`) có prop `isNew` → `Badge tone="accent"` "Mới". Dùng ở `/jobs`, trang chủ, trang công ty, việc làm phù hợp, việc đã lưu, việc làm tương tự.
- Trang tin Employer `/employer/jobs/[id]`: hàng `StatCard` (lượt xem, ứng viên, …), `QuickActions`, `AutoOutreachCard`, `ApplicationAutomationCard`, `JobPostCompanyCard`.
- `/employer/subscription`: `SubscriptionStatusCard`, `PlanList` / `PlanCard` (checkout gói), bảng lịch sử gói. Trang return `/employer/subscription/return/{vnpay,momo}`.
- Dashboard Employer: `HiringProgressPanel` (tối đa 5 tin đang hiển thị).
- Admin: **chưa có** trang quản lý gói.

## Các bước

### F1 — Type và hook

- Dùng type mới từ `@sip/shared-types` (bước 7 backend).
- `hooks/useJobPromotions.ts`: `useFeaturedJobs(filter)`, `usePromotionBalance()`, `useApplyPromotion(jobId)` (xong thì làm mới số dư, chi tiết tin, danh sách tin), `useJobPromotionHistory(jobId)`, `usePromotionProducts()`, `usePromotionCheckout()`, `usePromotionPurchases()`; Admin: `useAdminPromotionStats(range)`, `useUpdatePromotionProduct()`. Gói: mở rộng `useSubscription` cho 5 cột hạn mức.
- `lib/job-promotions.ts`: nhãn loại (`Nổi bật`, `Tuyển gấp`, `Làm mới`), thông điệp cho từng mã lỗi 409, `isFeaturedNow`, `isUrgentNow`.

### F2 — Phía ứng viên

- `JobCard`: thêm `featured?`, `urgent?` → hai `Badge` cạnh "Mới" (tone theo `sip-ui`; "Tuyển gấp" dùng tone cảnh báo). Các chỗ đang dùng `JobCard` truyền `urgent` từ `job.urgentUntil`; chỉ khối nổi bật truyền `featured`.
- `components/jobs/FeaturedJobsSection.tsx`: tiêu đề "Việc làm nổi bật", lưới thẻ, nhãn "Nổi bật" trên từng thẻ, ẩn hẳn khi không có tin (không hiện khung trống). Link tới `/jobs/[id]?src=featured`.
- Trang chủ: chèn khối (6 tin, không lọc) trên "Tin mới trong tuần".
- `/jobs`: chèn khối (3 tin, theo `cityId` / `industryId` đang lọc — Q2) trên danh sách. Danh sách giữ nguyên; bỏ trùng `items` theo id khi ghép các trang (làm mới có thể đẩy một tin lên giữa lúc cuộn).
- `JobFilters`: thêm ô "Chỉ tin tuyển gấp" (`urgent=1` trên URL), cập nhật `parseJobSearchParams` / `toJobSearchQuery`.
- Trang chi tiết `/jobs/[id]`: chuyển `src` từ URL vào API chi tiết; hiện huy hiệu "Tuyển gấp" nếu còn hiệu lực.

### F3 — Employer: dùng lượt ở trang tin

- `/employer/jobs/[id]`: thẻ **"Tăng hiển thị"** (chỉ khi tin `PUBLISHED`), mỗi loại một dòng:
  - trạng thái hiện tại ("Đang nổi bật đến 29/11", "Làm mới lần cuối 21/11 14:00, làm mới lại được sau 22/11 14:00");
  - số lượt còn lại và số ngày của lượt kế tiếp;
  - nút "Đặt nổi bật" / "Gắn tuyển gấp" / "Làm mới" → `ConfirmDialog` nói rõ "dùng 1 lượt, không hoàn lại, kết thúc ngày …"; hết lượt thì nút thành "Mua thêm lượt" dẫn tới `/employer/subscription#mua-luot`.
  - Lỗi 409 hiện thông điệp từ `lib/job-promotions.ts` (ví dụ `QUALITY_TOO_LOW`: "Tin chưa đủ điều kiện nổi bật. Hãy bổ sung mô tả, yêu cầu và quyền lợi rồi thử lại.").
- Tin đang nổi bật / tuyển gấp: thêm huy hiệu cạnh trạng thái ở đầu trang và ở danh sách `/employer/jobs`.
- Không hiện điểm chất lượng cho nhà tuyển dụng (giữ Q1 của AD-29).

### F4 — Employer: số dư và mua lẻ

- `/employer/subscription`:
  - Khối **"Lượt tăng hiển thị"** dưới `SubscriptionStatusCard`: bảng 3 loại × (trong gói đã dùng / tổng, mua lẻ đã dùng / tổng, còn lại), ghi "hết hạn cùng gói ngày …".
  - Khối **"Mua thêm lượt"** (`id="mua-luot"`): chọn loại, số lượt (1–20), hiện đơn giá, số ngày mỗi lượt, tổng tiền, chọn VNPay / Momo. Chỉ `isCompanyAdmin` thấy nút mua; thành viên khác thấy ghi chú "Chỉ quản trị viên công ty mua được". Không có gói `ACTIVE` → khối bị khoá kèm lời nhắc mua gói.
  - Lịch sử mua lẻ (bảng nhỏ, cùng kiểu bảng lịch sử gói).
  - `PlanCard`: thêm dòng hạn mức tăng hiển thị của gói. Khi công ty còn lượt lẻ chưa dùng mà bấm mua gói mới: `ConfirmDialog` cảnh báo "N lượt mua lẻ còn lại sẽ mất cùng gói hiện tại".
- Trang return VNPay / Momo: đọc `kind` từ API trạng thái; `PROMOTION_PURCHASE` thì thông báo "Đã cộng N lượt …" và nút quay lại `/employer/subscription`.

### F5 — Employer: thống kê hiệu quả

- `/employer/jobs/[id]`: thẻ **"Hiệu quả tăng hiển thị"** dưới thẻ "Tăng hiển thị", chỉ hiện khi tin đã từng dùng lượt.
  - Mỗi lần dùng một dòng: loại, thời gian, *trước → trong* (trung bình mỗi ngày) cho lượt xem và hồ sơ; nổi bật thêm lượt xuất hiện, lượt bấm, tỉ lệ bấm.
  - Thứ tự chỉ số: lượt xuất hiện / bấm → lượt xem → hồ sơ.
  - Không đủ dữ liệu "trước": ghi "Chưa đủ dữ liệu để so sánh".
  - Lượt xem tăng mà hồ sơ không tăng: một dòng gợi ý trung tính "Nhiều người đã xem tin. Xem lại mô tả, yêu cầu và mức lương để tăng số hồ sơ." Không dùng chữ "hiệu quả kém".
- Dashboard: `HiringProgressPanel` thêm huy hiệu "Nổi bật" / "Tuyển gấp" ở dòng tin. Không thêm khối mới (dashboard đã được rút gọn theo nhận xét ngày 29/10).

### F6 — Admin

- Trang mới `/admin/subscription-plans` (thêm vào menu console; Q5 chốt làm đầy đủ):
  - Danh sách gói: tên, giá, số tin, thời hạn, hạn mức nổi bật / tuyển gấp / làm mới, số ngày mỗi lượt, đang bán; sửa trong `Dialog`.
  - **Giá lẻ**: 3 dòng (loại, đơn giá, số ngày, đang bán), sửa tại chỗ.
  - **Số liệu tăng hiển thị** (chọn 7 / 30 / 90 ngày): `StatCard` cho lượt dùng theo loại, doanh thu lẻ, tỉ lệ bấm khối nổi bật, số tin đang nổi bật / tuyển gấp; một bảng "lượt xem mỗi ngày trước / trong khi nổi bật". Biểu đồ (nếu có) theo skill `dataviz` + `sip-ui`.
- Nhật ký hoạt động: hành động `JOB_PROMOTION_APPLIED` có nhãn tiếng Việt trong bộ lọc / hiển thị hiện có.

### F7 — Kiểm trên trình duyệt

Qua `localhost:8080`, tài khoản demo Mây Xanh, `DEV_SKIP_PAYMENT_GATEWAY=true`:

1. Đặt nổi bật một tin → khối nổi bật ở trang chủ và `/jobs` có tin, có nhãn; lọc ngành khác → tin không hiện trong khối.
2. Gắn tuyển gấp → huy hiệu ở `/jobs`, trang chi tiết; bộ lọc "Chỉ tin tuyển gấp".
3. Làm mới → tin lên đầu `/jobs`, không có nhãn "Mới" nếu đăng đã lâu; bấm lại ngay → thông báo thời điểm làm mới lại được.
4. Hết lượt → nút "Mua thêm lượt" → mua → trang return → số dư tăng → dùng được.
5. Bấm thẻ ở khối nổi bật → số liệu lượt bấm tăng ở thẻ hiệu quả.
6. Admin sửa hạn mức gói và giá lẻ → Employer thấy số mới.
7. Màn hình hẹp (375 px): khối nổi bật, thẻ "Tăng hiển thị", khối mua lượt không vỡ.

## Không làm trong đợt này

- Thông báo lượt nổi bật sắp hết.
- Banner / logo nhà tuyển dụng trên trang chủ.
- Gợi ý tự động "nên làm nổi bật tin này".

## Phần 4 — Ghi chú của chủ dự án

<!-- Dành cho chủ dự án. -->
