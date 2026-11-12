# Quản lý ứng viên (nhà tuyển dụng)

## employer-applications
audience: employer
title: Xem và xử lý hồ sơ ứng tuyển
questions:
- Xem hồ sơ ứng viên đã nộp ở đâu?
- Làm sao chuyển trạng thái hồ sơ ứng viên?
- Ghi chú và đánh giá ứng viên thế nào?
- Từ chối nhiều hồ sơ cùng lúc được không?
- Đánh giá sao cho ứng viên
- Chuyển hồ sơ sang danh sách rút gọn
- Đã nhận ứng viên rồi có đổi lại trạng thái được không?
- Sắp xếp ứng viên phù hợp nhất

Hồ sơ ứng tuyển nằm ở **Ứng viên** (/employer/applications), hoặc theo từng tin ở trang chi tiết tin.

- Trạng thái đi theo thứ tự: **Chờ duyệt** → **Đang xem xét** → **Vào danh sách rút gọn** → **Mời phỏng vấn** → **Được nhận**. Ở bước nào cũng có thể **Từ chối**. **Được nhận** và **Bị từ chối** là kết quả cuối, không đổi lại được.
- **Tin đã đóng** là trạng thái do hệ thống đặt khi tin ngừng tuyển (xem mục hệ thống tự xử lý hồ sơ). Đây cũng là kết quả cuối; bạn không chuyển hồ sơ sang hay ra khỏi trạng thái này được.
- Mỗi lần đổi trạng thái, ứng viên nhận thông báo.
- **Ghi chú nội bộ** và **đánh giá 1–5 sao** chỉ công ty bạn thấy, ứng viên không thấy.
- Có thể chọn nhiều hồ sơ để đổi trạng thái cùng lúc (tối đa 50 hồ sơ mỗi lần).
- Danh sách đơn của từng tin và trang **Ứng viên** có cách sắp xếp **Phù hợp nhất** theo mức độ phù hợp với yêu cầu của tin.

## employer-application-automation
audience: employer
title: Hệ thống tự xử lý hồ sơ chờ lâu
questions:
- Hệ thống có tự xử lý hồ sơ không?
- Tại sao hồ sơ tự chuyển sang Đang xem xét?
- Hệ thống có tự từ chối ứng viên không?
- Tin hết hạn thì hồ sơ ứng viên chưa xử lý thế nào?
- Trạng thái Tin đã đóng của hồ sơ ứng viên là gì?
- Hồ sơ bị hệ thống đóng có mở lại được không?
- Thông báo có hồ sơ ứng viên cần xử lý là gì?
- Khi nào hệ thống đóng hồ sơ của tin đã hết hạn?
- Có tắt được việc hệ thống tự chuyển hồ sơ sang Đang xem xét không?
- Cài đặt tự xử lý hồ sơ ở đâu?
- Xem các hồ sơ được đề xuất từ chối ở đâu?

Hệ thống giúp hồ sơ không bị bỏ quên. Mỗi tin có cài đặt riêng, và **không bao giờ tự từ chối** ứng viên.

- **Tự chuyển sang Đang xem xét:** hồ sơ **Chờ duyệt** của tin đang hiển thị có mức độ phù hợp **≥ ngưỡng phù hợp** của tin thì được chuyển ngay khi nộp, hoặc ở lượt 8h30 sáng hằng ngày. Ngưỡng này là **Ngưỡng phù hợp** ở thẻ **Tự động mời ứng viên** của tin (mặc định 80%), dùng chung cho tự mời. Hồ sơ chưa có điểm thì không được tự chuyển. Mỗi tin có công tắc riêng, mặc định bật, để tắt việc tự chuyển. Ứng viên nhận thông báo như khi bạn tự bấm.
- **Đề xuất từ chối:** hồ sơ Chờ duyệt có điểm dưới ngưỡng đề xuất từ chối của tin (mặc định 50%, luôn nhỏ hơn ngưỡng phù hợp) được gom thành một nhóm để bạn xem lại. Chỉ khi bạn xác nhận thì hồ sơ mới bị từ chối.
- **Nhắc hằng tuần:** 8h sáng thứ Hai, mỗi nhà tuyển dụng của công ty nhận một thông báo kèm email nếu còn hồ sơ đứng yên quá 7 ngày, ứng viên đã phỏng vấn chưa có kết quả, hoặc hồ sơ sắp bị tự đóng (kèm ngày đóng).
- **Tự đóng khi tin ngừng tuyển** (tin hết hạn, đã đóng hoặc bị gỡ), hồ sơ chuyển sang **Tin đã đóng**:
  - Chờ duyệt: ở lượt 8h30 đầu tiên sau khi tin đóng.
  - Đang xem xét, hoặc rút gọn / mời phỏng vấn mà chưa phỏng vấn: sau 14 ngày.
  - Có lịch phỏng vấn sắp tới: không đóng.
  - Đã phỏng vấn mà chưa có kết quả: chỉ đóng khi tin bật chế độ tự đóng hồ sơ đã phỏng vấn (mặc định tắt), sau 30 ngày.

