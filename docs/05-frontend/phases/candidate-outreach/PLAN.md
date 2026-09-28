# Tìm & mời ứng viên chưa ứng tuyển (B3) — Frontend

Song song với `docs/06-backend/candidate-outreach/PLAN.md` (schema, luồng tìm/xếp hạng, API, quyết định D1–D5 — **không chép lại ở đây**). Quyết định kiến trúc: AD-15. Phạm vi: 1 trang mới cho Employer, 1 khu vực mới cho Candidate — **2 màn UI chưa có gì để mở rộng, dựng từ đầu.**

**Trạng thái: MỚI LẬP KẾ HOẠCH (2026-09-27), CHƯA TRIỂN KHAI.**

## Quyết định mới chốt khi lên kế hoạch

1. **Trang tìm ứng viên gắn theo tin cụ thể**: `/employer/jobs/[id]/candidate-search` (không phải trang tìm kiếm độc lập không theo tin) — khớp API `GET /employer/job-posts/:jobId/candidate-search`, thêm link từ trang chi tiết tin (`/employer/jobs/[id]`) cạnh link "Xem đơn ứng tuyển" hiện có.
2. **Thẻ hiển thị tái dùng bố cục `JobMatchCard`** (đổi tên/tách thành `AnonymizedCandidateMatchCard` vì audience khác — có nút "Gửi lời mời" thay vì chỉ đọc) thay vì thiết kế mới hoàn toàn — nhất quán trực quan với thẻ điểm đã quen thuộc.
3. **Toggle `isOpenToOutreach` đặt ở `/candidate/profile`**, cạnh các cài đặt hồ sơ khác, **mặc định tắt**, có dòng giải thích ngắn về ẩn danh (D2: vẫn hiện trường, ẩn tên/SĐT/ảnh) trước khi Candidate bật.
4. **Hộp lời mời của Candidate là 1 tab/section riêng** (không nhét vào trang tin nhắn) vì có trạng thái Accept/Decline/Expired cần hiển thị rõ, mô phỏng tab "Job Invitation" của ITviec đã xem khi thiết kế.
5. Không thêm thư viện mới.

## Hook mới

| Hook | Query key / mutation | Ghi chú |
|---|---|---|
| `useCandidateSearch(jobId, enabled)` | `["employer", "job-posts", jobId, "candidate-search"]` | Employer, chỉ fetch khi mở trang này (không tự chạy nền) |
| `useSendOutreachInvitation()` | mutation `POST .../invitations` | `onSuccess` → cập nhật `alreadyInvited = true` cho đúng candidate trong cache, không refetch cả danh sách |
| `useOutreachInvitations()` | `["candidate", "outreach-invitations"]` | Candidate, danh sách + lịch sử |
| `useRespondOutreachInvitation()` | mutation `POST .../respond` | `onSuccess` → invalidate `["candidate", "outreach-invitations"]` |
| `useUpdateOutreachSettings()` | mutation `PATCH /candidate/outreach-settings` | Cập nhật cache hồ sơ Candidate cục bộ (không gọi lại toàn bộ profile) |

## Component mới

- `components/employer/AnonymizedCandidateMatchCard.tsx` — như `JobMatchCard` nhưng thêm:
  - `displayLabel` thay vì tên thật; hiện `universityName`/`majorName`/`degree` (D2).
  - Nút "Gửi lời mời" → confirm dialog ("Ứng viên sẽ thấy tên công ty và tin này khi nhận lời mời") → gọi mutation; disable + đổi thành "Đã gửi lời mời" nếu `alreadyInvited`.
- `app/employer/(portal)/jobs/[id]/candidate-search/page.tsx` — danh sách 10 thẻ trên, có ô hiển thị hạn mức còn lại trong ngày (lấy từ response lỗi 429 hoặc field phụ nếu backend trả kèm — nếu backend không trả sẵn số còn lại thì chỉ hiện thông báo khi chạm hạn mức, không hiện bộ đếm trước).
- `components/candidate/OutreachInvitationInbox.tsx` — danh sách lời mời:

