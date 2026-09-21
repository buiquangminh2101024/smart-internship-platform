# Job Matcher — Giai đoạn 1: Rule baseline + giải thích (Frontend)

Song song với `docs/06-backend/job-matcher-phase1/PLAN.md` (công thức, kiểu dữ liệu, API, quyết định D1–D5 — **không chép lại ở đây**). Không thuộc phase đánh số nào trong `FRONTEND_PHASES.md`. Phạm vi: (1) Employer đánh dấu kỹ năng Bắt buộc/Ưu tiên + nhập số năm tối thiểu ở form tin; (2) Candidate thấy thẻ "Mức độ phù hợp" ở trang tin; (3) Employer thấy cột "Phù hợp" và bảng giải thích ở phần đơn ứng tuyển.

**Trạng thái: ĐÃ VIẾT CODE (2026-09-21), CHƯA kiểm thử trên trình duyệt** — FE-1..FE-3 xong; FE-4 còn `next build` và kiểm tra thủ công (xem "Ghi chú triển khai").

## Quyết định mới chốt khi lên kế hoạch

1. **Một component giải thích dùng cho cả hai phía**: `JobMatchCard` nhận `result: MatchResult` và `audience: "candidate" | "employer"`. Khác nhau chỉ ở: Candidate có nút "Thêm vào hồ sơ" cạnh kỹ năng thiếu và dòng nhắc hoàn thiện hồ sơ; Employer có nhãn "Theo hồ sơ hiện tại của ứng viên" (D5) và không có nút hành động.
2. **`SkillMultiSelect` mở rộng bằng prop tuỳ chọn, không đổi hành vi cũ** (đã duyệt ở Q7). Cùng khuôn với `onUpdateYears`: **truyền `onChangeImportance` thì mới bật** công tắc Bắt buộc/Ưu tiên trên mỗi chip; không truyền ⇒ chip y như hiện tại (hồ sơ Candidate không bị ảnh hưởng). `SelectedSkill` thêm `importance?: SkillImportance` (mặc định coi là `REQUIRED`).
3. **Kỹ năng mới thêm luôn là Bắt buộc**; Employer tự đổi sang Ưu tiên nếu muốn (khớp hành vi cũ: mọi kỹ năng của tin đều bắt buộc).
4. **Điểm chỉ là gợi ý, không chặn hành động nào**: thẻ không làm mờ/khoá nút "Ứng tuyển", danh sách đơn **không** tự sắp xếp/lọc theo điểm (giữ thứ tự hiện có), luôn có dòng "Mang tính tham khảo, không phải quyết định tuyển dụng".
5. **Lỗi mạng của thẻ điểm không bao giờ chặn trang**: query lỗi ⇒ ẩn thẻ (Candidate) hoặc hiện "—" (Employer).
6. Không thêm thư viện mới.

## Hook mới — `apps/web/src/hooks/useJobMatch.ts`

| Hook | Query key | Ghi chú |
|---|---|---|
| `useCandidateJobMatch(jobId, enabled)` | `["candidate", "job-posts", jobId, "match"]` | `enabled` = đã đăng nhập **và** role `CANDIDATE` |
| `useEmployerApplicationMatches(jobId)` | `["employer", "job-posts", jobId, "application-matches"]` | trả `ApplicationMatchSummary[]` |
| `useEmployerApplicationMatch(applicationId)` | `["employer", "applications", applicationId, "match"]` | `MatchResult` đầy đủ |

Điểm phụ thuộc vào hồ sơ Candidate, nên: sau khi Candidate lưu kỹ năng/kinh nghiệm ở `/profile` cần **invalidate** `["candidate", "job-posts"]`. Các mutation ở `CandidateProfileClient.tsx` (không dùng react-query, xem ghi chú CV Phase 2) chưa có chỗ invalidate ⇒ đặt `staleTime` ngắn (30s) cho `useCandidateJobMatch` để mở lại trang tin là thấy điểm mới, không thêm luồng invalidate chéo.

## Component mới

- `components/jobs/JobMatchCard.tsx` — thẻ giải thích (bố cục dưới).
- `components/jobs/MatchScoreBadge.tsx` — badge % dùng ở bảng đơn: xanh `≥70`, vàng `40–69`, xám `<40`, `—` khi `status ≠ SCORED`. Dùng `Badge` có sẵn (`components/ui/Badge`), không tự chế màu mới.

