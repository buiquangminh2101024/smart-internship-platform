# Project Structure

## 1. Repository strategy

Monorepo dùng npm workspaces (`apps/*`, `packages/*`), giữ nguyên cấu trúc đã có sẵn trong repo thay vì áp đặt lại template gốc của prompt khởi tạo (vốn gợi ý `apps/api`) — vì `apps/server` đã được git-track và dùng xuyên suốt.

## 2. Root structure

```text
smart-internship-platform/
├── apps/
│   ├── server/          # Backend: Express API + Socket.IO
│   └── web/             # Frontend: Next.js
├── packages/
│   └── shared-types/     # TypeScript types dùng chung server + web
├── infra/
│   └── docker-compose.yaml   # Nginx, Redis (từ Phase 0), Postgres/Neon proxy nếu cần cho local
├── docs/
│   ├── 01-project/       # Tài liệu tổng quan + roadmap
│   ├── 02-architecture/  # Tài liệu kiến trúc
│   └── designs/          # Diagram tham chiếu (Use Case, Class Diagram)
├── .claude-workspace/     # Workspace tạm của AI — KHÔNG commit
├── CLAUDE.md
├── .gitignore
├── package.json           # npm workspaces root
└── tsconfig.base.json / tsconfig.json
```

## 3. Frontend structure (`apps/web`)

Next.js App Router. **Không** dùng route group thuần cho `employer`/`admin` — hai khu vực này có prefix URL thật (`/employer/*`, `/admin/*`) vì đây là 3 homepage tách biệt theo actor, không phải cùng một trang đổi nội dung (xem quyết định `docs/02-architecture/ARCHITECTURE_DECISIONS.md` mục AD-1):

```text
apps/web/src/app/
├── page.tsx           # "/" — Candidate homepage: guest marketing ⇄ Candidate đã đăng nhập, đổi nội dung theo session, KHÔNG tách route riêng
├── (auth)/
│   ├── login/          # Đăng nhập dùng chung Candidate + Employer (Admin đăng nhập riêng ở /admin, không có nút Google)
│   └── register/       # Đăng ký — chỉ Candidate/Employer (email/password hoặc Google)
├── (candidate)/        # Route group, KHÔNG thêm prefix URL — đã đăng nhập: /profile, /cv, /applications, /saved-jobs, /messages
├── employer/
│   ├── page.tsx         # "/employer" — Employer homepage công khai riêng, ưu tiên hành vi Recruiter (KHÔNG phải bản đổi nội dung của Candidate homepage)
│   └── (portal)/         # "/employer/..." — đã đăng nhập: hồ sơ doanh nghiệp, quản lý tin, xét duyệt hồ sơ ứng tuyển, tìm ứng viên, nhắn tin
├── admin/
│   ├── page.tsx         # "/admin" — chỉ form đăng nhập, KHÔNG có link/nút kích hoạt trỏ tới từ / hay /employer
│   └── (console)/        # "/admin/..." — đã đăng nhập: quản lý người dùng, nhà tuyển dụng, ngành nghề
├── layout.tsx
└── provider.tsx        # React Query / global providers
```

Role guard thực hiện qua `middleware.ts` ở root `apps/web/src/` (sẽ tạo khi implement Phase 2), theo prefix: `/employer/(portal)/*` yêu cầu `role=EMPLOYER`, `/admin/(console)/*` yêu cầu `role=ADMIN`, `(candidate)/*` yêu cầu `role=CANDIDATE`. Chi tiết routing/redirect sau đăng nhập xem `docs/05-frontend/phases/phase-02-identity-access/PLAN.md`.

`apps/web/CLAUDE.md` và `apps/web/AGENTS.md` do `next dev` tự sinh lại (breaking-change notice của Next 16) — giữ trong `.gitignore`, không commit, dù chính file đó khuyến nghị nên commit; đây là lựa chọn có chủ đích để tránh nhiễu diff mỗi lần chạy dev.

## 4. Backend structure (`apps/server`)

```text
apps/server/src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── students/
│   ├── employers/
│   ├── companies/
│   ├── job-posts/
│   ├── applications/
│   ├── cv/
│   ├── saved-jobs/
│   ├── messaging/        # Conversation + Message (gộp, không tách)
│   ├── notifications/
│   ├── catalog/          # Major, University, Industry, City, CompanyType (gộp)
│   └── ai/                # ports/ + adapters/ — boundary only cho tới Phase 10
├── socket/                # Socket.IO gateway, chạy chung process Express
├── infrastructure/        # Kết nối DB (Prisma/Neon), Redis, Cloudinary, Resend, email
├── shared/                # Utilities, middleware (auth guard, validation, rate-limit), error types
└── main.ts                # Entry point, awilix composition root

apps/server/
├── prisma/                # schema.prisma, migrations/
└── scripts/               # Script chạy tay, KHÔNG phải route API:
    ├── seed.ts             #   seed dữ liệu danh mục (catalog) — chuyển từ prisma/seed.ts
    └── create-admin.ts     #   bootstrap tài khoản Admin (hash password + upsert User role=ADMIN)
```

## 5. Module organization

Mỗi module domain là một thư mục độc lập trong `modules/`, tự chứa route/controller/service/repository của module đó, đăng ký dependency qua `awilix` tại `main.ts`. Quy tắc gộp/tách đã quyết định:

