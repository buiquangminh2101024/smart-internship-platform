# Xếp hạng ứng viên (A3) — Frontend

Quyết định kiến trúc: `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-13 mục 9. **Không có PLAN backend** — không đổi code backend, `score` (`ApplicationMatchSummary`) và `coverLetter` (`Application`) đã có sẵn ở 2 endpoint hiện có. Bản nháp lập luận: `docs/temp/AI_A1_A3_A4_B2_B3_MERGE_NOTES.md`.

**Trạng thái: MỚI LẬP KẾ HOẠCH (2026-09-27), CHƯA TRIỂN KHAI.**

## Quyết định đã chốt (chủ dự án chọn 2026-09-27)

| # | Quyết định |
|---|---|
| D1 | AD-13 đã sửa (mục 9): Employer được chủ động chọn sắp xếp theo điểm, khác thứ tự mặc định do hệ thống tự chọn. |
| D2 | Thêm đúng 1 tiêu chí phụ: có `coverLetter` hay không, dùng làm tie-break khi điểm bằng nhau. |
| D3 | **Không** làm vòng đánh giá số liệu riêng cho phần sort này — chỉ demo định tính. |

## Thay đổi duy nhất: `app/employer/(portal)/jobs/[id]/applications/page.tsx`

Trang này đã gọi `useEmployerJobApplications(jobId, status)` (danh sách đơn, có `coverLetter`) và (theo `JobMatchCard`/AD-13) một hook lấy `ApplicationMatchSummary[]` để hiển thị cột "Phù hợp" — đã join theo `applicationId` cho badge.

1. Thêm **control sắp xếp** (dropdown hoặc 2 nút) cạnh bộ lọc trạng thái hiện có: "Mới nhất" (mặc định, giữ nguyên thứ tự API trả về — **không đổi hành vi hiện tại**) / "Phù hợp nhất".
2. Khi chọn "Phù hợp nhất": dùng lại đúng mảng đã join (đơn + score) cho badge, sort theo:
   - `score` giảm dần (`null`/`status !== "SCORED"` coi là thấp nhất, xếp cuối);
   - điểm bằng nhau (kể cả cùng `null`) ⇒ đơn có `coverLetter` (không rỗng) xếp trước.
3. Đổi `sortMode` **chỉ đổi thứ tự hiển thị ở FE**, không gọi lại API, không đổi query key.
4. Thêm 1 dòng chú thích nhỏ dưới control: "Điểm chỉ mang tính tham khảo, không phải quyết định tuyển dụng." (đúng câu đã dùng ở `JobMatchCard`, giữ nhất quán).

Không thêm hook mới, không thêm component mới đáng kể (có thể tách `sortApplicationsByMatch()` thành hàm thuần nhỏ trong cùng file hoặc `lib/` nếu muốn test, nhưng không bắt buộc).

## Các bước thực hiện

1. Thêm control sort + hàm sort thuần + chú thích. **Test:** mặc định vẫn đúng thứ tự cũ; chọn "Phù hợp nhất" ⇒ đơn điểm cao lên đầu; 2 đơn cùng điểm, 1 đơn có thư xin việc ⇒ đơn có thư lên trước; đơn `status ≠ SCORED` luôn ở cuối dù chọn kiểu sort nào.
2. Kiểm thủ công trên trình duyệt với 1 tin có ≥5 đơn, điểm và có/không `coverLetter` khác nhau.

## Ngoài phạm vi

- Sort/lọc theo điểm ở bất kỳ danh sách nào khác (trang tin công khai, saved-jobs...).
- Vòng đánh giá số liệu (Spearman/NDCG) cho việc sort này — D3 đã chốt bỏ qua.
- Đổi API, đổi `ApplicationMatchSummary`.

## Ghi chú triển khai

*(để trống — điền khi làm xong)*

## Phần ghi chú của chủ dự án

*(để trống)*