```text
┌─ Mức độ phù hợp với hồ sơ của bạn ───────────────────────────┐
│    73%          Độ tin cậy: Trung bình                        │
│  ▓▓▓▓▓▓▓░░░                                                   │
│  Kỹ năng bắt buộc (2/3)                                       │
│    ✓ Java                (2 năm)      ← candidateYears > 0    │
│    ✓ Spring Boot                                              │
│    ✗ PostgreSQL          [Thêm vào hồ sơ]   ← chỉ audience Candidate │
│  Kỹ năng ưu tiên (1/1)                                        │
│    ✓ Docker                                                   │
│  Kinh nghiệm: tin không yêu cầu                               │
│  Điểm chỉ mang tính tham khảo, không phải quyết định tuyển.   │
└───────────────────────────────────────────────────────────────┘
```

Dòng kinh nghiệm theo `experience.status`:

| Status | Hiển thị |
|---|---|
| `NOT_REQUIRED` | "Tin không yêu cầu kinh nghiệm" |
| `MATCH` / `PARTIAL` / `BELOW` | "Tổng thời gian làm việc: X năm (chưa xét mức liên quan) — tin yêu cầu Y năm" kèm biểu tượng ✓ / ~ / ✗ |
| `UNKNOWN` | "Chưa có thông tin kinh nghiệm làm việc" — **không** ghi 0 năm (D1/D2) |

Kỹ năng khớp không có số năm (`candidateYears = null`) chỉ hiện tên, không ghi "0 năm".

**Các trạng thái phải xử lý (Candidate):**

| Trạng thái | Hiển thị |
|---|---|
| Chưa đăng nhập / không phải Candidate | **Không render thẻ** (không gọi API) |
| Đang tải | Skeleton |
| `INSUFFICIENT_PROFILE` | Khung nhắc "Hãy thêm kỹ năng vào hồ sơ để xem mức phù hợp" + link `/profile` |
| `INSUFFICIENT_JOB_DATA` | Một dòng "Tin này chưa đủ thông tin để đánh giá" |
| Lỗi mạng / 404 | Ẩn thẻ |

Nút "Thêm vào hồ sơ" cạnh kỹ năng thiếu dẫn tới `/profile` (không gọi API trực tiếp: tự thêm kỹ năng thay Candidate sẽ bỏ qua bước nhập số năm và vi phạm nguyên tắc AI/điểm không tự ghi dữ liệu nghiệp vụ).

## Thay đổi ở file hiện có

| File | Thay đổi |
|---|---|
| `app/jobs/[id]/page.tsx` | Đã có `isCandidate` (dòng 21). Gọi `useCandidateJobMatch(id, isCandidate)` và đặt `JobMatchCard` vào slot `aside` của `JobPostContent` (đang dùng ở dòng 122), chỉ khi `isCandidate` |
| `app/employer/(portal)/jobs/[id]/applications/page.tsx` | Thêm cột "Phù hợp" (giữa "Trạng thái" và "Thao tác"): `useEmployerApplicationMatches(jobId)` → ghép theo `applicationId` → `MatchScoreBadge`. Không đổi `useEmployerJobApplications` |
| `app/employer/(portal)/applications/[id]/page.tsx` | Thêm một `Card` chứa `JobMatchCard` (audience `employer`) dùng `useEmployerApplicationMatch(id)`, đặt cạnh các `Card` hiện có |
| `components/shared/SkillMultiSelect.tsx` | Prop tuỳ chọn `onChangeImportance?: (skillId, importance) => void`; `SelectedSkill.importance?`. Khi có prop: nhãn "Bắt buộc"/"Ưu tiên" trên chip, bấm để đổi, phân biệt bằng màu; khi không có: giữ nguyên chip hiện tại |
| `components/jobs/JobPostForm.tsx` | State `skills` giữ thêm `importance`; truyền `onChangeImportance`; khi lưu gửi `skillIds` = REQUIRED và `preferredSkillIds` = PREFERRED; ô số "Kinh nghiệm tối thiểu (năm, tuỳ chọn)" gửi `minExperienceYears` (bỏ trống ⇒ không gửi). Khởi tạo state từ `initial.skills[].importance` |
| `lib/`/`hooks/useJobPosts.ts` | Chỉ cập nhật kiểu request nếu file định nghĩa kiểu riêng (dùng `CreateJobPostRequest` từ shared-types thì không phải sửa) |

Ràng buộc form: `minExperienceYears` là số 0–20 (bước 0.5), **không** thêm vào `submitSchema` như trường bắt buộc (không nằm trong AD-10). Ít nhất 1 kỹ năng khi gửi duyệt vẫn tính trên **tổng** kỹ năng (Bắt buộc + Ưu tiên); nhưng nếu chỉ toàn Ưu tiên thì thẻ điểm vẫn chấm được (backend T10) — không cần chặn ở form.

