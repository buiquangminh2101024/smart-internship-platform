# Job Matcher — Giai đoạn 2: Embedding (semantic) (Frontend)

Tiếp nối `docs/05-frontend/phases/job-matcher-phase1/PLAN.md`, song song với `docs/06-backend/job-matcher-phase2/PLAN.md` (công thức, hợp đồng `MatchResult.semantic`, cờ `JOB_MATCHER_MODE`, bộ đánh giá — **không chép lại ở đây**). Phạm vi FE của GĐ2 rất nhỏ: **không có màn hình hay route mới**; bộ đánh giá chạy bằng script ở backend.

**Trạng thái: đã lên kế hoạch (2026-09-20), CHƯA triển khai.** Chỉ làm sau khi backend GĐ2 bước 4 xong (response đã có `semantic.enabled/available`, `weightsVersion`, `semanticStatus`) và **sau khi bộ đánh giá chốt mặc định `JOB_MATCHER_MODE`** — nếu mặc định vẫn là `rule` thì dòng mới không bao giờ hiện và phần này chỉ cần kiểm tra không làm hỏng gì.

## Quyết định mới chốt khi lên kế hoạch

1. **Giao diện chỉ dựa vào hai cờ backend đã cung cấp, không tự suy ra cấu hình từ `weightsVersion`:** `semantic.enabled = false` ⇒ **ẩn** dòng (tính năng tắt, như GĐ1); `enabled && available` ⇒ hiện "Độ tương đồng nội dung: X%" (X = `semantic.normalized × 100`, làm tròn); `enabled && !available` ⇒ "Độ tương đồng nội dung: chưa tính được" (model lỗi hoặc vượt hạn mức embed).
2. **Hiện `weightsVersion` bằng chữ nhỏ, mờ** cuối thẻ ("Phiên bản chấm điểm: hybrid-v1"). Điểm của cùng một người có thể là `rule-v1` ở lần tải này và `hybrid-v1` ở lần sau (backend GĐ2 quyết định #5/#6) — người xem, và người chấm luận văn khi demo, phải biết điểm nào do cấu hình nào tạo ra. Không giấu sự khác biệt.
3. **Không sắp xếp, không lọc, không tô màu lại theo điểm hybrid** — giữ nguyên nguyên tắc GĐ1: điểm chỉ tham khảo.
4. Không thêm thư viện, không thêm route, không thêm hook mới (`useJobMatch.ts` từ GĐ1 đã trả nguyên `MatchResult`).

## Thay đổi ở file (đều nhỏ, đều thuộc GĐ1)

| File | Thay đổi |
|---|---|
| `components/jobs/JobMatchCard.tsx` | Thêm một dòng "Độ tương đồng nội dung" theo quyết định #1, đặt dưới danh sách kỹ năng, trên dòng kinh nghiệm; thêm dòng chữ nhỏ `weightsVersion` cuối thẻ. Cả hai phía (Candidate/Employer) dùng chung |
| `components/jobs/MatchScoreBadge.tsx` | Nhận thêm prop tuỳ chọn `semanticPending?: boolean` (= `ApplicationMatchSummary.semanticStatus === "PENDING"`); có thì hiện dấu chú thích nhỏ + `title`: "Chưa tính độ tương đồng nội dung — điểm theo luật" |
| `app/employer/(portal)/jobs/[id]/applications/page.tsx` | Truyền `semanticPending` xuống badge; không đổi cột hay thứ tự |

**Hợp đồng:** `ApplicationMatchSummary.semanticStatus` là `"OFF" | "AVAILABLE" | "PENDING"` (đã chốt ở PLAN backend GĐ2). Chỉ `PENDING` mới hiện dấu chú thích; `OFF` (mặc định `rule`) không hiện gì — nên không có chuyện dấu chú thích hiện sai trên mọi dòng.

## Các bước thực hiện

### FE-1: Dòng "Độ tương đồng nội dung" + nhãn phiên bản

- Sửa `JobMatchCard` theo bảng trên.
- **Test (thủ công, trình duyệt thật):** `JOB_MATCHER_MODE=rule` ⇒ thẻ **y hệt GĐ1**, không có dòng mới; `hybrid` + có vector ⇒ hiện %, `weightsVersion = hybrid-v1`; `hybrid` + ép model lỗi ⇒ "chưa tính được" và `rule-v1`, trang không lỗi; đổi headline ở `/profile` rồi tải lại trang tin ⇒ % thay đổi (vector tính lại).

### FE-2: Badge trong danh sách đơn

- Sửa `MatchScoreBadge` + trang danh sách đơn.
- **Test:** danh sách có nhiều đơn chưa có vector (vượt `MAX_NEW_EMBEDDINGS_PER_REQUEST`) ⇒ phần vượt hiện dấu chú thích, tải lại lần 2–3 thì dần hết; `rule` ⇒ không có dấu nào.

### FE-3: Tài liệu

- Cập nhật "Ghi chú triển khai" (điểm lệch, mặc định `JOB_MATCHER_MODE` đã chốt), `PROJECT_STATUS.md`.

## Ngoài phạm vi

- Màn hình xem kết quả đánh giá / so sánh 3 cấu hình (kết quả nằm ở `docs/06-backend/job-matcher-phase2/eval/eval-results.md`, dùng cho báo cáo).
- Công tắc đổi cấu hình trên giao diện (cấu hình đổi bằng env, không phải lựa chọn của người dùng).
- Màn hình "Phân tích yêu cầu bằng AI" và `SkillMultiSelect` REQUIRED/PREFERRED tự động → GĐ3 (chưa có PLAN).

## Phần ghi chú của chủ dự án

*(để trống)*
