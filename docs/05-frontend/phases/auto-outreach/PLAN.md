# Tự động mời ứng viên theo tin (0.2) — Frontend

Song song: `docs/06-backend/auto-outreach/PLAN.md` (API, câu hỏi Q1–Q5).
Quyết định: **AD-23**. Quy ước giao diện: `.claude/skills/sip-ui/SKILL.md`. Bắt buộc đọc skill này trước khi code.

**Trạng thái: ĐÃ DUYỆT (2026-11-10), ĐANG LÀM ĐỢT A (F1 + F4).** Backend xong 2026-11-10.

## Phần 1 — Công nghệ / package / kiến trúc

- **Không thêm dependency.**
- Dùng lại `apiFetch`, TanStack Query (`hooks/useCandidateOutreach.ts`), các component trong `components/ui/` (`Card`, `StatCard`…) và toast `push` đang dùng ở trang tìm ứng viên.
- Hook mới đặt cạnh hook cũ, trong `hooks/useCandidateOutreach.ts` hoặc file mới `hooks/useAutoOutreach.ts`.

## Phần 2 — Liên kết giữa các phần

| Trang | Thay đổi | API |
|---|---|---|
| `/employer/jobs/[id]/candidate-search` | Nút "Mời tất cả gợi ý"; đọc `?tab=invited`; nhãn "Tự động" ở tab "Đã mời" | `POST …/invitations/bulk`, `GET …/invitations` |
| `/employer/jobs/[id]` | Thẻ "Tự động mời ứng viên" ở cột phải | `GET`/`PATCH …/auto-outreach` |
| `/employer/jobs/new` | Ô "Số người cần tuyển" và công tắc tự mời (không bắt buộc); lưu sau khi tạo nháp | `PATCH …/auto-outreach` |
| `/employer/outreach` | Khối cài đặt tỉ lệ; hạn mức hiện thêm dòng tự động; nhãn "Tự động" | `GET`/`PATCH /employer/outreach/settings`, `GET /employer/outreach/summary` |

Bấm mời hàng loạt hoặc lưu cài đặt xong thì làm mới các query: tìm ứng viên của tin, "Đã mời" của tin, summary của trang "Lời mời", cài đặt tự mời của tin.

## Phần 3 — Các bước thực hiện

Các bước F1–F4 giữ nguyên bên dưới. Chủ dự án chọn làm theo hai đợt (2026-11-10), mỗi đợt kiểm trên trình duyệt phần của nó ngay sau khi code:

| Đợt | Bước | Kiểm (mục của F5) | Lý do gộp |
|---|---|---|---|
| A | F1 + F4 | 1, 5 | Cùng là danh sách lời mời và hạn mức: nhãn "Tự động", số lượt tự động, các query cần làm mới sau khi mời |
| B | F2 + F3 | 2, 3, 4, 6 | Cùng API `GET`/`PATCH …/auto-outreach`, cùng hook và cách kiểm số người cần tuyển 1–100, ngưỡng 0–100 |

### Bước F1 — Nút "Mời tất cả gợi ý" (`candidate-search`)

- Nút đặt cạnh thanh tab, chỉ hiện ở tab "Gợi ý" khi danh sách có người: "Mời tất cả (N)".
- Bấm vào thì mở hộp xác nhận:
  - "Gửi lời mời cho N ứng viên? Hôm nay còn R lượt."
  - Nếu N > R: "Chỉ R người điểm cao nhất được mời."
- Xong thì toast tóm tắt "Đã mời X người. Bỏ qua Y người (lý do…)" và chuyển sang tab "Đã mời".
- Đổi `tab` từ state cục bộ sang đọc/ghi `?tab=` trên URL, để link trong thông báo `AUTO_OUTREACH_SENT` mở thẳng tab "Đã mời".
- `SentInvitationRow`: thêm nhãn nhỏ "Tự động" khi `source = AUTO`.
- `CandidateSearchCard`: khi `cappedToday = true`, nút mời bị mờ kèm chữ "Đã nhận đủ lời mời hôm nay, mời lại được từ 7h sáng mai". Nút "Mời tất cả (N)" chỉ đếm người chưa đủ trần.

### Bước F2 — Thẻ "Tự động mời ứng viên" (`jobs/[id]`)

Đặt ở cột phải, dưới "Thao tác nhanh". Ví dụ tin đang mở, gói Tiêu chuẩn:

