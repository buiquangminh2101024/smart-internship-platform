# Hướng dẫn viết tài liệu cho từng phase

Thư mục này **không** được điền sẵn từ đầu. Mỗi thư mục con `phase-NN-ten-phase/` chỉ được tạo ra **ngay trước khi bắt đầu triển khai phase đó** — tức là lúc lên kế hoạch chi tiết, không phải lúc viết roadmap tổng quan (roadmap tổng quan/tóm tắt từng phase vẫn nằm ở `docs/01-project/PROJECT_PHASES.md`).

Lý do tách riêng: `PROJECT_PHASES.md` chỉ nên giữ Goal/Modules/Dependencies/DoD ở mức tóm tắt cho toàn bộ roadmap dễ scan; phần thiết kế/kế hoạch chi tiết (đủ để bắt tay code) đặt ở đây để không làm phình file roadmap.

## Đặt tên thư mục

`docs/phases/phase-NN-slug/` — `NN` là số thứ tự 2 chữ số khớp với số phase trong `PROJECT_PHASES.md` (`phase-00-foundation`, `phase-01-core-architecture`, `phase-02-identity-access`, ...), `slug` là tên ngắn không dấu, viết thường, nối bằng `-`.

## Cấu trúc file trong một phase

Mỗi phase có ít nhất 1 file `PLAN.md` trong thư mục `phase-NN-slug/`, chia làm đúng 4 phần theo thứ tự sau:

### Phần 1 — Công nghệ / package / kiến trúc sử dụng

Liệt kê cụ thể: package nào (kèm version nếu đã chốt), pattern kiến trúc nào áp dụng cho phase này (vd. repository pattern, DI qua awilix, port/adapter...), có thêm dependency mới nào không và lý do. Không lặp lại toàn bộ tech stack chung của dự án (đã có ở `PROJECT_OVERVIEW.md` §9) — chỉ ghi phần **đặc thù riêng của phase này**.

### Phần 2 — Liên kết giữa các phần

Mô tả ở mức vừa đủ (không cần chi tiết từng dòng code) các thành phần trong phase này liên kết/gọi nhau ra sao: module nào phụ thuộc module nào, service gọi service nào, dữ liệu chảy qua đâu. Có thể dùng danh sách gạch đầu dòng hoặc sơ đồ text đơn giản, không cần diagram công phu.

### Phần 3 — Các bước thực hiện

Danh sách các bước triển khai theo thứ tự hợp lý. Nếu phase quá dài/phức tạp, được phép chia nhỏ thành nhiều file trong cùng thư mục phase đó (vd. `PLAN.md` cho tổng quan + `01-schema.md`, `02-auth-service.md`, `03-google-oauth.md`...) thay vì nhồi hết vào một file, miễn là `PLAN.md` liệt kê rõ thứ tự và trỏ tới các file con.

### Phần 4 — Ghi chú của chủ dự án

Phần để trống, dành riêng cho chủ dự án tự ghi thêm trong quá trình triển khai (điều chỉnh phát sinh, quyết định thay đổi so với kế hoạch ban đầu, vấn đề gặp phải...). Claude Code không tự ý viết vào phần này trừ khi được yêu cầu trực tiếp.

## Nguyên tắc chung

- Chỉ tạo thư mục `phase-NN-slug/` khi thực sự chuẩn bị triển khai phase đó — không tạo trước hàng loạt cho cả roadmap.
- Không chép lại nội dung đã có sẵn ở `docs/02-architecture/INITIAL_ARCHITECTURE_PLAN.md` hay `docs/03-database/DATABASE_DESIGN.md` — trỏ link tới đó, chỉ ghi phần bổ sung/đặc thù của phase.
- Nếu trong lúc lên kế hoạch phát hiện cần sửa quyết định kiến trúc đã chốt trước đó, phải cập nhật lại tài liệu gốc (`INITIAL_ARCHITECTURE_PLAN.md`/`ARCHITECTURE_DECISIONS.md` khi file đó được tạo), không chỉ sửa trong file phase.
