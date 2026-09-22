# Hướng dẫn chạy bộ đánh giá Job Matcher GĐ2

Dành cho người trong nhóm cần **thêm dữ liệu demo vào DB**, **gán nhãn**, hoặc **chạy lại đánh giá**. Đây là hướng dẫn thao tác (lệnh gõ); tiêu chí gán nhãn xem `labeling-guide.md`; phương pháp đầy đủ xem `../PLAN.md` mục "Bộ đánh giá"; cơ sở lý thuyết xem `docs/02-architecture/job-matcher-theory/`.

Mọi lệnh chạy trong thư mục `apps/server`.

## 0. Kiểm tra trước

- **Cùng một DB Neon với người đã seed trước đó?** Nếu `.env` của bạn trỏ `DATABASE_URL` đến đúng DB đó thì dữ liệu demo **đã có sẵn**, không cần seed lại — bỏ qua bước 2. Hỏi người đã seed để xin đúng `DATABASE_URL` (không tự tạo DB Neon mới trừ khi bạn cố ý muốn một bản dữ liệu riêng).
- **DB riêng (Neon nhánh khác, hoặc chưa migrate)?** Cần bước 1 trước khi seed.
- Cần `.env` ở thư mục gốc repo (copy từ `.env.example`, không commit) — tối thiểu có `DATABASE_URL`, `EMBEDDING_MODEL_ID` (đã có giá trị mặc định).

## 1. Áp migration (chỉ cần nếu DB chưa có bảng embedding)

```bash
npm run db:deploy
```

Kiểm nhanh: bảng `candidate_embeddings` và `job_post_embeddings` đã tồn tại (`npx prisma studio` hoặc bất kỳ client Postgres nào).

## 2. Seed dữ liệu demo

```bash
npm run seed-match-demo -- --check      # chỉ ĐỌC DB, kiểm fixture khớp catalog thật (kỹ năng/ngành APPROVED)
npm run seed-match-demo                 # seed thật — idempotent, chạy lại là cập nhật, không tạo trùng
```

Seed đọc `apps/server/scripts/data/match-demo.json` (~15–20 ứng viên + ~8–10 tin thực tập, một Company demo) và chỉ đụng vào:

- `User` có email đuôi `@match-demo.local`,
- Company demo và tin của nó,
- Skill do chính seed này tạo (đánh dấu người tạo = employer demo).

Không bao giờ đụng dữ liệu thật của người khác.

Các cờ khác:

```bash
npm run seed-match-demo -- --label-sheet   # sinh sẵn labels.json rỗng (đủ số cặp) để bắt đầu gán nhãn — không ghi DB
npm run seed-match-demo -- --reset         # xoá TOÀN BỘ dữ liệu demo (cascade cả vector embedding) — cẩn thận
```

## 3. Xem thử trên UI (tuỳ chọn)

Đăng nhập bằng **email + mật khẩu** (hệ thống không dùng OTP để đăng nhập, chỉ dùng OTP để xác minh email lúc tự đăng ký — các tài khoản demo được seed thẳng `emailVerifiedAt` nên không cần xác minh).

Mật khẩu chung cho mọi tài khoản demo: **`123456789`**.

- Ứng viên: bất kỳ `<ref>@match-demo.local` nào trong `match-demo.json` (vd. `fe-react-03@match-demo.local`) → mở `/jobs/:id` của một tin demo.
- Nhà tuyển dụng: `employer@match-demo.local` → xem danh sách đơn/điểm match theo tin của công ty demo.

Lần xem điểm đầu tiên có thể chậm vài giây (nạp model embedding); các lần sau nhanh vì vector được lưu lại.

## 4. Gán nhãn

Mở `labels.json` (sinh ở bước 2 nếu dùng `--label-sheet`, hoặc file đã có nếu người khác seed trước), làm theo `labeling-guide.md`. Tóm tắt:

- Mỗi người gán **độc lập** vào `ratings.rater1` / `ratings.rater2` (không xem nhãn của người kia trước).
- Cặp hai người khác nhau: bàn lại rồi điền `label` (nhãn cuối) — bắt buộc, không thì script loại cặp đó.
- Không sửa `split`, `category`.

## 5. Chạy đánh giá

```bash
npm run eval-job-matching
```

Cần dữ liệu đã seed (bước 2) và `labels.json` hợp lệ. Script tự báo lỗi kèm đúng id cặp nếu `labels.json` sai định dạng. Kết quả ghi vào `eval-results.md` (tự sinh, không sửa tay — chạy lại script để cập nhật).

## Sự cố thường gặp

| Thông báo | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| `Chưa có trong DB: hồ sơ "..."` / `tin "..."` | Chưa seed, hoặc `labels.json` không khớp `match-demo.json` | Chạy bước 2 |
| `labels.json có N lỗi` | Sai định dạng nhãn/split, hoặc trùng id/cặp | Sửa đúng id được liệt kê rồi chạy lại |
| Kỹ năng "..." đã tồn tại ở trạng thái ... | Có kỹ năng trùng tên trong catalog thật nhưng chưa `APPROVED` | Xử lý ở Admin trước rồi seed lại |