```
TỰ ĐỘNG MỜI ỨNG VIÊN                              [ Bật ●]
Số người cần tuyển   [ 2 ]
Ngưỡng điểm phù hợp  [ 80 ] %
  Đề xuất: 80%. Thấp hơn thì mời được nhiều người hơn nhưng kém phù hợp hơn.

Đang giữ 8/10 lời mời · 3 đã nhận lời · Đã tuyển 0/2
Hệ thống tự mời bù khi có người từ chối hoặc lời mời hết hạn.
Xem lời mời →
```

- Dòng trạng thái đổi theo `state`:

  | `state` | Hiện |
  |---|---|
  | `RUNNING` | dòng "Đang giữ …" như ví dụ |
  | `TARGET_MET` | "Đã tuyển đủ, hệ thống ngừng mời" |
  | `NO_MATCH` | "Không còn ứng viên đạt ngưỡng 80%. Hệ thống kiểm lại lúc HH:mm, hoặc bạn thử hạ ngưỡng." (giờ lấy từ `nextCheckAt`) |
  | `CANDIDATES_CAPPED` | "Các ứng viên phù hợp hôm nay đã nhận đủ lời mời. Hệ thống mời tiếp từ 7h sáng mai." |
  | `NOT_PUBLISHED` | "Bắt đầu mời khi tin được đăng" |
  | `OFF` | chỉ hiện các ô cài đặt |
  | `PLAN_NOT_ALLOWED` | thẻ mờ, kèm "Tự động mời có từ gói Cơ bản" và link tới trang gói dịch vụ |

- Lưu khi bấm nút "Lưu", không tự lưu mỗi lần gõ. Kiểm ở client: số người cần tuyển 1–100, ngưỡng 0–100.
- Chỉ người đăng tin thấy thẻ này, khớp quyền của API. Đồng nghiệp cùng công ty không thấy.

### Bước F3 — Form tạo tin (`jobs/new`)

- Thêm nhóm nhỏ ở cuối form: "Số người cần tuyển" (mặc định 1) và công tắc "Tự động mời ứng viên phù hợp khi tin được đăng" (mặc định tắt).
- Tạo nháp thành công thì gọi `PATCH …/auto-outreach`. Gọi lỗi thì vẫn giữ nháp và báo "Chưa lưu được cài đặt tự mời, chỉnh lại ở trang tin".
- Gói Dùng thử: ẩn công tắc, chỉ giữ ô số người cần tuyển.

### Bước F4 — Trang "Lời mời" (`/employer/outreach`)

- Khối hạn mức hiện thêm một dòng: "Tự động: 6/11 · Tổng: 9/14 hôm nay".
- Khối cài đặt, chỉ quản trị viên công ty sửa được; người khác chỉ xem:

  ```
  Tự động mời được dùng tối đa  [ 80 ] % hạn mức mỗi ngày
  → 11 / 14 lời mời. Còn ít nhất 3 lượt để bạn tự mời.
  Đề xuất: 80%. Hệ thống tự mời phần lớn, bạn vẫn còn lượt để mời thêm người mình chọn.
  ```

  - Số lượt ở dòng "→" tính lại ngay khi gõ.
  - Nhập 100% thì hiện cảnh báo: "Tự động có thể dùng hết lượt, bạn sẽ không mời tay được trong ngày".
  - Gói Dùng thử: ẩn khối này.
- Danh sách lời mời của công ty: thêm nhãn "Tự động".

### Bước F5 — Kiểm trên trình duyệt

Dùng bộ dữ liệu demo lớn (0.1), tài khoản nhà tuyển dụng của Mây Xanh.

1. Mời tất cả trên một tin: đủ 10 người, toast đúng, tab "Đã mời" có 10 dòng.
2. Bật tự mời với `hiringTarget = 2`: trong vài giây (lượt chạy ngay sau khi bật) thẻ hiện "Đang giữ 12/12" (Doanh nghiệp, H = 6).
3. Đăng nhập một ứng viên được mời, từ chối ⇒ quay lại thẻ thấy vẫn 12/12, có một lời mời mới.
4. Đặt tỉ lệ 0% ⇒ tự mời dừng, mời tay vẫn được.
5. Ứng viên đã nhận đủ 10 lời mời trong ngày: nút mời trên trang tìm ứng viên bị mờ, có chữ giải thích.
6. Kiểm màn hình điện thoại (theo sip-ui) và trạng thái lỗi / đang tải.

## Ngoài phạm vi

- Số ứng viên phù hợp ở trang tổng quan và danh sách tin, thanh tiến độ tuyển: mục 0.3.
- Giao diện phía ứng viên: không đổi, lời mời tự động hiện như lời mời thường.

## Phần 4 — Ghi chú của chủ dự án

