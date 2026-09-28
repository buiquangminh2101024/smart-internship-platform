# Tìm & mời ứng viên chưa ứng tuyển (B3) — Frontend

Song song với `docs/06-backend/candidate-outreach/PLAN.md` (schema, luồng tìm/xếp hạng, API, quyết định D1–D5, quy tắc Q1–Q5 đã chốt — **không chép lại ở đây**). Quyết định kiến trúc: AD-15. Phạm vi: 1 trang mới cho Employer, 1 trang mới cho Candidate (`/job-invitations`) + 1 toggle trong `/profile` — **2 màn UI chưa có gì để mở rộng, dựng từ đầu.**

**Trạng thái: ĐÃ LẬP KẾ HOẠCH (2026-09-27), SỬA LẠI 2026-09-28 (bỏ ẩn danh — D2 backend; tách "Gợi ý"/"Đã mời" + điểm lúc mời — D6/D7 backend; chốt hộp lời mời Candidate là **trang riêng** `/job-invitations` — quyết định 4). ĐÃ TRIỂN KHAI CO-1..CO-4 (2026-09-28) — chủ dự án đã kiểm luồng 2 phía trên trình duyệt ⇒ HOÀN TẤT.**

## Quyết định

1. **Trang tìm ứng viên gắn theo tin cụ thể**: `/employer/jobs/[id]/candidate-search` — khớp API `GET /employer/job-posts/:jobId/candidate-search`, thêm link từ trang chi tiết tin (`/employer/jobs/[id]`) cạnh link "Xem đơn ứng tuyển" hiện có.
2. **Thẻ `CandidateSearchCard` tái dùng bố cục `JobMatchCard`** + phần đầu thẻ có ảnh, tên, tiêu đề, trường/ngành, nút "Xem hồ sơ" (`/employer/candidates/[id]`, trang đã có) và "Gửi lời mời". (**Sửa 2026-09-28:** không còn ẩn danh — hiện tên/ảnh thật; không có SĐT/email vì backend không trả.)
3. **Toggle `isOpenToOutreach` đặt ở `/profile`** (route thật; component `CandidateProfileClient`), **mặc định tắt**, có dòng giải thích rõ: bật là NTD thấy tên, ảnh, học vấn, kỹ năng, kinh nghiệm; không thấy SĐT/email.
4. **(Chốt 2026-09-28 — chủ dự án chọn phương án "trang riêng") Hộp lời mời của Candidate là 1 trang riêng `/job-invitations`**, tiêu đề "Lời mời ứng tuyển", có mục riêng trên menu Candidate Portal — mô phỏng tab "Job Invitation" của ITviec. Không đặt trong `/profile` (trang hồ sơ đã dài, lời mời là việc cần xử lý chứ không phải thông tin hồ sơ) và không đặt trong `/messages` hay `/notifications` (có trạng thái Accept/Decline/Expired cần hiển thị rõ, dễ lẫn với tin nhắn/thông báo thường).
   - Route: `app/(candidate)/job-invitations/page.tsx` (cùng nhóm route `(candidate)`, dùng chung `CandidatePortalShell`), tên kebab-case tiếng Anh như các route hiện có (`/recommended-jobs`, `/saved-jobs`).
   - Link trong notification `CANDIDATE_OUTREACH_INVITATION_RECEIVED` trỏ về `/job-invitations` (backend sửa template — xem PLAN backend). Link được lưu cố định vào từng notification lúc tạo nên phải chốt trước khi có dữ liệu thật.
   - Toggle `isOpenToOutreach` **vẫn ở `/profile`** (quyết định 3 — là cài đặt hiển thị hồ sơ). Trang `/job-invitations` chỉ hiện 1 dòng nhắc khi đang tắt: "Bạn đang tắt 'Cho phép nhà tuyển dụng tìm thấy' — sẽ không nhận lời mời mới" + link sang `/profile`.
5. **"Xem hội thoại" dẫn `/messages?conversationId=<id>`** — `ChatLayout` đã đọc sẵn query `conversationId`; không có route `/messages/[id]`.
6. **(2026-09-28, D6 backend) Trang tìm ứng viên có 2 tab: "Gợi ý" và "Đã mời (n)".** "Gợi ý" chỉ gồm người chưa bị chặn mời; gửi lời mời xong, thẻ **rời "Gợi ý" và chèn vào đầu "Đã mời"** ngay tại chỗ (dùng response của POST). "Gợi ý" **không tự tìm lại** (mỗi lượt tìm chạy hybrid, tốn) — có nút "Tìm lại" để lấy thêm người.
7. **(2026-09-28, D7 backend) "Đã mời" hiện điểm lúc gửi**, nhãn rõ "Điểm lúc gửi lời mời" (không dùng lẫn badge điểm hiện tại của `JobMatchCard`); `matchScore = null` ⇒ "—".
8. Không thêm thư viện mới.