- **`messaging`** gộp `Conversation` + `Message` — luôn được truy cập cùng nhau, tách ra không có giá trị cô lập.
- **`catalog`** gộp Major/University/Industry/City/CompanyType — dữ liệu danh mục nhỏ, admin-managed, CRUD gần giống nhau; tách riêng từng module là over-fragmentation cho quy mô khoá luận.
- **`companies`** và **`employers`** giữ tách biệt — vòng đời khác nhau: `Company.verify()/unverify()` là quy trình do Admin gate độc lập với từng Employer user, và một Company có thể có nhiều Employer (`isCompanyAdmin`).
- **`auth`** và **`users`** giữ tách biệt về tầng service dù cùng thao tác trên bảng `User` — `auth` lo xác thực/token, `users` lo hồ sơ/quản trị tài khoản.
- **Không có module `admin` riêng** — quyền admin là các endpoint được gate bằng Role trên module có sẵn (`users`, `companies`, `catalog`), vì không có entity `Admin` riêng trong domain model. Việc **tạo** tài khoản Admin cũng nằm ngoài mọi module nghiệp vụ/route API — xử lý bằng script độc lập `apps/server/scripts/create-admin.ts` (xem mục 4 và `INITIAL_ARCHITECTURE_PLAN.md` mục 12b).

## 6. Shared code strategy

- `packages/shared-types` chứa type dùng chung server + web (request/response payload, entity shape cơ bản, Socket.IO event payload).
- **Hiện trạng cần lưu ý:** nội dung file `packages/shared-types/src/index.ts` hiện tại là leftover 100% từ một dự án khác (chat app "Zync") — sẽ được thay thế hoàn toàn bằng type domain tuyển dụng ở Phase 1 (Core Architecture & Data Layer), không sửa ở giai đoạn tài liệu hoá này.
- Không duplicate type giữa `apps/server` và `apps/web` — mọi type dùng ở cả hai phía phải đến từ `packages/shared-types`.

## 7. Documentation structure

```text
docs/
├── 01-project/
│   ├── PROJECT_OVERVIEW.md
│   ├── PROJECT_PHASES.md             # Roadmap tóm tắt — không chứa kế hoạch chi tiết từng phase
│   └── PROJECT_STATUS.md             # Trạng thái hiện tại của từng phase
├── 02-architecture/
│   ├── PROJECT_STRUCTURE.md          # File này
│   ├── INITIAL_ARCHITECTURE_PLAN.md
│   └── ARCHITECTURE_DECISIONS.md     # Log quyết định kiến trúc phát sinh trong lúc triển khai
├── 03-database/
│   └── DATABASE_DESIGN.md            # Tóm tắt schema.prisma — không phải nguồn sự thật
├── 04-api/
│   └── API_CONVENTIONS.md            # Quy ước chung API frontend/backend — tạo lần đầu ở Phase 2, bổ sung dần
├── phases/
│   ├── README.md                     # Hướng dẫn thiết kế file kế hoạch cho từng phase (backend)
│   └── phase-NN-slug/                # Tạo ngay trước khi triển khai phase đó, không tạo trước
├── 05-frontend/
│   ├── README.md                     # Quy ước viết tài liệu kiến trúc frontend theo phase
│   ├── FRONTEND_PHASES.md            # Roadmap tóm tắt các phase frontend
│   └── phases/phase-NN-slug/         # Tạo ngay trước khi triển khai phase đó, không tạo trước
└── designs/
    ├── class-diagram-v2.jpg          # Class Diagram tham khảo (bản tạm thời)
    └── use-case-diagram-v3.png       # Use Case Diagram tham khảo (bản tạm thời)
```

## 8. Infrastructure structure (`infra/`)

```text
infra/
├── docker-compose.yaml   # Nginx, Redis, và các service hỗ trợ dev khác nếu cần
└── nginx/
    └── nginx.conf         # Reverse proxy config: route /api/* -> apps/server, còn lại -> apps/web
```

`infra/nginx/` sẽ được tạo khi implement Phase 0 (hiện tại `docker-compose.yaml` đang trống — chỉ ghi nhận trong tài liệu này, không tạo file cấu hình thật ở lần chạy tài liệu hoá này).

## 9. Testing structure

```text
apps/server/tests/
├── unit/          # Test theo module (service/logic thuần)
├── integration/   # Test API + DB thật/test container
└── load/          # Script load test cơ bản (Phase 12)
```

Frontend testing structure sẽ được bổ sung khi Phase 12 tới gần (chưa quyết định framework — cân nhắc Playwright/RTL tuỳ nhu cầu thực tế lúc đó).

## 10. Thư mục được commit / không commit

| Thư mục/file | Commit? | Ghi chú |
|---|---|---|
| `apps/`, `packages/`, `infra/`, `docs/` | Có | Source of truth |
| `CLAUDE.md` (root) | Có | Vừa sửa `.gitignore` để bỏ chặn |
| `apps/web/CLAUDE.md`, `apps/web/AGENTS.md` | Không | Next.js tự sinh lại mỗi `next dev` |
| `.claude-workspace/` | Không | Workspace tạm của AI |
| `node_modules/`, `dist/`, `build/`, `.next/` | Không | Build artifact/dependency |
| `.env`, `.env.*.local` | Không | Secrets — chỉ commit `.env.example` |
| `agents/`, `codex/`, `claude/`, `gemini/`, `.cursor/`, `docs/todo` | Không | Ghi chú riêng theo từng AI tool, không phải tài liệu chính thức |
