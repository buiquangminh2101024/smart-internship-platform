# Kết quả đánh giá Job Matcher GĐ3

> Sinh tự động bởi `apps/server/scripts/eval-job-matching.ts` lúc 2026-09-22T16:55:09.523Z — không sửa tay; chạy lại script để cập nhật. Phương pháp: `../PLAN.md` bước 7; cặp, nhãn, cosine và cách đo dùng lại nguyên của GĐ2 (`../../job-matcher-phase2/eval/`).

Cỡ mẫu nhỏ, dữ liệu tổng hợp: mọi con số chỉ mang tính chỉ báo.

## Dữ liệu GĐ3

Yêu cầu "Employer đã xác nhận" nằm ở `confirmed-requirements.json` (cùng thư mục), áp trong bộ nhớ lên hồ sơ tin — không ghi DB, không sửa `match-demo.json`/`labels.json`. Quy tắc gắn ngành chốt trước khi chạy, không dựa vào nhãn hay điểm (xem trường `description` của file).

| Tin | Tập | Căn cứ trong tin | Đúng ngành (PRIMARY) | Ngành liên quan (RELATED) |
| --- | --- | --- | --- | --- |
| Thực tập sinh Frontend Web | dev | "SV năm 3-4 CNTT hoặc ngành gần" | Công nghệ thông tin | Khoa học máy tính, Kỹ thuật phần mềm, Hệ thống thông tin, Kỹ thuật máy tính, An toàn thông tin |
| Thực tập sinh Java Backend | dev | "SV CNTT, Kỹ thuật phần mềm hoặc ngành gần" | Công nghệ thông tin, Kỹ thuật phần mềm | Khoa học máy tính, Hệ thống thông tin, Kỹ thuật máy tính, An toàn thông tin |
| Thực tập sinh Data & AI | dev | "Phù hợp SV Khoa học dữ liệu, AI hoặc ngành gần" | Khoa học dữ liệu, Trí tuệ nhân tạo | Toán học, Toán ứng dụng, Thống kê, Khoa học máy tính, Công nghệ thông tin, Kỹ thuật phần mềm, Hệ thống thông tin, Kỹ thuật máy tính |
| Thực tập sinh Content Marketing | test | "SV Marketing, Truyền thông hoặc ngành gần" | Marketing, Truyền thông đa phương tiện, Truyền thông đại chúng | Quản trị kinh doanh, Thương mại điện tử, Kinh doanh quốc tế, Báo chí, Quan hệ công chúng |
| Thực tập sinh Kế toán | test | "SV Kế toán, Kiểm toán hoặc Tài chính" | Kế toán, Kiểm toán, Tài chính - Ngân hàng | — |
| Thực tập sinh Digital Marketing | test | "SV Marketing, Thương mại điện tử hoặc ngành gần" | Marketing, Thương mại điện tử | Quản trị kinh doanh, Kinh doanh quốc tế, Kinh doanh thương mại |

Tin không nêu ngành (giữ nguyên, education không áp dụng): Thực tập sinh Frontend Product, Thực tập sinh Backend Node TypeScript, Thực tập sinh QA Automation, Thực tập sinh Thiết kế UI.

**Số năm theo từng kỹ năng (`JobPostSkill.minYears`): không đánh giá được trên bộ dữ liệu này** — không tin demo nào nêu số năm cho riêng một kỹ năng (fixture viết cho GĐ2), và quy tắc là không tự đặt số năm khi văn bản tin không nêu. Phần chấm này chỉ được kiểm bằng test đơn vị (`scoring-job-matcher.test.ts`, E1–E5).

### Trạng thái học vấn của các cặp (theo nhãn)

| Tập | Nhãn | PRIMARY | RELATED | NONE | UNKNOWN | NOT_REQUIRED |
| --- | --- | --- | --- | --- | --- | --- |
| dev | GOOD | 2 | 1 | 1 | 0 | 3 |
| dev | PARTIAL | 1 | 3 | 1 | 0 | 8 |
| dev | POOR | 1 | 3 | 4 | 0 | 10 |
| test | GOOD | 4 | 0 | 0 | 0 | 1 |
| test | PARTIAL | 3 | 1 | 1 | 0 | 1 |
| test | POOR | 0 | 0 | 12 | 0 | 3 |