## Hook mới

| Hook | Query key / mutation | Ghi chú |
|---|---|---|
| `useCandidateSearch(jobId)` | `["employer", "job-posts", jobId, "candidate-search"]` | Chỉ fetch khi mở trang này, `retry: false` |
| `useSentOutreachInvitations(jobId)` | `["employer", "job-posts", jobId, "outreach-invitations"]` | Tab "Đã mời"; rẻ (không hybrid) nên refetch bình thường |
| `useSendOutreachInvitation(jobId)` | mutation `POST .../invitations` | `onSuccess` → `setQueryData` **bỏ** candidate khỏi cache "Gợi ý" và **chèn** DTO trả về vào đầu cache "Đã mời"; không refetch "Gợi ý" (hybrid, tốn) |
| `useOutreachInvitations()` | `["candidate", "outreach-invitations"]` | Candidate, danh sách + lịch sử |
| `useRespondOutreachInvitation()` | mutation `POST .../respond` | `onSuccess` → invalidate `["candidate", "outreach-invitations"]` |
| `useUpdateOutreachSettings()` | mutation `PATCH /candidate/outreach-settings` | Cập nhật cache hồ sơ Candidate cục bộ (không gọi lại toàn bộ profile) |

## Component mới

- `components/employer/CandidateSearchCard.tsx`:
  - Ảnh, `fullName` (null ⇒ "Ứng viên chưa đặt tên"), `headline`, `education` (trường · ngành · bằng), thành phố.
  - Phần điểm/kỹ năng/kinh nghiệm như `JobMatchCard`.
  - Nút "Gửi lời mời" → confirm ("Ứng viên sẽ nhận thông báo kèm tên công ty và tin này") → mutation. Mọi thẻ ở tab "Gợi ý" đều mời được; `previouslyInvitedExpired = true` ⇒ thêm nhãn nhỏ "Lời mời trước đã hết hạn".
- `components/employer/SentInvitationRow.tsx` (tab "Đã mời") — ảnh, tên, học vấn, nhãn trạng thái (`PENDING` "Đang chờ" · hết hạn sau N ngày / `ACCEPTED` "Đã chấp nhận" / `DECLINED` "Đã từ chối" / `EXPIRED` "Hết hạn"), ngày gửi, "Điểm lúc gửi lời mời: 78" (hoặc "—"). Nút "Xem hồ sơ" chỉ hiện khi `canViewProfile`. Không có nút mời lại ở đây (mời lại người `EXPIRED` từ tab "Gợi ý" — họ tự quay lại pool).
- `app/employer/(portal)/jobs/[id]/candidate-search/page.tsx` — 2 tab; "Gợi ý" ≤10 thẻ + nút "Tìm lại"; "Đã mời" danh sách dòng. Không hiện bộ đếm hạn mức trước (backend không trả số còn lại); chạm hạn mức ⇒ thông báo từ lỗi 429.
- `components/candidate/OutreachInvitationInbox.tsx` (client component, render bởi `app/(candidate)/job-invitations/page.tsx` — page chỉ đặt `metadata` "Lời mời ứng tuyển — InternHub" rồi render component, giống `recommended-jobs/page.tsx`):

```text
┌─ Lời mời ứng tuyển ─────────────────────────────────────────────┐
│  (i) Bạn đang tắt "Cho phép NTD tìm thấy" — Bật trong Hồ sơ →  │  ← chỉ khi đang tắt
│  [Đang chờ] Công ty ABC — Thực tập sinh Backend                │
│    Hết hạn sau 6 ngày                [Từ chối]  [Chấp nhận]    │
│  [Đã chấp nhận] Công ty XYZ — Thực tập sinh Frontend            │
│    → Xem hội thoại                                              │
│  [Hết hạn] Công ty DEF — ...                                    │
└──────────────────────────────────────────────────────────────────┘
```

- Toggle trong `/profile`:

```text
☐ Cho phép nhà tuyển dụng tìm thấy và mời bạn
  Khi bật: NTD thấy tên, ảnh, học vấn, kỹ năng và kinh nghiệm của bạn,
  KHÔNG thấy số điện thoại và email. Bạn có thể tắt bất cứ lúc nào.
```

**Các trạng thái phải xử lý:**

