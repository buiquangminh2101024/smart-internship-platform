# Hướng dẫn gán nhãn — bộ đánh giá Job Matcher GĐ2

Tài liệu chung cho **mọi người gán nhãn** trong `labels.json` (xem `../PLAN.md`, mục "Bộ đánh giá"). Cả hai người gán dùng đúng một bản này; nếu đổi tiêu chí giữa chừng thì ghi lại ngày đổi và gán lại các cặp đã làm. Đoạn "Tiêu chí" và "Nguyên tắc" dùng lại được cho phần phương pháp của báo cáo.

Chưa biết chạy lệnh gì để có dữ liệu demo/`labels.json`? Xem `README.md` cùng thư mục.

## Câu hỏi để gán nhãn

Với mỗi cặp (hồ sơ, tin) tự hỏi như một nhà tuyển dụng thật: **"Với tin thực tập này, tôi có mời hồ sơ này phỏng vấn không?"**

Không đòi hồ sơ khớp mọi yêu cầu. Thực tập sinh hiếm khi đủ hết, nên nếu chỉ chấm GOOD cho hồ sơ khớp 100% thì gần như không cặp nào được.

## Tiêu chí

| Nhãn | Nhà tuyển dụng sẽ… | Thường gặp |
| --- | --- | --- |
| `GOOD_MATCH` | mời phỏng vấn, ưu tiên xem | Đúng lĩnh vực và có các kỹ năng cốt lõi của tin. Thiếu vài kỹ năng phụ hoặc kỹ năng ưu tiên mà học nhanh được vẫn là GOOD. |
| `PARTIAL_MATCH` | cân nhắc, mời nếu thiếu người | Đúng lĩnh vực nhưng thiếu một kỹ năng cốt lõi; hoặc lĩnh vực gần (frontend ↔ backend, CNTT ↔ data) và có nền tảng chuyển được; hoặc hồ sơ quá ít thông tin để chắc. |
| `POOR_MATCH` | không mời | Khác lĩnh vực, hoặc gần như không đáp ứng yêu cầu nào. Chỉ trùng kỹ năng chung ("Giao tiếp", "Quản lý thời gian") vẫn là POOR. |

## Nguyên tắc

1. **Phán đoán tổng thể, không đếm kỹ năng.** Gán theo kiểu "thiếu 1/4 kỹ năng thì GOOD" làm nhãn trùng cách chấm của rule, khiến bộ đánh giá thiên vị cho rule ngay từ đầu. Đọc cả headline, kinh nghiệm, dự án như người thật.
2. **Kỹ năng cốt lõi khác kỹ năng phụ.** Thiếu kỹ năng phụ (thường là `PREFERRED`, hoặc một `REQUIRED` không quyết định công việc) thì không hạ nhãn. Thiếu kỹ năng làm nên công việc thì hạ một bậc.
3. **Kỹ năng trùng nghĩa tính là có** (vd. "ReactJS" ≈ "React"), dù catalog coi là hai kỹ năng riêng.
4. **Kinh nghiệm không liên quan không được cộng** (nhiều năm bán hàng không giúp tin frontend).
5. **Hồ sơ liệt kê rất nhiều kỹ năng nhưng thiếu chiều sâu**: cân nhắc theo dự án và kinh nghiệm thật, không theo số kỹ năng đã liệt kê.
6. **Không xem `category` và không xem điểm hệ thống khi gán.** `category` chỉ dùng phân tích lỗi sau này.
7. **Phân vân giữa hai mức kề nhau: chọn mức thấp hơn** và ghi một dòng `note`. Quy tắc chung này giúp hai người ít bất đồng hơn.

## Cách điền `labels.json`

- `ratings.rater1` / `ratings.rater2`: điền **chuỗi** `"GOOD_MATCH"`, `"PARTIAL_MATCH"` hoặc `"POOR_MATCH"` (đúng chữ hoa, có ngoặc kép); chưa gán thì để `null`, không để `""`. Không sửa `split`, `category`.
- **Độc lập:** mỗi người gán khi chưa thấy nhãn của người kia và chưa bàn với nhau.
- `label` (nhãn cuối): bỏ trống nếu hai người gán giống nhau; **bắt buộc điền** nếu khác nhau, sau khi bàn bạc. `label` đã điền luôn được ưu tiên.
- `note`: không bắt buộc. Chỉ ghi ở cặp bất đồng, cặp phân vân, hoặc ca khó đáng bàn — một dòng lý do chọn nhãn.
- Cặp ratings khác nhau mà `label` còn trống sẽ bị script loại khỏi phép đo và in vào danh sách "chưa thống nhất".

## Ghi vào báo cáo

- Hai người khác nhau gán độc lập: báo Cohen's κ giữa hai người.
- Cùng một người gán lại sau một thời gian: đó là độ nhất quán của một người (intra-rater), **không** gọi là hai người gán độc lập.
- Chỉ một lượt gán: nêu rõ đó là hạn chế (không có số đo độ tin cậy của nhãn).
- Cỡ mẫu nhỏ, nhãn mang tính chủ quan: kết quả chỉ mang tính chỉ báo (đã nêu ở PLAN).
