# Trang "Lời mời" của Employer — Frontend

Song song: `docs/06-backend/outreach-hub/PLAN.md` (API, câu hỏi Q1–Q3).
Quy ước giao diện: `.claude/skills/sip-ui/SKILL.md`. Trang tìm ứng viên theo tin giữ nguyên (`docs/05-frontend/phases/candidate-outreach/PLAN.md`).

**Trạng thái: ĐÃ DUYỆT (2026-10-15). Backend (bước 1) đã xong; frontend chưa code.**

## Route và điều hướng

| Việc | Chi tiết |
|---|---|
| Route mới | `/employer/outreach` → `app/employer/(portal)/outreach/page.tsx` |
| Menu | Thêm "Lời mời" (icon `send`) vào `NAV_ITEMS` của `EmployerPortalShell`, ngay sau "Lịch phỏng vấn"; thêm `outreach: "Lời mời"` vào `CRUMB_LABELS`. |
| Dashboard | Thẻ KPI "Lời mời còn lại hôm nay" đổi `href` từ `/employer/jobs` sang `/employer/outreach` (gói hết hạn vẫn giữ nút "Xem gói dịch vụ"). |
| Trang tìm ứng viên | Thêm liên kết "← Tất cả lời mời" về `/employer/outreach` ở đầu trang `jobs/[id]/candidate-search`. Không đổi gì khác. |

## Bố cục (từ trên xuống)

1. **Đầu trang**: `h1` "Lời mời", dòng phụ "Mời ứng viên phù hợp ứng tuyển vào tin của bạn."
2. **Hàng số liệu** (lưới 2 cột, 1 cột ở màn hẹp), dùng `StatCard` bố cục KPI:
   - "Lời mời còn lại hôm nay": `QuotaBar` như dashboard; `BLOCKED` ⇒ "Cần gói còn hiệu lực" + nút "Xem gói dịch vụ".
   - "Kết quả 30 ngày": số đã gửi, `SegmentBar` Chấp nhận / Từ chối / Đang chờ (có nhãn và số).
3. **Tìm ứng viên theo tin** (`Panel`): các tin `status = PUBLISHED` trong `summary.jobs`, mỗi tin một hàng: tiêu đề, "Còn N ngày", số lời mời "Đã mời X · Chấp nhận Y", nút **Tìm ứng viên** → `/employer/jobs/[id]/candidate-search`. Tin không phải của người xem: nút bị khoá kèm dòng "Chỉ người đăng tin mới tìm và mời được". Rỗng: "Chưa có tin nào đang hiển thị. Đăng tin để bắt đầu mời ứng viên." + nút "Đăng tin mới".
4. **Lời mời đã gửi** (`Panel`):
   - Bộ lọc: `ChipGroup` trạng thái (Tất cả · Đang chờ · Đã chấp nhận · Đã từ chối · Hết hạn), `Select` theo tin (lấy từ `summary.jobs`, gồm cả tin đã đóng có lời mời), `ChipGroup` "Cả công ty / Do tôi gửi" (Q1).
   - Danh sách: dùng lại `SentInvitationRow`, thêm prop tuỳ chọn hiện tên tin (liên kết tới `/employer/jobs/[id]`) và nhãn "Bạn gửi". Trang tìm ứng viên không truyền prop mới nên không đổi.
   - Nút "Tải thêm" (cursor), 20 dòng mỗi lần.
   - Rỗng theo bộ lọc: "Không có lời mời nào khớp bộ lọc." + "Xoá bộ lọc".

Bộ lọc lưu trong URL (`?status=&job=&mine=`), giống trang `/admin/users`, để quay lại vẫn giữ.

## Hook và dữ liệu

Thêm vào `hooks/useCandidateOutreach.ts`:

| Hook | Key | API |
|---|---|---|
| `useOutreachSummary()` | `["employer","outreach","summary"]` | `GET /employer/outreach/summary` |
| `useCompanyOutreachInvitations(filter)` | `["employer","outreach","invitations",filter]` (`useInfiniteQuery`) | `GET /employer/outreach/invitations` |

Làm mới:
- `useSendOutreachInvitation` (đã có) thêm invalidate `["employer","outreach"]` khi gửi thành công.
- `SocketProvider`: thông báo `CANDIDATE_OUTREACH_INVITATION_RESPONDED` invalidate `["employer","outreach"]` (cùng chỗ đang invalidate dashboard).

## Trạng thái

Đang tải: khung xám giữ chiều cao từng khối. Lỗi: `BlockError` từng khối kèm "Tải lại". Quá nhiều: phân trang. Kiểm ở 375px và ≥ 1280px; bàn phím, focus, nhãn cho nút icon.

## Các bước

Gộp còn 3 bước cho cả trang (2026-10-15): **1** backend (plan BE) → **2** = FE-1 + FE-2 → **3** = FE-3.

| Bước | Nội dung | Phụ thuộc | Điều kiện xong |
|---|---|---|---|
| FE-0 | Chủ dự án duyệt plan (cùng Q1–Q3 của backend). | — | Xong 2026-10-15. |
| **2** (FE-1 + FE-2) | Hook, trang `/employer/outreach`, mục menu, crumb, mở rộng `SentInvitationRow`; đổi `href` thẻ KPI dashboard, liên kết quay lại ở trang tìm ứng viên, invalidate sau khi gửi / khi có phản hồi. | Bước 1 | `tsc`, eslint các file mới sạch. |
| **3** (FE-3) | Kiểm trên trình duyệt với tài khoản thật: 375px và desktop, đủ trạng thái, bộ lọc trong URL; gửi lời mời ở trang tìm ⇒ quay lại trang Lời mời thấy dòng mới và số đếm tăng. | Bước 2 | Chủ dự án xem và xác nhận. |

## Ngoài phạm vi

Gửi lời mời ngay trên trang này; danh sách ứng viên gộp nhiều tin; tên người gửi.

## Ghi chú của chủ dự án

<!-- Để trống — dành cho chủ dự án. -->
