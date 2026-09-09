# Phase 4 (Frontend) — Employer & Company Module — Kế hoạch triển khai

Tham chiếu: `docs/05-frontend/FRONTEND_PHASES.md` (Phase 4), `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-1 (URL structure), AD-4 (cô lập state theo area), AD-5 (quyết định nghiệp vụ Phase 4 — không lặp lại ở đây), `docs/06-backend/phase-04-employer-company/PLAN.md` (API contract).

---

## Phần 1 — Công nghệ / package / kiến trúc frontend sử dụng

**Dependency mới:** `react-hook-form`, `zod` (pin `^4`, xem lý do version ở AD-5), `@hookform/resolvers` — chỉ dùng cho `CreateCompanyForm` (10+ field, hiển thị có điều kiện). Các form auth hiện có (`LoginForm`/`RegisterForm`/`OtpForm`) giữ nguyên pattern `useState` cũ theo đúng quyết định Phase 2, không đổi theo.

**Pattern áp dụng:**
- `apiFetch("employer"|"admin", ...)` cho mọi call JSON (theo pattern có sẵn); thêm biến thể `apiUpload(area, path, formData)` (instance axios riêng không có `Content-Type` mặc định) cho route nhận file.
- React Query hook dùng chung `useEmployerMe()` (`hooks/useEmployerMe.ts`) — cùng `queryKey: ["employerMe"]` giữa trang onboarding/profile và `EmployerStageSync` (provider-level), nên cache dùng chung, không gọi trùng API.
- `useIndustries`/`useCompanyTypes`/`useCities` (`hooks/useCatalog.ts`) — public fetch, `staleTime` 5 phút.

---

## Phần 2 — Kiến trúc & liên kết

### Routing & layout theo actor

| Route | Actor | Guard (`proxy.ts`) |
|---|---|---|
| `/employer/hoan-tat-thu-tuc` | Employer, stage `ONBOARDING` | stage `pending`→`/employer/profile`; stage `active`→`/employer` |
| `/employer/profile` | Employer, mọi stage khác `ONBOARDING` | stage `onboarding`→`/employer/hoan-tat-thu-tuc` |
| `/admin/companies`, `/admin/companies/[id]` | Admin | cookie `sip_session_admin` (không đổi so với Phase 2) |

Cookie mới `sip_employer_stage` (`onboarding|pending|active`, xem AD-5) ghi bởi `EmployerStageSync` (mounted trong `provider.tsx`, chạy cho mọi trang) và bởi `lib/auth.ts` (`resolveEmployerDestination`, chạy ngay sau đăng ký/đăng nhập để `proxy.ts` có cookie đúng ngay lần điều hướng kế tiếp, không phải đợi query client-side).

### Component tree & tái sử dụng

- `components/employer/CreateCompanyForm.tsx` — dùng chung cho tạo mới (`mode="create"`) và nộp lại sau khi bị từ chối (`mode="resubmit"`, nhận `company`/`employer` để prefill). Gọi `/employers/company/verification-check` trước, render UI theo outcome (`AUTO_VERIFIED`/`NEEDS_MANUAL_REVIEW`/`BLOCKED` + fallback "vẫn gửi thủ công"), rồi submit multipart cuối cùng qua `apiUpload`.
- `components/employer/JoinCompanyForm.tsx`, `BusinessLicenseUpload.tsx`, `OnboardingExitGuard.tsx` (best-effort clear-session `pagehide`, xem AD-5 mục "thoát giữa chừng").
- `components/ui/Textarea.tsx` — primitive mới, theo đúng style `Input`/`Select` đã có.
- Tái dùng nguyên `Button`/`Card`/`Badge`/`Select`/`Input` từ Phase 2 — không xây `EmployerShell`/sidebar portal đầy đủ (chỉ 1-2 trang, chưa cần).

### State management & data fetching

- `useEmployerMe()` — server state chính cho mọi UI onboarding/profile.
- `useCurrentUser("employer")` (zustand, có sẵn) — chỉ để hiển thị email, không dùng để suy ra stage (stage luôn tính từ `/employers/me`, không tự đoán ở client).
- Admin: `useQuery(["admin-companies", status])`, `useQuery(["admin-company", id])` — invalidate cả hai sau mỗi action (verify/reject/toggle) để list và detail đồng bộ.

### UI states & design system

- Outcome kiểm tra xác thực hiển thị qua `Badge` (success/warning/danger) + đoạn text giải thích theo `reason`, không chỉ hiện mã lỗi thô.
- Trạng thái công ty (`PENDING`/`VERIFIED`/`REJECTED`) hiển thị nhất quán qua cùng một bảng nhãn ở cả `/employer/profile` (Employer) và `/admin/companies` (Admin).

---

## Phần 3 — Các bước thực hiện

1. `packages/shared-types` — types mới (xem backend PLAN.md Phần 3 bước 9, dùng chung).
2. `lib/auth-storage.ts` — cookie `sip_employer_stage` + `employerStageToCookieValue`.
3. `lib/auth.ts` — `resolveEmployerDestination`, `redirectDestinationForUser`, `navigateAfterAuth`; cập nhật `RegisterForm`/`LoginForm` dùng `navigateAfterAuth` thay `router.push(redirectPathForRole(...))`.
4. `proxy.ts` — mở rộng nhánh `/employer/*` đọc thêm `sip_employer_stage`.
5. `hooks/useEmployerMe.ts`, `hooks/useCatalog.ts`.
6. `components/auth/EmployerStageSync.tsx`, mount trong `app/provider.tsx`.
7. `components/ui/Textarea.tsx`.
8. `components/employer/{BusinessLicenseUpload,JoinCompanyForm,CreateCompanyForm,OnboardingExitGuard}.tsx`.
9. `app/employer/(portal)/hoan-tat-thu-tuc/page.tsx`, `app/employer/(portal)/profile/page.tsx`.
10. `app/admin/(console)/companies/page.tsx`, `app/admin/(console)/companies/[id]/page.tsx`; link từ `app/admin/page.tsx` (đã đăng nhập) tới `/admin/companies`.
11. `lib/api-client.ts` — `apiUpload` + `uploadClient` (axios instance riêng không có `Content-Type` mặc định).
12. `EmployerHomeHeader.tsx` — thêm link email → `/employer/profile` (trước đó chỉ hiện text, không có lối vào portal).
13. Kiểm thử: `next build` (đã pass, xác nhận route tree đúng: `/employer/hoan-tat-thu-tuc`, `/employer/profile`, `/admin/companies`, `/admin/companies/[id]`) + kiểm thử thủ công qua trình duyệt (đăng ký Employer → onboarding → complete → đúng redirect theo outcome → thử truy cập chéo stage → bị bounce đúng chỗ) — **chưa thực hiện được trong phiên triển khai này** (không có công cụ trình duyệt), cần chủ dự án tự kiểm tra trước khi coi Phase 4 frontend hoàn tất toàn bộ.

---

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