## Lưới `RELATED_MAJOR_SCORE` (chỉ trên dev)

Chọn theo ρ, rồi NDCG@3, rồi ít FP hơn; hoà thì giữ giá trị hiện tại (0,65). Quy tắc chốt trước: cần ≥ 5 cặp dev có học vấn RELATED và lưới phải làm đổi ít nhất một chỉ số thì mới coi là hiệu chỉnh.

| RELATED | ρ | NDCG@3 | Acc (mặc định) | FP | FN | |
| --- | --- | --- | --- | --- | --- | --- |
| 0,30 | 0,793 | 0,965 | 68% | 0 | 0 |  |
| 0,50 | 0,797 | 0,965 | 68% | 0 | 0 |  |
| 0,65 | 0,799 | 0,965 | 68% | 0 | 0 | **chọn** |
| 0,80 | 0,797 | 0,965 | 68% | 0 | 0 |  |

Kết quả: **0,65** (7 cặp dev RELATED). ρ giữa các giá trị trong lưới chỉ chênh 0,006, NDCG@3 và FP không đổi — mức chênh nằm trong nhiễu của cỡ mẫu này: giá trị được chọn **không bị dữ liệu bác bỏ**, nhưng cũng chưa đủ căn cứ để nói nó tốt hơn các giá trị lân cận.

## GĐ2 so với GĐ3

Cùng trọng số `hybrid-v2` và `lo/hi` đang dùng (0,4442/0,7277); khác nhau duy nhất ở dữ liệu tin. Ở GĐ2 trọng số `education` (0,0429) luôn bị chia lại cho các thành phần khác; ở GĐ3 nó có điểm khi tin có ngành. rule-v1 có `education = 0` nên không đổi giữa hai giai đoạn khi không có số năm theo kỹ năng — không liệt kê.

### Tập dev

| Cấu hình | n | Spearman ρ | NDCG@3 (số tin) | Acc (mặc định) | Acc (dev) — ngưỡng | FP | FN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GĐ2 — hybrid-v2, tin chưa có ngành/số năm theo kỹ năng | 38 | 0,789 | 0,965 (6) | 71% | 76% — 70/15 | 0 | 0 |
| GĐ3 — hybrid-v2 + yêu cầu xác nhận, RELATED = 0,65 | 38 | 0,799 | 0,965 (6) | 68% | 76% — 70/20 | 0 | 0 |

### Tập test (chỉ để báo cáo)

| Cấu hình | n | Spearman ρ | NDCG@3 (số tin) | Acc (mặc định) | Acc (dev) — ngưỡng | FP | FN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GĐ2 — hybrid-v2, tin chưa có ngành/số năm theo kỹ năng | 26 | 0,872 | 1,000 (4) | 88% | 85% — 70/15 | 0 | 0 |
| GĐ3 — hybrid-v2 + yêu cầu xác nhận, RELATED = 0,65 | 26 | 0,876 | 1,000 (4) | 92% | 92% — 70/20 | 0 | 0 |

## Các cặp đổi điểm

Dấu ✗ khi lớp suy ra từ điểm (ngưỡng mặc định) khác nhãn. 23/64 cặp đổi điểm.

