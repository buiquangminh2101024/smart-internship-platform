# Feature Backlog — Chức năng còn thiếu so với nền tảng tuyển dụng thực tế

Danh sách chức năng mà các nền tảng tuyển dụng thực tế (TopCV, ITviec, LinkedIn…) thường có nhưng hệ thống chưa triển khai, kèm mức độ ưu tiên. Lập ngày 2026-10-06, đối chiếu từ `docs/` và cây route/module hiện có.

**Mức độ ưu tiên:**

- 🔴 **Cao** — nên làm trước buổi bảo vệ.
- 🟡 **Trung bình** — điểm cộng rõ rệt.
- 🟢 **Thấp** — làm nếu còn thời gian.

**Ngoài phạm vi (đã chốt):**

- Thanh toán VNPay/MoMo thật: dự án chỉ dùng **sandbox**, vì đơn vị chỉ có đăng ký doanh nghiệp, không đủ điều kiện mở merchant thật.
- Migration `20260929120000_add_interviews`: **đã áp lên Neon**. Đã kiểm `prisma migrate status` ngày 2026-10-06, kết quả "Database schema is up to date"; bảng `interviews` đã có dữ liệu.

---

## 1. Hoàn thiện phần đang dở

| Việc | Mức | Ghi chú |
|---|---|---|
| Cập nhật `PROJECT_STATUS.md` | 🔴 | Phase 8, 9, 10 vẫn ghi "Chưa bắt đầu", dù đã triển khai xong. Các khối AI và dashboard cũng chưa có trong bảng. |
| Phase 13 — Kiểm thử tự động | 🔴 | Hiện mới có unit test cho `job-matching`. Cần integration test cho các luồng ứng tuyển, duyệt tin và nhắn tin. |
| Phase 14 — Triển khai và kịch bản demo | 🔴 | Từ một bản clone mới, chạy theo tài liệu phải ra được bản demo. |
| Phase 12 — Rà soát bảo mật | 🟡 | Token đang lưu ở `localStorage` (AD-2). Cần rà soát XSS, rate-limit chung qua Nginx và validate đầu vào ở mọi module. |

## 2. Admin và vận hành

| Chức năng | Mức | Ghi chú |
|---|---|---|
| Quản lý người dùng: danh sách, tìm kiếm, khoá/mở tài khoản (bản đầu) | 🔴 | Chưa có route `/admin/users` nào, cả backend lẫn frontend. Dự kiến cho buổi báo cáo 2026-10-07. Câu hỏi cần chốt: `docs/temp/ADMIN_USERS_AND_SIMILAR_JOBS_DECISIONS.md` (Mục 1). |
| Quản lý người dùng — Mở rộng 1: bộ lọc/tìm kiếm thêm, trang chi tiết, buộc đăng xuất, kích hoạt thủ công, gửi link đặt lại mật khẩu | 🟡 | Không migration, ~1 ngày. Ưu tiên nhất trong các gói mở rộng. |
| Quản lý người dùng — Mở rộng 2: đăng nhập lần cuối, khoá có thời hạn, cảnh cáo | 🟢 | Có migration, ~1–1,5 ngày (gồm cả mục "Khoá Employer thì xử lý tin đang đăng" bên dưới). |
| Hộp thoại xác nhận khi đăng nhập Google trùng email tài khoản có sẵn: báo "email này đã có tài khoản", người dùng chọn liên kết hoặc huỷ (backend trả 409 `GOOGLE_LINK_REQUIRED`, gửi lại kèm `confirmLink: true`) | 🟢 | Làm **cùng đợt với trang hỗ trợ bản B và gói mở rộng quản lý người dùng (Mở rộng 2)**, theo quyết định chủ dự án 2026-10-07. ~2–3 giờ. Chỉ để minh bạch: phần an toàn (kiểm `email_verified`, xoá mật khẩu chưa xác thực) đã làm ở AD-17 mục 6. Không gồm xoá tài khoản: hệ thống chưa có chức năng này, cần plan riêng (dữ liệu liên quan nhiều bảng, thanh toán/audit log phải giữ). |
| Quản lý người dùng — Mở rộng 3: tạo Admin qua giao diện, phân quyền Admin | 🟢 | Phân quyền cần migration và sửa `authorize`, ~1–2 ngày. |
| Khoá Employer thì xử lý tin đang đăng của họ (ẩn/mở lại khi mở khoá) | 🟡 | Làm sau đợt "Quản lý người dùng" bản đầu. Cần trạng thái tin mới, xử lý trường hợp công ty nhiều Employer, ảnh hưởng hội thoại/đơn ứng tuyển/quota. Lý do chi tiết: `docs/temp/ADMIN_USERS_AND_SIMILAR_JOBS_DECISIONS.md` (U5). |
| Báo cáo tin lừa đảo/vi phạm (người dùng báo, Admin xử lý) | 🔴 | Tin tuyển thực tập dễ bị lợi dụng. Luồng xử lý có thể dùng lại `TAKEN_DOWN` và `JobPostModerationAction` sẵn có. |
| Màn hình Admin quản lý gói dịch vụ | 🟡 | Backend đã có `POST`/`PATCH /subscription-plans`, chỉ còn thiếu UI. |
| Hoá đơn/biên lai cho giao dịch | 🟢 | |

## 3. Ứng viên