```text
┌─ Lời mời từ nhà tuyển dụng ────────────────────────────────────┐
│  [Đang chờ] Công ty ABC — Thực tập sinh Backend                │
│    Hết hạn sau 6 ngày                [Từ chối]  [Chấp nhận]    │
│  [Đã chấp nhận] Công ty XYZ — Thực tập sinh Frontend            │
│    → Xem hội thoại                                              │
│  [Hết hạn] Công ty DEF — ...                                    │
└──────────────────────────────────────────────────────────────────┘
```

- Toggle trong `/candidate/profile`:

```text
☐ Cho phép nhà tuyển dụng chủ động tìm và mời bạn
  Khi bật: NTD chỉ thấy trường/ngành/kỹ năng/kinh nghiệm của bạn, KHÔNG thấy
  tên, số điện thoại, ảnh đại diện cho tới khi bạn Chấp nhận lời mời.
```

**Các trạng thái phải xử lý:**

| Màn | Trạng thái | Hiển thị |
|---|---|---|
| Candidate search (Employer) | Danh sách rỗng (không ai `isOpenToOutreach`/khớp) | "Chưa tìm thấy ứng viên phù hợp đang mở tìm việc" |
| Candidate search | Vượt rate-limit khi gửi lời mời | Toast lỗi 429, giữ nguyên danh sách |
| Outreach inbox (Candidate) | Rỗng | "Bạn chưa có lời mời nào" |
| Outreach inbox | Accept thành công | Chuyển trạng thái ngay tại chỗ + nút "Xem hội thoại" dẫn `/messages/:conversationId` (không điều hướng tự động) |

## Thay đổi ở file hiện có

| File | Thay đổi |
|---|---|
| `app/employer/(portal)/jobs/[id]/page.tsx` | Thêm link "Tìm ứng viên phù hợp" dẫn `/employer/jobs/[id]/candidate-search` |
| `components/candidate/CandidateProfileClient.tsx` (route thật: `app/(candidate)/profile/page.tsx` chỉ render component này — xem PLAN Khối 1) | Thêm toggle `isOpenToOutreach`, đặt cạnh `<ProfileInsightCard />` nếu Khối 1 đã làm, không phụ thuộc nhau |
| Trang/khu vực thông báo hiện có | **Không cần đổi** — 2 `NotificationType` mới dùng chung cách render `title`/`body`/`link` đã có, FE không switch theo loại |
| `packages/shared-types` | `AnonymizedCandidateMatchDto`, `CandidateOutreachInvitationDto` |

## Các bước thực hiện

### CO-1: Toggle cài đặt (Candidate)

- **Test:** bật/tắt lưu đúng, mặc định tài khoản mới là tắt.

### CO-2: Trang tìm ứng viên (Employer)

- `useCandidateSearch` + `AnonymizedCandidateMatchCard` + trang mới.
- **Test:** không thấy tên/SĐT/ảnh thật ở bất kỳ đâu trong DOM (kiểm tra kỹ — kể cả `title`/`alt` attribute); gửi lời mời thành công ⇒ nút đổi trạng thái; gửi trùng ⇒ nút đã disable từ trước (không cho bấm lại).

### CO-3: Hộp lời mời (Candidate)

- `OutreachInvitationInbox` + 2 hook respond/list, gắn vào trang/khu vực phù hợp (tab riêng hoặc mục trong `/candidate/messages`).
- **Test:** Accept ⇒ tạo được hội thoại và điều hướng được tới đó; Decline ⇒ không tạo hội thoại; lời mời hết hạn hiển thị đúng nhãn, không còn nút hành động.

### CO-4: Kiểm thử trình duyệt thật + tài liệu

- `next build` sạch; kiểm luồng đầy đủ 2 phía (Employer mời → Candidate accept → cả hai thấy hội thoại mới) trên trình duyệt.

## Ngoài phạm vi

- Tìm kiếm ứng viên không gắn theo tin cụ thể.
- Candidate lọc/tắt thông báo theo từng công ty.
- Employer xem lịch sử toàn bộ lời mời đã gửi (chỉ thấy trạng thái `alreadyInvited` trên từng thẻ khi tìm lại).

## Ghi chú triển khai

*(để trống — điền khi làm xong)*

## Phần ghi chú của chủ dự án

*(để trống)*