## Các bước thực hiện

### FE-1: Form tin (Employer)

- Mở rộng `SkillMultiSelect` + `JobPostForm` theo bảng trên.
- **Test:** thêm kỹ năng ⇒ mặc định Bắt buộc; đổi sang Ưu tiên ⇒ lưu nháp ⇒ mở lại tin thấy đúng nhãn; tin cũ (tạo trước migration) mở ra thấy toàn Bắt buộc; **hồ sơ Candidate (`/profile`) không đổi giao diện chip** (kiểm tra hồi quy vì cùng component); nhập số năm rồi để trống lại ⇒ lưu được `null`.

### FE-2: Thẻ cho Candidate

- `useJobMatch.ts` (hook 1) + `JobMatchCard` + gắn vào `jobs/[id]/page.tsx`.
- **Test:** Candidate có đủ kỹ năng ⇒ thấy %, danh sách khớp/thiếu; Candidate chưa có kỹ năng ⇒ khung nhắc + link `/profile`; chưa đăng nhập ⇒ không thấy thẻ, không có request `/match` trong tab Network; tắt backend ⇒ trang tin vẫn hiển thị bình thường.

### FE-3: Cột & bảng giải thích cho Employer

- Hook 2, 3 + `MatchScoreBadge` + gắn vào 2 trang đơn.
- **Test:** cột hiển thị đúng badge; đơn của ứng viên chưa có kỹ năng ⇒ `—`; mở chi tiết đơn ⇒ thẻ có nhãn "theo hồ sơ hiện tại"; Employer không thấy nút "Thêm vào hồ sơ"; thứ tự đơn không đổi theo điểm.

### FE-4: Kiểm thử trình duyệt thật + tài liệu

- `next build` sạch; kiểm tra thủ công 3 luồng trên trình duyệt (Candidate, Employer form, Employer đơn) ở cả màn hình hẹp. Ghi kết quả và các điểm lệch so với kế hoạch vào mục "Ghi chú triển khai" (như các PLAN CV Phase 2).

## Ngoài phạm vi

- Hiển thị nhãn Bắt buộc/Ưu tiên trong `JobPostContent` cho khách xem tin công khai (chỉ thẻ điểm của Candidate đã đăng nhập cho thấy phân loại) — cân nhắc sau nếu thấy cần.
- Sắp xếp/lọc danh sách đơn theo điểm (cố ý không làm — nguyên tắc #4, điểm chỉ tham khảo).
- Điểm trong danh sách tin `/jobs` và `saved-jobs` (cần endpoint hàng loạt cho Candidate — thuộc hướng gợi ý tin B2).
- Bảng "Độ tương đồng nội dung" → GĐ2 (`docs/05-frontend/phases/job-matcher-phase2/PLAN.md`); màn hình phân tích yêu cầu bằng AI → GĐ3 (chưa có PLAN).

## Ghi chú triển khai (2026-09-21)

- Đã làm đúng bảng "Thay đổi ở file hiện có"; `useJobPosts.ts` không phải sửa (dùng `CreateJobPostRequest` từ shared-types).
- **Lệch nhỏ:**
  - `JobMatchCard` tự xử lý `INSUFFICIENT_PROFILE`/`INSUFFICIENT_JOB_DATA` cho cả hai phía (Employer thấy "Ứng viên chưa khai kỹ năng nào…"); thêm `JobMatchCardSkeleton` trong cùng file.
  - Dòng `UNKNOWN` ghi "Tin yêu cầu X năm kinh nghiệm — chưa có thông tin kinh nghiệm làm việc" (có số năm yêu cầu để người đọc hiểu vì sao phần này không tính).
  - Form luôn gửi `minExperienceYears` (`null` khi để trống) thay vì "bỏ trống ⇒ không gửi" — nếu không gửi thì không xoá được yêu cầu đã lưu (chính test FE-1 yêu cầu).
  - Hook dùng `retry: false` để lỗi (404/mạng) ẩn thẻ ngay thay vì chờ 3 lần thử lại.
- **Đã kiểm:** `tsc` sạch; `eslint` các file đã sửa không có lỗi mới (4 lỗi `no-explicit-any` ở 2 trang đơn của Employer có từ trước, không sửa vì ngoài phạm vi).
- **Chưa kiểm:** `next build` (tránh ghi đè `.next` của dev server đang chạy) và toàn bộ test thủ công FE-1..FE-3 trên trình duyệt.

## Phần ghi chú của chủ dự án

*(để trống)*