| Chức năng | Mức | Ghi chú |
|---|---|---|
| Thông báo việc làm mới (job alert): lưu bộ lọc tìm kiếm, nhận email khi có tin mới phù hợp | 🔴 | Dùng lại matcher và hàng đợi email (outbox) sẵn có. |
| Đổi mật khẩu (khi đã đăng nhập) | 🔴 | Trang Cài đặt hiện chỉ có bật/tắt thông báo trình duyệt. |
| Cài đặt quyền riêng tư: cho/không cho nhà tuyển dụng tìm thấy hồ sơ | 🟡 | Cần thiết vì đã có tính năng "Tìm & mời ứng viên" (B3). Liên quan Nghị định 13/2023 về dữ liệu cá nhân. |
| Xoá tài khoản, tải về dữ liệu cá nhân | 🟡 | Cũng liên quan Nghị định 13/2023. |
| Gợi ý "việc làm tương tự" ở trang chi tiết tin | 🟡 | Rẻ, vì đã có `job-matching`. |
| Thư xin việc và câu hỏi sàng lọc khi ứng tuyển | 🟡 | |
| Ứng viên xác nhận hoặc xin đổi lịch phỏng vấn; link họp online; file lịch `.ics` | 🟡 | Bổ sung cho module `interviews` đã có. |
| Theo dõi công ty (follow) và nhận thông báo khi công ty đăng tin mới | 🟢 | Đã có trang công ty công khai `/companies/[id]`. |
| Tuỳ chọn tắt/bật email theo từng loại thông báo | 🟢 | Hiện chỉ có tuỳ chọn cho thông báo trình duyệt. |
| Đánh giá/review công ty | 🟢 | Phải kèm cơ chế kiểm duyệt nội dung. |

## 4. Nhà tuyển dụng

| Chức năng | Mức | Ghi chú |
|---|---|---|
| Bảng Kanban kéo-thả đơn ứng tuyển theo trạng thái | 🟡 | Bản chuyển trạng thái đã có sẵn trong `applications.service.ts`. |
| Mẫu email/tin nhắn gửi hàng loạt (từ chối, mời phỏng vấn) | 🟡 | |
| Tin nổi bật / đẩy tin trả phí | 🟡 | Mở rộng từ hệ thống gói (Phase 5), thanh toán qua sandbox. |
| Phân quyền nhiều vai trò trong công ty (HR, trưởng nhóm, chỉ xem…) | 🟢 | Hiện chỉ phân biệt `isCompanyAdmin` và thành viên. |
| Phiếu đánh giá sau phỏng vấn (scorecard) | 🟢 | |

## 5. Đặc thù tuyển thực tập (điểm khác biệt của khoá luận)

| Chức năng | Mức | Ghi chú |
|---|---|---|
| Quản lý sau khi nhận thực tập: xác nhận bắt đầu/kết thúc, công ty đánh giá thực tập sinh, xuất giấy xác nhận hoàn thành | 🟡 | Khác biệt so với một trang tuyển dụng thông thường. |
| Vai trò Nhà trường/giảng viên theo dõi sinh viên thực tập | 🟢 | Thêm một actor mới, khối lượng lớn. |

## 6. Kỹ thuật và tiếp cận người dùng

| Chức năng | Mức | Ghi chú |
|---|---|---|
| SEO cho tin tuyển dụng: metadata riêng từng tin, `sitemap.xml`, dữ liệu cấu trúc `JobPosting` (Google for Jobs) | 🟡 | Làm nhanh với Next.js. |
| Tìm kiếm toàn văn, gợi ý từ khoá, tuỳ chọn sắp xếp | 🟡 | Hiện mới có lọc cơ bản. |
| Đính kèm file trong chat, hiện "đang nhập…" | 🟢 | |
| Song ngữ Anh/Việt, PWA | 🟢 | |
| Bỏ token khỏi `localStorage`: refresh token chuyển sang cookie httpOnly (server đặt ở login / verify-otp / google / refresh, xoá ở logout), access token chỉ giữ trong bộ nhớ, mở lại trang thì gọi `/auth/refresh` | 🟡 | Phần chính của mục "Phase 12 — Rà soát bảo mật" ở trên (AD-2 đã hẹn đánh giá lại). Thêm 2026-10-07 theo quyết định chủ dự án. Thay đổi kiến trúc: phải viết AD mới thay AD-2/AD-4 và plan riêng trước khi code. Phạm vi: auth controller, CORS `credentials` + axios `withCredentials`, chống CSRF (`SameSite`, kiểm `Origin`), 3 cookie riêng theo area (AD-4), `proxy.ts` đọc cookie thật thay cookie đánh dấu `sip_session_*`, khoảng 15 file web đang đọc token. ~1 ngày. Ghi chú: cookie vẫn dùng chung giữa các tab, nên vẫn cần giữ cách sửa "chỉ điều hướng khi tab ở đúng khu vực" (`endSession` trong `lib/api-client.ts`, F6 của `docs/05-frontend/phases/admin-users-support/PLAN.md`). Dọn luôn key cũ `sip-auth` còn sót trong `localStorage`. |

---

## Thứ tự đề xuất

1. Cập nhật `PROJECT_STATUS.md`.
2. Làm 4 chức năng 🔴 dùng lại được hạ tầng sẵn có: **quản lý người dùng**, **báo cáo tin vi phạm**, **job alert**, **đổi mật khẩu**.
3. Làm Phase 13 (kiểm thử), sau đó Phase 14 (triển khai, kịch bản demo).
4. Nếu còn thời gian, chọn một chức năng đặc thù thực tập (mục 5) làm điểm nhấn khi bảo vệ.

Mỗi chức năng phải có `PLAN.md` riêng trong `docs/06-backend/` và `docs/05-frontend/phases/` trước khi triển khai, theo quy ước ở `docs/06-backend/README.md`.