| Màn | Trạng thái | Hiển thị |
|---|---|---|
| Candidate search (Employer) | Rỗng | "Chưa tìm thấy ứng viên phù hợp đang cho phép nhà tuyển dụng tìm kiếm" |
| Candidate search | 403 công ty `BLOCKED` (Q1) / 409 tin không `PUBLISHED` (Q2) | Card thông báo tương ứng thay cho danh sách |
| Candidate search | 429 khi gửi lời mời | Toast lỗi, giữ nguyên danh sách |
| Candidate search | Gửi hết thẻ ở "Gợi ý" | "Đã mời hết gợi ý hiện có" + nút "Tìm lại" |
| Tab "Đã mời" | Rỗng | "Chưa gửi lời mời nào cho tin này" |
| Tab "Đã mời" | Tin đã hết hạn / công ty `BLOCKED` | Vẫn xem được (chỉ đọc); tab "Gợi ý" hiện card 403/409 như trên |
| `/job-invitations` (Candidate) | Rỗng | "Bạn chưa có lời mời nào" (+ gợi ý bật toggle nếu đang tắt) |
| Outreach inbox | Accept thành công | Đổi trạng thái tại chỗ + nút "Xem hội thoại" (không tự điều hướng) |
| Outreach inbox | 409 (lời mời vừa hết hạn) | Toast + refetch danh sách |

## Thay đổi ở file hiện có

| File | Thay đổi |
|---|---|
| `app/employer/(portal)/jobs/[id]/page.tsx` | Thêm link "Tìm ứng viên phù hợp" |
| `components/candidate/CandidateProfileClient.tsx` (route `/profile`) | Chỉ thêm toggle `isOpenToOutreach` cạnh `<ProfileInsightCard />` (hộp lời mời **không** đặt ở đây — quyết định 4) |
| `components/layout/CandidatePortalShell.tsx` | Thêm mục menu `{ label: "Lời mời ứng tuyển", icon: "mail", href: "/job-invitations" }` ngay sau "Ứng tuyển của tôi" (icon chọn trong bộ icon `SideNav` đang dùng khi làm) |
| `src/proxy.ts` | Thêm `"/job-invitations"` vào `CANDIDATE_ONLY_PREFIXES` — thiếu thì khách chưa đăng nhập vào thẳng được trang |
| Trang hồ sơ ứng viên phía Employer (`/employer/candidates/[id]`) | Xử lý `phone`/`email` vắng mặt khi xem qua đường outreach (ẩn dòng, không hiện "undefined") |
| Trang/khu vực thông báo hiện có | **Không cần đổi** — 2 `NotificationType` mới dùng chung cách render `title`/`body`/`link` |
| `packages/shared-types` | Do backend thêm (xem PLAN backend) |

## Các bước thực hiện

### CO-1: Toggle cài đặt (Candidate)

- **Test:** bật/tắt lưu đúng, tải lại trang vẫn đúng; tài khoản mới mặc định tắt.

### CO-2: Trang tìm ứng viên (Employer)

- `useCandidateSearch` + `useSentOutreachInvitations` + `CandidateSearchCard` + `SentInvitationRow` + trang 2 tab + link từ chi tiết tin.
- **Test:** không có SĐT/email trong DOM (kể cả `title`/`alt`) ở cả 2 tab; gửi lời mời ⇒ thẻ rời "Gợi ý", xuất hiện đầu "Đã mời" với "Điểm lúc gửi lời mời" và **không** có request tìm lại; tải lại trang ⇒ người đó không còn trong "Gợi ý"; ứng viên đã từ chối nằm ở "Đã mời" với nhãn "Đã từ chối"; ứng viên tắt cờ sau khi được mời ⇒ vẫn ở "Đã mời", không có nút "Xem hồ sơ"; "Xem hồ sơ" mở được hồ sơ, không có SĐT/email.

### CO-3: Hộp lời mời (Candidate)

- Trang `/job-invitations` + `OutreachInvitationInbox` + 2 hook respond/list + mục menu + thêm route vào `proxy.ts`.
- **Test:** Accept ⇒ có hội thoại, "Xem hội thoại" mở đúng hội thoại; Decline ⇒ không tạo hội thoại; lời mời hết hạn đúng nhãn, không còn nút hành động; bấm notification "Bạn nhận được lời mời ứng tuyển" ⇒ mở `/job-invitations`; chưa đăng nhập vào `/job-invitations` ⇒ bị chuyển về `/`; mục menu sáng đúng khi đang ở trang; đang tắt toggle ⇒ có dòng nhắc + link sang `/profile`.

