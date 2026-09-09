# Phase 4 — Employer & Company Module — Kế hoạch triển khai

Tham chiếu: `docs/01-project/PROJECT_PHASES.md` (Phase 4), `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-5 (quyết định + thuật toán xác thực chi tiết — không lặp lại ở đây), `docs/03-database/DATABASE_DESIGN.md` (nhóm `Employer domain`), `docs/04-api/API_CONVENTIONS.md` (quy ước multipart mới). Tài liệu này chỉ ghi phần thực thi đặc thù Phase 4.

---

## Phần 1 — Công nghệ / package / kiến trúc sử dụng

### Dependency mới cho `apps/server`

| Package | Vai trò |
|---|---|
| `cloudinary` | SDK chính thức upload business license (đã có env vars từ trước, chưa dùng) |
| `multer` (+ `@types/multer`) | Middleware multipart, chỉ mount trên `POST /employers/company` |

### Pattern áp dụng

- **Port/adapter** cho mọi thứ chạm hạ tầng mới: `CompanyInviteCodeStore` (interface) → `RedisCompanyInviteCodeStore`; `MediaStorage` (interface) → `CloudinaryMediaStorage` — cùng tinh thần `shared/ports/` + `infrastructure/` đã dùng ở Phase 2.
- **`employers`** (hành động phía tài khoản Employer: onboarding, hồ sơ, mã mời) và **`companies`** (hành động phía Admin: hàng đợi xác thực, verify/reject, `requiresApproval`) tách 2 module riêng nhưng dùng chung `CompanyRepository` — đăng ký tập trung ở `container.ts` giống `UserRepository` (xem `PROJECT_STRUCTURE.md` §5: không có module `admin` riêng, hành động Admin nằm trong module sở hữu resource).
- **`catalog`** — module tối thiểu mới, chỉ `Industry`/`CompanyType`/`City` (form công ty cần), public không cần `authenticate`. Không đụng `University`/`Major` (Phase 3).
- **`CompanyVerificationService`** (`modules/employers/company-verification.service.ts`) là logic thuần (DNS + fetch VietQR + heuristic so khớp), không phụ thuộc Prisma — dễ test độc lập.

---

## Phần 2 — Liên kết giữa các phần

```text
apps/server/src/main.ts
  +-- /api/employers/*  → employers.routes.ts → EmployersController → EmployersService
  |        EmployersService phụ thuộc: EmployerRepository, CompanyRepository, UserRepository,
  |        CompanyVerificationService, CompanyInviteCodeStore, MediaStorage, prisma ($transaction)
  +-- /api/companies/*  → companies.routes.ts → CompaniesController → CompaniesService
  |        CompaniesService phụ thuộc: CompanyRepository
  +-- /api/industries, /company-types, /cities → catalog.routes.ts → CatalogController → CatalogService → CatalogRepository

Middleware chain: authenticate(container) → authorize("EMPLOYER"|"ADMIN") → [singleFileUpload cho POST /employers/company] → validate(schema) → controller.
```

Endpoint đầy đủ, guard, và luồng nghiệp vụ (auto-verify vs manual review vs blocked, reject/resubmit, invite-code) đã mô tả chi tiết ở AD-5 — không lặp lại.

---

## Phần 3 — Các bước thực hiện

1. **Schema:** thêm enum `CompanyVerificationStatus`/`CompanyVerificationMethod` + field trên `Company` (`verificationStatus`, `verificationMethod`, `businessLicenseUrl`, `verificationNote`, `rejectedAt`) → migration `add_company_verification_workflow`.
2. **Env:** `COMMON_EMAIL_DOMAINS`, `VIETQR_API_URL`, `DEV_SKIP_COMPANY_MANUAL_VERIFICATION` (parse thủ công, không `z.coerce.boolean()` — xem AD-5 mục bug), type-hoá luôn `CLOUDINARY_*` (đã có trong `.env` nhưng chưa validate).
3. **Ports/infra:** `CompanyInviteCodeStore`/`RedisCompanyInviteCodeStore`, `MediaStorage`/`CloudinaryMediaStorage`, middleware `singleFileUpload` (multer).
4. **Module `catalog`:** repository/service/controller/routes cho Industry/CompanyType/City.
5. **Module `companies`:** `CompanyRepository` (đăng ký ở `container.ts`), `company.mapper.ts` (Prisma → DTO), service/controller/routes (list cursor-paginated, detail kèm `retractionCount` derived, verify/reject/requires-approval).
6. **Module `employers`:** `EmployerRepository`, `CompanyVerificationService`, service/controller/routes/dto (`GET/PATCH /employers/me`, `POST /employers/company/verification-check`, `POST /employers/company` multipart, `POST /employers/company/join`, `POST /employers/invite-code`).
7. **`container.ts`:** đăng ký `companyRepository`, `companyInviteCodeStore`, `mediaStorage` tập trung.
8. **`main.ts`:** mount `employersRouter`, `companiesRouter`, `catalogRouter`.
9. **`packages/shared-types`:** thêm `CatalogItem`, `Company`, `CompanyDetail`, `EmployerProfile`, `EmployerMeResponse`, `EmployerStage`, `VerificationCheckRequest/Response`, `CreateCompanyRequest`, `JoinCompanyRequest`, `InviteCodeResponse`, `RejectCompanyRequest`, `SetRequiresApprovalRequest`.
10. **Kiểm thử thủ công** (chưa có test suite thật tới Phase 12 — REST client/curl), theo đúng trình tự ở `PROJECT_STATUS.md` dòng Phase 4: common-domain → manual review; custom-domain match → auto-verify; mismatch → manual review; no-MX/invalid tax code → blocked → forceManualReview fallback; admin verify/reject/resubmit; invite-code issue/join/single-use/expiry; `requires-approval` toggle; role guard 401/403; `DEV_SKIP_COMPANY_MANUAL_VERIFICATION=true` + `NODE_ENV=production` → server từ chối khởi động.
11. **Sửa bug phát sinh chặn đường test** (không thuộc nghiệp vụ Phase 4, ghi ở AD-5): `shared/middleware/validate.ts` không tương thích Express 5 khi `part: "query"`.
12. **Cập nhật tài liệu:** `ARCHITECTURE_DECISIONS.md` (AD-5), `DATABASE_DESIGN.md`, `API_CONVENTIONS.md`, `PROJECT_STATUS.md`.

---

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