**Tin đã đóng** là kết quả cuối, không mở lại được. Trạng thái này không tính là từ chối, và ứng viên được báo là tin đã ngừng nhận hồ sơ.

Ở đâu:

- Cài đặt: thẻ **Tự động xử lý hồ sơ** ở trang chi tiết tin (chỉ người đăng tin thấy), hoặc cuối form tạo tin.
- Trang **Ứng viên**: dòng gợi ý phía trên các tab mở nhóm đề xuất từ chối (hồ sơ được chọn sẵn, bỏ chọn hồ sơ muốn giữ rồi bấm **Từ chối**) và nhóm cần kết quả phỏng vấn.
- Hồ sơ hệ thống đã chuyển có nhãn **Hệ thống tự chuyển**; hồ sơ hệ thống đã đóng nằm ở tab **Tin đã đóng**.

## employer-interviews
audience: employer
title: Đặt lịch phỏng vấn
questions:
- Làm sao đặt lịch phỏng vấn cho ứng viên?
- Đổi hoặc huỷ lịch phỏng vấn thế nào?
- Đặt lịch phỏng vấn cho nhiều người cùng lúc được không?
- Tại sao tôi không đặt lịch phỏng vấn được?
- Lịch phỏng vấn của công ty xem ở đâu?
- Phỏng vấn trực tuyến thì gửi link họp ở đâu?
- Huỷ lịch phỏng vấn có cần lý do không?

- Chỉ đặt lịch được cho hồ sơ ở trạng thái **Vào danh sách rút gọn** hoặc **Mời phỏng vấn**. Đặt lịch cho hồ sơ đang ở danh sách rút gọn sẽ tự chuyển sang **Mời phỏng vấn**.
- Mỗi lịch gồm thời gian (trong vòng 180 ngày tới), thời lượng 15–240 phút, hình thức **trực tuyến** (kèm link họp) hoặc **tại công ty** (kèm địa chỉ).
- Có thể đặt lịch cho tối đa 20 hồ sơ cùng lúc.
- Mỗi hồ sơ chỉ có một lịch sắp tới; muốn đổi thì dùng **đổi lịch**. Huỷ lịch cần nhập lý do.

Tất cả lịch nằm ở **Lịch phỏng vấn** (/employer/interviews). Ứng viên nhận thông báo khi lịch được đặt, đổi hoặc huỷ. Hôm trước buổi phỏng vấn, ứng viên được nhắc qua thông báo và email, người đặt lịch được nhắc trong ứng dụng.

## candidate-search-invite
audience: employer
title: Tìm và mời ứng viên chưa ứng tuyển
questions:
- Làm sao tìm ứng viên phù hợp cho tin?
- Mời ứng viên ứng tuyển thế nào?
- Mỗi ngày được gửi bao nhiêu lời mời?
- Tại sao tôi không thấy số điện thoại ứng viên?
- Lời mời đã gửi xem ở đâu?
- Một ứng viên mời được mấy lần?
- Lời mời gửi ứng viên hết hạn khi nào?

Vào **Tin tuyển dụng** (/employer/jobs), mở một tin **Đang hiển thị** và bấm **Tìm ứng viên phù hợp**. Hệ thống đưa ra tối đa 10 ứng viên phù hợp nhất với tin.

- Chỉ gồm ứng viên **đã bật cho phép nhà tuyển dụng tìm thấy** và chưa ứng tuyển tin này. Số điện thoại và email không hiển thị.
- Mỗi ứng viên chỉ được mời một lần cho mỗi tin. Lời mời hết hạn sau **14 ngày**.
- Số lời mời mỗi ngày giới hạn theo gói của công ty: dùng thử 6, Cơ bản 8, Tiêu chuẩn 14, Doanh nghiệp 86 lời mời/ngày. Hạn mức được làm mới lúc 7h sáng. Cần đang dùng thử hoặc có gói còn hiệu lực.
- Ứng viên chấp nhận thì một hội thoại được tạo để hai bên trao đổi. Theo dõi các lời mời đã gửi ở **Lời mời** (/employer/outreach).