### CO-4: Kiểm thử trình duyệt thật + tài liệu

- `next build` sạch; luồng đủ 2 phía (Employer mời → Candidate accept → cả hai thấy hội thoại mới).

## Ngoài phạm vi

- Tìm kiếm ứng viên không gắn theo tin cụ thể.
- Chế độ ẩn danh (xem PLAN backend).
- Candidate lọc/tắt thông báo theo từng công ty.
- Employer xem lịch sử lời mời gộp mọi tin (chỉ có tab "Đã mời" theo từng tin).
- Điểm hiện tại cho người ở tab "Đã mời" (chỉ có điểm lúc gửi).
- Badge số lời mời đang chờ trên mục menu "Lời mời ứng tuyển" (cần thêm API đếm — để sau; ứng viên đã có notification cho mỗi lời mời mới).
- Thêm "Lời mời ứng tuyển" vào menu của `CandidateHomeHeader` (chỉ thêm ở menu Candidate Portal).

## Ghi chú triển khai

**2026-09-28 — CO-1..CO-4 xong.**

- **Hook:** gộp cả 6 hook (+ `useOutreachSetting`) vào 1 file `hooks/useCandidateOutreach.ts`.
  - `useCandidateSearch`: `staleTime: Infinity`, `refetchOnWindowFocus: false`, `retry: false` — chỉ tìm lại khi bấm "Tìm lại".
  - `useSendOutreachInvitation`: `onSuccess` bỏ người đó khỏi cache "Gợi ý", chèn DTO vào đầu cache "Đã mời", không refetch.
  - `useRespondOutreachInvitation`: invalidate ở `onSettled` (cả khi 409) để hiện đúng trạng thái.
- **Đọc cờ `isOpenToOutreach`:** không có endpoint GET riêng.
  - `/job-invitations` đọc qua `useOutreachSetting` (gọi `/candidates/me`, key `["candidate", "outreach-settings"]`).
  - `/profile` vẫn tự tải hồ sơ như cũ; `OutreachSettingToggle` lưu ngay khi bấm, không đi qua form "Thông tin cá nhân".
- **Thẻ "Gợi ý" (`CandidateSearchCard`):** hiện badge điểm, chip kỹ năng khớp/thiếu (tối đa 6), nút "Xem chi tiết mức phù hợp" mở `JobMatchCard` (audience `employer`) — tái dùng component, không sửa `JobMatchCard`.
  - Phần đầu thẻ (`OutreachCandidateHeader`) dùng chung với `SentInvitationRow`.
- **Link từ chi tiết tin:** nút "Tìm ứng viên phù hợp" trong card "Ứng viên", ẩn khi tin `DRAFT`/`PENDING` (chưa thể có lời mời).
- **Lỗi ở tab "Gợi ý":** 403/409 hiện card kèm message tiếng Việt của backend; 403 thêm nút "Xem gói dịch vụ".
- **Rỗng ở tab "Gợi ý":** "Đã mời hết gợi ý hiện có" chỉ khi đã mời ít nhất 1 người trong phiên trang này; ngược lại hiện câu "Chưa tìm thấy…".
- **Xác nhận trước khi gửi/phản hồi:**
  - Gửi lời mời: `ConfirmDialog` nêu hiệu lực 14 ngày.
  - Accept: nêu rõ NTD sẽ thấy email trong hội thoại (khớp quyền `EMAIL_ONLY` ở backend).
  - Decline: dialog dạng destructive.
- **Màu nhãn trạng thái (giống nhau ở cả 2 phía):** `PENDING` vàng, `ACCEPTED` xanh, `DECLINED` đỏ, `EXPIRED` xám.
- **`/employer/candidates/[id]`:** đã ẩn sẵn `phone` khi null; chỉ thêm fallback tên "Ứng viên" khi cả `fullName` và email đều null (đường outreach ẩn email).
- **Đã kiểm:**
  - `tsc --noEmit` sạch.
  - `eslint` 0 lỗi (chỉ cảnh báo `<img>` như các trang hiện có).
  - `next build` sạch, có 2 route `/job-invitations` và `/employer/jobs/[id]/candidate-search`.
  - Qua `next start`: chưa đăng nhập vào `/job-invitations` ⇒ 307 về `/`; có cookie phiên Candidate ⇒ 200, title "Lời mời ứng tuyển — InternHub".
- **CO-4 (trình duyệt thật, cả 2 app):** chủ dự án đã tự kiểm luồng NTD mời → Candidate phản hồi → hội thoại, chạy đúng.

## Phần ghi chú của chủ dự án

*(để trống)*