| Cặp | Tập | Hồ sơ | Tin | Nhãn | Học vấn | Ngành ứng viên khớp | GĐ2 | GĐ3 | Ca khó |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| p01 | dev | fe-react-03 | Thực tập sinh Frontend Web | GOOD | PRIMARY | Công nghệ thông tin | 55 ✗ | 57 ✗ | synonym-skill, adjacent-field |
| p10 | dev | backend-node-02 | Thực tập sinh Java Backend | PARTIAL | RELATED | Hệ thống thông tin | 19 ✗ | 21 ✗ | synonym-skill |
| p11 | dev | backend-node-02 | Thực tập sinh Frontend Web | POOR | RELATED | Hệ thống thông tin | 27 | 28 | synonym-skill, adjacent-field |
| p12 | dev | backend-node-02 | Thực tập sinh Data & AI | POOR | RELATED | Hệ thống thông tin | 35 | 36 | synonym-skill |
| p13 | dev | backend-java-01 | Thực tập sinh Java Backend | GOOD | RELATED | Khoa học máy tính | 100 | 98 | — |
| p23 | dev | qa-03 | Thực tập sinh Frontend Web | POOR | PRIMARY | Công nghệ thông tin | 37 | 40 ✗ | adjacent-field |
| p24 | test | qa-03 | Thực tập sinh Kế toán | POOR | NONE | — | 17 | 16 | — |
| p26 | test | marketing-content-01 | Thực tập sinh Digital Marketing | PARTIAL | PRIMARY | Marketing | 66 | 67 | — |
| p30 | test | marketing-digital-02 | Thực tập sinh Content Marketing | PARTIAL | RELATED | Thương mại điện tử | 58 | 59 | — |
| p31 | test | marketing-digital-02 | Thực tập sinh Kế toán | POOR | NONE | — | 25 | 24 | — |
| p36 | test | finance-02 | Thực tập sinh Kế toán | PARTIAL | PRIMARY | Tài chính - Ngân hàng | 59 | 61 | — |
| p37 | dev | finance-02 | Thực tập sinh Data & AI | POOR | NONE | — | 10 | 9 | — |
| p42 | dev | mobile-02 | Thực tập sinh Java Backend | PARTIAL | RELATED | Kỹ thuật máy tính | 37 ✗ | 39 ✗ | adjacent-field |
| p43 | dev | mobile-02 | Thực tập sinh Frontend Web | POOR | RELATED | Kỹ thuật máy tính | 11 | 13 | adjacent-field |
| p50 | dev | career-switch-01 | Thực tập sinh Data & AI | PARTIAL | NONE | — | 75 ✗ | 71 ✗ | career-switch |
| p51 | test | career-switch-01 | Thực tập sinh Digital Marketing | PARTIAL | PRIMARY | Marketing | 53 | 55 | career-switch |
| p52 | test | language-01 | Thực tập sinh Content Marketing | PARTIAL | NONE | — | 24 ✗ | 23 ✗ | — |
| p55 | test | logistics-01 | Thực tập sinh Kế toán | POOR | NONE | — | 42 ✗ | 40 ✗ | — |
| p56 | test | logistics-01 | Thực tập sinh Digital Marketing | POOR | NONE | — | 10 | 9 | — |
| p57 | dev | it-adjacent-01 | Thực tập sinh Frontend Web | GOOD | NONE | — | 75 | 71 | adjacent-field |
| p61 | test | communication-02 | Thực tập sinh Content Marketing | GOOD | PRIMARY | Truyền thông đa phương tiện | 69 ✗ | 70 | — |
| p63 | dev | backend-sql-03 | Thực tập sinh Java Backend | PARTIAL | RELATED | Hệ thống thông tin | 9 ✗ | 12 ✗ | — |
| p64 | dev | it-adjacent-01 | Thực tập sinh Java Backend | POOR | NONE | — | 10 | 9 | adjacent-field |

## Hạn chế

- Trọng số `education` của hybrid-v2 chỉ 0,0429 nên một cặp đổi tối đa khoảng 4 điểm giữa "đúng ngành" và "khác ngành"; lưới RELATED chỉ dịch điểm cặp RELATED khoảng 1–2 điểm — khó đổi thứ hạng trên vài chục cặp.
- Nhãn GĐ2 được gán khi hệ thống chưa chấm ngành; người gán vẫn nhìn thấy ngành của ứng viên nên nhãn phản ánh ngành một phần, nhưng không có ca nào được thiết kế riêng để tách tác động của ngành liên quan.
- Tập ngành RELATED do người viết file xác nhận theo nhóm ngành của Bộ GD&ĐT, không phải do Employer thật chọn qua giao diện.
